import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository } from '@/features/crm/server/repository';
import { overviewFacts, matchesOverviewOrder } from '../lib/cohorts';
import { overviewOrderMetrics } from '../schemas/period';

test('SQL overview scopes select the exact cohort before pagination, including cash reversals and current debt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'overview-cohorts-'));
  const path = join(directory, 'test.sqlite');
  const repository = new CrmRepository(path),
    db = new DatabaseSync(path);
  const actor = { id: 'admin', name: 'Адмін' };
  try {
    const customerId = repository.createCustomer({
      name: 'Клієнт',
      phone: '0501234567',
      notes: ''
    });
    const vehicleId = repository.createVehicle({
      customerId,
      make: 'Ford',
      model: 'Focus',
      plate: '',
      vin: 'WVWZZZ1JZXW000001',
      year: 2020
    });
    const ids = Array.from({ length: 12 }, () =>
      repository.createOrder(
        {
          customerId,
          vehicleId,
          requestId: '',
          assigneeId: 'admin',
          description: 'Фарбування',
          items: [{ description: 'Бампер', quantity: 1, unitPrice: 100 }]
        },
        actor.name,
        actor
      )
    );
    db.exec("UPDATE crm_orders SET createdAt='2026-11-01T00:00:00Z'");
    for (const id of ids.slice(0, 5))
      db.prepare(
        "UPDATE crm_orders SET status='ready',actualReadyDate='2026-11-30' WHERE id=?"
      ).run(id);
    db.prepare("UPDATE crm_orders SET actualReadyDate='2026-10-31' WHERE id=?").run(ids[4]);
    const cash = (id: string, amount: string) =>
      repository.payments.receive(
        { orderId: id, amount, operationId: crypto.randomUUID(), note: '' },
        actor
      );
    const cancelled = cash(ids[0], '25');
    repository.payments.reverse(
      { paymentId: cancelled, operationId: crypto.randomUUID(), note: 'Помилка' },
      actor
    );
    cash(ids[1], '100');
    cash(ids[4], '50');
    db.exec("UPDATE crm_payments SET createdAt='2026-11-01T10:00:00Z'");
    const period = { from: '2026-11-01', to: '2026-11-30' };
    const facts = overviewFacts(repository.reads.overviewSource());
    for (const overviewMetric of overviewOrderMetrics) {
      const expected = facts.orders
        .filter((fact) => matchesOverviewOrder(fact, facts, overviewMetric, period))
        .map((fact) => fact.order.id)
        .toSorted();
      const actual = repository.reads.list({
        entity: 'orders',
        overviewMetric,
        overviewFrom: period.from,
        overviewTo: period.to,
        pageSize: 100
      });
      assert.deepEqual(actual.orders.map((order) => order.id).toSorted(), expected, overviewMetric);
    }
    const filters = {
      entity: 'orders' as const,
      overviewMetric: 'completed' as const,
      overviewFrom: period.from,
      overviewTo: period.to,
      pageSize: 2
    };
    const first = repository.reads.list({ ...filters, page: 1 });
    const second = repository.reads.list({ ...filters, page: 2 });
    assert.equal(first.pagination!.total, 4);
    assert.equal(second.pagination!.total, 4);
    assert.equal(new Set([...first.orders, ...second.orders].map((order) => order.id)).size, 4);
    const debt = repository.reads.list({ ...filters, overviewMetric: 'ready_debt', pageSize: 100 });
    assert.equal(debt.pagination!.total, 3);
    assert.equal(
      debt.orders.some((order) => order.id === ids[1]),
      false
    );
    const receipts = repository.reads.list({
      ...filters,
      overviewMetric: 'receipts',
      pageSize: 100
    });
    assert.deepEqual(
      receipts.orders.map((order) => order.id).toSorted(),
      [ids[1], ids[4]].toSorted()
    );
  } finally {
    db.close();
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
