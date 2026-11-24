import test from 'node:test';
import assert from 'node:assert/strict';
import { CrmRepository } from '../server/repository';
import { orderSchema } from '../schemas/crm';
import { paymentBalance } from '../lib/payment-balance';

test('CRM lists search all records before pagination and do not include unrelated history or payments', () => {
  const repository = new CrmRepository(':memory:');
  try {
    for (let i = 0; i < 63; i++)
      repository.createCustomer({
        name: `Клієнт ${String(i).padStart(3, '0')}`,
        phone: `+38099111${String(i).padStart(4, '0')}`,
        notes: i === 42 ? 'Унікальна примітка' : ''
      });
    const first = repository.reads.list({ entity: 'customers', page: 1, pageSize: 20 });
    const second = repository.reads.list({ entity: 'customers', page: 2, pageSize: 20 });
    assert.equal(first.pagination!.total, 63);
    assert.equal(second.customers.length, 20);
    assert.equal(new Set([...first.customers, ...second.customers].map((row) => row.id)).size, 40);
    assert.equal(first.orders.length, 0);
    assert.equal(first.events.length, 0);
    assert.equal(first.payments!.length, 0);
    assert.equal(first.finance!.postings.length, 0);
    const found = repository.reads.list({ entity: 'customers', search: 'УНІКАЛЬНА', pageSize: 10 });
    assert.equal(found.pagination!.total, 1);
    assert.equal(found.customers[0].name, 'Клієнт 042');
    for (const search of ['+38 (099) 111-00-42', '042 КЛІЄНТ']) {
      const choice = repository.reads.list({ entity: 'customers', lookup: true, search });
      assert.equal(choice.customers.length, 1);
      assert.equal(choice.customers[0].name, 'Клієнт 042');
    }
    const sorted = repository.reads.list({
      entity: 'customers',
      pageSize: 10,
      sort: JSON.stringify([{ id: 'name', desc: false }])
    });
    assert.equal(sorted.customers[0].name, 'Клієнт 000');
    assert.throws(() => repository.reads.list({ entity: 'orders', pageSize: 101 }));
    assert.throws(() => repository.reads.order(crypto.randomUUID()));
    assert.equal(repository.reads.list({ entity: 'kanban' }).pagination!.total, 0);
  } finally {
    repository.close();
  }
});

