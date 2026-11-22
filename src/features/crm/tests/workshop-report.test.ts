import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CrmRepository } from '../server/repository';
import { businessToday } from '../lib/workflow';
import { buildPeriodReport } from '@/features/workshop-reports/lib/report';
import { reportCsv } from '@/features/workshop-reports/lib/csv';
import { detailedCheckItems } from '@/features/order-economics/lib/details';
import type { OrderEconomicsDetails } from '@/features/order-economics/api/types';

test('full SQLite workflow: EUR purchase, fractional materials, check, readiness, advance, payout and correction reconcile with report and CSV', () => {
  const repository = new CrmRepository(':memory:');
  const actor = { id: 'owner', name: 'Адміністратор' };
  const today = businessToday();
  try {
    repository.bindOrganization('org_report');
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
    const orderId = repository.createOrder({
      customerId,
      vehicleId,
      requestId: '',
      description: 'Фарбування',
      items: [{ description: 'Бампер', quantity: 1, unitPrice: 18000 }]
    });
    const order = () => repository.workspace().orders.find((row) => row.id === orderId)!;
    function transition(status: 'in_progress' | 'ready') {
      repository.updateWorkflow(
        {
          kind: 'order',
          id: orderId,
          expectedStatus: order().status,
          expectedRevision: order().workflowRevision ?? 0,
          status,
          actualIntakeDate: today,
          actualReadyDate: status === 'ready' ? today : '',
          actualDeliveryDate: '',
          plannedIntakeDate: '',
          plannedDeliveryDate: '',
          note: ''
        },
        actor
      );
    }
    transition('in_progress');
    const paint = repository.inventory.createItem({ name: 'Лак Sprint', unit: 'л', notes: '' });
    const polish = repository.inventory.createItem({ name: 'Поліроль', unit: 'л', notes: '' });
    repository.inventory.receive(
      {
        itemId: paint,
        operationId: randomUUID(),
        quantity: '2',
        totalAmount: '40',
        currency: 'EUR',
        exchangeRate: '48',
        note: ''
      },
      actor
    );
    repository.inventory.receive(
      {
        itemId: polish,
        operationId: randomUUID(),
        quantity: '2',
        totalAmount: '1000',
        currency: 'UAH',
        exchangeRate: '1',
        note: ''
      },
      actor
    );
    repository.inventory.consume(
      {
        itemId: paint,
        operationId: randomUUID(),
        orderId,
        quantity: '0.5',
        category: 'painting',
        note: ''
      },
      actor
    );
    repository.inventory.consume(
      {
        itemId: polish,
        operationId: randomUUID(),
        orderId,
        quantity: '1',
        category: 'polishing',
        note: ''
      },
      actor
    );
    const details: OrderEconomicsDetails = {
      employeeShareBps: 6000,
      painterId: 'p',
      polisherId: 'q',
      assemblerId: 'a',
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
    const names = { p: 'Маляр', q: 'Полірувальник', a: 'Розбірник' };
    repository.updateOrder(
      {
        id: orderId,
        expectedRevision: order().workflowRevision,
        description: 'Фарбування',
        items: detailedCheckItems(details).map((row) => ({
          description: row.description,
          quantity: row.quantity,
          unitPrice: row.unitPriceCents / 100
        }))
      },
      undefined,
      actor,
      { details, workerNames: names }
    );
    const payee = { kind: 'worker' as const, id: 'p', name: 'Маляр' };
    const payout = (amount: string) =>
      repository.settlements.cash(
        {
          orgId: 'org_report',
          orderId,
          operationId: randomUUID(),
          payeeKind: 'worker',
          payeeId: 'p',
          kind: 'payout',
          amount,
          note: ''
        },
        actor,
        payee
      );
    payout('2000');
    transition('ready');
    payout('1000');
    repository.payments.receive(
      { orderId, operationId: randomUUID(), amount: '5000', note: 'Часткова оплата' },
      actor
    );
    repository.correctOrderEconomics(
      {
        orgId: 'org_report',
        orderId,
        operationId: randomUUID(),
        expectedRevision: order().workflowRevision!,
        expectedPostingRevision: 1,
        expectedInventoryRevision: repository.workspace().finance!.inventoryRevision,
        details,
        materials: [{ kind: 'consume', itemId: paint, quantity: '0.5', category: 'painting' }],
        note: 'Додатковий лак'
      },
      names,
      actor
    );
    const before = repository.reportSnapshot();
    const report = buildPeriodReport(
      before.workspace,
      before.movements,
      { userId: 'owner', orgId: 'org_report', role: 'admin' },
      { from: today, to: today, orderDate: 'ready' }
    );
    assert.equal(report.postings.length, 2);
    assert.equal(report.economics!.checkCents, 1900000);
    assert.equal(report.economics!.materialsCents, 146000);
    assert.equal(report.economics!.employeeAccrualsCents, 1052400);
    assert.equal(report.economics!.workshopRemainderCents, 701600);
    assert.equal(report.cash!.netCents, 500000);
    assert.equal(report.orders[0].revision, 2);
    const painter = report.settlements.payees.find((row) => row.payee.id === 'p')!;
    assert.equal(painter.accrualCents, 991200);
    assert.equal(painter.adjustmentCents, -28800);
    assert.equal(painter.payoutCents, 300000);
    assert.equal(painter.payableCents, 662400);
    assert.equal(report.materials.rows.find((row) => row.id === paint)!.quantityMilli, 1000);
    assert.ok(reportCsv(report, 'settlements').includes('6624,00'));
    assert.deepEqual(repository.reportSnapshot(), before);
  } finally {
    repository.close();
  }
});
