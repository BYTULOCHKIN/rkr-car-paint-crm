import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository } from '../server/repository';
import { businessToday } from '../lib/workflow';

const repos: CrmRepository[] = [];
afterEach(() => repos.splice(0).forEach((repo) => repo.close()));
const actor = { id: 'admin', name: 'Адміністратор' };
function setup(path = ':memory:') {
  const repo = new CrmRepository(path);
  repos.push(repo);
  const customerId = repo.createCustomer({ name: 'Клієнт', phone: '0501234567', notes: '' });
  const vehicleId = repo.createVehicle({
    customerId,
    make: 'Ford',
    model: 'Focus',
    year: 2020,
    plate: '',
    vin: 'WVWZZZ1JZXW000001'
  });
  const input = {
    customerId,
    vehicleId,
    requestId: '',
    assigneeId: 'worker',
    description: 'Ремонт бампера',
    items: [{ description: 'Фарбування', quantity: 1, unitPrice: 1500 }],
    paintPlan: [{ partId: 'hood' as const, mode: 'one_side' as const }]
  };
  const id = repo.createOrder(
    { ...input, paintPlan: [{ partId: 'hood', mode: 'both_sides' }] },
    'Маляр',
    actor
  );
  const order = () => repo.workspace(true).orders.find((entry) => entry.id === id)!;
  const trash = (action: 'trash' | 'restore' = 'trash') => ({
    orgId: 'org_test',
    orderId: id,
    expectedRevision: order().workflowRevision ?? 0,
    action
  });
  const transition = (status: 'in_progress' | 'ready', net = false) =>
    repo.updateWorkflow(
      {
        kind: 'order',
        id,
        expectedStatus: order().status,
        expectedRevision: order().workflowRevision,
        status,
        plannedIntakeDate: '',
        plannedDeliveryDate: '',
        actualIntakeDate: businessToday(),
        actualReadyDate: status === 'ready' ? businessToday() : '',
        actualDeliveryDate: '',
        note: ''
      },
      actor,
      net ? { netSalary: true } : undefined
    );
  return {
    repo,
    id,
    order,
    trash,
    transition,
    input: { ...input, paintPlan: [{ partId: 'hood' as const, mode: 'both_sides' as const }] }
  };
}
test('trash hides an order and its events; restore preserves identity, state, client work and history without posting wages', () => {
  const { repo, id, order, trash, transition, input } = setup();
  transition('in_progress');
  transition('ready');
  const original = order();
  const command = trash();
  repo.changeOrderTrash(command, actor);
  assert.equal(repo.workspace().orders.length, 0);
  assert.equal(repo.reportSnapshot().workspace.orders.length, 0);
  assert.equal(
    repo.workspace().events.some((event) => event.recordId === id),
    false
  );
  assert.equal(order().deletedBy?.id, actor.id);
  assert.ok(order().deletedAt);
  assert.equal(order().status, 'ready');
  assert.throws(() => repo.changeOrderTrash(command, actor), /змінено/);
  repo.changeOrderTrash(trash('restore'), actor);
  assert.equal(order().deletedAt, null);
  assert.equal(order().deletedBy, null);
  assert.equal(order().number, original.number);
  assert.equal(order().status, original.status);
  assert.deepEqual(order().items, original.items);
  assert.deepEqual(order().paintPlan, original.paintPlan);
  assert.equal(order().totalCents, original.totalCents);
  assert.equal(repo.workspace().events.filter((event) => /кошик/.test(event.note)).length, 2);
  assert.equal(repo.settlements.postings().length, 0);
  const nextId = repo.createOrder(input, 'Маляр', actor);
  assert.equal(
    repo.workspace().orders.find((entry) => entry.id === nextId)!.number,
    original.number + 1
  );
});
test('client payments block trash even after reversal; no cash or stock records are changed', () => {
  const { repo, id, trash } = setup();
  const stale = trash();
  const paymentId = repo.payments.receive(
    { orderId: id, operationId: randomUUID(), amount: '100', note: '' },
    actor
  );
  const before = JSON.stringify(repo.reportSnapshot());
  assert.throws(() => repo.changeOrderTrash(stale, actor), /оплати/);
  assert.equal(JSON.stringify(repo.reportSnapshot()), before);
  repo.payments.reverse({ paymentId, operationId: randomUUID(), note: 'Помилковий платіж' }, actor);
  assert.throws(() => repo.changeOrderTrash(trash(), actor), /оплати/);
});
test('material movements block trash even when fully reversed; contractor expenses also block after archiving', () => {
  const { repo, id, trash, transition, order } = setup();
  transition('in_progress');
  const itemId = repo.inventory.createItem({ name: 'Лак', unit: 'л', notes: '' });
  repo.inventory.receive(
    {
      itemId,
      quantity: '10',
      operationId: randomUUID(),
      totalAmount: '1000',
      currency: 'UAH',
      exchangeRate: '1',
      note: ''
    },
    actor
  );
  const operationId = randomUUID();
  repo.inventory.consume(
    { orderId: id, itemId, operationId, quantity: '1', category: 'painting', note: '' },
    actor
  );
  assert.throws(() => repo.changeOrderTrash(trash(), actor), /складські/);
  repo.inventory.reverse(
    { operationId: randomUUID(), movementId: operationId, note: 'Виправлення' },
    actor
  );
  assert.throws(() => repo.changeOrderTrash(trash(), actor), /складські/);
  const other = setup();
  const expenseId = other.repo.expenses.save(
    {
      orgId: 'org_test',
      orderId: other.id,
      expectedRevision: other.order().workflowRevision!,
      operationId: randomUUID(),
      expenseNameId: 'soldering',
      contractorUserId: 'subcontractor',
      note: '',
      amount: '100'
    },
    actor,
    false,
    { id: 'subcontractor', name: 'Майстер' }
  );
  assert.throws(() => other.repo.changeOrderTrash(other.trash(), actor), /субпідряд/);
  other.repo.expenses.save(
    {
      orgId: 'org_test',
      orderId: other.id,
      operationId: randomUUID(),
      expectedRevision: other.order().workflowRevision!,
      id: expenseId
    },
    actor,
    true
  );
  assert.throws(() => other.repo.changeOrderTrash(other.trash(), actor), /субпідряд/);
  assert.equal(order().status, 'in_progress');
});
test('salary postings and advances block trash regardless of client payment', () => {
  const { repo, trash, transition } = setup();
  transition('in_progress');
  transition('ready', true);
  assert.equal(repo.payments.list().length, 0);
  assert.throws(() => repo.changeOrderTrash(trash(), actor), /нарахування|зарплати/);
  const other = setup();
  other.repo.settlements.cash(
    {
      orgId: 'org_test',
      orderId: other.id,
      operationId: randomUUID(),
      payeeKind: 'worker',
      payeeId: 'worker',
      kind: 'payout',
      amount: '100',
      note: ''
    },
    actor,
    { kind: 'worker', id: 'worker', name: 'Маляр' }
  );
  assert.throws(() => other.repo.changeOrderTrash(other.trash(), actor), /виплати/);
});
test('stale forms cannot edit, advance or add payments, materials and expenses to a trashed order', () => {
  const { repo, id, order, trash, input, transition } = setup();
  transition('in_progress');
  const current = order();
  repo.changeOrderTrash(trash(), actor);
  const before = JSON.stringify(repo.workspace(true));
  assert.throws(
    () =>
      repo.updateClientOrder(
        {
          id,
          expectedRevision: current.workflowRevision,
          description: 'Не зберігати',
          items: input.items
        },
        undefined,
        actor
      ),
    /кошику/
  );
  assert.throws(
    () =>
      repo.updateWorkflow(
        {
          kind: 'order',
          id,
          expectedStatus: current.status,
          expectedRevision: current.workflowRevision,
          status: 'ready',
          plannedIntakeDate: '',
          plannedDeliveryDate: '',
          actualIntakeDate: businessToday(),
          actualReadyDate: businessToday(),
          actualDeliveryDate: '',
          note: ''
        },
        actor,
        { netSalary: true }
      ),
    /кошику/
  );
  assert.throws(
    () =>
      repo.payments.receive(
        { orderId: id, operationId: randomUUID(), amount: '10', note: '' },
        actor
      ),
    /не знайдено/
  );
  assert.throws(
    () =>
      repo.inventory.consume(
        {
          orderId: id,
          itemId: randomUUID(),
          operationId: randomUUID(),
          quantity: '1',
          category: 'painting',
          note: ''
        },
        actor
      ),
    /не знайдено/
  );
  assert.throws(
    () =>
      repo.expenses.save(
        {
          orgId: 'org_test',
          orderId: id,
          expectedRevision: order().workflowRevision!,
          operationId: randomUUID(),
          expenseNameId: 'other',
          contractorUserId: 'subcontractor',
          note: '',
          amount: '10'
        },
        actor
      ),
    /не знайдено/
  );
  assert.throws(
    () =>
      repo.settlements.cash(
        {
          orgId: 'org_test',
          orderId: id,
          operationId: randomUUID(),
          payeeKind: 'worker',
          payeeId: 'worker',
          kind: 'payout',
          amount: '100',
          note: ''
        },
        actor,
        { kind: 'worker', id: 'worker', name: 'Маляр' }
      ),
    /не знайдено/
  );
  assert.equal(JSON.stringify(repo.workspace(true)), before);
});
test('trash survives reopening and two connections cannot restore using an obsolete revision', () => {
  const folder = mkdtempSync(join(tmpdir(), 'crm-trash-'));
  try {
    const path = join(folder, 'crm.sqlite');
    const { repo, id, trash } = setup(path);
    repo.changeOrderTrash(trash(), actor);
    const second = new CrmRepository(path);
    repos.push(second);
    assert.equal(second.workspace().orders.length, 0);
    const archived = second.workspace(true).orders[0];
    assert.equal(archived.id, id);
    const restore = {
      orgId: 'org_test',
      orderId: id,
      expectedRevision: archived.workflowRevision!,
      action: 'restore' as const
    };
    second.changeOrderTrash(restore, actor);
    assert.throws(() => repo.changeOrderTrash(restore, actor), /змінено/);
    assert.equal(repo.workspace().orders.length, 1);
  } finally {
    repos.splice(0).forEach((repo) => repo.close());
    rmSync(folder, { recursive: true, force: true });
  }
});

