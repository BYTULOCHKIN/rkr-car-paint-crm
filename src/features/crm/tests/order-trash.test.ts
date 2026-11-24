import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
