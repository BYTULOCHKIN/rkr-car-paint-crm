import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository } from '../server/repository';
import { businessToday } from '../lib/workflow';
import { receiptSchema, adjustmentSchema } from '@/features/inventory/schemas/inventory';
import { orderMaterialCosts } from '@/features/inventory/lib/order-costs';

const actor = { id: 'admin', name: 'Адміністратор' };
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
  const orderId = repository.createOrder({
    customerId,
    vehicleId,
    requestId: '',
    description: 'Фарбування',
    items: [{ description: 'Деталь', quantity: 1, unitPrice: 18000 }]
  });
  repository.updateWorkflow({
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
  });
  const itemId = repository.inventory.createItem({ name: 'Лак', unit: 'л', notes: '' });
  return { itemId, orderId };
}
function purchase(itemId: string, quantity: string, totalAmount: string, exchangeRate = '1') {
  return {
    itemId,
    quantity,
    totalAmount,
    currency: exchangeRate === '1' ? ('UAH' as const) : ('EUR' as const),
    exchangeRate,
    operationId: randomUUID(),
    note: ''
  };
}
function consume(
  itemId: string,
  orderId: string,
  quantity: string,
  category: 'painting' | 'polishing' = 'painting'
) {
  return { itemId, orderId, quantity, category, operationId: randomUUID(), note: '' };
}
function withRepository(work: (repository: CrmRepository) => void) {
  const repository = new CrmRepository(':memory:');
  try {
    work(repository);
  } finally {
    repository.close();
  }
}

test('EUR receipts, category totals and original-cost reversal stay atomic and retry-safe', () =>
  withRepository((repository) => {
    const { itemId, orderId } = seed(repository);
    const first = purchase(itemId, '2', '40', '48');
    repository.inventory.receive(first, actor);
    repository.inventory.receive(first, actor);
    const used = consume(itemId, orderId, '0.5');
    repository.inventory.consume(used, actor);
    repository.inventory.receive(purchase(itemId, '3', '66', '50'), actor);
    repository.inventory.consume(used, actor);
    assert.equal(repository.inventory.items()[0].totalCostCents, 474000);
    assert.equal(
      repository.inventory.movements().find((entry) => entry.id === used.operationId)!
        .costDeltaCents,
      -48000
    );
    assert.deepEqual(orderMaterialCosts(repository.inventory.movements(), orderId), {
      paintingCents: 48000,
      polishingCents: 0,
      unallocatedCents: 0,
      totalCents: 48000
    });
    assert.throws(
      () => repository.inventory.consume({ ...used, category: 'polishing' }, actor),
      /іншими даними/
    );
    const reverse = {
      movementId: used.operationId,
      operationId: randomUUID(),
      note: 'Помилкове списання'
    };
    repository.inventory.reverse(reverse, actor);
    repository.inventory.reverse(reverse, actor);
    assert.equal(repository.inventory.items()[0].totalCostCents, 522000);
    assert.equal(repository.inventory.items()[0].balanceMilli, 5000);
    assert.equal(repository.inventory.movements().length, 4);
    assert.equal(orderMaterialCosts(repository.inventory.movements(), orderId).totalCents, 0);
    const polishing = consume(itemId, orderId, '0.5', 'polishing');
    repository.inventory.consume(polishing, actor);
    assert.equal(
      orderMaterialCosts(repository.inventory.movements(), orderId).polishingCents,
      52200
    );
    const receipt = repository.inventory
      .movements()
      .find((entry) => entry.id === first.operationId)!;
    assert.equal(receipt.currency, 'EUR');
    assert.equal(receipt.purchaseAmountMinor, 4000);
    assert.equal(receipt.exchangeRateMicros, 48000000);
    assert.equal(repository.workspace().orders[0].totalCents, 1800000);
  }));

