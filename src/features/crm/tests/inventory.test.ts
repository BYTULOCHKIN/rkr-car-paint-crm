import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository, OrganizationRepositories } from '../server/repository';
import { itemSchema } from '@/features/inventory/schemas/inventory';

const actor = { id: 'user_admin', name: 'Адміністратор' };
function order(repository: CrmRepository): string {
  const customerId = repository.createCustomer({ name: 'Олена', phone: '0501234567', notes: '' });
  const vehicleId = repository.createVehicle({
    customerId,
    make: 'Ford',
    model: 'Focus',
    year: 2020,
    plate: '',
    vin: 'WVWZZZ1JZXW000001'
  });
  const id = repository.createOrder({
    requestId: '',
    customerId,
    vehicleId,
    description: 'Фарбування',
    actualIntakeDate: '2026-11-16',
    items: [{ description: 'Робота', quantity: 1, unitPrice: 100 }],
    paintPlan: []
  });
  repository.updateWorkflow({
    kind: 'order',
    id,
    expectedStatus: 'created',
    expectedRevision: 0,
    status: 'in_progress',
    plannedIntakeDate: '',
    plannedDeliveryDate: '',
    actualIntakeDate: '2026-11-16',
    actualReadyDate: '',
    actualDeliveryDate: '',
    note: ''
  });
  return id;
}
function receive(repository: CrmRepository, itemId: string, quantity = '1') {
  const input = {
    itemId,
    quantity,
    operationId: randomUUID(),
    note: '',
    totalAmount: '100',
    currency: 'UAH' as const,
    exchangeRate: '1'
  };
  repository.inventory.receive(input, actor);
  return input;
}

test('batch consumption is atomic, includes repeated positions and retries without duplicating costs', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const orderId = order(repository);
    const paint = repository.inventory.createItem({ name: 'Фарба', unit: 'л', notes: '' });
    const polish = repository.inventory.createItem({ name: 'Паста', unit: 'кг', notes: '' });
    receive(repository, paint);
    receive(repository, polish);
    const row = { itemId: paint, quantity: '0,6', category: 'painting' as const, note: '' };
    const input = {
      operationId: randomUUID(),
      orderId,
      rows: [row, { ...row, quantity: '0,5', category: 'polishing' as const }]
    };
    const before = repository.inventory.items();
    assert.throws(() => repository.inventory.consumeBatch(input, actor), /Недостатньо/);
    assert.deepEqual(repository.inventory.items(), before);
    assert.equal(
      repository.inventory.movements().filter((entry) => entry.kind === 'consumption').length,
      0
    );
    input.rows[1].quantity = '0,4';
    input.rows.push({ ...row, itemId: polish, quantity: '0,25' });
    repository.inventory.consumeBatch(input, actor);
    const saved = repository.inventory.movements();
    repository.inventory.consumeBatch(input, actor);
    assert.deepEqual(repository.inventory.movements(), saved);
    assert.equal(saved.filter((entry) => entry.kind === 'consumption').length, 3);
    assert.equal(
      saved
        .filter((entry) => entry.kind === 'consumption')
        .reduce((total, entry) => total + entry.costDeltaCents!, 0),
      -12500
    );
    assert.equal(repository.inventory.items().find((entry) => entry.id === paint)!.balanceMilli, 0);
    assert.equal(
      repository.inventory.items().find((entry) => entry.id === polish)!.balanceMilli,
      750
    );
    assert.throws(
      () => repository.inventory.consumeBatch({ ...input, rows: [row] }, actor),
      /іншими даними/
    );
    assert.throws(
      () => repository.inventory.consumeBatch(input, { ...actor, id: 'other' }),
      /іншими даними/
    );
    const current = repository.workspace().orders[0];
    repository.updateWorkflow({
      kind: 'order',
      id: orderId,
      expectedStatus: current.status,
      expectedRevision: current.workflowRevision,
      status: 'ready',
      plannedIntakeDate: '',
      plannedDeliveryDate: '',
      actualIntakeDate: '2026-11-16',
      actualReadyDate: '2026-11-17',
      actualDeliveryDate: '',
      note: ''
    });
    // A retry of an already completed request remains safe after readiness.
    repository.inventory.consumeBatch(input, actor);
    assert.throws(
      () =>
        repository.inventory.consumeBatch(
          {
            ...input,
            operationId: randomUUID(),
            rows: [{ ...row, itemId: polish, quantity: '0,1' }]
          },
          actor
        ),
      /В роботі/
    );
    assert.deepEqual(repository.inventory.movements(), saved);
  } finally {
    repository.close();
  }
});

