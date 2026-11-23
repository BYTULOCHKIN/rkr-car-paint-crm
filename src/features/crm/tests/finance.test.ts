import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository, OrganizationRepositories } from '../server/repository';
import { businessToday } from '../lib/workflow';
import { paymentBalance } from '../lib/payment-balance';
import { detailedCheckItems } from '@/features/order-economics/lib/details';
import { settlementBalance } from '@/features/order-economics/lib/settlements';
import type { OrderEconomicsDetails, EconomicsPosting } from '@/features/order-economics/api/types';
import type { CorrectionInput } from '@/features/order-economics/schemas/finance';
import { overviewMetrics } from '@/features/overview/lib/metrics';

const actor = { id: 'admin', name: 'Адміністратор' };
const painter = { kind: 'worker' as const, id: 'painter', name: 'Маляр' };
const names = {
  painter: 'Маляр',
  polisher: 'Полірувальник',
  assembler: 'Розбірник',
  replacement: 'Інший маляр'
};
function setup(repository: CrmRepository) {
  const customerId = repository.createCustomer({ name: 'Клієнт', phone: '0501234567', notes: '' });
  const vehicleId = repository.createVehicle({
    customerId,
    make: 'Ford',
    model: 'Focus',
    year: 2020,
    plate: '',
    vin: 'WVWZZZ1JZXW000001'
  });
  const id = repository.createOrder({
    customerId,
    vehicleId,
    requestId: '',
    description: 'Фарбування',
    items: [{ description: 'Бампер', quantity: 1, unitPrice: 18000 }]
  });
  const details: OrderEconomicsDetails = {
    employeeShareBps: 6000,
    painterId: 'painter',
    polisherId: 'polisher',
    assemblerId: 'assembler',
    lines: [
      {
        id: randomUUID(),
        kind: 'painting',
        description: 'Бампер',
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
        contractorName: 'Пайка'
      }
    ]
  };
  repository.updateOrder(
    {
      id,
      expectedRevision: 0,
      description: 'Фарбування',
      items: detailedCheckItems(details).map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPriceCents / 100
      }))
    },
    undefined,
    actor,
    { details, workerNames: names }
  );
  transition(repository, id, 'in_progress');
  const stocks: string[] = [];
  for (const [name, amount, category] of [
    ['Лак', '3000', 'painting'],
    ['Поліроль', '500', 'polishing'],
    ['Додатковий матеріал', '1000', 'painting']
  ] as const) {
    const itemId = repository.inventory.createItem({ name, unit: 'л', notes: '' });
    stocks.push(itemId);
    repository.inventory.receive(
      {
        itemId,
        quantity: '2',
        totalAmount: String(Number(amount) * 2),
        currency: 'UAH',
        exchangeRate: '1',
        operationId: randomUUID(),
        note: ''
      },
      actor
    );
    if (name !== 'Додатковий матеріал')
      repository.inventory.consume(
        { itemId, orderId: id, quantity: '1', category, operationId: randomUUID(), note: '' },
        actor
      );
  }
  return { id, details, extraId: stocks[2], customerId, vehicleId };
}
function transition(
  repository: CrmRepository,
  id: string,
  status: 'in_progress' | 'ready',
  note = ''
) {
  const order = repository.workspace().orders.find((entry) => entry.id === id)!;
  repository.updateWorkflow(
    {
      kind: 'order',
      id,
      expectedStatus: order.status,
      expectedRevision: order.workflowRevision ?? 0,
      status,
      plannedIntakeDate: '',
      plannedDeliveryDate: '',
      actualIntakeDate: businessToday(),
      actualReadyDate: status === 'in_progress' ? '' : businessToday(),
      actualDeliveryDate: '',
      note
    },
    actor
  );
}
function correction(
  repository: CrmRepository,
  id: string,
  details: OrderEconomicsDetails,
  materials: CorrectionInput['materials'] = []
): CorrectionInput {
  const workspace = repository.workspace();
  return {
    orgId: 'org_A',
    orderId: id,
    operationId: randomUUID(),
    expectedRevision: workspace.orders.find((entry) => entry.id === id)!.workflowRevision ?? 0,
    expectedPostingRevision: repository.settlements.latest(id)?.revision ?? 0,
    expectedInventoryRevision: workspace.finance!.inventoryRevision,
    details,
    materials,
    note: 'Уточнені фактичні витрати'
  };
}
function withRepository(work: (repository: CrmRepository) => void) {
  const repository = new CrmRepository(':memory:');
  try {
    work(repository);
  } finally {
    repository.close();
  }
}
function pay(repository: CrmRepository, orderId: string, amount: string) {
  const input = {
    orgId: 'org_A',
    orderId,
    operationId: randomUUID(),
    payeeKind: 'worker' as const,
    payeeId: painter.id,
    kind: 'payout' as const,
    amount,
    note: ''
  };
  repository.settlements.cash(input, actor, painter);
  return input;
}

