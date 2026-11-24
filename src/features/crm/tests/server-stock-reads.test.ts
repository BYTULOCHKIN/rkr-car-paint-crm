import test from 'node:test';
import assert from 'node:assert/strict';
import { CrmRepository } from '../server/repository';
import { filterStockItems } from '@/features/inventory/lib/search';

test('SQL material pages preserve Ukrainian search, tag OR, archive, literal wildcards and total counts', () => {
  const repository = new CrmRepository(':memory:');
  try {
    for (let i = 0; i < 117; i++)
      repository.inventory.createItem({
        name: `Емаль ${String(i).padStart(3, '0')}`,
        unit: 'л',
        notes: i === 55 ? 'SKU: 100%_A' : '',
        tags: i % 2 ? ['Фарба', 'Фарба_чорна'] : ['Фарба', 'Фарба_зелена']
      });
    const all = repository.inventory.items();
    const archived = all[0];
    repository.inventory.archive(archived.id, true);
    for (const search of ['ЕМАЛЬ', '100%_a', '"', 'емаль 055', 'не існує']) {
      const filters = {
        search,
        tags: ['Фарба_чорна', 'Фарба_зелена'] as ('Фарба_чорна' | 'Фарба_зелена')[],
        archived: false,
        pageSize: 17
      };
      const expected = filterStockItems(repository.inventory.items(), search, filters.tags, false);
      const ids: string[] = [];
      for (let page = 1; page <= Math.max(1, Math.ceil(expected.length / 17)); page++) {
        const result = repository.inventory.listItems({ ...filters, page });
        assert.equal(result.total, expected.length);
        assert.ok(result.items.length <= 17);
        ids.push(...result.items.map((row) => row.id));
      }
      assert.deepEqual(
        ids,
        expected.map((row) => row.id)
      );
    }
    assert.deepEqual(
      repository.inventory
        .listItems({ search: '', tags: [], archived: true })
        .items.map((row) => row.id),
      [archived.id]
    );
    assert.equal(
      repository.inventory.listItems({ search: '', tags: [], archived: false, page: 999 }).items
        .length,
      0
    );
    for (const pageSize of [0, 101])
      assert.throws(() =>
        repository.inventory.listItems({ search: '', tags: [], archived: false, pageSize })
      );
    assert.throws(() =>
      repository.inventory.listItems({ search: '', tags: [], archived: false, page: 0 })
    );
  } finally {
    repository.close();
  }
});

test('stock movement pages include valuations and exact item filtering without unrelated operations', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const first = repository.inventory.createItem({ name: 'Лак', unit: 'л', notes: '' });
    const second = repository.inventory.createItem({ name: 'Фарба', unit: 'л', notes: '' });
    const actor = { id: 'admin', name: 'Адмін' };
    for (let index = 0; index < 8; index++)
      repository.inventory.receive(
        {
          itemId: index % 2 ? first : second,
          operationId: crypto.randomUUID(),
          quantity: '1',
          note: '',
          currency: 'UAH',
          totalAmount: '100',
          exchangeRate: '1'
        },
        actor
      );
    const all = repository.inventory.movements();
    assert.deepEqual(
      repository.inventory.listMovements({ page: 2, pageSize: 3 }).items,
      all.slice(3, 6)
    );
    assert.equal(repository.inventory.listMovements({ page: 2, pageSize: 3 }).total, 8);
    const scoped = repository.inventory.listMovements({ itemId: first, pageSize: 2 });
    assert.equal(scoped.total, 4);
    assert.ok(scoped.items.every((row) => row.itemId === first));
    assert.deepEqual(repository.inventory.orderMovements(crypto.randomUUID()), []);
  } finally {
    repository.close();
  }
});
