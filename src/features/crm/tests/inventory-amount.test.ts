import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { inventoryTables } from '@/features/inventory/server/repository';
import { migrateStockValuation } from '@/features/inventory/server/valuation-migration';
import { CrmRepository } from '../server/repository';
import { orderSchema } from '../schemas/crm';
import { businessToday } from '../lib/workflow';
import { consumptionSchema, type ConsumptionInput } from '@/features/inventory/schemas/inventory';
import { orderMaterialCosts } from '@/features/inventory/lib/order-costs';
import { buildPayrollReport } from '@/features/payroll/lib/report';
import { buildPeriodReport } from '@/features/workshop-reports/lib/report';

const actor = { id: 'admin', name: 'Адміністратор' };
function setup() {
  const repo = new CrmRepository(':memory:');
  const customerId = repo.createCustomer({ name: 'Клієнт', phone: '0501234567', notes: '' });
  const vehicleId = repo.createVehicle({
    customerId,
    make: 'Ford',
    model: 'Focus',
    year: 2020,
    plate: '',
    vin: 'WVWZZZ1JZXW000001'
  });
  const id = repo.createClientOrder(
    orderSchema.parse({
      customerId,
      vehicleId,
      requestId: '',
      assigneeId: 'painter',
      description: 'Фарбування',
      items: [{ description: 'Фарбування', quantity: 1, unitPrice: 20000 }]
    }),
    'Маляр',
    actor
  );
  const itemId = repo.inventory.createItem({
    name: 'Фарба',
    unit: '',
    accountingMode: 'amount',
    notes: '',
    tags: ['Фарба']
  });
  const current = () => repo.workspace().orders.find((order) => order.id === id)!;
  const workflow = (status: 'in_progress' | 'ready') =>
    repo.updateWorkflow(
      {
        kind: 'order',
        id,
        expectedStatus: current().status,
        expectedRevision: current().workflowRevision,
        status,
        plannedIntakeDate: '',
        plannedDeliveryDate: '',
        actualIntakeDate: businessToday(),
        actualReadyDate: status === 'ready' ? businessToday() : '',
        actualDeliveryDate: '',
        note: ''
      },
      actor,
      { netSalary: true }
    );
  const input = (amount = '3500,25') => ({
    itemId,
    orderId: id,
    operationId: randomUUID(),
    quantity: '',
    amount,
    category: 'painting' as const,
    note: 'Підбір за кодом'
  });
  const consume = (value: ConsumptionInput) =>
    repo.mutateOrderCosts(id, actor, () => repo.inventory.consume(value, actor));
  return { repo, id, itemId, current, workflow, input, consume };
}

test('renaming a used amount-only material preserves completed order costs, salary postings and events', () => {
  const { repo, id, itemId, workflow, consume, input } = setup();
  try {
    workflow('in_progress');
    consume(input());
    workflow('ready');
    const before = repo.workspace();
    const valuation = repo.inventory.items()[0];
    const movements = repo.inventory.orderMovements(id);
    const costs = orderMaterialCosts(movements, id);
    repo.inventory.updateItem({
      id: itemId,
      name: 'Фарба за кодом авто',
      unit: '',
      accountingMode: 'amount',
      notes: valuation.notes
    });
    assert.deepEqual(repo.workspace(), before);
    assert.deepEqual(repo.inventory.items()[0], { ...valuation, name: 'Фарба за кодом авто' });
    assert.deepEqual(
      repo.inventory.orderMovements(id),
      movements.map((movement) => ({ ...movement, itemName: 'Фарба за кодом авто' }))
    );
    assert.deepEqual(orderMaterialCosts(repo.inventory.orderMovements(id), id), costs);
    assert.equal(repo.inventory.orderItems(id)[0].name, 'Фарба за кодом авто');
    assert.equal(repo.settlements.postings([id]).length, 1);
  } finally {
    repo.close();
  }
});

