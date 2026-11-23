import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CrmRepository } from '@/features/crm/server/repository';
import { executorTransition } from '@/features/crm/lib/executor-workflow';
import { detailedCheckItems } from '@/features/order-economics/lib/details';
import type { OrderEconomicsDetails } from '@/features/order-economics/api/types';
import { admin, worker } from '@/features/workshop-reports/tests/fixtures';
import { buildPayrollReport } from '../lib/report';
import { payrollCsv } from '../lib/csv';
import {
  defaultPayrollFilters,
  payrollFiltersSchema,
  previousPayrollMonth
} from '../schemas/filters';
import { payrollFixture } from './fixtures';

const november = { from: '2026-11-01', to: '2026-11-30' };
const december = { from: '2026-12-01', to: '2026-12-31' };

test('inclusive Kyiv dates include posted earnings once; unposted ready cars are explicit and active zero earners remain visible', () => {
  const source = payrollFixture();
  const before = JSON.stringify(source);
  const report = buildPayrollReport(source.workspace, source.team, admin, november);
  assert.equal(report.totals.totalCents, 870000);
  assert.equal(report.totals.orderCount, 1);
  assert.equal(report.workers.find((row) => row.id === 'p')!.totalCents, 840000);
  assert.equal(report.workers.find((row) => row.id === 'q')!.totalCents, 30000);
  assert.equal(report.workers.find((row) => row.id === 'zero')!.totalCents, 0);
  assert.deepEqual(
    report.warnings.unpostedOrders.map((order) => order.id),
    ['legacy']
  );
  assert.equal(JSON.stringify(source), before);
});

test('later corrections contribute only their delta and changing current rates or dates never rewrites a previous period', () => {
  const source = payrollFixture();
  source.workspace.finance!.defaultShareBps = 9000;
  source.workspace.orders[0].actualReadyDate = '2026-12-10';
  source.workspace.finance!.postings.reverse();
  const report = buildPayrollReport(source.workspace, source.team, admin, december);
  assert.equal(report.totals.accrualCents, 0);
  assert.equal(report.totals.adjustmentCents, -60000);
  assert.equal(report.totals.totalCents, -60000);
  const entry = report.workers.find((row) => row.id === 'p')!.entries[0];
  assert.equal(entry.before!.shareBps, 6000);
  assert.equal(entry.before!.amountCents, 840000);
  assert.equal(entry.after!.amountCents, 780000);
  assert.equal(
    buildPayrollReport(source.workspace, source.team, admin, november).totals.totalCents,
    870000
  );
});

test('multiple roles aggregate by user ID and reassignment credits the replacement while debiting the former worker', () => {
  const source = payrollFixture();
  const [first, second] = source.workspace.finance!.postings;
  first.details = { ...first.details, polisherId: 'p', polisherName: 'Сергій' };
  second.details = { ...first.details, painterId: 'r', painterName: 'Новий маляр' };
  second.createdAt = '2026-12-01T10:00:00Z';
  second.result = { ...first.result };
  assert.equal(
    buildPayrollReport(source.workspace, source.team, admin, november).workers.find(
      (row) => row.id === 'p'
    )!.totalCents,
    870000
  );
  const report = buildPayrollReport(source.workspace, source.team, admin, december);
  assert.equal(report.workers.find((row) => row.id === 'p')!.totalCents, -840000);
  assert.equal(report.workers.find((row) => row.id === 'r')!.totalCents, 840000);
  assert.equal(report.totals.totalCents, 0);
  assert.equal(report.workers.find((row) => row.id === 'p')!.entries[0].after, null);
});

test('worker responses and CSV contain only that worker and never include payout details or administrative warnings', () => {
  const source = payrollFixture();
  const report = buildPayrollReport(source.workspace, source.team, worker, november);
  assert.deepEqual(
    report.workers.map((row) => row.id),
    ['p']
  );
  assert.equal(report.totals.totalCents, 840000);
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes('Валик'));
  for (const field of ['payoutCents', 'paidCents', 'balanceCents', 'payableCents', 'advanceCents'])
    assert.ok(!serialized.includes(field));
  assert.deepEqual(report.warnings.unpostedOrders, []);
  assert.ok(!payrollCsv(report.workers, november, true).includes('Валик'));
  source.workspace.finance!.events = [];
  assert.deepEqual(
    buildPayrollReport(source.workspace, source.team, worker, november, report.generatedAt),
    report
  );
});

test('historical identities survive departure, malformed dates are warned about, and equal names do not merge users', () => {
  const source = payrollFixture();
  source.team = source.team.filter((member) => member.id !== 'p');
  source.team[0].name = 'Маляр';
  const report = buildPayrollReport(source.workspace, source.team, admin, november);
  assert.equal(report.workers.find((row) => row.id === 'p')!.active, false);
  assert.equal(report.workers.filter((row) => row.name === 'Маляр').length, 2);
  source.workspace.finance!.postings[0].createdAt = 'invalid';
  assert.equal(
    buildPayrollReport(source.workspace, source.team, admin, november).warnings.undatedPostings,
    1
  );
});

