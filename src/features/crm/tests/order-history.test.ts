import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository } from '../server/repository';
import { historyOrderChanges } from '../lib/workflow-history';

function seed(repository: CrmRepository) {
  const customerId = repository.createCustomer({ name: 'Клієнт', phone: '0501234567', notes: '' });
  const vehicleId = repository.createVehicle({
    customerId,
    make: 'Ford',
    model: 'Focus',
    year: 2020,
    plate: '',
    vin: 'WVWZZZ1JZXW000001'
  });
  const items = [{ description: 'Фарбування', quantity: 1, unitPrice: 100 }];
  const id = repository.createOrder({
    customerId,
    vehicleId,
    requestId: '',
    description: 'Старий опис',
    items
  });
  return { id, description: 'Старий опис', items };
}

test('description and price edits create one atomic before/after event; unchanged saves do not', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const initial = seed(repository);
    const originalCount = repository.workspace().events.length;
    repository.updateOrder(initial);
    assert.equal(repository.workspace().events.length, originalCount);
    const input = {
      ...initial,
      description: 'Новий опис',
      expectedRevision: 0,
      items: [{ ...initial.items[0], unitPrice: 250 }]
    };
    repository.updateOrder(input);
    const event = repository.workspace().events[0];
    assert.equal(repository.workspace().events.length, originalCount + 1);
    assert.equal(event.orderChanges?.before.description, 'Старий опис');
    assert.equal(event.orderChanges?.after.description, 'Новий опис');
    assert.equal(event.orderChanges?.before.items[0].unitPriceCents, 10000);
    assert.equal(event.orderChanges?.after.items[0].unitPriceCents, 25000);
    assert.equal(event.orderChanges?.before.totalCents, 10000);
    assert.equal(event.orderChanges?.after.totalCents, 25000);
    assert.ok(
      historyOrderChanges(event).some((change) => change.label === 'Позиція 1 · ціна за одиницю')
    );
    repository.updateOrder({ ...input, expectedRevision: 1 });
    assert.equal(repository.workspace().events.length, originalCount + 1);
    assert.throws(() => repository.updateOrder(input), /іншому вікні/);
    const beforeFailure = repository.workspace();
    assert.throws(() =>
      repository.updateOrder({
        ...input,
        expectedRevision: 1,
        items: [{ description: 'Помилка', quantity: -1, unitPrice: 100 }]
      })
    );
    assert.deepEqual(repository.workspace(), beforeFailure);
    repository.updateOrder({
      ...input,
      expectedRevision: 1,
      items: [...input.items, { description: 'Полірування', quantity: 2, unitPrice: 50 }],
      paintPlan: [{ partId: 'hood', mode: 'partial' }]
    });
    const changes = historyOrderChanges(repository.workspace().events[0]);
    assert.ok(
      changes.some(
        (change) => change.label === 'Склад робіт' && change.after.includes('Полірування')
      )
    );
    assert.ok(changes.some((change) => change.label === 'Кузов · Капот'));
    repository.updateOrder({ ...input, expectedRevision: 2, paintPlan: [] });
    assert.ok(
      historyOrderChanges(repository.workspace().events[0]).some(
        (change) => change.label === 'Кузов · Капот' && change.after === 'Не позначено'
      )
    );
  } finally {
    repository.close();
  }
});

test('v5 migration keeps older history and persists new content events across reopening', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-order-history-'));
  const path = join(dir, 'crm.sqlite');
  let repository = new CrmRepository(path);
  try {
    const initial = seed(repository);
    repository.close();
    const old = new DatabaseSync(path);
    old.exec(
      'ALTER TABLE crm_workflow_events DROP COLUMN actor; ALTER TABLE crm_workflow_events DROP COLUMN orderChanges; ALTER TABLE crm_orders DROP COLUMN assigneeId; ALTER TABLE crm_orders DROP COLUMN assigneeName; DROP TABLE crm_vehicle_models; PRAGMA user_version = 5;'
    );
    old.close();
    repository = new CrmRepository(path);
    assert.equal(repository.workspace().events[0].orderChanges, null);
    repository.updateOrder({ ...initial, description: 'Змінено після міграції' });
    const event = repository.workspace().events[0];
    repository.close();
    repository = new CrmRepository(path);
    assert.deepEqual(repository.workspace().events[0], event);
    assert.equal(
      repository.workspace().events[0].orderChanges?.after.description,
      'Змінено після міграції'
    );
  } finally {
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