test('amount-only materials accrue exact cost and unpaid salaries without receipts or stock valuation', () => {
  const { repo, id, itemId, workflow, consume, input } = setup();
  try {
    workflow('in_progress');
    const before = repo.inventory.items()[0];
    const value = input();
    consume(value);
    consume(value);
    assert.equal(repo.inventory.movements().length, 1);
    const item = repo.inventory.items()[0];
    assert.equal(item.balanceMilli, 0);
    assert.equal(item.totalCostCents, 0);
    assert.equal(item.valuationRevision, before.valuationRevision);
    assert.equal(item.unit, '');
    assert.equal(item.accountingMode, 'amount');
    assert.equal(item.locked, true);
    const movement = repo.inventory.orderMovements(id)[0];
    assert.equal(movement.deltaMilli, 0);
    assert.equal(movement.costDeltaCents, -350025);
    assert.equal(movement.accountingMode, 'amount');
    assert.equal(orderMaterialCosts(repo.inventory.movements(), id).paintingCents, 350025);
    workflow('ready');
    const posting = repo.settlements.latest(id)!;
    assert.equal(posting.result.painterAccrualCents, 989985);
    assert.equal(posting.result.workshopRemainderCents, 659990);
    assert.equal(repo.payments.list().length, 0);
    const access = { role: 'admin' as const, userId: 'admin', orgId: 'test' };
    assert.equal(
      buildPayrollReport(repo.workspace(), [], access, {
        from: businessToday(),
        to: businessToday()
      }).totals.totalCents,
      989985
    );
    const report = buildPeriodReport(
      repo.workspace(),
      repo.inventory.movements(),
      access,
      { from: businessToday(), to: businessToday(), orderDate: 'ready' },
      'fixed'
    );
    assert.equal(report.materials.rows.find((row) => row.id === itemId)!.costCents, 350025);
    assert.equal(report.materials.rows[0].accountingMode, 'amount');
    assert.throws(() => consume({ ...value, amount: '1' }), /іншими даними/);
  } finally {
    repo.close();
  }
});

test('editing and cancelling amount-only costs after readiness preserve history and recalculate earnings once', () => {
  const { repo, id, itemId, workflow, input, consume } = setup();
  try {
    workflow('in_progress');
    workflow('ready');
    const firstPosting = repo.settlements.latest(id)!;
    const value = input('3500');
    consume(value);
    assert.equal(repo.settlements.latest(id)!.result.painterAccrualCents, 990000);
    const original = repo.inventory.orderMovements(id)[0];
    const edit = { ...value, amount: '4000', movementId: original.id, operationId: randomUUID() };
    const save = () =>
      repo.mutateOrderCosts(id, actor, () => repo.inventory.editConsumption(edit, actor));
    save();
    const revision = repo.settlements.latest(id)!.revision;
    save();
    assert.equal(repo.settlements.latest(id)!.revision, revision);
    assert.equal(repo.settlements.latest(id)!.result.painterAccrualCents, 960000);
    assert.equal(repo.settlements.latest(id)!.result.workshopRemainderCents, 640000);
    assert.equal(
      repo.settlements.postings()[0].result.painterAccrualCents,
      firstPosting.result.painterAccrualCents
    );
    assert.equal(
      repo.inventory.orderMovements(id).find((row) => row.id === original.id)!.reversed,
      true
    );
    const active = repo.inventory
      .orderMovements(id)
      .find((row) => row.kind === 'consumption' && !row.reversed)!;
    const reversal = {
      movementId: active.id,
      operationId: randomUUID(),
      note: 'Помилкова витрата'
    };
    const reverse = () =>
      repo.mutateOrderCosts(id, actor, () => repo.inventory.reverse(reversal, actor));
    reverse();
    reverse();
    assert.equal(repo.settlements.latest(id)!.result.painterAccrualCents, 1200000);
    assert.equal(orderMaterialCosts(repo.inventory.orderMovements(id), id).totalCents, 0);
    assert.equal(repo.inventory.items().find((item) => item.id === itemId)!.totalCostCents, 0);
    assert.equal(repo.inventory.items()[0].balanceMilli, 0);
  } finally {
    repo.close();
  }
});

