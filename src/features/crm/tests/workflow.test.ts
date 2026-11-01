import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository } from '../server/repository';
import { workflowSchema, type WorkflowInput } from '../schemas/crm';
import { boardRecords, businessToday, overdueLabel, transitionKind } from '../lib/workflow';

function seed(repository: CrmRepository) {
  const customerId = repository.createCustomer({ name: 'Клієнт', phone: '0501234567', notes: '' });
  const vehicleId = repository.createVehicle({
    customerId,
    year: 2020,
    make: 'Ford',
    model: 'Focus',
    plate: '',
    vin: 'WVWZZZ1JZXW000001'
  });
  const requestId = repository.createRequest({
    customerId,
    vehicleId,
    description: 'Фарбування',
    plannedIntakeDate: '2020-01-01',
    plannedDeliveryDate: '2020-01-10'
  });
  return { customerId, vehicleId, requestId };
}

function workflow(id: string, kind: 'request' | 'order', expectedStatus: string): WorkflowInput {
  return {
    id,
    kind,
    expectedStatus,
    status: kind === 'request' ? 'scheduled' : 'in_progress',
    plannedIntakeDate: '2020-01-01',
    plannedDeliveryDate: '2020-01-10',
    actualIntakeDate: kind === 'order' ? '2020-01-05' : '',
    actualReadyDate: '',
    actualDeliveryDate: '',
    note: ''
  };
}

test('rescheduling needs a reason and retains the previous plan in history', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const { requestId } = seed(repository);
    assert.equal(repository.workspace().requests[0].status, 'scheduled');
    const change = {
      ...workflow(requestId, 'request', 'scheduled'),
      plannedIntakeDate: '2020-01-03'
    };
    assert.throws(() => repository.updateWorkflow(change), /причину/);
    assert.equal(repository.workspace().requests[0].plannedIntakeDate, '2020-01-01');
    assert.equal(repository.workspace().events.length, 1);
    repository.updateWorkflow({ ...change, note: 'Немає місця в цеху' });
    const workspace = repository.workspace();
    assert.equal(workspace.requests[0].plannedIntakeDate, '2020-01-03');
    assert.equal(workspace.events[0].previousIntakeDate, '2020-01-01');
    assert.equal(workspace.events[0].note, 'Немає місця в цеху');
  } finally {
    repository.close();
  }
});

test('late receipt keeps the original plan; conversion produces a single board card', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const source = seed(repository);
    const orderId = repository.createOrder({
      ...source,
      description: 'Фарбування',
      actualIntakeDate: '2020-01-05',
      items: [{ description: 'Бампер', quantity: 1, unitPrice: 100 }]
    });
    const workspace = repository.workspace();
    assert.equal(workspace.orders[0].id, orderId);
    assert.equal(workspace.orders[0].plannedIntakeDate, '2020-01-01');
    assert.equal(workspace.orders[0].actualIntakeDate, '2020-01-05');
    assert.equal(workspace.requests[0].status, 'converted');
    assert.equal(boardRecords(workspace).length, 1);
    assert.equal(
      overdueLabel({ kind: 'request', record: workspace.requests[0] }, '2020-01-11'),
      null
    );
    assert.equal(overdueLabel(boardRecords(workspace)[0], '2020-01-11'), 'Прострочено видачу');
  } finally {
    repository.close();
  }
});

test('ready and delivered facts are separate from promised dates, with stale updates rejected', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const source = seed(repository);
    const orderId = repository.createOrder({
      ...source,
      description: 'Фарбування',
      actualIntakeDate: '2020-01-05',
      items: [{ description: 'Бампер', quantity: 1, unitPrice: 100 }]
    });
    const ready = {
      ...workflow(orderId, 'order', 'in_progress'),
      status: 'ready' as const,
      actualReadyDate: '2020-01-08'
    };
    repository.updateWorkflow(ready);
    assert.throws(() => repository.updateWorkflow(ready), /іншому вікні/);
    repository.updateWorkflow({
      ...ready,
      expectedStatus: 'ready',
      status: 'delivered',
      actualDeliveryDate: '2020-01-15'
    });
    const order = repository.workspace().orders[0];
    assert.equal(order.plannedDeliveryDate, '2020-01-10');
    assert.equal(order.actualDeliveryDate, '2020-01-15');
    assert.equal(overdueLabel({ kind: 'order', record: order }, '2020-01-16'), null);
    assert.throws(
      () => repository.updateWorkflow({ ...workflow(orderId, 'order', 'delivered') }),
      /причину/
    );
    repository.updateWorkflow({
      ...workflow(orderId, 'order', 'delivered'),
      note: 'Повторна перевірка'
    });
    assert.equal(repository.workspace().orders[0].actualDeliveryDate, null);
    assert.match(repository.workspace().events[0].note, /2020-01-15/);
  } finally {
    repository.close();
  }
});