test('readiness posts one immutable snapshot with Excel amounts and no duplicate after rollback', () =>
  withRepository((repository) => {
    const { id } = setup(repository);
    transition(repository, id, 'ready');
    const posted = repository.settlements.latest(id)!;
    assert.equal(posted.revision, 1);
    assert.equal(posted.result.painterAccrualCents, 840000);
    assert.equal(posted.result.polisherAccrualCents, 30000);
    assert.equal(posted.result.assemblerAccrualCents, 60000);
    assert.equal(posted.result.workshopRemainderCents, 620000);
    assert.equal(repository.settlements.events().length, 5);
    transition(repository, id, 'ready');
    transition(repository, id, 'in_progress', 'Повернуто на доопрацювання');
    transition(repository, id, 'ready');
    assert.deepEqual(repository.settlements.latest(id), posted);
    assert.equal(repository.settlements.events().length, 5);
  }));

test('administrative readiness directly from work cannot bypass accrual posting', () =>
  withRepository((repository) => {
    const { id } = setup(repository);
    transition(repository, id, 'ready');
    assert.equal(repository.settlements.latest(id)!.revision, 1);
    assert.equal(repository.settlements.latest(id)!.result.painterAccrualCents, 840000);
    transition(repository, id, 'in_progress', 'Доопрацювання');
    transition(repository, id, 'ready');
    assert.equal(repository.settlements.postings().length, 1);
  }));

