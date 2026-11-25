import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository } from '../server/repository';
import { orderSchema } from '../schemas/crm';
import type { CrmAccess } from '../api/types';

const worker: CrmAccess = { userId: 'mine', orgId: 'org_test', role: 'worker' };
const admin: CrmAccess = { ...worker, role: 'admin' };
const actor = { id: 'admin', name: 'Адміністратор' };

function fixture(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'crm-order-access-'));
  const filename = join(root, 'crm.sqlite');
  const repository = new CrmRepository(filename);
  const db = new DatabaseSync(filename);
  t.after(() => {
    db.close();
    repository.close();
    rmSync(root, { recursive: true, force: true });
  });
  const customerId = repository.createCustomer({
    name: 'Клієнт',
    phone: '+380991112233',
    notes: ''
  });
  const vehicleId = repository.createVehicle({
    customerId,
    make: 'FORD',
    model: 'Focus',
    year: 2020,
    plate: '',
    vin: 'WVWZZZ1JZXW000001'
  });
  const ids: Record<string, string> = {};
  for (const key of [
    'responsible',
    'painter',
    'polisher',
    'assembler',
    'legacy',
    'other',
    'staleLegacy',
    'trash'
  ]) {
    ids[key] = repository.createClientOrder(
      orderSchema.parse({
        customerId,
        vehicleId,
        requestId: '',
        assigneeId: key === 'responsible' || key === 'trash' ? 'mine' : 'other',
        description: key,
        items: [{ description: key, quantity: 1, unitPrice: 1000 }]
      }),
      'Працівник',
      actor
    );
  }
  for (const role of ['painter', 'polisher', 'assembler']) {
    const labor = Object.fromEntries(
      ['painter', 'polisher', 'assembler'].map((key) => [
        key,
        { workerId: key === role ? 'mine' : 'other', workerName: 'Працівник', shareBps: 6000 }
      ])
    );
    db.prepare('UPDATE crm_orders SET labor=? WHERE id=?').run(
      JSON.stringify({ ...labor, polishingCents: 100, assemblyCents: 100 }),
      ids[role]
    );
  }
  for (const key of ['legacy', 'staleLegacy']) {
    db.prepare('INSERT INTO crm_order_economics(orderId,details) VALUES (?,?)').run(
      ids[key],
      JSON.stringify({ painterId: 'mine', employeeShareBps: 6000, lines: [] })
    );
  }
  db.prepare('UPDATE crm_orders SET labor=? WHERE id=?').run(
    JSON.stringify({
      painter: { workerId: 'other' },
      polisher: { workerId: '' },
      assembler: { workerId: '' }
    }),
    ids.staleLegacy
  );
  db.prepare("UPDATE crm_orders SET deletedAt='2026-11-25T00:00:00Z' WHERE id=?").run(ids.trash);
  db.prepare("UPDATE crm_orders SET status='in_progress' WHERE id IN (?,?)").run(
    ids.painter,
    ids.other
  );
  db.prepare("UPDATE crm_orders SET status='ready' WHERE id=?").run(ids.polisher);
  return { repository, db, ids, customerId, vehicleId };
}

test('worker SQL lists, pagination, search and board counts include only current assignments in any role', (t) => {
  const { repository, ids } = fixture(t);
  const visible = ['responsible', 'painter', 'polisher', 'assembler', 'legacy'].map(
    (key) => ids[key]
  );
  const found: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const result = repository.reads.list({ entity: 'orders', pageSize: 2, page }, [], worker);
    assert.equal(result.pagination!.total, visible.length);
    assert.ok(result.orders.length <= 2);
    assert.ok(result.orders.every((order) => visible.includes(order.id)));
    found.push(...result.orders.map((order) => order.id));
  }
  assert.deepEqual(new Set(found), new Set(visible));
  assert.equal(
    repository.reads.list({ entity: 'orders', search: 'other' }, [], worker).pagination!.total,
    0
  );
  assert.equal(
    repository.reads.list({ entity: 'orders', status: 'in_progress' }, [], worker).pagination!
      .total,
    1
  );
  const board = repository.reads.list({ entity: 'kanban', pageSize: 1 }, [], worker);
  assert.equal(board.boardTotal, visible.length);
  assert.deepEqual(board.boardCounts, { created: 3, in_progress: 1, ready: 1 });
  assert.equal(board.pagination!.total, visible.length);
  assert.equal(repository.reads.list({ entity: 'orders' }, [], admin).pagination!.total, 7);
  assert.equal(
    repository.reads.list({ entity: 'orders' }, [], { ...worker, userId: 'unassigned' }).pagination!
      .total,
    0
  );
  assert.equal(
    repository.reads.list({ entity: 'kanban' }, [], { ...worker, userId: "mine' OR 1=1 --" })
      .boardTotal,
    0
  );
  assert.throws(() =>
    repository.reads.list({ entity: 'orders', userId: 'other' } as never, [], worker)
  );
  for (const entity of ['customers', 'vehicles', 'requests'] as const)
    assert.throws(() => repository.reads.list({ entity }, [], worker), /адміністратору/);
  assert.throws(
    () => repository.reads.list({ entity: 'orders', trash: true }, [], worker),
    /адміністратору/
  );
});

