import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository } from '../server/repository';
import type { OrderEconomicsDetails } from '@/features/order-economics/api/types';
import { economicsDetailsSchema } from '@/features/order-economics/schemas/details';
import {
  detailedCheckItems,
  previewDetailedEconomics
} from '@/features/order-economics/lib/details';
import { orderMaterialCosts } from '@/features/inventory/lib/order-costs';
import { historyOrderChanges } from '../lib/workflow-history';
import { businessToday } from '../lib/workflow';

const actor = { id: 'admin', name: 'Адміністратор' };
function seed(repository: CrmRepository): string {
  const customerId = repository.createCustomer({ name: 'Клієнт', phone: '0501234567', notes: '' });
  const vehicleId = repository.createVehicle({
    customerId,
    make: 'Ford',
    model: 'Focus',
    year: 2020,
    plate: '',
    vin: 'WVWZZZ1JZXW000001'
  });
  return repository.createOrder({
    customerId,
    vehicleId,
    requestId: '',
    description: 'Роботи по авто',
    items: [{ description: 'Фарбування бампера', quantity: 1, unitPrice: 18000 }]
  });
}
function details(): OrderEconomicsDetails {
  return {
    employeeShareBps: 6000,
    painterId: 'painter',
    polisherId: 'polisher',
    assemblerId: 'assembler',
    lines: [
      {
        id: randomUUID(),
        kind: 'painting',
        description: 'Фарбування бампера',
        quantity: 1,
        unitPriceCents: 1800000,
        polishingCents: 100000,
        subcontractCostCents: 0,
        contractorName: ''
      },
      {
        id: randomUUID(),
        kind: 'assembly',
        description: 'Розбірка-збірка',
        quantity: 1,
        unitPriceCents: 100000,
        polishingCents: 0,
        subcontractCostCents: 0,
        contractorName: ''
      },
      {
        id: randomUUID(),
        kind: 'color_matching',
        description: 'Підбір фарби',
        quantity: 1,
        unitPriceCents: 200000,
        polishingCents: 0,
        subcontractCostCents: 200000,
        contractorName: 'Колорист'
      },
      {
        id: randomUUID(),
        kind: 'soldering',
        description: 'Пайка',
        quantity: 1,
        unitPriceCents: 150000,
        polishingCents: 0,
        subcontractCostCents: 150000,
        contractorName: 'Підрядник'
      }
    ]
  };
}
function save(
  repository: CrmRepository,
  id: string,
  value: OrderEconomicsDetails,
  revision = 0
): void {
  const canonical = economicsDetailsSchema.parse(value);
  repository.updateOrder(
    {
      id,
      expectedRevision: revision,
      description: 'Роботи по авто',
      items: detailedCheckItems(canonical).map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPriceCents / 100
      }))
    },
    undefined,
    actor,
    {
      details: canonical,
      workerNames: { painter: 'Маляр', polisher: 'Полірувальник', assembler: 'Розбірник' }
    }
  );
}
function withRepository(work: (repository: CrmRepository) => void) {
  const repository = new CrmRepository(':memory:');
  try {
    work(repository);
  } finally {
    repository.close();
  }
}

test('detailed check persists role assignments, contractor identities, client total and history atomically', () =>
  withRepository((repository) => {
    const id = seed(repository);
    assert.equal(repository.workspace().orders[0].economics, undefined);
    const value = details();
    save(repository, id, value);
    const order = repository.workspace().orders[0];
    assert.equal(order.totalCents, 2250000);
    assert.deepEqual(order.items, detailedCheckItems(value));
    assert.equal(order.economics!.painterName, 'Маляр');
    assert.equal(order.economics!.polisherName, 'Полірувальник');
    assert.equal(order.economics!.assemblerName, 'Розбірник');
    assert.ok(order.economics!.lines[2].contractorId);
    const event = repository.workspace().events[0];
    assert.deepEqual(event.actor, actor);
    assert.equal(event.orderChanges!.before.economics, undefined);
    assert.equal(event.orderChanges!.after.economics!.lines[0].polishingCents, 100000);
    assert.ok(
      historyOrderChanges(event).some(
        (change) => change.label === 'Внутрішня економіка' && change.after.includes('Маляр')
      )
    );
    const count = repository.workspace().events.length;
    save(repository, id, value, 1);
    assert.equal(repository.workspace().events.length, count);
    assert.equal(repository.workspace().orders[0].workflowRevision, 1);
    assert.equal(repository.workspace().payments!.length, 0);
  }));