test('fractional stock, atomic insufficient-stock rejection, retry safety and order total independence', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const orderId = order(repository);
    const itemId = repository.inventory.createItem({ name: 'Фарба', unit: 'л', notes: '' });
    for (const unit of ['літр', 'мл', 'упаковка', '']) {
      assert.equal(itemSchema.safeParse({ name: 'Матеріал', unit, notes: '' }).success, false);
      assert.throws(() =>
        repository.inventory.updateItem({ id: itemId, name: 'Фарба', unit, notes: '' })
      );
    }
    const receipt = receive(repository, itemId, '0,300');
    repository.inventory.receive(receipt, actor);
    const consumption = {
      itemId,
      orderId,
      quantity: '0.100',
      operationId: randomUUID(),
      note: 'Капот'
    };
    repository.inventory.consume(consumption, actor);
    repository.inventory.consume(consumption, actor);
    assert.equal(repository.inventory.items()[0].balanceMilli, 200);
    assert.equal(repository.inventory.movements().length, 2);
    assert.throws(
      () =>
        repository.inventory.consume(
          { ...consumption, quantity: '0.201', operationId: randomUUID() },
          actor
        ),
      /Недостатньо/
    );
    assert.equal(repository.inventory.movements().length, 2);
    assert.throws(
      () => repository.inventory.consume({ ...consumption, quantity: '0.200' }, actor),
      /іншими даними/
    );
    assert.equal(repository.workspace().orders[0].totalCents, 10000);
    const event = repository.inventory.movements()[0];
    assert.deepEqual(event.actor, actor);
    assert.equal(event.orderNumber, 1);
    assert.ok(Date.now() - Date.parse(event.createdAt) < 10000);
  } finally {
    repository.close();
  }
});

test('completed orders reject new consumption; cancellation returns stock once even from archived position', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stock-status-'));
  const filename = join(dir, 'crm.sqlite');
  const repository = new CrmRepository(filename);
  try {
    const orderId = order(repository);
    const itemId = repository.inventory.createItem({ name: 'Ґрунт', unit: 'кг', notes: '' });
    receive(repository, itemId);
    const consumption = { itemId, orderId, quantity: '0.250', operationId: randomUUID(), note: '' };
    repository.inventory.consume(consumption, actor);
    const db = new DatabaseSync(filename);
    db.prepare("UPDATE crm_orders SET status='ready' WHERE id=?").run(orderId);
    db.close();
    assert.throws(
      () => repository.inventory.consume({ ...consumption, operationId: randomUUID() }, actor),
      /В роботі/
    );
    repository.inventory.archive(itemId, true);
    const reversal = {
      movementId: consumption.operationId,
      operationId: randomUUID(),
      note: 'Помилка кількості'
    };
    repository.inventory.reverse(reversal, actor);
    repository.inventory.reverse(reversal, actor);
    assert.equal(repository.inventory.items()[0].balanceMilli, 1000);
    assert.equal(repository.inventory.movements().filter((entry) => entry.reversed).length, 1);
    assert.throws(
      () => repository.inventory.reverse({ ...reversal, operationId: randomUUID() }, actor),
      /вже скасоване/
    );
    assert.equal(repository.inventory.movements().length, 3);
  } finally {
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('catalog identity is frozen after movement; signed adjustments require a reason and cannot overdraw', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const itemId = repository.inventory.createItem({ name: 'Фарба', unit: 'л', notes: '' });
    assert.throws(
      () => repository.inventory.createItem({ name: 'фарба', unit: 'кг', notes: '' }),
      /вже існує/
    );
    repository.inventory.updateItem({ id: itemId, name: 'Емаль', unit: 'л', notes: '' });
    receive(repository, itemId);
    assert.throws(
      () => repository.inventory.updateItem({ id: itemId, name: 'Емаль', unit: 'мл', notes: '' }),
      /змінити не можна/
    );
    const adjustment = {
      itemId,
      operationId: randomUUID(),
      quantity: '-0,125',
      note: 'Інвентаризація'
    };
    repository.inventory.adjust(adjustment, actor);
    assert.equal(repository.inventory.items()[0].balanceMilli, 875);
    assert.throws(
      () =>
        repository.inventory.adjust(
          { ...adjustment, operationId: randomUUID(), quantity: '-1' },
          actor
        ),
      /Недостатньо/
    );
    assert.throws(() =>
      repository.inventory.adjust({ ...adjustment, operationId: randomUUID(), note: '' }, actor)
    );
    for (const quantity of ['0', '-1', '0.0001', 'NaN', '1e3']) {
      assert.throws(() => receive(repository, itemId, quantity));
    }
    repository.inventory.archive(itemId, true);
    assert.throws(() => receive(repository, itemId), /архіву/);
    repository.inventory.archive(itemId, false);
    receive(repository, itemId, '0.125');
    assert.equal(repository.inventory.items()[0].balanceMilli, 1000);
  } finally {
    repository.close();
  }
});