test('permanent deletion requires trash, removes order details and never reuses its number', () => {
  const { repo, id, order, trash, input } = setup();
  repo.saveOrderLabor(
    {
      orgId: 'org_test',
      orderId: id,
      operationId: randomUUID(),
      expectedRevision: order().workflowRevision!,
      labor: {
        painter: { workerId: 'worker', workerName: 'Маляр', shareBps: 6000 },
        polisher: { workerId: '', workerName: '', shareBps: 6000 },
        assembler: { workerId: '', workerName: '', shareBps: 6000 },
        polishingCents: 0,
        assemblyCents: 0
      }
    },
    [{ id: 'worker', name: 'Маляр', identifier: 'worker@example.com', role: 'worker' }],
    actor
  );
  assert.throws(
    () => repo.changeOrderTrash({ ...trash(), action: 'delete' }, actor),
    /лише з кошика/
  );
  const original = order();
  const stale = { ...trash(), action: 'delete' as const };
  repo.changeOrderTrash(trash(), actor);
  assert.throws(() => repo.changeOrderTrash(stale, actor), /змінено/);
  const command = { ...trash(), action: 'delete' as const };
  repo.changeOrderTrash(command, actor);
  assert.equal(repo.workspace(true).orders.length, 0);
  assert.equal(
    repo.workspace(true).events.some((event) => event.kind === 'order' && event.recordId === id),
    false
  );
  assert.equal(repo.workspace().customers.length, 1);
  assert.equal(repo.workspace().vehicles.length, 1);
  assert.throws(() => repo.reads.order(id), /не знайдено/);
  const nextId = repo.createOrder(input, 'Маляр', actor);
  assert.equal(repo.reads.order(nextId).orders[0].number, original.number + 1);
  assert.throws(() => repo.changeOrderTrash(command, actor), /не знайдено/);
  assert.equal(repo.reads.order(nextId).orders[0].id, nextId);
});