test('depletion removes every kopeck; positive and negative adjustments retain value', () =>
  withRepository((repository) => {
    const { itemId, orderId } = seed(repository);
    repository.inventory.receive(purchase(itemId, '0.003', '0.01'), actor);
    repository.inventory.consume(consume(itemId, orderId, '0.001'), actor);
    repository.inventory.consume(consume(itemId, orderId, '0.002', 'polishing'), actor);
    assert.equal(repository.inventory.items()[0].totalCostCents, 0);
    assert.equal(repository.inventory.items()[0].balanceMilli, 0);
    repository.inventory.adjust(
      { ...purchase(itemId, '1', '100'), note: 'Знайдений залишок' },
      actor
    );
    repository.inventory.adjust(
      { itemId, quantity: '-0.25', operationId: randomUUID(), note: 'Інвентаризація' },
      actor
    );
    assert.equal(repository.inventory.items()[0].totalCostCents, 7500);
    assert.equal(repository.inventory.items()[0].balanceMilli, 750);
    repository.inventory.adjust(
      { ...purchase(itemId, '0.25', ' 1,5 '), note: 'Оцінений залишок' },
      actor
    );
    assert.equal(repository.inventory.items()[0].totalCostCents, 7650);
    const before = repository.inventory.movements();
    assert.throws(() =>
      repository.inventory.adjust(
        { itemId, quantity: '1', operationId: randomUUID(), note: 'Без ціни' },
        actor
      )
    );
    assert.throws(
      () => repository.inventory.consume(consume(itemId, orderId, '1.001'), actor),
      /Недостатньо/
    );
    assert.deepEqual(repository.inventory.movements(), before);
  }));

test('invalid prices and overflowing valuation leave quantity, cost and history unchanged', () =>
  withRepository((repository) => {
    const { itemId } = seed(repository);
    const initial = repository.inventory.items()[0];
    const invalid = [
      { ...purchase(itemId, '1', '10'), totalAmount: '-1' },
      { ...purchase(itemId, '1', '10'), totalAmount: '1.001' },
      { ...purchase(itemId, '1', '10'), exchangeRate: '48' },
      purchase(itemId, '1', '10', '0'),
      purchase(itemId, '1', '9999999999.99', '99999')
    ];
    for (const value of invalid) assert.throws(() => repository.inventory.receive(value, actor));
    assert.deepEqual(repository.inventory.items()[0], initial);
    assert.equal(repository.inventory.movements().length, 0);
    const valid = { ...purchase(itemId, '1', '10'), note: 'Одна операція' };
    repository.inventory.receive(valid, actor);
    assert.throws(() => repository.inventory.adjust(valid, actor), /іншими даними/);
    assert.throws(
      () => repository.inventory.receive({ ...valid, totalAmount: '20' }, actor),
      /іншими даними/
    );
    assert.equal(repository.inventory.items()[0].totalCostCents, 1000);
  }));

function downgradeToV12(filename: string): void {
  const db = new DatabaseSync(filename);
  try {
    db.exec('DROP TABLE stock_valuation_events; DROP TABLE stock_item_values;');
    for (const column of [
      'costDeltaCents',
      'currency',
      'purchaseAmountMinor',
      'exchangeRateMicros',
      'category'
    ])
      db.exec(`ALTER TABLE stock_movements DROP COLUMN ${column}`);
    db.exec('PRAGMA user_version=12');
  } finally {
    db.close();
  }
}

