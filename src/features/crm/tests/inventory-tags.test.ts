import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository } from '../server/repository';
import { itemSchema } from '@/features/inventory/schemas/inventory';
import { filterStockItems } from '@/features/inventory/lib/search';
import { stockTags } from '@/features/inventory/constants/tags';

const actor = { id: 'admin', name: 'Адміністратор' };

test('material tags persist through receipts, editing, archival and restart without changing valuation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-stock-tags-'));
  const path = join(directory, 'crm.sqlite');
  let repository = new CrmRepository(path);
  try {
    const id = repository.inventory.createItem({
      name: 'Емаль',
      unit: 'л',
      notes: 'Для кузова',
      tags: ['Фарба', 'Фарба_чорна']
    });
    repository.inventory.receive(
      {
        itemId: id,
        operationId: randomUUID(),
        quantity: '1,5',
        note: 'Закупівля',
        currency: 'UAH',
        totalAmount: '3000',
        exchangeRate: '1'
      },
      actor
    );
    const movements = repository.inventory.movements();
    const before = repository.inventory.items()[0];
    repository.inventory.updateItem({
      id,
      name: before.name,
      unit: before.unit,
      notes: before.notes,
      tags: ['Фарба', 'Фарба_зелена']
    });
    assert.deepEqual(repository.inventory.items()[0], {
      ...before,
      tags: ['Фарба', 'Фарба_зелена']
    });
    repository.inventory.archive(id, true);
    repository.close();
    repository = new CrmRepository(path);
    assert.deepEqual(repository.inventory.items()[0], {
      ...before,
      archived: true,
      tags: ['Фарба', 'Фарба_зелена']
    });
    assert.deepEqual(repository.inventory.movements(), movements);
    // An older client omitting tags must preserve the saved classification.
    repository.inventory.updateItem({
      id,
      name: before.name,
      unit: before.unit,
      notes: before.notes
    });
    assert.deepEqual(repository.inventory.items()[0].tags, ['Фарба', 'Фарба_зелена']);
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('fixed tag catalog rejects invented, empty and repeated assignments atomically', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const base = { name: 'Матеріал', unit: 'л' as const, notes: '' };
    const id = repository.inventory.createItem({ ...base, tags: ['Фарба'] });
    const before = repository.inventory.items();
    for (const tags of [[], ['Новий тег'], ['Фарба', 'Фарба']]) {
      assert.equal(itemSchema.safeParse({ ...base, tags }).success, false);
      assert.throws(() => repository.inventory.updateItem({ ...base, id, tags } as never));
      assert.deepEqual(repository.inventory.items(), before);
    }
    assert.equal(new Set(stockTags).size, stockTags.length);
    const legacyId = repository.inventory.createItem({ ...base, name: 'Старий клієнт API' });
    assert.deepEqual(repository.inventory.items().find((item) => item.id === legacyId)!.tags, [
      'Розхідник'
    ]);
  } finally {
    repository.close();
  }
});

test('warehouse text search combines with exact tag and archive filters', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const greenId = repository.inventory.createItem({
      name: 'Емаль Sprint',
      unit: 'л',
      notes: 'Кузов №42',
      tags: ['Фарба', 'Фарба_зелена']
    });
    const blackId = repository.inventory.createItem({
      name: 'Емаль Sprint чорна',
      unit: 'л',
      notes: '',
      tags: ['Фарба', 'Фарба_чорна']
    });
    const archivedId = repository.inventory.createItem({
      name: 'Емаль Sprint архів',
      unit: 'л',
      notes: '',
      tags: ['Фарба', 'Фарба_зелена']
    });
    repository.inventory.archive(archivedId, true);
    const items = repository.inventory.items();
    assert.deepEqual(
      filterStockItems(items, '  КУЗОВ   sprint ', ['Фарба_зелена'], false).map((item) => item.id),
      [greenId]
    );
    assert.deepEqual(
      filterStockItems(items, 'зелена', [], false).map((item) => item.id),
      [greenId]
    );
    assert.deepEqual(
      filterStockItems(items, 'sprint', ['Фарба_чорна'], false).map((item) => item.id),
      [blackId]
    );
    assert.equal(filterStockItems(items, 'чорна', ['Фарба_зелена'], false).length, 0);
    assert.deepEqual(
      filterStockItems(items, '', ['Фарба_зелена'], true).map((item) => item.id),
      [archivedId]
    );
    assert.deepEqual(
      filterStockItems(items, 'sprint', ['Фарба_зелена', 'Фарба_чорна'], false)
        .map((item) => item.id)
        .toSorted(),
      [greenId, blackId].toSorted()
    );
    assert.deepEqual(
      filterStockItems(items, 'Кузов', ['Фарба_чорна', 'Фарба_зелена'], false).map(
        (item) => item.id
      ),
      [greenId]
    );
  } finally {
    repository.close();
  }
});

test('schema 20 materials receive the consumable tag without changing stock or operation history', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-stock-migration-'));
  const path = join(directory, 'crm.sqlite');
  let repository = new CrmRepository(path);
  try {
    const id = repository.inventory.createItem({
      name: 'Старий матеріал',
      unit: 'кг',
      notes: 'Зберегти'
    });
    repository.inventory.receive(
      {
        itemId: id,
        operationId: randomUUID(),
        quantity: '2',
        note: '',
        currency: 'UAH',
        totalAmount: '150',
        exchangeRate: '1'
      },
      actor
    );
    repository.inventory.archive(id, true);
    const before = repository.inventory.items();
    const movements = repository.inventory.movements();
    repository.close();
    const db = new DatabaseSync(path);
    db.exec('ALTER TABLE stock_items DROP COLUMN tags; PRAGMA user_version=20');
    db.close();
    repository = new CrmRepository(path);
    assert.deepEqual(repository.inventory.items(), before);
    assert.deepEqual(repository.inventory.movements(), movements);
    const verify = new DatabaseSync(path);
    assert.equal(verify.prepare('PRAGMA user_version').get()!.user_version, 22);
    assert.deepEqual(verify.prepare('PRAGMA foreign_key_check').all(), []);
    verify.close();
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