test('permanent deletion preserves source requests and rolls back all child cleanup on failure', () => {
  const folder = mkdtempSync(join(tmpdir(), 'crm-permanent-delete-'));
  const path = join(folder, 'crm.sqlite');
  const { repo, id, order, trash, input } = setup(path);
  const db = new DatabaseSync(path);
  try {
    const requestId = repo.createRequest({
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      description: 'Архівна заявка'
    });
    const linkedId = repo.createOrder({ ...input, requestId }, 'Маляр', actor);
    const linked = () => repo.workspace(true).orders.find((entry) => entry.id === linkedId)!;
    repo.changeOrderTrash(
      {
        orgId: 'org_test',
        orderId: linkedId,
        expectedRevision: linked().workflowRevision!,
        action: 'trash'
      },
      actor
    );
    const source = repo.workspace(true).requests;
    const sourceHistory = repo.workspace(true).events.filter((event) => event.kind === 'request');
    repo.changeOrderTrash(
      {
        orgId: 'org_test',
        orderId: linkedId,
        expectedRevision: linked().workflowRevision!,
        action: 'delete'
      },
      actor
    );
    assert.deepEqual(repo.workspace(true).requests, source);
    assert.deepEqual(
      repo.workspace(true).events.filter((event) => event.kind === 'request'),
      sourceHistory
    );
    repo.changeOrderTrash(trash(), actor);
    const before = JSON.stringify(repo.workspace(true));
    db.exec(
      "CREATE TRIGGER reject_order_delete BEFORE DELETE ON crm_orders BEGIN SELECT RAISE(ABORT,'test rollback'); END"
    );
    assert.throws(
      () => repo.changeOrderTrash({ ...trash(), action: 'delete' }, actor),
      /test rollback/
    );
    assert.equal(JSON.stringify(repo.workspace(true)), before);
    assert.equal(order().items.length, input.items.length);
    db.exec('DROP TRIGGER reject_order_delete');
    repo.changeOrderTrash({ ...trash(), action: 'delete' }, actor);
    assert.equal(
      repo.workspace(true).orders.some((entry) => entry.id === id),
      false
    );
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
    repos.splice(0).forEach((repo) => repo.close());
    rmSync(folder, { recursive: true, force: true });
  }
});