test('v12 migration preserves old movements; explicit assessment never revalues past consumption', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-stock-value-'));
  const filename = join(directory, 'crm.sqlite');
  let repository = new CrmRepository(filename);
  try {
    const { itemId, orderId } = seed(repository);
    repository.inventory.receive(purchase(itemId, '2', '200'), actor);
    const historic = consume(itemId, orderId, '0.5');
    repository.inventory.consume(historic, actor);
    const before = repository.workspace();
    repository.close();
    downgradeToV12(filename);
    repository = new CrmRepository(filename);
    assert.deepEqual(repository.workspace(), before);
    let item = repository.inventory.items()[0];
    assert.equal(item.balanceMilli, 1500);
    assert.equal(item.totalCostCents, null);
    assert.equal(orderMaterialCosts(repository.inventory.movements(), orderId).totalCents, null);
    const assessment = {
      itemId,
      operationId: randomUUID(),
      totalAmount: '150',
      expectedBalanceMilli: item.balanceMilli,
      expectedRevision: item.valuationRevision,
      note: 'Звірено за накладною'
    };
    repository.inventory.valueOpeningBalance(assessment, actor);
    repository.inventory.valueOpeningBalance(assessment, actor);
    assert.equal(
      repository.inventory.movements().filter((entry) => entry.kind === 'valuation').length,
      1
    );
    assert.equal(
      repository.inventory.movements().find((entry) => entry.id === historic.operationId)!
        .costDeltaCents,
      null
    );
    repository.inventory.consume(consume(itemId, orderId, '0.25', 'polishing'), actor);
    assert.equal(
      orderMaterialCosts(repository.inventory.movements(), orderId).polishingCents,
      2500
    );
    assert.equal(orderMaterialCosts(repository.inventory.movements(), orderId).totalCents, null);
    repository.close();
    repository = new CrmRepository(filename);
    item = repository.inventory.items()[0];
    assert.equal(item.totalCostCents, 12500);
    assert.equal(item.valuationRevision, 2);
    // Returning a historic unknown-cost consumption makes the remaining pool unknown again.
    repository.inventory.reverse(
      {
        movementId: historic.operationId,
        operationId: randomUUID(),
        note: 'Історичне помилкове списання'
      },
      actor
    );
    assert.equal(repository.inventory.items()[0].totalCostCents, null);
    assert.equal(orderMaterialCosts(repository.inventory.movements(), orderId).totalCents, 2500);
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('assessment rejects stale revisions across connections even if quantity returns to its old value', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-stock-value-race-'));
  const filename = join(directory, 'crm.sqlite');
  let repository = new CrmRepository(filename);
  let other: CrmRepository | undefined;
  try {
    const { itemId } = seed(repository);
    repository.inventory.receive(purchase(itemId, '1', '100'), actor);
    repository.close();
    downgradeToV12(filename);
    repository = new CrmRepository(filename);
    const item = repository.inventory.items()[0];
    const input = {
      itemId,
      operationId: randomUUID(),
      totalAmount: '100',
      expectedBalanceMilli: item.balanceMilli,
      expectedRevision: item.valuationRevision,
      note: 'Оцінювання'
    };
    other = new CrmRepository(filename);
    other.inventory.receive(purchase(itemId, '1', '100'), actor);
    other.inventory.adjust(
      { itemId, operationId: randomUUID(), quantity: '-1', note: 'Коригування' },
      actor
    );
    assert.equal(repository.inventory.items()[0].balanceMilli, 1000);
    assert.equal(repository.inventory.items()[0].totalCostCents, null);
    assert.throws(() => repository.inventory.valueOpeningBalance(input, actor), /Залишок змінено/);
    const current = repository.inventory.items()[0];
    repository.inventory.valueOpeningBalance(
      { ...input, expectedRevision: current.valuationRevision },
      actor
    );
    assert.throws(() =>
      other!.inventory.valueOpeningBalance({ ...input, operationId: randomUUID() }, actor)
    );
    assert.equal(repository.inventory.items()[0].totalCostCents, 10000);
  } finally {
    other?.close();
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('new receipts cannot disguise the unknown cost of legacy stock', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-stock-value-unknown-'));
  const filename = join(directory, 'crm.sqlite');
  let repository = new CrmRepository(filename);
  try {
    const { itemId, orderId } = seed(repository);
    repository.inventory.receive(purchase(itemId, '1', '100'), actor);
    repository.close();
    downgradeToV12(filename);
    repository = new CrmRepository(filename);
    repository.inventory.receive(purchase(itemId, '1', '200'), actor);
    assert.equal(repository.inventory.items()[0].totalCostCents, null);
    repository.inventory.consume(consume(itemId, orderId, '2'), actor);
    assert.equal(repository.inventory.items()[0].totalCostCents, 0);
    assert.equal(orderMaterialCosts(repository.inventory.movements(), orderId).totalCents, null);
    repository.inventory.receive(purchase(itemId, '1', '300'), actor);
    assert.equal(repository.inventory.items()[0].totalCostCents, 30000);
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('pricing schemas accept decimal commas and require positive adjustment valuation', () => {
  const itemId = randomUUID();
  assert.equal(
    receiptSchema.safeParse(purchase(itemId, '0,5', '12,34', '48,123456')).success,
    true
  );
  assert.equal(
    receiptSchema.safeParse({ ...purchase(itemId, '1', '10'), totalAmount: '' }).success,
    false
  );
  assert.equal(
    adjustmentSchema.safeParse({
      itemId,
      operationId: randomUUID(),
      quantity: '1',
      note: 'Знайдено'
    }).success,
    false
  );
  assert.equal(
    adjustmentSchema.safeParse({ ...purchase(itemId, '1', '10'), note: 'Знайдено' }).success,
    true
  );
  assert.equal(
    adjustmentSchema.safeParse({ ...purchase(itemId, '-1', '10'), note: 'Помилка' }).success,
    false
  );
});
