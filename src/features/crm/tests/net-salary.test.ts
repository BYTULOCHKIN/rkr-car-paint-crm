import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CrmRepository } from '../server/repository';
import { orderSchema } from '../schemas/crm';
import { businessToday } from '../lib/workflow';
import { buildPayrollReport } from '@/features/payroll/lib/report';
import { calculateNetOrder } from '@/features/order-expenses/lib/calculate';

const repos: CrmRepository[] = [];
afterEach(() => repos.splice(0).forEach((repo) => repo.close()));
const actor = { id: 'admin', name: 'Адміністратор' };
function setup(legacy = false) {
  const repo = new CrmRepository(':memory:');
  repos.push(repo);
  const customerId = repo.createCustomer({ name: 'Клієнт', phone: '0501234567', notes: '' });
  const vehicleId = repo.createVehicle({
    customerId,
    make: 'Ford',
    model: 'Focus',
    year: 2020,
    plate: '',
    vin: 'WVWZZZ1JZXW000001'
  });
  const input = orderSchema.parse({
    customerId,
    vehicleId,
    requestId: '',
    assigneeId: 'painter',
    description: 'Повний ремонт',
    items: [{ description: 'Клієнтський чек', quantity: 1, unitPrice: 20000 }]
  });
  const id = legacy
    ? repo.createOrder(input, 'Маляр', actor)
    : repo.createClientOrder(input, 'Маляр', actor);
  const order = () => repo.workspace().orders.find((order) => order.id === id)!;
  const workflow = (status: 'in_progress' | 'ready', net = true) =>
    repo.updateWorkflow(
      {
        kind: 'order',
        id,
        expectedStatus: order().status,
        expectedRevision: order().workflowRevision,
        status,
        plannedIntakeDate: '',
        plannedDeliveryDate: '',
        actualIntakeDate: businessToday(),
        actualReadyDate: status === 'ready' ? businessToday() : '',
        actualDeliveryDate: '',
        note: ''
      },
      actor,
      net ? { netSalary: true } : undefined
    );
  const expense = (
    amount = '2500',
    kind: 'color_matching' | 'soldering' | 'other' = 'other',
    expenseId?: string
  ) => ({
    orgId: 'test',
    orderId: id,
    expectedRevision: order().workflowRevision ?? 0,
    operationId: randomUUID(),
    expenseNameId: kind,
    contractorUserId: 'subcontractor',
    note: '',
    amount,
    ...(expenseId ? { id: expenseId } : {})
  });
  const save = (total = 20000, assigneeId = 'painter', employeeShareBps = 6000) =>
    repo.updateClientOrder(
      {
        id,
        expectedRevision: order().workflowRevision,
        description: order().description,
        items: [{ description: 'Клієнтський чек', quantity: 1, unitPrice: total }],
        assigneeId,
        employeeShareBps
      },
      assigneeId === order().assigneeId ? (order().assigneeName ?? assigneeId) : assigneeId,
      actor
    );
  return { repo, id, order, workflow, expense, save };
}
test('whole-order formula uses exact kopecks, variable shares and validates impossible inputs', () => {
  assert.deepEqual(calculateNetOrder(2000000, 500000, 500000, 6000), {
    checkCents: 2000000,
    materialsCents: 500000,
    subcontractCents: 500000,
    baseCents: 1000000,
    employeeShareBps: 6000,
    employeeCents: 600000,
    workshopCents: 400000
  });
  assert.equal(calculateNetOrder(1, 0, 0, 5000).employeeCents, 1);
  for (const share of [0, 10000, 3333])
    assert.equal(calculateNetOrder(20001, 1, 0, share).employeeCents, share * 2);
  assert.throws(() => calculateNetOrder(100, null, 0, 6000), /собівартість/);
  assert.equal(calculateNetOrder(100, 101, 0, 6000).employeeCents, 0);
  assert.equal(calculateNetOrder(100, 101, 0, 6000).workshopCents, -1);
  assert.throws(() => calculateNetOrder(100, 0, 0, 10001), /100%/);
});
test('unpaid ready car immediately accrues 6000 from 20000 minus 5000 stock and 5000 subcontract', () => {
  const { repo, id, order, workflow, expense } = setup();
  workflow('in_progress');
  const itemId = repo.inventory.createItem({ name: 'Лак і фарба', unit: 'л', notes: '' });
  repo.inventory.receive(
    {
      itemId,
      operationId: randomUUID(),
      quantity: '10',
      totalAmount: '10000',
      currency: 'UAH',
      exchangeRate: '1',
      note: ''
    },
    actor
  );
  repo.mutateOrderCosts(id, actor, () =>
    repo.inventory.consume(
      {
        orderId: id,
        itemId,
        operationId: randomUUID(),
        quantity: '5',
        category: 'painting',
        note: ''
      },
      actor
    )
  );
  repo.expenses.save(expense('2500', 'color_matching'), actor, false, {
    id: 'subcontractor',
    name: 'Субпідрядник'
  });
  repo.expenses.save(expense('2500', 'soldering'), actor, false, {
    id: 'subcontractor',
    name: 'Субпідрядник'
  });
  assert.equal(repo.settlements.postings().length, 0);
  workflow('ready');
  assert.equal(repo.payments.list().length, 0);
  const posting = repo.settlements.latest(id)!;
  assert.equal(posting.result.painterAccrualCents, 600000);
  assert.equal(posting.result.workshopRemainderCents, 400000);
  const access = { role: 'admin' as const, userId: 'admin', orgId: 'test' };
  const report = buildPayrollReport(repo.workspace(), [], access, {
    from: businessToday(),
    to: businessToday()
  });
  assert.equal(report.totals.totalCents, 600000);
  assert.equal(
    report.workers.find((worker) => worker.id === order().assigneeId)!.totalCents,
    600000
  );
});
test('edits after readiness recalculate automatically, preserve payouts and do not duplicate explicit saves or operation retries', () => {
  const { repo, id, order, workflow, expense, save } = setup();
  workflow('in_progress');
  workflow('ready');
  const oldPosting = JSON.stringify(repo.settlements.postings()[0]);
  repo.settlements.cash(
    {
      orgId: 'test',
      orderId: id,
      operationId: randomUUID(),
      payeeKind: 'worker',
      payeeId: 'painter',
      kind: 'payout',
      amount: '1000',
      note: ''
    },
    actor,
    { kind: 'worker', id: 'painter', name: 'Маляр' }
  );
  const input = expense();
  const expenseId = repo.expenses.save(input, actor, false, {
    id: 'subcontractor',
    name: 'Субпідрядник'
  });
  assert.equal(repo.settlements.latest(id)!.result.employeeAccrualsCents, 1050000);
  const count = repo.settlements.postings().length;
  assert.equal(
    repo.expenses.save(input, actor, false, { id: 'subcontractor', name: 'Субпідрядник' }),
    expenseId
  );
  save();
  save();
  assert.equal(repo.settlements.postings().length, count);
  save(22000, 'other', 7000);
  assert.equal(repo.settlements.latest(id)!.result.employeeAccrualsCents, 1365000);
  assert.equal(
    repo.settlements
      .events()
      .filter(
        (event) =>
          event.payee.id === 'painter' && (event.kind === 'accrual' || event.kind === 'adjustment')
      )
      .reduce((sum, event) => sum + event.amountCents, 0),
    0
  );
  assert.equal(
    repo.settlements.events().find((event) => event.kind === 'payout')!.amountCents,
    100000
  );
  assert.equal(JSON.stringify(repo.settlements.postings()[0]), oldPosting);
  repo.expenses.save(
    {
      orgId: 'test',
      orderId: id,
      expectedRevision: order().workflowRevision!,
      operationId: randomUUID(),
      id: expenseId
    },
    actor,
    true
  );
  assert.equal(repo.settlements.latest(id)!.result.employeeAccrualsCents, 1540000);
});
test('old ready orders remain unposted until an explicit save; unchanged save initializes exactly once', () => {
  const { repo, id, workflow, save } = setup(true);
  workflow('in_progress', false);
  workflow('ready', false);
  assert.equal(repo.workspace().orders[0].salaryModel, 'legacy');
  assert.equal(repo.settlements.postings().length, 0);
  repo.reportSnapshot();
  assert.equal(repo.settlements.postings().length, 0);
  save();
  assert.equal(repo.settlements.latest(id)!.result.employeeAccrualsCents, 1200000);
  save();
  assert.equal(repo.settlements.postings().length, 1);
});
test('ready stock edits and reversals recalculate atomically; bad stock batches roll back all movements and salary', () => {
  const { repo, id, workflow } = setup();
  workflow('in_progress');
  workflow('ready');
  const itemId = repo.inventory.createItem({ name: 'Лак', unit: 'л', notes: '' });
  repo.inventory.receive(
    {
      itemId,
      operationId: randomUUID(),
      quantity: '10',
      totalAmount: '10000',
      currency: 'UAH',
      exchangeRate: '1',
      note: ''
    },
    actor
  );
  const consume = {
    itemId,
    orderId: id,
    operationId: randomUUID(),
    quantity: '1',
    category: 'painting' as const,
    note: ''
  };
  repo.mutateOrderCosts(id, actor, () => repo.inventory.consume(consume, actor));
  assert.equal(repo.settlements.latest(id)!.result.employeeAccrualsCents, 1140000);
  const before = JSON.stringify(repo.reportSnapshot());
  assert.throws(() =>
    repo.mutateOrderCosts(id, actor, () =>
      repo.inventory.consumeBatch(
        {
          orderId: id,
          operationId: randomUUID(),
          rows: [
            { itemId, quantity: '1', category: 'painting', note: '' },
            { itemId, quantity: '99', category: 'painting', note: '' }
          ]
        },
        actor
      )
    )
  );
  assert.equal(JSON.stringify(repo.reportSnapshot()), before);
  repo.mutateOrderCosts(id, actor, () =>
    repo.inventory.reverse(
      { movementId: consume.operationId, operationId: randomUUID(), note: 'Виправлення' },
      actor
    )
  );
  assert.equal(repo.settlements.latest(id)!.result.employeeAccrualsCents, 1200000);
});
test('concurrent expenses and invalid rates reject without partial writes', () => {
  const { repo, id, order, workflow, expense, save } = setup();
  const stale = expense();
  repo.expenses.save(expense(), actor, false, { id: 'subcontractor', name: 'Субпідрядник' });
  const before = JSON.stringify(repo.reportSnapshot());
  assert.throws(() => repo.expenses.save(stale, actor), /змінилося/);
  assert.equal(JSON.stringify(repo.reportSnapshot()), before);
  workflow('in_progress');
  workflow('ready');
  const prior = JSON.stringify(repo.reportSnapshot());
  assert.throws(() => save(1, 'painter', 10001), /100%/);
  assert.equal(JSON.stringify(repo.reportSnapshot()), prior);
  assert.equal(order().status, 'ready');
  assert.equal(order().id, id);
});

test('loss pays zero, records the workshop loss, and later repricing restores positive wages', () => {
  const { repo, id, workflow, expense, save } = setup();
  workflow('in_progress');
  repo.expenses.save(expense('25000'), actor, false, { id: 'subcontractor', name: 'Субпідрядник' });
  workflow('ready');
  assert.equal(repo.settlements.latest(id)!.result.employeeAccrualsCents, 0);
  assert.equal(repo.settlements.latest(id)!.result.workshopRemainderCents, -500000);
  const report = buildPayrollReport(
    repo.workspace(),
    [],
    { userId: 'admin', orgId: 'test', role: 'admin' },
    { from: businessToday(), to: businessToday() }
  );
  assert.equal(report.workers.find((worker) => worker.id === 'painter')!.entries[0].amountCents, 0);
  save(30000);
  assert.equal(repo.settlements.latest(id)!.result.employeeAccrualsCents, 300000);
});