test('stock and history persist and are isolated by organization', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stock-org-'));
  const filename = join(dir, 'crm.sqlite');
  let registry = new OrganizationRepositories(filename);
  try {
    const a = registry.forOrganization('org_A', 'user_other', true);
    const b = registry.forOrganization('org_B', 'user_other', true);
    const itemId = a.inventory.createItem({ name: 'Матеріал', unit: 'шт', notes: '' });
    receive(a, itemId, '10');
    assert.equal(b.inventory.items().length, 0);
    assert.throws(() => receive(b, itemId));
    assert.throws(() =>
      b.inventory.reverse(
        { operationId: randomUUID(), movementId: a.inventory.movements()[0].id, note: 'Спроба' },
        actor
      )
    );
    registry.close();
    registry = new OrganizationRepositories(filename);
    assert.equal(
      registry.forOrganization('org_A', 'user_other', true).inventory.items()[0].balanceMilli,
      10000
    );
    assert.equal(
      registry.forOrganization('org_B', 'user_other', true).inventory.movements().length,
      0
    );
  } finally {
    registry.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('two connections cannot consume the same remaining stock and upgrading v8 preserves orders', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stock-migration-'));
  const filename = join(dir, 'crm.sqlite');
  let repository = new CrmRepository(filename);
  let second: CrmRepository | undefined;
  try {
    const orderId = order(repository);
    repository.close();
    const db = new DatabaseSync(filename);
    db.exec(
      'DROP TABLE stock_movements; DROP TABLE stock_items; DROP TABLE crm_vehicle_models; PRAGMA user_version=8'
    );
    db.close();
    repository = new CrmRepository(filename);
    assert.equal(repository.workspace().orders[0].id, orderId);
    const itemId = repository.inventory.createItem({ name: 'Фарба', unit: 'л', notes: '' });
    receive(repository, itemId, '0.300');
    second = new CrmRepository(filename);
    assert.equal(second.inventory.items()[0].balanceMilli, 300);
    repository.inventory.consume(
      { itemId, orderId, quantity: '0.200', operationId: randomUUID(), note: '' },
      actor
    );
    assert.throws(
      () =>
        second!.inventory.consume(
          { itemId, orderId, quantity: '0.200', operationId: randomUUID(), note: '' },
          actor
        ),
      /Недостатньо/
    );
    assert.equal(second.inventory.items()[0].balanceMilli, 100);
    assert.equal(second.inventory.movements().length, 2);
  } finally {
    second?.close();
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