test('v14 finance migration preserves detailed checks, cash and stock without inventing historical accruals', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-finance-migration-'));
  const path = join(directory, 'crm.sqlite');
  let repository = new CrmRepository(path);
  try {
    const { id } = setup(repository);
    transition(repository, id, 'ready');
    repository.payments.receive(
      { orderId: id, operationId: randomUUID(), amount: '100', note: '' },
      actor
    );
    const before = repository.workspace();
    const movements = repository.inventory
      .movements()
      .map(({ financialLocked: _locked, ...entry }) => entry);
    const items = repository.inventory.items();
    repository.close();
    const db = new DatabaseSync(path);
    try {
      db.exec(
        'DROP TABLE crm_settlement_events; DROP TABLE crm_economics_postings; DROP TABLE crm_customer_refunds; ALTER TABLE crm_orders DROP COLUMN defaultEmployeeShareBps; PRAGMA user_version=14'
      );
    } finally {
      db.close();
    }
    repository = new CrmRepository(path);
    const after = repository.workspace();
    assert.deepEqual(after.orders, before.orders);
    assert.deepEqual(after.customers, before.customers);
    assert.deepEqual(after.vehicles, before.vehicles);
    assert.deepEqual(after.events, before.events);
    assert.deepEqual(after.payments, before.payments);
    assert.deepEqual(after.finance!.events, []);
    assert.deepEqual(after.finance!.postings, []);
    assert.deepEqual(repository.inventory.items(), items);
    assert.deepEqual(
      repository.inventory.movements().map(({ financialLocked: _locked, ...entry }) => entry),
      movements
    );
    const verification = new DatabaseSync(path);
    try {
      assert.equal(verification.prepare('PRAGMA user_version').get()!.user_version, 17);
      assert.deepEqual(verification.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
      verification.close();
    }
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('advances, partial payouts and signed cost corrections preserve actual cash and expose overpayment', () =>
  withRepository((repository) => {
    const { id, details, extraId } = setup(repository);
    const advance = pay(repository, id, '2000');
    repository.settlements.cash(advance, actor, painter);
    assert.equal(
      settlementBalance(repository.settlements.events(), id, painter).advanceCents,
      200000
    );
    transition(repository, id, 'ready');
    assert.equal(
      settlementBalance(repository.settlements.events(), id, painter).payableCents,
      640000
    );
    pay(repository, id, '6400');
    const input = correction(repository, id, details, [
      { kind: 'consume', itemId: extraId, quantity: '1', category: 'painting' }
    ]);
    const before = repository.workspace();
    const stock = repository.inventory.items();
    const movements = repository.inventory.movements();
    const preview = repository.correctOrderEconomics(input, names, actor, true);
    assert.ok('after' in preview);
    assert.equal(preview.after.result.painterAccrualCents, 780000);
    assert.equal(
      preview.deltas.find((entry) => entry.payee.id === painter.id)!.amountCents,
      -60000
    );
    assert.deepEqual(repository.workspace(), before);
    assert.deepEqual(repository.inventory.items(), stock);
    assert.deepEqual(repository.inventory.movements(), movements);
    const posted = repository.correctOrderEconomics(input, names, actor) as EconomicsPosting;
    assert.equal(posted.revision, 2);
    assert.equal(
      settlementBalance(repository.settlements.events(), id, painter).advanceCents,
      60000
    );
    assert.equal(settlementBalance(repository.settlements.events(), id, painter).paidCents, 840000);
    assert.deepEqual(repository.correctOrderEconomics(input, names, actor), posted);
    assert.throws(
      () => repository.correctOrderEconomics({ ...input, note: 'Інша причина' }, names, actor),
      /ідентифікатор|Ідентифікатор/
    );
    repository.settlements.cash(
      { ...advance, kind: 'return', amount: '600', operationId: randomUUID() },
      actor,
      painter
    );
    assert.equal(settlementBalance(repository.settlements.events(), id, painter).balanceCents, 0);
  }));

test('reassignment corrects each person separately without transferring or deleting payouts', () =>
  withRepository((repository) => {
    const { id, details } = setup(repository);
    transition(repository, id, 'ready');
    pay(repository, id, '8400');
    repository.correctOrderEconomics(
      correction(repository, id, { ...details, painterId: 'replacement' }),
      names,
      actor
    );
    assert.equal(
      settlementBalance(repository.settlements.events(), id, painter).advanceCents,
      840000
    );
    assert.equal(
      settlementBalance(repository.settlements.events(), id, { kind: 'worker', id: 'replacement' })
        .payableCents,
      840000
    );
    const adjustments = repository.settlements
      .events()
      .filter((entry) => entry.kind === 'adjustment');
    assert.equal(adjustments.length, 2);
    assert.equal(
      adjustments.reduce((sum, entry) => sum + entry.amountCents, 0),
      0
    );
  }));

test('corrections reject stale warehouse versions and roll back all work if a later material operation fails', () =>
  withRepository((repository) => {
    const { id, details, extraId } = setup(repository);
    transition(repository, id, 'ready');
    const stale = correction(repository, id, details);
    repository.inventory.receive(
      {
        itemId: extraId,
        quantity: '1',
        totalAmount: '1000',
        currency: 'UAH',
        exchangeRate: '1',
        operationId: randomUUID(),
        note: ''
      },
      actor
    );
    assert.throws(() => repository.correctOrderEconomics(stale, names, actor), /змінилися/);
    const input = correction(repository, id, details, [
      { kind: 'consume', itemId: extraId, quantity: '1', category: 'painting' },
      { kind: 'consume', itemId: extraId, quantity: '999', category: 'painting' }
    ]);
    const before = repository.workspace();
    const stock = repository.inventory.items();
    const movements = repository.inventory.movements();
    assert.throws(() => repository.correctOrderEconomics(input, names, actor), /Недостатньо/);
    assert.deepEqual(repository.workspace(), before);
    assert.deepEqual(repository.inventory.items(), stock);
    assert.deepEqual(repository.inventory.movements(), movements);
  }));

test('posted materials stay locked after rollback; reversal through correction restores original cost', () =>
  withRepository((repository) => {
    const { id, details, extraId } = setup(repository);
    transition(repository, id, 'ready');
    const used = repository.inventory
      .movements()
      .find((entry) => entry.orderId === id && entry.category === 'painting')!;
    assert.throws(
      () =>
        repository.inventory.reverse(
          { movementId: used.id, operationId: randomUUID(), note: 'Помилка' },
          actor
        ),
      /коригування/
    );
    transition(repository, id, 'in_progress', 'Доопрацювання');
    assert.throws(
      () =>
        repository.inventory.consume(
          { itemId: extraId, orderId: id, quantity: '1', operationId: randomUUID(), note: '' },
          actor
        ),
      /коригування/
    );
    repository.correctOrderEconomics(
      correction(repository, id, details, [{ kind: 'reverse', movementId: used.id }]),
      names,
      actor
    );
    assert.equal(repository.settlements.latest(id)!.costs.paintingCents, 0);
    assert.equal(
      repository.inventory.movements().find((entry) => entry.reversesId === used.id)!
        .costDeltaCents,
      300000
    );
    assert.equal(
      settlementBalance(repository.settlements.events(), id, painter).accruedCents,
      1020000
    );
  }));

test('missing workers prevent readiness atomically; legacy unclassified checks do not gain fictitious accruals', () =>
  withRepository((repository) => {
    const { id, details, customerId, vehicleId } = setup(repository);
    repository.updateOrder(
      {
        id,
        expectedRevision: 2,
        description: 'Фарбування',
        items: detailedCheckItems(details).map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPriceCents / 100
        }))
      },
      undefined,
      actor,
      { details: { ...details, painterId: '' }, workerNames: names }
    );
    assert.throws(() => transition(repository, id, 'ready'), /Не призначено/);
    assert.equal(
      repository.workspace().orders.find((entry) => entry.id === id)!.status,
      'in_progress'
    );
    assert.equal(repository.settlements.postings().length, 0);
    const legacy = repository.createOrder({
      customerId,
      vehicleId,
      requestId: '',
      description: 'Старий облік',
      items: [{ description: 'Робота', quantity: 1, unitPrice: 100 }]
    });
    transition(repository, legacy, 'in_progress');
    transition(repository, legacy, 'ready');
    assert.equal(repository.settlements.latest(legacy), null);
    repository.correctOrderEconomics(correction(repository, legacy, details), names, actor);
    assert.equal(repository.settlements.latest(legacy)!.kind, 'initial');
  }));