test('actual material categories reproduce Excel economics; subcontract and polishing are not counted twice', () =>
  withRepository((repository) => {
    const id = seed(repository);
    save(repository, id, details());
    repository.updateWorkflow({
      kind: 'order',
      id,
      expectedStatus: 'created',
      expectedRevision: 1,
      status: 'in_progress',
      plannedIntakeDate: '',
      plannedDeliveryDate: '',
      actualIntakeDate: businessToday(),
      actualReadyDate: '',
      actualDeliveryDate: '',
      note: ''
    });
    for (const [name, amount, category] of [
      ['Лак', '3000', 'painting'],
      ['Поліроль', '500', 'polishing']
    ] as const) {
      const itemId = repository.inventory.createItem({ name, unit: 'л', notes: '' });
      repository.inventory.receive(
        {
          itemId,
          quantity: '1',
          totalAmount: amount,
          currency: 'UAH',
          exchangeRate: '1',
          operationId: randomUUID(),
          note: ''
        },
        actor
      );
      repository.inventory.consume(
        { itemId, orderId: id, quantity: '1', category, operationId: randomUUID(), note: '' },
        actor
      );
    }
    const preview = previewDetailedEconomics(
      repository.workspace().orders[0].economics!,
      orderMaterialCosts(repository.inventory.movements(), id)
    );
    assert.deepEqual(preview.issues, []);
    assert.equal(preview.result!.painterAccrualCents, 840000);
    assert.equal(preview.result!.polisherAccrualCents, 30000);
    assert.equal(preview.result!.assemblerAccrualCents, 60000);
    assert.equal(preview.result!.subcontractCostsCents, 350000);
    assert.equal(preview.result!.workshopRemainderCents, 620000);
  }));

test('ordinary edits cannot overwrite detailed prices; stale and missing revisions reject the whole update', () =>
  withRepository((repository) => {
    const id = seed(repository);
    const value = details();
    save(repository, id, value);
    const before = repository.workspace();
    assert.throws(
      () => save(repository, id, { ...value, employeeShareBps: 7000 }, 0),
      /іншому вікні/
    );
    assert.throws(
      () =>
        repository.updateOrder({
          id,
          expectedRevision: 1,
          description: 'Зміна',
          items: [{ description: 'Нова ціна', quantity: 1, unitPrice: 20000 }]
        }),
      /Деталізований чек/
    );
    assert.throws(
      () =>
        repository.updateOrder(
          {
            id,
            description: 'Зміна',
            items: [{ description: 'Робота', quantity: 1, unitPrice: 22500 }]
          },
          undefined,
          actor,
          { details: value, workerNames: {} }
        ),
      /версія/
    );
    assert.deepEqual(repository.workspace(), before);
    const order = before.orders[0];
    repository.updateOrder({
      id,
      expectedRevision: 1,
      description: 'Уточнений опис',
      items: order.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPriceCents / 100
      }))
    });
    assert.deepEqual(repository.workspace().orders[0].economics, order.economics);
  }));

test('reducing a detailed check below received money and editing a ready order are rejected', () =>
  withRepository((repository) => {
    const id = seed(repository);
    repository.payments.receive(
      { orderId: id, operationId: randomUUID(), amount: '18000', note: '' },
      actor
    );
    const value = details();
    const cheap = { ...value, lines: [{ ...value.lines[0], unitPriceCents: 1000000 }] };
    assert.throws(() => save(repository, id, cheap), /отриману оплату/);
    assert.equal(repository.workspace().orders[0].economics, undefined);
    save(repository, id, value);
    repository.updateWorkflow({
      kind: 'order',
      id,
      expectedStatus: 'created',
      expectedRevision: 1,
      status: 'in_progress',
      plannedIntakeDate: '',
      plannedDeliveryDate: '',
      actualIntakeDate: businessToday(),
      actualReadyDate: '',
      actualDeliveryDate: '',
      note: ''
    });
    repository.updateWorkflow({
      kind: 'order',
      id,
      expectedStatus: 'in_progress',
      expectedRevision: 2,
      status: 'ready',
      plannedIntakeDate: '',
      plannedDeliveryDate: '',
      actualIntakeDate: businessToday(),
      actualReadyDate: businessToday(),
      actualDeliveryDate: '',
      note: ''
    });
    assert.throws(() => save(repository, id, value, 3), /коригування/);
  }));

test('contractor identity survives line edits and normalizes repeated names across orders', () =>
  withRepository((repository) => {
    const id = seed(repository);
    const value = details();
    value.lines[3].contractorName = '  Колорист  ';
    save(repository, id, value);
    const stored = repository.workspace().orders[0].economics!;
    assert.equal(stored.lines[2].contractorId, stored.lines[3].contractorId);
    assert.equal(stored.lines[3].contractorName, 'Колорист');
    const changed = { ...value, lines: value.lines.map((line) => ({ ...line })) };
    changed.lines[3].subcontractCostCents = 140000;
    save(repository, id, changed, 1);
    assert.equal(
      repository.workspace().orders[0].economics!.lines[3].contractorId,
      stored.lines[3].contractorId
    );
    assert.equal(repository.workspace().orders[0].economics!.lines[3].id, value.lines[3].id);
  }));

test('v13 upgrade preserves legacy data and classified data survive reopening', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-economics-'));
  const filename = join(directory, 'crm.sqlite');
  let repository = new CrmRepository(filename);
  try {
    const id = seed(repository);
    const before = repository.workspace();
    repository.close();
    const db = new DatabaseSync(filename);
    db.exec('DROP TABLE crm_order_economics; DROP TABLE crm_contractors; PRAGMA user_version=13');
    db.close();
    repository = new CrmRepository(filename);
    assert.deepEqual(repository.workspace(), before);
    save(repository, id, details());
    const classified = repository.workspace();
    repository.close();
    repository = new CrmRepository(filename);
    assert.deepEqual(repository.workspace(), classified);
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
