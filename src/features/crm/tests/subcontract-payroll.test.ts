import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CrmRepository } from '../server/repository';
import type { TeamMember } from '../api/types';
import { businessToday } from '../lib/workflow';
import { buildPayrollReport } from '@/features/payroll/lib/report';
import { payrollCsv } from '@/features/payroll/lib/csv';
import { expenseNameKey } from '@/features/order-expenses/lib/names';

const repos: CrmRepository[] = [];
afterEach(() => repos.splice(0).forEach((repo) => repo.close()));
const actor = { id: 'admin', name: 'Адміністратор' };
const filters = { from: businessToday(), to: businessToday() };
const access = { userId: 'admin', orgId: 'org_test', role: 'admin' as const };
const team = (a = false, b = false): TeamMember[] => [
  { id: 'painter', name: 'Маляр', role: 'worker', identifier: '' },
  {
    id: 'sub-a',
    name: 'Однакове ім’я',
    role: 'worker',
    identifier: '',
    includeSubcontractInPayroll: a
  },
  {
    id: 'sub-b',
    name: 'Однакове ім’я',
    role: 'worker',
    identifier: '',
    includeSubcontractInPayroll: b
  }
];

function setup(filename = ':memory:') {
  const repo = new CrmRepository(filename);
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
  const id = repo.createClientOrder(
    {
      customerId,
      vehicleId,
      requestId: '',
      assigneeId: 'painter',
      description: 'Ремонт',
      items: [{ description: 'Клієнтський чек', quantity: 1, unitPrice: 20000 }]
    },
    'Маляр',
    actor
  );
  const order = () => repo.workspace().orders.find((entry) => entry.id === id)!;
  const expense = (user = 'sub-a', amount = '2500', previousId?: string) =>
    repo.expenses.save(
      {
        orgId: access.orgId,
        orderId: id,
        expectedRevision: order().workflowRevision!,
        operationId: randomUUID(),
        ...(previousId ? { id: previousId } : {}),
        expenseNameId: 'soldering',
        contractorUserId: user,
        amount,
        note: 'Тестова примітка'
      },
      actor,
      false,
      { id: user, name: 'Однакове ім’я' }
    );
  const ready = () => {
    for (const status of ['in_progress', 'ready'] as const)
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
  };
  const report = (a = false, b = false) =>
    buildPayrollReport(repo.workspace(), team(a, b), access, filters);
  return { repo, id, order, expense, ready, team, report };
}
test('expense names normalize case, Unicode and whitespace, reject duplicates, and persist independent IDs', () => {
  const { repo, order } = setup();
  const originalRevision = order().workflowRevision;
  const entry = repo.expenses.createName('  Ремонт   пластику  ');
  assert.equal(entry.name, 'Ремонт пластику');
  assert.equal(order().workflowRevision, originalRevision);
  assert.throws(() => repo.expenses.createName('ремонт пластику'), /вже існує/);
  assert.throws(() => repo.expenses.createName('РЕМОНТ\u00a0пластику'), /вже існує/);
  assert.throws(() => repo.expenses.createName('Пайка'), /вже існує/);
  assert.throws(() => repo.expenses.createName('\u200b'), /120/);
  assert.equal(expenseNameKey(' ＡＢＣ '), expenseNameKey('abc'));
  assert.equal(repo.workspace().expenseNames!.filter((name) => name.id === entry.id).length, 1);
});
test('default payroll excludes subcontract sums; opt-in adds 100% and does not change painter salary, postings or workshop income', () => {
  const { repo, id, expense, ready, report } = setup();
  expense('sub-a');
  expense('sub-b');
  assert.equal(report(true, true).totals.totalCents, 0);
  ready();
  const original = JSON.stringify(repo.financeWorkspace());
  assert.equal(report().totals.totalCents, 900000);
  assert.equal(report(true).totals.totalCents, 1150000);
  const all = report(true, true);
  assert.equal(all.totals.totalCents, 1400000);
  const sub = all.workers.find((worker) => worker.id === 'sub-a')!;
  assert.equal(sub.totalCents, 250000);
  assert.equal(sub.entries[0].role, 'subcontract');
  assert.equal(sub.entries[0].after!.shareBps, 10000);
  assert.equal(repo.settlements.latest(id)!.result.employeeAccrualsCents, 900000);
  assert.equal(repo.settlements.latest(id)!.result.subcontractCostsCents, 500000);
  assert.equal(repo.settlements.latest(id)!.result.workshopRemainderCents, 600000);
  assert.equal(JSON.stringify(repo.financeWorkspace()), original);
  assert.match(payrollCsv([sub], filters, true), /Субпідряд/);
  assert.equal(repo.expenses.list()[0].note, 'Тестова примітка');
  assert.notEqual(repo.expenses.list()[0].contractorId, repo.expenses.list()[1].contractorId);
});
test('cost edits and reassignment transfer only deltas, same-named team members stay separate, worker response contains own totals only', () => {
  const { repo, expense, ready, report, team } = setup();
  const first = expense('sub-a');
  expense('sub-b');
  ready();
  const original = JSON.stringify(repo.settlements.postings()[0]);
  expense('sub-a', '3000', first);
  assert.equal(report(true, true).totals.totalCents, 1420000);
  const changed = report(true, true).workers.find((worker) => worker.id === 'sub-a')!;
  assert.equal(changed.adjustmentCents, 50000);
  expense('sub-b', '3000', first);
  assert.equal(report(true, true).workers.find((worker) => worker.id === 'sub-a')!.totalCents, 0);
  assert.equal(
    report(true, true).workers.find((worker) => worker.id === 'sub-b')!.totalCents,
    550000
  );
  assert.equal(report(true, false).totals.totalCents, 870000);
  const personal = buildPayrollReport(
    repo.workspace(),
    team(true, true),
    { ...access, role: 'worker', userId: 'sub-b' },
    filters
  );
  assert.deepEqual(
    personal.workers.map((worker) => worker.id),
    ['sub-b']
  );
  assert.equal(personal.totals.totalCents, 550000);
  assert.equal(JSON.stringify(repo.settlements.postings()[0]), original);
});
test('catalog and recipient validation reject forged names and foreign IDs without partial costs', () => {
  const { repo, order, id } = setup();
  const input = {
    orgId: access.orgId,
    orderId: id,
    expectedRevision: order().workflowRevision!,
    operationId: randomUUID(),
    expenseNameId: 'soldering',
    contractorUserId: 'sub-a',
    note: '',
    amount: '100'
  };
  const before = JSON.stringify(repo.workspace());
  assert.throws(
    () => repo.expenses.save(input, actor, false, { id: 'other', name: 'Фальшиве ім’я' }),
    /команди/
  );
  assert.throws(
    () =>
      repo.expenses.save({ ...input, expenseNameId: 'missing' }, actor, false, {
        id: 'sub-a',
        name: 'Майстер'
      }),
    /Назву/
  );
  assert.equal(JSON.stringify(repo.workspace()), before);
});

