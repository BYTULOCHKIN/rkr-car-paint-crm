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
      expectedRevision: 1,
      status: 'delivered',
      actualDeliveryDate: '2020-01-15'
    });
    const order = repository.workspace().orders[0];
    assert.equal(order.plannedDeliveryDate, '2020-01-10');
    assert.equal(order.actualDeliveryDate, '2020-01-15');
    assert.equal(overdueLabel({ kind: 'order', record: order }, '2020-01-16'), null);
    assert.throws(
      () =>
        repository.updateWorkflow({
          ...workflow(orderId, 'order', 'delivered'),
          expectedRevision: 2
        }),
      /причину/
    );
    repository.updateWorkflow({
      ...workflow(orderId, 'order', 'delivered'),
      expectedRevision: 2,
      note: 'Повторна перевірка'
    });
    assert.equal(repository.workspace().orders[0].actualDeliveryDate, null);
    assert.equal(repository.workspace().events[0].note, 'Повторна перевірка');
    assert.ok(
      repository
        .workspace()
        .events[0].actualDateChanges?.some(
          (change) =>
            change.field === 'actualDeliveryDate' &&
            change.before === '2020-01-15' &&
            change.after === null
        )
    );
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
    const consistentFacts = { ...facts, actualReadyDate: '2020-01-05' };
    assert.equal(
      workflowSchema.safeParse({ ...consistentFacts, status: 'in_progress' }).success,
      false
    );
    assert.equal(workflowSchema.safeParse({ ...consistentFacts, status: 'ready' }).success, false);
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

test('unchanged saves do not create events; notes and same-status date edits use optimistic revisions', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const { requestId } = seed(repository);
    const initial = workflow(requestId, 'request', 'scheduled');
    repository.updateWorkflow(initial);
    repository.updateWorkflow({ ...initial, note: '   ' });
    assert.equal(repository.workspace().events.length, 1);
    assert.equal(repository.workspace().requests[0].workflowRevision, 0);
    repository.updateWorkflow({
      ...initial,
      note: 'Нова домовленість',
      plannedIntakeDate: '2020-01-02'
    });
    assert.equal(repository.workspace().requests[0].workflowRevision, 1);
    const before = repository.workspace();
    assert.throws(
      () => repository.updateWorkflow({ ...initial, note: 'Застаріла форма' }),
      /іншому вікні/
    );
    assert.deepEqual(repository.workspace(), before);
    repository.updateWorkflow({
      ...initial,
      expectedRevision: 1,
      plannedIntakeDate: '2020-01-02',
      note: 'Телефонували клієнту'
    });
    assert.equal(repository.workspace().events.length, 3);
    assert.equal(repository.workspace().events[0].note, 'Телефонували клієнту');
    assert.deepEqual(repository.workspace().events[0].actualDateChanges, []);
  } finally {
    repository.close();
  }
});

test('initial intake and later factual corrections are structured, with a separate user reason', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const source = seed(repository);
    const id = repository.createOrder({
      ...source,
      description: 'Роботи',
      actualIntakeDate: '2020-01-05',
      items: [{ description: 'Робота', quantity: 1, unitPrice: 100 }]
    });
    const initial = repository.workspace().events.find((event) => event.kind === 'order')!;
    assert.deepEqual(initial.actualDateChanges, [
      { field: 'actualIntakeDate', before: null, after: '2020-01-05' }
    ]);
    assert.throws(
      () =>
        repository.updateWorkflow({
          ...workflow(id, 'order', 'in_progress'),
          actualIntakeDate: '2020-01-04'
        }),
      /причину/
    );
    repository.updateWorkflow({
      ...workflow(id, 'order', 'in_progress'),
      actualIntakeDate: '2020-01-04',
      note: 'Виправили дату прийому'
    });
    const event = repository.workspace().events[0];
    assert.equal(event.note, 'Виправили дату прийому');
    assert.deepEqual(event.actualDateChanges, [
      { field: 'actualIntakeDate', before: '2020-01-05', after: '2020-01-04' }
    ]);
  } finally {
    repository.close();
  }
});

test('conversion cannot restore a plan cleared in another window', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const source = seed(repository);
    repository.updateWorkflow({
      ...workflow(source.requestId, 'request', 'scheduled'),
      status: 'backlog',
      plannedIntakeDate: '',
      plannedDeliveryDate: '',
      note: 'Клієнт скасував дату'
    });
    const before = repository.workspace();
    assert.throws(
      () =>
        repository.createOrder({
          ...source,
          description: 'Роботи',
          plannedIntakeDate: '2020-01-01',
          plannedDeliveryDate: '2020-01-10',
          items: [{ description: 'Робота', quantity: 1, unitPrice: 100 }]
        }),
      /перенесіть/
    );
    assert.deepEqual(repository.workspace(), before);
  } finally {
    repository.close();
  }
});

test('v4 event migration preserves legacy notes without inventing factual changes', () => {
  const folder = mkdtempSync(join(tmpdir(), 'autopaint-history-migration-'));
  const filename = join(folder, 'legacy.sqlite');
  const initial = new CrmRepository(filename);
  const { requestId } = seed(initial);
  initial.close();
  const legacy = new DatabaseSync(filename);
  const note = 'Причина\nФактична видача: 2020-01-15 → —';
  legacy.prepare('UPDATE crm_workflow_events SET note = ?').run(note);
  legacy.exec(
    'ALTER TABLE crm_workflow_events DROP COLUMN orderChanges; ALTER TABLE crm_workflow_events DROP COLUMN actualDateChanges; ALTER TABLE crm_requests DROP COLUMN workflowRevision; ALTER TABLE crm_orders DROP COLUMN workflowRevision; PRAGMA user_version = 4;'
  );
  legacy.close();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const repository = new CrmRepository(filename);
      try {
        assert.equal(repository.workspace().events[0].note, note);
        assert.equal(repository.workspace().events[0].actualDateChanges, null);
        assert.equal(repository.workspace().requests[0].workflowRevision, 0);
        assert.equal(repository.workspace().requests[0].id, requestId);
      } finally {
        repository.close();
      }
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
