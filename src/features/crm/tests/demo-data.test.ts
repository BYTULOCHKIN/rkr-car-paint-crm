import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { CrmRepository } from '../server/repository';
import { generateDemoData, importDemoData, removeDemoData } from '../server/demo-data';

test('demo import preserves business data, assigns real members, is atomic and can be removed independently', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-demo-test-'));
  const staged = join(directory, 'staged.sqlite');
  const target = join(directory, 'target.sqlite');
  const repository = new CrmRepository(target);
  try {
    repository.bindOrganization('org_demo');
    const customerId = repository.createCustomer({
      name: 'Реальний клієнт',
      phone: '0501234567',
      notes: ''
    });
    const vehicleId = repository.createVehicle({
      customerId,
      make: 'BMW',
      model: 'X5',
      year: 2020,
      plate: 'AA1234BB',
      vin: 'WVWZZZ1JZXW000001'
    });
    repository.createOrder({
      customerId,
      vehicleId,
      requestId: '',
      description: 'Реальне замовлення',
      items: [{ description: 'Робота', quantity: 1, unitPrice: 100 }]
    });
    const before = repository.workspace();
    generateDemoData(staged, [{ id: 'user_admin', name: 'Руслан' }], {
      customers: 3,
      vehicles: 5,
      requests: 6,
      orders: 20
    });
    assert.throws(() => importDemoData(target, staged, 'org_other', 'demo'));
    assert.deepEqual(repository.workspace(), before);
    importDemoData(target, staged, 'org_demo', 'demo');
    const workspace = repository.workspace();
    assert.equal(workspace.customers.length, 4);
    assert.equal(workspace.vehicles.length, 6);
    assert.equal(workspace.requests.length, 6);
    assert.equal(workspace.orders.length, 21);
    const generatedOrders = workspace.orders.filter((order) => order.id !== before.orders[0].id);
    assert.ok(generatedOrders.every((order) => order.number > before.orders[0].number));
    assert.deepEqual(
      workspace.orders.find((order) => order.id === before.orders[0].id),
      before.orders[0]
    );
    assert.deepEqual(
      new Set(workspace.orders.map((order) => order.status)),
      new Set(['created', 'in_progress', 'ready'])
    );
    assert.deepEqual(
      new Set(workspace.requests.map((request) => request.status)),
      new Set(['backlog', 'scheduled'])
    );
    assert.ok(
      generatedOrders.every((order) => order.assigneeId === 'user_admin' && order.totalCents > 0)
    );
    assert.ok((workspace.payments?.length ?? 0) > 0);
    assert.ok(new Set(workspace.orders.map((order) => order.createdAt.slice(0, 10))).size > 3);
    assert.throws(() => importDemoData(target, staged, 'org_demo', 'demo'), /уже завантажено/);
    // A duplicate row halfway through a second import rolls back the new run as well.
    assert.throws(() => importDemoData(target, staged, 'org_demo', 'conflicting-run'));
    assert.deepEqual(repository.workspace(), workspace);
    const db = new DatabaseSync(target);
    try {
      assert.equal(db.prepare('SELECT count(*) AS count FROM crm_demo_runs').get()?.count, 1);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
      db.close();
    }
    // Financial records subsequently entered for demo cars are owned dependencies as well.
    const finished = generatedOrders.find((order) => order.status === 'ready')!;
    repository.correctOrderEconomics(
      {
        orgId: 'org_demo',
        orderId: finished.id,
        operationId: randomUUID(),
        expectedRevision: finished.workflowRevision ?? 0,
        expectedPostingRevision: 0,
        expectedInventoryRevision: repository.workspace().finance!.inventoryRevision,
        details: {
          employeeShareBps: 6000,
          painterId: '',
          polisherId: '',
          assemblerId: 'user_admin',
          lines: [
            {
              id: randomUUID(),
              kind: 'assembly',
              description: 'Збірка',
              quantity: 1,
              unitPriceCents: 100000,
              polishingCents: 0,
              subcontractCostCents: 0,
              contractorName: ''
            }
          ]
        },
        materials: [],
        note: 'Початковий розрахунок тестового авто'
      },
      { user_admin: 'Руслан' },
      { id: 'user_admin', name: 'Руслан' }
    );
    const payoutId = randomUUID();
    repository.settlements.cash(
      {
        orgId: 'org_demo',
        orderId: finished.id,
        operationId: payoutId,
        payeeKind: 'worker',
        payeeId: 'user_admin',
        kind: 'payout',
        amount: '100',
        note: ''
      },
      { id: 'user_admin', name: 'Руслан' },
      { kind: 'worker', id: 'user_admin', name: 'Руслан' }
    );
    repository.settlements.reverse(
      { orgId: 'org_demo', operationId: randomUUID(), eventId: payoutId, note: 'Помилковий запис' },
      { id: 'user_admin', name: 'Руслан' }
    );
    removeDemoData(target, 'org_demo', 'demo');
    assert.deepEqual(repository.workspace(), before);
    assert.throws(() => removeDemoData(target, 'org_demo', 'demo'), /не знайдено/);
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('cleanup rolls back if a real record depends on a generated vehicle', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-demo-dependency-'));
  const target = join(directory, 'target.sqlite');
  const staged = join(directory, 'staged.sqlite');
  const repository = new CrmRepository(target);
  try {
    repository.bindOrganization('org_demo');
    generateDemoData(staged, [{ id: 'user_admin', name: 'Руслан' }], {
      customers: 1,
      vehicles: 1,
      requests: 1,
      orders: 1
    });
    importDemoData(target, staged, 'org_demo', 'demo');
    const vehicle = repository.workspace().vehicles[0];
    repository.createOrder({
      customerId: vehicle.customerId!,
      vehicleId: vehicle.id,
      requestId: '',
      description: 'Ручне замовлення',
      items: [{ description: 'Робота', quantity: 1, unitPrice: 100 }]
    });
    const before = repository.workspace();
    assert.throws(() => removeDemoData(target, 'org_demo', 'demo'), /FOREIGN KEY/);
    assert.deepEqual(repository.workspace(), before);
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