test('v19 migration moves free-text expense titles into notes without matching names to people or rewriting financial snapshots', () => {
  const folder = mkdtempSync(join(tmpdir(), 'subcontract-migration-'));
  const filename = join(folder, 'crm.sqlite');
  const { repo, id, ready } = setup(filename);
  try {
    const writer = new DatabaseSync(filename);
    const contractorId = randomUUID();
    const expenseId = randomUUID();
    writer
      .prepare('INSERT INTO crm_contractors(id,name,nameKey) VALUES (?,?,?)')
      .run(contractorId, 'Сергій', 'сергій');
    writer
      .prepare(
        'INSERT INTO crm_order_expenses(id,orderId,kind,description,contractorId,contractorName,amountCents,createdAt) VALUES (?,?,?,?,?,?,?,?)'
      )
      .run(
        expenseId,
        id,
        'color_matching',
        'Особливий підбір для бампера',
        contractorId,
        'Сергій',
        250000,
        new Date().toISOString()
      );
    for (const [kind, description] of [
      ['soldering', 'Пайка кріплення'],
      ['other', 'Особлива послуга']
    ])
      writer
        .prepare(
          'INSERT INTO crm_order_expenses(id,orderId,kind,description,contractorId,contractorName,amountCents,createdAt) VALUES (?,?,?,?,?,?,?,?)'
        )
        .run(
          randomUUID(),
          id,
          kind,
          description,
          contractorId,
          'Сергій',
          10000,
          new Date().toISOString()
        );
    ready();
    const before = JSON.stringify(repo.settlements.postings());
    repo.close();
    repos.splice(repos.indexOf(repo), 1);
    writer.exec(
      'PRAGMA foreign_keys=OFF; ALTER TABLE crm_order_expenses DROP COLUMN expenseNameId; ALTER TABLE crm_order_expenses DROP COLUMN note; ALTER TABLE crm_order_expenses DROP COLUMN contractorUserId; DROP TABLE crm_expense_names; DROP INDEX crm_contractors_team; ALTER TABLE crm_contractors DROP COLUMN teamUserId; PRAGMA user_version=19;'
    );
    writer.close();
    const migrated = new CrmRepository(filename);
    repos.push(migrated);
    const expense = migrated.expenses.list(id).find((entry) => entry.id === expenseId)!;
    assert.equal(expense.expenseName, 'Підбір фарби');
    assert.equal(expense.note, 'Особливий підбір для бампера');
    assert.equal(expense.contractorUserId, null);
    assert.equal(expense.contractorName, 'Сергій');
    assert.equal(
      migrated.expenses.list(id).find((entry) => entry.kind === 'soldering')!.expenseName,
      'Пайка'
    );
    assert.equal(
      migrated.expenses.list(id).find((entry) => entry.kind === 'other')!.expenseName,
      'Інший субпідряд'
    );
    assert.equal(JSON.stringify(migrated.settlements.postings()), before);
    assert.equal(migrated.expenses.names().length, 3);
  } finally {
    repos.splice(0).forEach((entry) => entry.close());
    rmSync(folder, { recursive: true, force: true });
  }
});