test('direct order, history, print lookup and workspace deny other assignments and recheck reassignment immediately', (t) => {
  const { repository, db, ids, customerId, vehicleId } = fixture(t);
  for (const key of ['other', 'staleLegacy', 'trash']) {
    assert.throws(() => repository.reads.order(ids[key], worker), /Замовлення не знайдено/);
    assert.equal(repository.reads.findOrder(ids[key], worker), null);
    assert.throws(
      () => repository.reads.history('order', ids[key], worker),
      /Замовлення не знайдено/
    );
  }
  assert.equal(
    repository.reads.order(ids.polisher, worker).orders[0].labor!.painter.workerId,
    'other'
  );
  assert.ok(
    repository.reads
      .history('order', ids.painter, worker)
      .events.every((event) => event.recordId === ids.painter)
  );
  assert.equal(repository.reads.order(ids.other, admin).orders[0].id, ids.other);
  assert.throws(() => repository.reads.history('customer', customerId, worker), /адміністратору/);
  assert.throws(() => repository.reads.history('vehicle', vehicleId, worker), /адміністратору/);
  const all = repository.reads.workspace(worker);
  assert.equal(all.orders.length, 5);
  assert.ok(all.events.every((event) => all.orders.some((order) => order.id === event.recordId)));
  assert.deepEqual(repository.reads.workspace({ ...worker, userId: 'unassigned' }).customers, []);
  db.prepare('UPDATE crm_orders SET assigneeId=? WHERE id=?').run('other', ids.responsible);
  assert.equal(repository.reads.findOrder(ids.responsible, worker), null);
  assert.equal(repository.reads.list({ entity: 'orders' }, [], worker).pagination!.total, 4);
  db.prepare('UPDATE crm_orders SET assigneeId=? WHERE id=?').run('mine', ids.other);
  assert.equal(repository.reads.order(ids.other, worker).orders[0].id, ids.other);
});

test('material journals never disclose hidden order references and totals are scoped before pagination', (t) => {
  const { repository, db, ids } = fixture(t);
  db.prepare("UPDATE crm_orders SET status='in_progress' WHERE id=?").run(ids.responsible);
  const itemId = repository.inventory.createItem({ name: 'Лак', unit: 'л', notes: '' });
  repository.inventory.receive(
    {
      itemId,
      operationId: crypto.randomUUID(),
      quantity: '10',
      currency: 'UAH',
      totalAmount: '1000',
      exchangeRate: '1',
      note: ''
    },
    actor
  );
  for (const orderId of [ids.responsible, ids.painter, ids.other])
    repository.inventory.consume(
      {
        itemId,
        orderId,
        operationId: crypto.randomUUID(),
        quantity: '1',
        note: '',
        category: 'painting'
      },
      actor
    );
  assert.equal(repository.inventory.movements().length, 4);
  const visible = repository.inventory.movements(worker);
  assert.equal(visible.length, 3);
  assert.ok(visible.every((row) => row.orderId !== ids.other));
  assert.equal(repository.inventory.listMovements({ orderId: ids.other }, worker).total, 0);
  const first = repository.inventory.listMovements({ itemId, pageSize: 2 }, worker);
  const second = repository.inventory.listMovements({ itemId, pageSize: 2, page: 2 }, worker);
  assert.equal(first.total, 3);
  assert.equal(second.total, 3);
  assert.deepEqual([...first.items, ...second.items], visible);
  assert.equal(repository.inventory.listMovements({ itemId }, admin).total, 4);
});

test('team subcontractors have access only while their expense is active, independently of payroll settings', (t) => {
  const { repository, db, ids } = fixture(t);
  const expenseId = repository.expenses.save(
    {
      orgId: worker.orgId,
      orderId: ids.other,
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      expenseNameId: 'color_matching',
      contractorUserId: worker.userId,
      amount: '1000',
      note: ''
    },
    actor,
    false,
    { id: worker.userId, name: 'Колорист' }
  );
  assert.equal(repository.reads.order(ids.other, worker).orders[0].id, ids.other);
  assert.equal(repository.reads.list({ entity: 'orders' }, [], worker).pagination!.total, 6);
  db.prepare('UPDATE crm_order_expenses SET archived=1 WHERE id=?').run(expenseId);
  assert.equal(repository.reads.findOrder(ids.other, worker), null);
  db.prepare('UPDATE crm_order_expenses SET archived=0,contractorUserId=? WHERE id=?').run(
    'another',
    expenseId
  );
  assert.equal(repository.reads.findOrder(ids.other, worker), null);
  assert.equal(repository.reads.list({ entity: 'orders' }, [], worker).pagination!.total, 5);
});
