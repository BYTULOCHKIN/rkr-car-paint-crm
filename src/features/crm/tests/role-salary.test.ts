import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { randomUUID } from 'node:crypto';
import { CrmRepository } from '../server/repository';
import { businessToday } from '../lib/workflow';
import { orderSchema } from '../schemas/crm';
import { calculateRoleSalary } from '@/features/order-labor/lib/calculate';
import type { OrderLabor } from '@/features/order-labor/api/types';
import { buildPayrollReport } from '@/features/payroll/lib/report';

const actor = { id: 'admin', name: 'Адміністратор' };
const labor: OrderLabor = {
  painter: { workerId: 'p', workerName: 'Маляр', shareBps: 6000 },
  polisher: { workerId: 'pol', workerName: 'Полірувальник', shareBps: 6000 },
  assembler: { workerId: 'a', workerName: 'Збірник', shareBps: 6000 },
  polishingCents: 200000,
  assemblyCents: 200000
};
const costs = {
  paintingCents: 200000,
  polishingCents: 50000,
  unallocatedCents: 0,
  totalCents: 250000
};
const repos: CrmRepository[] = [];
afterEach(() => repos.splice(0).forEach((repo) => repo.close()));
function setup() {
  const repo = new CrmRepository(':memory:');
  repos.push(repo);
  const customerId = repo.createCustomer({ name: 'Клієнт', phone: '0501234567', notes: '' });
  const vehicleId = repo.createVehicle({
    customerId,
    make: 'Ford',
    model: 'Focus',
    plate: '',
    year: 2020,
    vin: 'WVWZZZ1JZXW000001'
  });
  const id = repo.createClientOrder(
    orderSchema.parse({
      customerId,
      vehicleId,
      requestId: '',
      assigneeId: 'p',
      description: 'Фарбування',
      items: [{ description: 'Чек', quantity: 1, unitPrice: 20000 }]
    }),
    'Маляр',
    actor
  );
  const order = () => repo.reads.order(id).orders[0];
  const team = ['p', 'pol', 'a'].map((id) => ({
    id,
    name: id,
    identifier: id,
    role: 'worker' as const
  }));
  const save = (value = labor) => ({
    orgId: 'test',
    orderId: id,
    operationId: randomUUID(),
    expectedRevision: order().workflowRevision!,
    labor: structuredClone(value)
  });
  const workflow = (status: 'in_progress' | 'ready') =>
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
      { netSalary: true }
    );
  const item = (name: string, amount: string, category: 'painting' | 'polishing') => {
    const itemId = repo.inventory.createItem({ name, unit: 'л', notes: '' });
    repo.inventory.receive(
      {
        itemId,
        operationId: randomUUID(),
        quantity: '10',
        totalAmount: amount,
        currency: 'UAH',
        exchangeRate: '1',
        note: ''
      },
      actor
    );
    const input = {
      itemId,
      orderId: id,
      operationId: randomUUID(),
      quantity: '1',
      category,
      note: ''
    };
    repo.mutateOrderCosts(id, actor, () => repo.inventory.consume(input, actor));
    return input;
  };
  return { repo, id, order, team, save, workflow, item };
}
test('agreed role formula balances check against costs, three wages and workshop remainder', () => {
  const result = calculateRoleSalary(2000000, costs, 100000, labor);
  assert.equal(result.painterBaseCents, 1300000);
  assert.equal(result.painterAccrualCents, 780000);
  assert.equal(result.polisherAccrualCents, 90000);
  assert.equal(result.assemblerAccrualCents, 120000);
  assert.equal(result.workshopRemainderCents, 660000);
  assert.equal(
    result.checkCents,
    result.materialsCents +
      result.subcontractCostsCents +
      result.employeeAccrualsCents +
      result.workshopRemainderCents
  );
  const different = structuredClone(labor);
  different.polisher.shareBps = 5000;
  different.assembler.shareBps = 7000;
  assert.equal(
    calculateRoleSalary(2000000, costs, 100000, different).employeeAccrualsCents,
    995000
  );
  const loss = calculateRoleSalary(10000, costs, 100000, labor);
  assert.equal(loss.painterAccrualCents, 0);
  assert.ok(loss.workshopRemainderCents < 0);
  assert.throws(
    () => calculateRoleSalary(2000000, { ...costs, totalCents: null }, 0, labor),
    /собівартість/
  );
});
test('unpaid completion accrues all roles, same-person roles stay separate in payroll and corrections preserve snapshots', () => {
  const { repo, id, order, team, save, workflow, item } = setup();
  workflow('in_progress');
  item('Фарба', '20000', 'painting');
  item('Паста', '5000', 'polishing');
  repo.expenses.save(
    {
      orgId: 'test',
      orderId: id,
      operationId: randomUUID(),
      expectedRevision: order().workflowRevision!,
      expenseNameId: 'color_matching',
      contractorUserId: 'sub',
      amount: '1000',
      note: ''
    },
    actor,
    false,
    { id: 'sub', name: 'Колорист' }
  );
  const assignment = structuredClone(labor);
  assignment.polisher.workerId = 'p';
  repo.saveOrderLabor(save(assignment), team, actor);
  assert.equal(repo.settlements.postings().length, 0);
  workflow('ready');
  assert.equal(repo.payments.list().length, 0);
  const original = JSON.stringify(repo.settlements.latest(id));
  const result = repo.settlements.latest(id)!.result;
  assert.equal(result.workshopRemainderCents, 660000);
  const report = buildPayrollReport(
    repo.workspace(),
    team,
    { orgId: 'test', userId: 'admin', role: 'admin' },
    { from: businessToday(), to: businessToday() }
  );
  const painter = report.workers.find((worker) => worker.id === 'p')!;
  assert.equal(painter.totalCents, 870000);
  assert.deepEqual(painter.entries.map((entry) => entry.role).toSorted(), ['painter', 'polisher']);
  const changed = structuredClone(assignment);
  changed.polisher.shareBps = 5000;
  const input = save(changed);
  repo.saveOrderLabor(input, team, actor);
  repo.saveOrderLabor(input, team, actor);
  assert.equal(repo.settlements.postings().length, 2);
  assert.equal(JSON.stringify(repo.settlements.postings()[0]), original);
  assert.equal(repo.settlements.latest(id)!.result.polisherAccrualCents, 75000);
  const before = JSON.stringify(repo.workspace());
  assert.throws(
    () => repo.saveOrderLabor({ ...save(), expectedRevision: 0 }, team, actor),
    /змінено/
  );
  assert.throws(
    () =>
      repo.saveOrderLabor(
        save({ ...assignment, assembler: { ...assignment.assembler, workerId: 'outsider' } }),
        team,
        actor
      ),
    /команди/
  );
  assert.equal(JSON.stringify(repo.workspace()), before);
});
test('editing stock preserves historic unit cost, replaces atomically, rejects stale edits and recalculates wages once', () => {
  const { repo, id, team, save, workflow, item } = setup();
  workflow('in_progress');
  const used = item('Фарба', '20000', 'painting');
  repo.saveOrderLabor(save(), team, actor);
  workflow('ready');
  repo.inventory.receive(
    {
      itemId: used.itemId,
      operationId: randomUUID(),
      quantity: '10',
      totalAmount: '90000',
      currency: 'UAH',
      exchangeRate: '1',
      note: ''
    },
    actor
  );
  const old = JSON.stringify(
    repo.inventory.orderMovements(id).find((entry) => entry.id === used.operationId)
  );
  const edited = {
    ...used,
    movementId: used.operationId,
    operationId: randomUUID(),
    category: 'polishing' as const
  };
  repo.mutateOrderCosts(id, actor, () => repo.inventory.editConsumption(edited, actor));
  const active = repo.inventory
    .orderMovements(id)
    .filter((entry) => entry.kind === 'consumption' && !entry.reversed);
  assert.equal(active.length, 1);
  assert.equal(active[0].costDeltaCents, -200000);
  assert.equal(repo.settlements.latest(id)!.result.painterAccrualCents, 960000);
  const count = repo.settlements.postings().length;
  repo.mutateOrderCosts(id, actor, () => repo.inventory.editConsumption(edited, actor));
  assert.equal(repo.settlements.postings().length, count);
  const before = JSON.stringify(repo.reportSnapshot());
  assert.throws(
    () =>
      repo.mutateOrderCosts(id, actor, () =>
        repo.inventory.editConsumption({ ...edited, operationId: randomUUID() }, actor)
      ),
    /змінено/
  );
  assert.throws(
    () =>
      repo.mutateOrderCosts(id, actor, () =>
        repo.inventory.editConsumption(
          { ...edited, movementId: active[0].id, operationId: randomUUID(), quantity: '1000' },
          actor
        )
      ),
    /Недостатньо/
  );
  assert.equal(JSON.stringify(repo.reportSnapshot()), before);
  assert.equal(JSON.parse(old).costDeltaCents, -200000);
  assert.equal(repo.inventory.items()[0].balanceMilli, 19000);
});