test('mode, stock and amount validation cannot bypass stock costing or change existing history', () => {
  const { repo, id, itemId, workflow, input, consume } = setup();
  try {
    assert.throws(() => consume(input('1')), /В роботі/);
    workflow('in_progress');
    const quantityId = repo.inventory.createItem({ name: 'Лак', unit: 'л', notes: '' });
    for (const amount of ['0', '-1', '1.001', 'abc', '99999999999', ''])
      assert.equal(consumptionSchema.safeParse(input(amount)).success, false, amount);
    assert.throws(() => consume({ ...input('3500'), quantity: '1' }), /кількість або суму/);
    assert.throws(() => consume({ ...input('3500'), itemId: quantityId }), /кількість, а не суму/);
    assert.throws(() => consume({ ...input(), amount: undefined, quantity: '1' }), /суму витрати/);
    const stockInput = {
      itemId,
      operationId: randomUUID(),
      quantity: '1',
      note: '',
      currency: 'UAH' as const,
      exchangeRate: '1',
      totalAmount: '100'
    };
    assert.throws(() => repo.inventory.receive(stockInput, actor), /лише витрати/);
    assert.throws(
      () => repo.inventory.adjust({ ...stockInput, note: 'Перевірка' }, actor),
      /лише витрати/
    );
    assert.equal(repo.inventory.movements().length, 0);
    consume(input());
    assert.throws(
      () =>
        repo.inventory.updateItem({
          id: itemId,
          name: 'Фарба',
          unit: 'л',
          accountingMode: 'quantity',
          notes: ''
        }),
      /режим обліку/
    );
    repo.inventory.updateItem({
      id: itemId,
      name: 'Фарба',
      unit: '',
      accountingMode: 'amount',
      notes: 'Оновлена примітка'
    });
    repo.inventory.archive(itemId, true);
    assert.throws(() => consume(input()), /архівну/);
    assert.throws(() =>
      repo.changeOrderTrash(
        {
          orgId: 'test',
          orderId: id,
          action: 'trash',
          expectedRevision: repo.workspace().orders[0].workflowRevision!
        },
        actor
      )
    );
  } finally {
    repo.close();
  }
});

test('mixed batches roll back as a whole and repeated saving does not duplicate amount expenses', () => {
  const { repo, id, itemId, workflow, input } = setup();
  try {
    workflow('in_progress');
    const lacquerId = repo.inventory.createItem({ name: 'Лак', unit: 'л', notes: '' });
    const value = {
      operationId: randomUUID(),
      orderId: id,
      rows: [
        { itemId, quantity: '', amount: '3500', category: 'painting' as const, note: '' },
        { itemId: lacquerId, quantity: '1', category: 'painting' as const, note: '' }
      ]
    };
    const save = () =>
      repo.mutateOrderCosts(id, actor, () => repo.inventory.consumeBatch(value, actor));
    assert.throws(save, /Недостатньо/);
    assert.equal(repo.inventory.movements().length, 0);
    repo.inventory.receive(
      {
        itemId: lacquerId,
        operationId: randomUUID(),
        quantity: '1',
        totalAmount: '1000',
        currency: 'UAH',
        exchangeRate: '1',
        note: ''
      },
      actor
    );
    save();
    save();
    assert.equal(orderMaterialCosts(repo.inventory.movements(), id).paintingCents, 450000);
    assert.equal(
      repo.inventory.orderMovements(id).filter((row) => row.kind === 'consumption').length,
      2
    );
    assert.equal(repo.inventory.items().find((item) => item.id === itemId)!.balanceMilli, 0);
    assert.throws(
      () =>
        repo.mutateOrderCosts(id, actor, () =>
          repo.inventory.consume({ ...input('1'), orderId: randomUUID() }, actor)
        ),
      /не знайдено/
    );
  } finally {
    repo.close();
  }
});