for (const history of [
  'reversed_payment',
  'reversed_amount_material',
  'zero_salary_posting'
] as const)
  test(`permanent deletion rechecks accounting history in trash: ${history}`, () => {
    const folder = mkdtempSync(join(tmpdir(), 'crm-delete-blocker-'));
    const path = join(folder, 'crm.sqlite');
    const { repo, id, order, trash, transition, input } = setup(path);
    const db = new DatabaseSync(path);
    try {
      if (history === 'reversed_payment') {
        const paymentId = repo.payments.receive(
          { orderId: id, operationId: randomUUID(), amount: '10', note: '' },
          actor
        );
        repo.payments.reverse({ paymentId, operationId: randomUUID(), note: 'Помилка' }, actor);
      } else if (history === 'reversed_amount_material') {
        transition('in_progress');
        const itemId = repo.inventory.createItem({
          name: 'Фарба',
          unit: '',
          accountingMode: 'amount',
          notes: ''
        });
        const operationId = randomUUID();
        repo.inventory.consume(
          { itemId, orderId: id, operationId, quantity: '', amount: '100', note: '' },
          actor
        );
        repo.inventory.reverse(
          { movementId: operationId, operationId: randomUUID(), note: 'Помилка' },
          actor
        );
        assert.equal(repo.inventory.items()[0].balanceMilli, 0);
      } else {
        repo.updateClientOrder(
          {
            id,
            description: input.description,
            items: input.items.map((item) => ({ ...item, unitPrice: 0 }))
          },
          'Маляр',
          actor
        );
        transition('in_progress');
        transition('ready', true);
        assert.equal(repo.settlements.latest(id)!.result.employeeAccrualsCents, 0);
      }
      // Represents historical/imported trash; current write APIs forbid adding these operations there.
      db.prepare('UPDATE crm_orders SET deletedAt=? WHERE id=?').run(new Date().toISOString(), id);
      const before = JSON.stringify(repo.workspace(true));
      assert.ok(order().trashBlockedReason);
      assert.throws(
        () => repo.changeOrderTrash({ ...trash(), action: 'delete' }, actor),
        /Не можна видалити/
      );
      assert.equal(JSON.stringify(repo.workspace(true)), before);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
      db.close();
      repos.splice(0).forEach((repo) => repo.close());
      rmSync(folder, { recursive: true, force: true });
    }
  });