test('quantity corrections retain the original portion and value only extra stock at the current average', () => {
  const { repo, id, workflow, item } = setup();
  workflow('in_progress');
  const used = item('Фарба', '20000', 'painting');
  repo.inventory.receive(
    {
      itemId: used.itemId,
      operationId: randomUUID(),
      quantity: '10',
      totalAmount: '90000',
      currency: 'UAH',
      exchangeRate: '1',
      note: ''
    },
    actor
  );
  const edit = {
    ...used,
    movementId: used.operationId,
    operationId: randomUUID(),
    quantity: '1.5'
  };
  repo.mutateOrderCosts(id, actor, () => repo.inventory.editConsumption(edit, actor));
  let active = repo.inventory
    .orderMovements(id)
    .find((entry) => entry.kind === 'consumption' && !entry.reversed)!;
  assert.equal(active.costDeltaCents, -484211);
  assert.equal(repo.inventory.items()[0].balanceMilli, 18500);
  repo.mutateOrderCosts(id, actor, () =>
    repo.inventory.editConsumption(
      { ...edit, operationId: randomUUID(), movementId: active.id, quantity: '0.75' },
      actor
    )
  );
  active = repo.inventory
    .orderMovements(id)
    .find((entry) => entry.kind === 'consumption' && !entry.reversed)!;
  assert.equal(active.costDeltaCents, -242106);
  assert.equal(repo.inventory.items()[0].balanceMilli, 19250);
  assert.equal(repo.inventory.items()[0].totalCostCents, 10757894);
});
