import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CrmRepository, OrganizationRepositories } from '../server/repository';
import { paymentBalance } from '../lib/payment-balance';
import { overviewMetrics } from '@/features/overview/lib/metrics';
import { businessToday } from '../lib/workflow';
import { executorTransition } from '../lib/executor-workflow';

const actor = { id: 'admin', name: 'Адміністратор' };
function seed(repository: CrmRepository): string {
  const customerId = repository.createCustomer({ name: 'Клієнт', phone: '0501234567', notes: '' });
  const vehicleId = repository.createVehicle({
    customerId,
    make: 'ZEEKR',
    model: '001',
    year: 2024,
    plate: '',
    vin: 'L6T79ZCEXRP120619'
  });
  return repository.createOrder(
    {
      customerId,
      vehicleId,
      requestId: '',
      assigneeId: 'admin',
      description: 'Фарбування',
      items: [{ description: 'Капот', quantity: 1, unitPrice: 100 }]
    },
    actor.name,
    actor
  );
}
function receive(repository: CrmRepository, orderId: string, amount: string) {
  const input = { orderId, amount, operationId: randomUUID(), note: '' };
  const id = repository.payments.receive(input, actor);
  return { id, input };
}
function advance(repository: CrmRepository, id: string) {
  const order = repository.workspace().orders.find((entry) => entry.id === id)!;
  const next = executorTransition(order, {
    id,
    expectedStatus: order.status,
    expectedRevision: order.workflowRevision ?? 0
  });
  assert.equal(next.ok, true);
  if (next.ok) repository.updateWorkflow(next.data, actor);
}

test('created orders advance forward; unpaid readiness creates debt independent from monthly receipts', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const id = seed(repository);
    assert.equal(repository.workspace().orders[0].status, 'created');
    assert.equal(overviewMetrics(repository.workspace()).debtCents, 0);
    assert.equal(overviewMetrics(repository.workspace()).pendingPaymentCents, 10000);
    const first = receive(repository, id, '30,25');
    assert.equal(repository.payments.receive(first.input, actor), first.id);
    assert.throws(
      () => repository.payments.receive({ ...first.input, amount: '1' }, actor),
      /ідентифікатор/i
    );
    assert.throws(() => receive(repository, id, '70'), /перевищує/);
    advance(repository, id);
    advance(repository, id);
    let metrics = overviewMetrics(repository.workspace());
    assert.equal(metrics.debtCents, 6975);
    assert.equal(metrics.monthlyReceiptsCents, 3025);
    assert.equal(metrics.pendingPaymentCents, 0);
    assert.equal(metrics.debtOrderCount, 1);
    receive(repository, id, '69.75');
    metrics = overviewMetrics(repository.workspace());
    assert.equal(metrics.debtCents, 0);
    assert.equal(metrics.monthlyReceiptsCents, 10000);
    assert.equal(
      paymentBalance(repository.workspace().orders[0], repository.payments.list()).status,
      'Оплачено'
    );
    const cancellation = {
      paymentId: first.id,
      operationId: randomUUID(),
      note: 'Помилково внесено'
    };
    const reversalId = repository.payments.reverse(cancellation, actor);
    assert.equal(repository.payments.reverse(cancellation, actor), reversalId);
    assert.throws(
      () => repository.payments.reverse({ ...cancellation, operationId: randomUUID() }, actor),
      /уже скасовано/
    );
    assert.throws(() =>
      repository.payments.reverse({ ...cancellation, operationId: randomUUID(), note: '' }, actor)
    );
    assert.equal(overviewMetrics(repository.workspace()).debtCents, 3025);
    assert.equal(overviewMetrics(repository.workspace()).monthlyReceiptsCents, 6975);
    assert.equal(repository.payments.list().length, 3);
  } finally {
    repository.close();
  }
});