test('order pages and on-demand detail/history include only their own records and preserve current assignee search', () => {
  const repository = new CrmRepository(':memory:');
  const actor = { id: 'admin', name: 'Адмін' };
  try {
    const ids = Array.from({ length: 3 }, (_, index) => {
      const customerId = repository.createCustomer({
        name: `Замовник ${index}`,
        phone: `+38099111${String(index).padStart(4, '0')}`,
        notes: ''
      });
      const vehicleId = repository.createVehicle({
        customerId,
        make: 'Ford',
        model: 'Focus',
        year: 2020,
        plate: `TEST${index}`,
        vin: `WVWZZZ1JZXW${String(index).padStart(6, '0')}`
      });
      const id = repository.createClientOrder(
        orderSchema.parse({
          customerId,
          vehicleId,
          requestId: '',
          assigneeId: `painter${index}`,
          description: `Ремонт ${index}`,
          items: [{ description: `Деталь ${index}`, quantity: 1, unitPrice: 1000 }]
        }),
        `Маляр ${index}`,
        actor
      );
      repository.payments.receive(
        { orderId: id, operationId: crypto.randomUUID(), amount: '100', note: '' },
        actor
      );
      return id;
    });
    const page = repository.reads.list({ entity: 'orders', pageSize: 1 });
    assert.equal(page.pagination!.total, 3);
    assert.equal(page.orders.length, 1);
    assert.equal(page.customers.length, 1);
    assert.equal(page.vehicles.length, 1);
    assert.deepEqual(page.events, []);
    assert.deepEqual(page.payments, []);
    assert.equal(page.paymentSummaries![page.orders[0].id].status, 'Частково оплачено');
    assert.equal(page.paymentSummaries![page.orders[0].id].paidCents, 10000);
    const detail = repository.reads.order(ids[0]);
    assert.deepEqual(
      detail.orders.map((order) => order.id),
      [ids[0]]
    );
    assert.ok(detail.payments!.length > 0);
    assert.ok(detail.payments!.every((event) => event.orderId === ids[0]));
    assert.deepEqual(detail.events, []);
    assert.ok(repository.expenses.names().length > 0);
    assert.deepEqual(detail.expenseNames, repository.expenses.names());
    repository.payments.receive(
      { orderId: ids[0], operationId: crypto.randomUUID(), amount: '900', note: '' },
      actor
    );
    const before = repository.reads.order(ids[0]).orders[0];
    repository.updateClientOrder(
      {
        id: ids[0],
        expectedRevision: before.workflowRevision,
        description: before.description,
        items: [{ description: 'Деталь 0', quantity: 1, unitPrice: 800 }],
        assigneeId: before.assigneeId ?? undefined,
        employeeShareBps: 6000
      },
      before.assigneeName ?? '',
      actor
    );
    const refund = repository.payments.refund(
      { orderId: ids[0], operationId: crypto.randomUUID(), amount: '50', note: 'Повернення' },
      actor
    );
    const compareSummary = () =>
      assert.deepEqual(
        repository.reads.list({ entity: 'orders' }).paymentSummaries![ids[0]],
        paymentBalance(repository.reads.order(ids[0]).orders[0], repository.payments.list([ids[0]]))
      );
    compareSummary();
    repository.payments.reverse(
      { paymentId: refund, operationId: crypto.randomUUID(), note: 'Скасування повернення' },
      actor
    );
    repository.payments.reverse(
      {
        paymentId: detail.payments![0].id,
        operationId: crypto.randomUUID(),
        note: 'Скасування оплати'
      },
      actor
    );
    compareSummary();
    const requestId = repository.createRequest(
      {
        customerId: detail.customers[0].id,
        vehicleId: detail.vehicles[0].id,
        description: 'Архівна заявка',
        plannedIntakeDate: '',
        plannedDeliveryDate: ''
      },
      actor
    );
    assert.ok(
      repository.reads
        .history('request', requestId)
        .events.some((event) => event.recordId === requestId)
    );
    const linkedId = repository.createClientOrder(
      orderSchema.parse({
        customerId: detail.customers[0].id,
        vehicleId: detail.vehicles[0].id,
        requestId,
        description: 'Із заявки',
        items: [{ description: 'Робота', quantity: 1, unitPrice: 1000 }]
      }),
      'Маляр',
      actor
    );
    assert.ok(
      repository.reads.list({ entity: 'requests' }).orders.some((order) => order.id === linkedId)
    );
    const history = repository.reads.history('order', ids[0]);
    assert.ok(history.events.length > 0);
    assert.ok(history.events.every((event) => event.recordId === ids[0]));
    const scheduled = repository.createRequest(
      {
        customerId: detail.customers[0].id,
        vehicleId: detail.vehicles[0].id,
        description: 'Запланований ремонт',
        plannedIntakeDate: '2026-01-02',
        plannedDeliveryDate: '2026-01-04'
      },
      actor
    );
    assert.equal(
      repository.reads
        .list({ entity: 'requests' })
        .requests.find((request) => request.id === scheduled)!.status,
      'scheduled'
    );
    assert.equal(repository.reads.history('request', scheduled).requests[0].status, 'scheduled');
    const renamed = repository.reads.list({ entity: 'orders', search: 'Оновлений працівник' }, [
      { id: 'painter0', name: 'Оновлений працівник', role: 'worker', identifier: '' }
    ]);
    assert.deepEqual(
      renamed.orders.map((order) => order.id),
      [ids[0]]
    );
    const vehicle = repository.createVehicle({
      customerId: detail.customers[0].id,
      make: 'Ford',
      model: 'Fiesta',
      year: 2021,
      plate: 'NEW',
      vin: 'WVWZZZ1JZXW999999'
    });
    assert.equal(
      repository.reads.history('vehicle', vehicle).customers[0].id,
      detail.customers[0].id
    );
    const vehicles = repository.reads.list({ entity: 'vehicles' }).vehicles;
    assert.equal(vehicles.find((row) => row.id === vehicle)!.linked, false);
    assert.equal(vehicles.find((row) => row.id === detail.vehicles[0].id)!.linked, true);
    assert.doesNotThrow(() =>
      repository.reads.list({
        entity: 'requests',
        sort: JSON.stringify([{ id: 'number', desc: true }])
      })
    );
  } finally {
    repository.close();
  }
});
