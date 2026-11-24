import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository } from '../server/repository';
import { orderSchema } from '../schemas/crm';
import { buildPeriodReport } from '@/features/workshop-reports/lib/report';
import { buildPayrollReport } from '@/features/payroll/lib/report';
import { overviewMetrics } from '@/features/overview/lib/metrics';
import { overviewTrends } from '@/features/overview/lib/trends';

const summary = (metrics: ReturnType<typeof overviewMetrics>) => ({
  ...metrics,
  recentOrders: metrics.recentOrders.map((order) => ({
    id: order.id,
    totalCents: order.totalCents,
    status: order.status
  })),
  attention: metrics.attention.map((target) => target.record.id),
  schedule: metrics.schedule.map((entry) => ({
    id: entry.target.record.id,
    date: entry.date,
    kind: entry.kind
  }))
});

test('period SQL reads preserve historical opening balances, later reversals and salary corrections', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-scoped-report-'));
  const path = join(directory, 'test.sqlite');
  const repository = new CrmRepository(path),
    db = new DatabaseSync(path);
  const actor = { id: 'admin', name: 'Адмін' };
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
      plate: 'AA1234BB',
      vin: 'WVWZZZ1JZXW000001'
    });
    const orderId = repository.createClientOrder(
      orderSchema.parse({
        customerId,
        vehicleId,
        requestId: '',
        assigneeId: 'painter',
        description: 'Ремонт',
        items: [{ description: 'Бампер', quantity: 1, unitPrice: 20000 }]
      }),
      'Маляр',
      actor
    );
    const current = () => repository.reads.order(orderId).orders[0];
    const workflow = (status: 'in_progress' | 'ready') =>
      repository.updateWorkflow(
        {
          kind: 'order',
          id: orderId,
          expectedStatus: current().status,
          expectedRevision: current().workflowRevision,
          status,
          plannedIntakeDate: '',
          plannedDeliveryDate: '',
          actualIntakeDate: '2026-10-31',
          actualReadyDate: status === 'ready' ? '2026-11-01' : '',
          actualDeliveryDate: '',
          note: ''
        },
        actor,
        { netSalary: true }
      );
    workflow('in_progress');
    workflow('ready');
    db.exec(
      "UPDATE crm_economics_postings SET createdAt='2026-10-31T23:30:00Z'; UPDATE crm_settlement_events SET createdAt='2026-10-31T23:30:00Z'; UPDATE crm_orders SET createdAt='2026-10-30T10:00:00Z'; UPDATE crm_workflow_events SET createdAt='2026-10-30T10:00:00Z';"
    );
    const payoutId = crypto.randomUUID();
    repository.settlements.cash(
      {
        orgId: 'test',
        orderId,
        operationId: payoutId,
        payeeKind: 'worker',
        payeeId: 'painter',
        kind: 'payout',
        amount: '1000',
        note: ''
      },
      actor,
      { kind: 'worker', id: 'painter', name: 'Маляр' }
    );
    db.prepare('UPDATE crm_settlement_events SET createdAt=? WHERE id=?').run(
      '2026-11-05T10:00:00Z',
      payoutId
    );
    repository.settlements.reverse(
      { orgId: 'test', operationId: crypto.randomUUID(), eventId: payoutId, note: 'Скасування' },
      actor
    );
    db.exec(
      "UPDATE crm_settlement_events SET createdAt='2026-12-05T10:00:00Z' WHERE kind='reversal'"
    );
    repository.updateClientOrder(
      {
        id: orderId,
        expectedRevision: current().workflowRevision,
        description: 'Ремонт',
        items: [{ description: 'Бампер', quantity: 1, unitPrice: 18000 }],
        assigneeId: 'painter',
        employeeShareBps: 6000
      },
      'Маляр',
      actor
    );
    db.exec(
      "UPDATE crm_economics_postings SET createdAt='2026-12-10T10:00:00Z' WHERE kind='correction'; UPDATE crm_settlement_events SET createdAt='2026-12-10T10:00:00Z' WHERE kind='adjustment';"
    );
    const access = { userId: 'admin', orgId: 'test', role: 'admin' as const };
    const team = [{ id: 'painter', name: 'Маляр', identifier: '', role: 'worker' as const }];
    const full = repository.reportSnapshot();
    for (const month of ['10', '11', '12']) {
      const filters = {
        from: `2026-${month}-01`,
        to: `2026-${month}-${month === '11' ? '30' : '31'}`,
        orderDate: 'ready' as const
      };
      const scoped = repository.reportSnapshot(filters);
      for (const role of ['admin', 'worker'] as const) {
        const viewer = { ...access, userId: role === 'worker' ? 'painter' : 'admin', role };
        assert.deepEqual(
          buildPeriodReport(scoped.workspace, scoped.movements, viewer, filters, 'fixed'),
          buildPeriodReport(full.workspace, full.movements, viewer, filters, 'fixed')
        );
        const salary = repository.reportSnapshot(filters, true);
        assert.deepEqual(
          buildPayrollReport(
            salary.workspace,
            team,
            viewer,
            { from: filters.from, to: filters.to },
            'fixed'
          ),
          buildPayrollReport(
            full.workspace,
            team,
            viewer,
            { from: filters.from, to: filters.to },
            'fixed'
          )
        );
      }
    }
    const light = repository.reads.overviewSource();

    assert.deepEqual(
      summary(overviewMetrics(light, '2026-11-24')),
      summary(overviewMetrics(full.workspace, '2026-11-24'))
    );
    assert.deepEqual(
      overviewTrends(light, '2026-11-24'),
      overviewTrends(full.workspace, '2026-11-24')
    );
  } finally {
    db.close();
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