test('amount expenses use their assigned work category for role wages and support losses', () => {
  const { repo, id, itemId, workflow, current, input, consume } = setup();
  try {
    const team = ['painter', 'polisher', 'assembler'].map((id) => ({
      id,
      name: id,
      identifier: id,
      role: 'worker' as const
    }));
    repo.saveOrderLabor(
      {
        orgId: 'test',
        orderId: id,
        expectedRevision: current().workflowRevision!,
        operationId: randomUUID(),
        labor: {
          painter: { workerId: 'painter', workerName: 'Маляр', shareBps: 6000 },
          polisher: { workerId: 'polisher', workerName: 'Полірувальник', shareBps: 6000 },
          assembler: { workerId: 'assembler', workerName: 'Збірник', shareBps: 6000 },
          polishingCents: 200000,
          assemblyCents: 200000
        }
      },
      team,
      actor
    );
    workflow('in_progress');
    consume(input('3500'));
    repo.mutateOrderCosts(id, actor, () =>
      repo.inventory.consume({ ...input('500'), category: 'polishing' }, actor)
    );
    workflow('ready');
    const result = repo.settlements.latest(id)!.result;
    assert.equal(result.painterAccrualCents, 750000);
    assert.equal(result.polisherAccrualCents, 90000);
    assert.equal(result.assemblerAccrualCents, 120000);
    assert.equal(result.workshopRemainderCents, 640000);
    assert.equal(repo.inventory.items().find((item) => item.id === itemId)!.balanceMilli, 0);
    consume(input('25000'));
    assert.equal(repo.settlements.latest(id)!.result.painterAccrualCents, 0);
    assert.ok(repo.settlements.latest(id)!.result.workshopRemainderCents < 0);
  } finally {
    repo.close();
  }
});

test('schema 22 migration preserves quantity values, reversal links and ordering across reopen', () => {
  const directory = mkdtempSync(join(tmpdir(), 'amount-migration-'));
  const path = join(directory, 'crm.sqlite');
  let repo = new CrmRepository(path);
  try {
    const itemId = repo.inventory.createItem({ name: 'Лак', unit: 'л', notes: '' });
    repo.inventory.receive(
      {
        itemId,
        quantity: '2',
        operationId: randomUUID(),
        note: '',
        currency: 'UAH',
        totalAmount: '1000',
        exchangeRate: '1'
      },
      actor
    );
    const customerId = repo.createCustomer({ name: 'Клієнт', phone: '0501234567', notes: '' });
    const vehicleId = repo.createVehicle({
      customerId,
      make: 'Ford',
      model: 'Focus',
      year: 2020,
      plate: '',
      vin: 'WVWZZZ1JZXW000001'
    });
    const orderId = repo.createOrder({
      customerId,
      vehicleId,
      requestId: '',
      description: 'Ремонт',
      items: [{ description: 'Фарбування', quantity: 1, unitPrice: 20000 }]
    });
    const db = new DatabaseSync(path);
    db.prepare("UPDATE crm_orders SET status='in_progress' WHERE id=?").run(orderId);
    const movementId = randomUUID();
    repo.inventory.consume(
      { itemId, orderId, operationId: movementId, quantity: '0.5', note: '' },
      actor
    );
    repo.inventory.reverse({ movementId, operationId: randomUUID(), note: 'Помилка' }, actor);
    const items = repo.inventory.items(),
      movements = repo.inventory.movements();
    repo.close();
    const columns = db
      .prepare('PRAGMA table_info(stock_movements)')
      .all()
      .map((column) => `"${column.name}"`)
      .join(',');
    db.exec(
      'PRAGMA foreign_keys=OFF; ALTER TABLE stock_movements RENAME TO stock_movements_current'
    );
    db.exec(inventoryTables);
    migrateStockValuation(db);
    db.exec(`INSERT INTO stock_movements(rowid,${columns}) SELECT rowid,${columns} FROM stock_movements_current;
      DROP TABLE stock_movements_current; ALTER TABLE stock_items DROP COLUMN accountingMode; PRAGMA user_version=22;`);
    db.exec(inventoryTables);
    db.close();
    repo = new CrmRepository(path);
    assert.deepEqual(repo.inventory.items(), items);
    assert.deepEqual(repo.inventory.movements(), movements);
    const amountId = repo.inventory.createItem({
      name: 'Фарба',
      unit: '',
      accountingMode: 'amount',
      notes: ''
    });
    repo.inventory.consume(
      {
        itemId: amountId,
        orderId,
        operationId: randomUUID(),
        quantity: '',
        amount: '3500',
        note: ''
      },
      actor
    );
    const saved = repo.inventory.movements();
    repo.close();
    repo = new CrmRepository(path);
    assert.deepEqual(repo.inventory.movements(), saved);
    const verify = new DatabaseSync(path);
    assert.equal(verify.prepare('PRAGMA user_version').get()!.user_version, 23);
    assert.deepEqual(verify.prepare('PRAGMA foreign_key_check').all(), []);
    verify.close();
  } finally {
    repo.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