test('cash cancellation is distinct from a real return and cannot make net payments negative', () =>
  withRepository((repository) => {
    const { id } = setup(repository);
    const payout = pay(repository, id, '1000');
    const returned = {
      ...payout,
      kind: 'return' as const,
      operationId: randomUUID(),
      amount: '400'
    };
    repository.settlements.cash(returned, actor, painter);
    assert.throws(
      () =>
        repository.settlements.reverse(
          {
            orgId: 'org_A',
            operationId: randomUUID(),
            eventId: payout.operationId,
            note: 'Помилка'
          },
          actor
        ),
      /Повернення/
    );
    const reverse = {
      orgId: 'org_A',
      operationId: randomUUID(),
      eventId: returned.operationId,
      note: 'Помилковий запис'
    };
    repository.settlements.reverse(reverse, actor);
    repository.settlements.reverse(reverse, actor);
    assert.equal(settlementBalance(repository.settlements.events(), id, painter).paidCents, 100000);
    assert.equal(repository.settlements.events().length, 3);
    assert.throws(
      () => repository.settlements.cash({ ...payout, amount: '2000' }, actor, painter),
      /Ідентифікатор/
    );
    assert.throws(
      () =>
        repository.settlements.cash(
          { ...returned, operationId: randomUUID(), amount: '1001' },
          actor,
          painter
        ),
      /перевищує/
    );
  }));

test('default rate only affects newly created orders and is revision-protected', () =>
  withRepository((repository) => {
    const { id, customerId, vehicleId } = setup(repository);
    repository.updateFinanceSettings({
      orgId: 'org_A',
      employeeShareBps: 7000,
      expectedRevision: 0
    });
    const next = repository.createOrder({
      customerId,
      vehicleId,
      requestId: '',
      description: 'Нове',
      items: [{ description: 'Робота', quantity: 1, unitPrice: 100 }]
    });
    const orders = repository.workspace().orders;
    assert.equal(orders.find((entry) => entry.id === id)!.economics!.employeeShareBps, 6000);
    assert.equal(orders.find((entry) => entry.id === next)!.defaultEmployeeShareBps, 7000);
    assert.throws(
      () =>
        repository.updateFinanceSettings({
          orgId: 'org_A',
          employeeShareBps: 8000,
          expectedRevision: 0
        }),
      /вже змінено/
    );
  }));

