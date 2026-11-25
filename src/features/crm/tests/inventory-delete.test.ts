import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository } from '../server/repository';
import { businessToday } from '../lib/workflow';

const actor = { id: 'admin', name: 'Адміністратор' };
function database(work: (repo: CrmRepository, db: DatabaseSync, path: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'stock-delete-'));
  const path = join(directory, 'crm.sqlite');
  const repo = new CrmRepository(path),
    db = new DatabaseSync(path);
  try {
    work(repo, db, path);
  } finally {
    db.close();
    repo.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
function item(repo: CrmRepository, amount = false) {
  const id = repo.inventory.createItem({
    name: 'Фарба',
    unit: amount ? '' : 'л',
    accountingMode: amount ? 'amount' : 'quantity',
    notes: '',
    tags: ['Фарба']
  });
  return { id, expectedName: 'Фарба', expectedArchived: false };
}

test('unused active and archived materials can be deleted atomically and their names reused', () =>
  database((repo, db) => {
    for (const amount of [false, true])
      for (const archived of [false, true]) {
        const input = item(repo, amount);
        if (archived) repo.inventory.archive(input.id, true);
        repo.inventory.deleteItem({ ...input, expectedArchived: archived });
        assert.equal(repo.inventory.items().length, 0);
        assert.equal(
          db.prepare('SELECT COUNT(*) AS n FROM stock_item_values WHERE itemId=?').get(input.id)!.n,
          0
        );
        assert.throws(() => repo.inventory.deleteItem(input), /не знайдено/);
      }
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  }));

test('a second connection adding an operation, changing identity or archiving blocks a stale delete', () =>
  database((repo, _db, path) => {
    const input = item(repo);
    const second = new CrmRepository(path);
    try {
      second.inventory.updateItem({ id: input.id, name: 'Нова фарба', unit: 'л', notes: '' });
      assert.throws(() => repo.inventory.deleteItem(input), /вже змінено/);
      second.inventory.updateItem({ id: input.id, name: 'Фарба', unit: 'л', notes: '' });
      second.inventory.archive(input.id, true);
      assert.throws(() => repo.inventory.deleteItem(input), /вже змінено/);
      second.inventory.archive(input.id, false);
      second.inventory.receive(
        {
          itemId: input.id,
          operationId: randomUUID(),
          quantity: '1',
          totalAmount: '100',
          currency: 'UAH',
          exchangeRate: '1',
          note: ''
        },
        actor
      );
      const before = JSON.stringify(repo.inventory.items());
      assert.throws(() => repo.inventory.deleteItem(input), /історія операцій/);
      assert.equal(JSON.stringify(repo.inventory.items()), before);
    } finally {
      second.close();
    }
  }));

test('zero balance does not permit deletion of reversed amount costs or assessed historical stock', () =>
  database((repo, db) => {
    const input = item(repo, true);
    const customerId = repo.createCustomer({ name: 'Клієнт', phone: '0501234567', notes: '' });
    const vehicleId = repo.createVehicle({
      customerId,
      make: 'Ford',
      model: 'Focus',
      year: 2020,
      plate: '',
      vin: 'WVWZZZ1JZXW000001'
    });
    const orderId = repo.createClientOrder(
      {
        customerId,
        vehicleId,
        requestId: '',
        description: '',
        items: [{ description: 'Ремонт', quantity: 1, unitPrice: 1000 }]
      },
      'Маляр',
      actor
    );
    repo.updateWorkflow(
      {
        kind: 'order',
        id: orderId,
        expectedStatus: 'created',
        expectedRevision: 0,
        status: 'in_progress',
        plannedIntakeDate: '',
        plannedDeliveryDate: '',
        actualIntakeDate: businessToday(),
        actualReadyDate: '',
        actualDeliveryDate: '',
        note: ''
      },
      actor,
      { netSalary: true }
    );
    const operationId = randomUUID();
    repo.mutateOrderCosts(orderId, actor, () =>
      repo.inventory.consume(
        { itemId: input.id, orderId, operationId, quantity: '', amount: '350', note: '' },
        actor
      )
    );
    repo.mutateOrderCosts(orderId, actor, () =>
      repo.inventory.reverse(
        { movementId: operationId, operationId: randomUUID(), note: 'Помилка' },
        actor
      )
    );
    const before = JSON.stringify(repo.reportSnapshot());
    assert.equal(repo.inventory.items()[0].balanceMilli, 0);
    assert.equal(repo.inventory.items()[0].totalCostCents, 0);
    assert.throws(() => repo.inventory.deleteItem(input), /історія операцій/);
    assert.equal(JSON.stringify(repo.reportSnapshot()), before);
    const legacyId = repo.inventory.createItem({ name: 'Стара оцінка', unit: 'л', notes: '' });
    db.prepare('INSERT INTO stock_valuation_events VALUES (?,?,?,?,?,?,?,?)').run(
      randomUUID(),
      legacyId,
      0,
      1000,
      'Історична оцінка',
      JSON.stringify(actor),
      new Date().toISOString(),
      '{}'
    );
    assert.equal(repo.inventory.items().find((row) => row.id === legacyId)!.locked, true);
    assert.throws(
      () =>
        repo.inventory.deleteItem({
          id: legacyId,
          expectedName: 'Стара оцінка',
          expectedArchived: false
        }),
      /історія операцій/
    );
  }));

test('partial stock cleanup rolls back on delete failure and never discards a nonzero valuation', () =>
  database((repo, db) => {
    const input = item(repo);
    db.prepare('UPDATE stock_item_values SET totalCostCents=1 WHERE itemId=?').run(input.id);
    assert.throws(() => repo.inventory.deleteItem(input), /вартість/);
    db.prepare('UPDATE stock_item_values SET totalCostCents=0 WHERE itemId=?').run(input.id);
    db.exec(
      "CREATE TRIGGER reject_stock_delete BEFORE DELETE ON stock_items BEGIN SELECT RAISE(ABORT,'test rollback'); END"
    );
    assert.throws(() => repo.inventory.deleteItem(input), /test rollback/);
    assert.equal(repo.inventory.items().length, 1);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM stock_item_values WHERE itemId=?').get(input.id)!.n,
      1
    );
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  }));