test('payments survive reopening; two connections cannot overpay and price edits cannot fall below received money', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-payment-'));
  const path = join(dir, 'crm.sqlite');
  let repository = new CrmRepository(path);
  let second: CrmRepository | undefined;
  try {
    const id = seed(repository);
    receive(repository, id, '60');
    second = new CrmRepository(path);
    assert.throws(() => receive(second!, id, '50'), /перевищує/);
    assert.throws(
      () =>
        repository.updateOrder({
          id,
          description: 'Знижка',
          items: [{ description: 'Капот', quantity: 1, unitPrice: 50 }]
        }),
      /меншою/
    );
    repository.close();
    repository = new CrmRepository(path);
    assert.equal(
      paymentBalance(repository.workspace().orders[0], repository.payments.list()).paidCents,
      6000
    );
    assert.equal(repository.payments.list()[0].actor.name, actor.name);
    assert.equal(repository.workspace().orders[0].totalCents, 10000);
  } finally {
    second?.close();
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('payment history is isolated per shop and a foreign payment cannot be reversed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-payment-org-'));
  const registry = new OrganizationRepositories(join(dir, 'crm.sqlite'));
  try {
    const a = registry.forOrganization('org_A', 'admin_A', true);
    const b = registry.forOrganization('org_B', 'admin_B', true);
    const id = seed(a);
    const paid = receive(a, id, '10');
    assert.deepEqual(b.payments.list(), []);
    assert.throws(() => receive(b, id, '1'), /не знайдено/);
    assert.throws(
      () =>
        b.payments.reverse({ paymentId: paid.id, operationId: randomUUID(), note: 'Інше' }, actor),
      /не знайдено/
    );
  } finally {
    registry.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('receipt month follows Kyiv payment date, not delivery date, and cancellation excludes the original payment', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const id = seed(repository);
    receive(repository, id, '10');
    const data = repository.workspace();
    data.payments![0].createdAt = '2026-10-31T22:30:00Z';
    assert.equal(overviewMetrics(data, '2026-11-01').monthlyReceiptsCents, 1000);
    assert.equal(overviewMetrics(data, '2026-10-31').monthlyReceiptsCents, 0);
    assert.equal(data.orders[0].actualDeliveryDate, null);
    assert.ok(businessToday());
  } finally {
    repository.close();
  }
});

test('v10 migration preserves linked stock, order history and numbering gaps', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-payment-migration-'));
  const path = join(dir, 'crm.sqlite');
  let repository = new CrmRepository(path);
  try {
    const id = seed(repository);
    advance(repository, id);
    const before = repository.workspace();
    const itemId = repository.inventory.createItem({ name: 'Фарба', unit: 'л', notes: '' });
    repository.inventory.receive(
      {
        itemId,
        quantity: '1',
        operationId: randomUUID(),
        note: '',
        totalAmount: '100',
        currency: 'UAH',
        exchangeRate: '1'
      },
      actor
    );
    repository.inventory.consume(
      { itemId, orderId: id, quantity: '0.25', operationId: randomUUID(), note: '' },
      actor
    );
    repository.close();
    const old = new DatabaseSync(path);
    try {
      const sql = (
        old.prepare("SELECT sql FROM sqlite_master WHERE name='crm_orders'").get()!.sql as string
      )
        .replace("('created','in_progress','ready')", "('in_progress','ready','delivered')")
        .replace(/CREATE TABLE\s+["`]?crm_orders["`]?/i, 'CREATE TABLE crm_orders_v10');
      const columns = old
        .prepare('PRAGMA table_info(crm_orders)')
        .all()
        .map((column) => `"${column.name}"`)
        .join(',');
      old.exec('PRAGMA foreign_keys=OFF; DROP TABLE crm_payments;');
      old.exec(sql);
      old.exec(
        `INSERT INTO crm_orders_v10 (${columns}) SELECT ${columns} FROM crm_orders; DROP TABLE crm_orders; ALTER TABLE crm_orders_v10 RENAME TO crm_orders; PRAGMA user_version=10;`
      );
      old.prepare("UPDATE sqlite_sequence SET seq=99 WHERE name='crm_orders'").run();
    } finally {
      old.close();
    }
    repository = new CrmRepository(path);
    assert.deepEqual(
      repository.workspace().orders.map(({ trashBlockedReason: _reason, ...order }) => order),
      before.orders.map(({ trashBlockedReason: _reason, ...order }) => order)
    );
    assert.deepEqual(repository.workspace().events, before.events);
    assert.equal(repository.inventory.items()[0].balanceMilli, 750);
    assert.equal(repository.inventory.movements().length, 2);
    const next = repository.createOrder({
      customerId: before.customers[0].id,
      vehicleId: before.vehicles[0].id,
      requestId: '',
      description: 'Нове',
      items: [{ description: 'Робота', quantity: 1, unitPrice: 1 }]
    });
    assert.equal(repository.workspace().orders.find((entry) => entry.id === next)!.number, 100);
    assert.equal(
      repository.workspace().orders.find((entry) => entry.id === next)!.status,
      'created'
    );
  } finally {
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