test('customer overpayment survives a reduced check and actual refunds never rewrite received payments', () =>
  withRepository((repository) => {
    const { id, details } = setup(repository);
    transition(repository, id, 'ready');
    const receipt = repository.payments.receive(
      { orderId: id, operationId: randomUUID(), amount: '22500', note: '' },
      actor
    );
    const changed = structuredClone(details);
    changed.lines[0].unitPriceCents = 1700000;
    repository.correctOrderEconomics(correction(repository, id, changed), names, actor);
    let order = repository.workspace().orders.find((entry) => entry.id === id)!;
    assert.equal(paymentBalance(order, repository.payments.list()).overpaidCents, 100000);
    repository.updateOrder(
      {
        id,
        expectedRevision: order.workflowRevision,
        description: 'Уточнено опис без зміни ціни',
        items: order.items.map((item) => ({ ...item, unitPrice: item.unitPriceCents / 100 }))
      },
      undefined,
      actor
    );
    assert.equal(
      repository.workspace().orders.find((entry) => entry.id === id)!.description,
      'Уточнено опис без зміни ціни'
    );
    const refund = {
      orderId: id,
      operationId: randomUUID(),
      amount: '400',
      note: 'Повернуто фактичну переплату'
    };
    repository.payments.refund(refund, actor);
    repository.payments.refund(refund, actor);
    assert.equal(paymentBalance(order, repository.payments.list()).overpaidCents, 60000);
    assert.throws(
      () =>
        repository.payments.refund({ ...refund, operationId: randomUUID(), amount: '601' }, actor),
      /перевищує/
    );
    repository.payments.refund({ ...refund, operationId: randomUUID(), amount: '600' }, actor);
    assert.equal(paymentBalance(order, repository.payments.list()).overpaidCents, 0);
    assert.equal(
      repository.payments.list().find((entry) => entry.id === receipt)!.amountCents,
      2250000
    );
    assert.throws(
      () =>
        repository.payments.reverse(
          { paymentId: receipt, operationId: randomUUID(), note: 'Помилка' },
          actor
        ),
      /повернення/
    );
    order = repository.workspace().orders.find((entry) => entry.id === id)!;
    assert.equal(paymentBalance(order, repository.payments.list()).paidCents, 2150000);
  }));

test('refunds affect the month of cash return rather than the original receipt month', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-refund-month-'));
  const path = join(directory, 'crm.sqlite');
  const repository = new CrmRepository(path);
  try {
    const { id, details } = setup(repository);
    transition(repository, id, 'ready');
    repository.payments.receive(
      { orderId: id, operationId: randomUUID(), amount: '22500', note: '' },
      actor
    );
    const changed = structuredClone(details);
    changed.lines[0].unitPriceCents = 1700000;
    repository.correctOrderEconomics(correction(repository, id, changed), names, actor);
    const refundId = repository.payments.refund(
      { orderId: id, operationId: randomUUID(), amount: '1000', note: 'Фактичне повернення' },
      actor
    );
    const db = new DatabaseSync(path);
    db.exec(
      "UPDATE crm_payments SET createdAt='2026-10-31T12:00:00Z'; UPDATE crm_customer_refunds SET createdAt='2026-11-22T12:00:00Z'"
    );
    db.close();
    assert.equal(
      overviewMetrics(repository.workspace(), '2026-11-22').monthlyReceiptsCents,
      -100000
    );
    assert.equal(
      overviewMetrics(repository.workspace(), '2026-10-31').monthlyReceiptsCents,
      2250000
    );
    repository.payments.reverse(
      { paymentId: refundId, operationId: randomUUID(), note: 'Помилковий запис повернення' },
      actor
    );
    assert.equal(overviewMetrics(repository.workspace(), '2026-11-22').monthlyReceiptsCents, 0);
    assert.equal(
      paymentBalance(
        repository.workspace().orders.find((entry) => entry.id === id)!,
        repository.payments.list()
      ).overpaidCents,
      100000
    );
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('posted snapshots and cash persist across reopen and stay isolated between shops', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-finance-org-'));
  const path = join(directory, 'crm.sqlite');
  let registry = new OrganizationRepositories(path);
  try {
    const a = registry.forOrganization('org_A', 'admin', true);
    const b = registry.forOrganization('org_B', 'admin', true);
    const { id } = setup(a);
    transition(a, id, 'ready');
    pay(a, id, '1000');
    assert.equal(b.financeWorkspace().events.length, 0);
    assert.equal(b.financeWorkspace().postings.length, 0);
    assert.throws(
      () =>
        b.settlements.cash(
          {
            orgId: 'org_B',
            orderId: id,
            operationId: randomUUID(),
            payeeKind: 'worker',
            payeeId: painter.id,
            kind: 'payout',
            amount: '1',
            note: ''
          },
          actor,
          painter
        ),
      /не знайдено/
    );
    const finance = a.financeWorkspace();
    registry.close();
    registry = new OrganizationRepositories(path);
    assert.deepEqual(registry.forOrganization('org_A', 'admin', true).financeWorkspace(), finance);
  } finally {
    registry.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