test('CSV preserves numeric negative adjustments and protects spreadsheet formulas in names', () => {
  const source = payrollFixture();
  source.team[0].name = '=HYPERLINK("unsafe")';
  const report = buildPayrollReport(source.workspace, source.team, admin, december);
  const csv = payrollCsv(report.workers, december);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"-600,00"'));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(!csv.includes('Виплати'));
  assert.ok(payrollCsv(report.workers, december, true).includes('Ставка після'));
});

test('presets handle year and leap-year boundaries; impossible and inverted ranges fail validation', () => {
  assert.deepEqual(defaultPayrollFilters('2026-11-23'), { from: '2026-11-01', to: '2026-11-23' });
  assert.deepEqual(previousPayrollMonth('2026-01-10'), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(previousPayrollMonth('2024-03-10'), { from: '2024-02-01', to: '2024-02-29' });
  for (const filters of [
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-12-01', to: '2026-11-30' },
    { ...november, workerId: 'foreign' }
  ])
    assert.equal(payrollFiltersSchema.safeParse(filters).success, false);
});

test('SQLite readiness produces real payroll, repeated readiness and viewing cannot duplicate it, and cash does not alter earnings', () => {
  const repository = new CrmRepository(':memory:');
  const actor = { id: 'p', name: 'Сергій' };
  try {
    const customerId = repository.createCustomer({
      name: 'Клієнт',
      phone: '0501234567',
      notes: ''
    });
    const vehicleId = repository.createVehicle({
      customerId,
      make: 'Ford',
      model: 'Focus',
      year: 2020,
      plate: '',
      vin: 'WVWZZZ1JZXW000001'
    });
    const id = repository.createOrder({
      customerId,
      vehicleId,
      requestId: '',
      description: 'Роботи',
      items: [{ description: 'Фарбування', quantity: 1, unitPrice: 18000 }]
    });
    const details: OrderEconomicsDetails = {
      employeeShareBps: 6000,
      painterId: 'p',
      polisherId: 'p',
      assemblerId: 'p',
      lines: [
        {
          id: randomUUID(),
          kind: 'painting',
          description: 'Бампер',
          quantity: 1,
          unitPriceCents: 1800000,
          polishingCents: 100000,
          subcontractCostCents: 0,
          contractorName: ''
        },
        {
          id: randomUUID(),
          kind: 'assembly',
          description: 'Розбірка-збірка',
          quantity: 1,
          unitPriceCents: 100000,
          polishingCents: 0,
          subcontractCostCents: 0,
          contractorName: ''
        }
      ]
    };
    repository.updateOrder(
      {
        id,
        expectedRevision: 0,
        description: 'Роботи',
        items: detailedCheckItems(details).map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPriceCents / 100
        }))
      },
      undefined,
      actor,
      { details, workerNames: { p: actor.name } }
    );
    const filters = { from: '2000-01-01', to: '2099-12-31' };
    assert.equal(
      buildPayrollReport(repository.workspace(), [], admin, filters).totals.totalCents,
      0
    );
    for (let step = 0; step < 2; step++) {
      const order = repository.workspace().orders[0];
      const next = executorTransition(order, {
        id,
        expectedStatus: order.status,
        expectedRevision: order.workflowRevision ?? 0
      });
      assert.ok(next.ok);
      if (next.ok) repository.updateWorkflow(next.data, actor);
    }
    const ready = repository.workspace().orders[0];
    const before = repository.workspace();
    const report = buildPayrollReport(before, [], admin, filters);
    assert.equal(report.totals.totalCents, 1140000);
    assert.equal(report.workers[0].entries.length, 3);
    assert.equal(report.workers[0].orderCount, 1);
    repository.updateWorkflow(
      {
        kind: 'order',
        id,
        expectedRevision: ready.workflowRevision ?? 0,
        status: 'ready',
        expectedStatus: 'ready',
        plannedIntakeDate: '',
        plannedDeliveryDate: '',
        actualIntakeDate: ready.actualIntakeDate ?? '',
        actualReadyDate: ready.actualReadyDate ?? '',
        actualDeliveryDate: ready.actualDeliveryDate ?? '',
        note: ''
      },
      actor
    );
    assert.equal(repository.workspace().finance!.postings.length, 1);
    repository.settlements.cash(
      {
        orgId: 'org_A',
        orderId: id,
        payeeKind: 'worker',
        payeeId: 'p',
        kind: 'payout',
        amount: '1000',
        operationId: randomUUID(),
        note: ''
      },
      actor,
      { kind: 'worker', id: 'p', name: actor.name }
    );
    assert.equal(
      buildPayrollReport(repository.workspace(), [], admin, filters).totals.totalCents,
      1140000
    );
    assert.equal(repository.workspace().finance!.postings.length, 1);
  } finally {
    repository.close();
  }
});