test('chronology and workflow boundaries are validated', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const { requestId } = seed(repository);
    const input = workflow(requestId, 'request', 'scheduled');
    assert.equal(workflowSchema.safeParse({ ...input, status: 'in_progress' }).success, false);
    assert.equal(
      workflowSchema.safeParse({ ...input, plannedDeliveryDate: '2019-12-01' }).success,
      false
    );
    const facts = {
      ...input,
      kind: 'order',
      status: 'delivered',
      actualIntakeDate: '2020-01-05',
      actualReadyDate: '2020-01-04',
      actualDeliveryDate: '2020-01-06'
    };
    assert.equal(workflowSchema.safeParse(facts).success, false);
    assert.equal(
      workflowSchema.safeParse({
        ...facts,
        actualReadyDate: '2020-01-05',
        actualDeliveryDate: '2999-01-01'
      }).success,
      false
    );
    const target = { kind: 'request' as const, record: repository.workspace().requests[0] };
    assert.equal(transitionKind(target, 'in_progress'), 'convert');
    assert.equal(transitionKind(target, 'delivered'), 'invalid');
    assert.equal(transitionKind(target, 'backlog'), 'workflow');
  } finally {
    repository.close();
  }
});

test('workshop calendar dates follow Kyiv time across UTC midnight', () => {
  assert.equal(businessToday(new Date('2026-10-31T22:30:00Z')), '2026-11-01');
});

test('v1 migration keeps existing customers, orders, positions and administrator and is repeatable', () => {
  const folder = mkdtempSync(join(tmpdir(), 'autopaint-migration-'));
  const filename = join(folder, 'legacy.sqlite');
  const legacy = new DatabaseSync(filename);
  legacy.exec(`
    CREATE TABLE crm_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO crm_settings VALUES ('admin', 'existing-admin');
    CREATE TABLE crm_customers (id TEXT PRIMARY KEY, name TEXT, phone TEXT, notes TEXT, createdAt TEXT);
    INSERT INTO crm_customers VALUES ('customer', 'Existing customer', '0501234567', '', '2020-01-01');
    CREATE TABLE crm_vehicles (id TEXT PRIMARY KEY, customerId TEXT, make TEXT, model TEXT, plate TEXT, vin TEXT);
    INSERT INTO crm_vehicles VALUES ('vehicle', 'customer', 'Ford', 'Focus', '', 'WVWZZZ1JZXW000001');
    CREATE TABLE crm_requests (id TEXT PRIMARY KEY, customerId TEXT, vehicleId TEXT, description TEXT, status TEXT, createdAt TEXT);
    INSERT INTO crm_requests VALUES ('request', 'customer', 'vehicle', 'Existing work', 'converted', '2020-01-01');
    CREATE TABLE crm_orders (number INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE, requestId TEXT, customerId TEXT, vehicleId TEXT, description TEXT, createdAt TEXT);
    INSERT INTO crm_orders VALUES (7, 'order', 'request', 'customer', 'vehicle', 'Existing work', '2020-01-01');
    CREATE TABLE crm_order_items (orderId TEXT, position INTEGER, description TEXT, quantity INTEGER, unitPriceCents INTEGER, PRIMARY KEY(orderId, position));
    INSERT INTO crm_order_items VALUES ('order', 0, 'Paint', 2, 12345);
    PRAGMA user_version = 1;
  `);
  legacy.close();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const repository = new CrmRepository(filename);
      try {
        repository.authorize('existing-admin');
        const workspace = repository.workspace();
        assert.equal(workspace.orders[0].number, 7);
        assert.equal(workspace.orders[0].totalCents, 24690);
        assert.equal(workspace.orders[0].status, 'in_progress');
        assert.equal(
          workspace.orders[0].actualIntakeDate,
          null,
          'do not invent factual dates for legacy orders'
        );
        assert.equal(workspace.requests[0].status, 'converted');
        assert.equal(workspace.customers[0].name, 'Existing customer');
        assert.equal(workspace.events.length, 0);
      } finally {
        repository.close();
      }
    }
  } finally {
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
    assert.ok(basename(folder).startsWith('autopaint-migration-'));
    rmSync(folder, { recursive: true, force: true });
  }
});
