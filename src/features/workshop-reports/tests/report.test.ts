import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPeriodReport, reportDate } from '../lib/report';
import { reportCsv, encodeCsv } from '../lib/csv';
import { reportFiltersSchema } from '../schemas/filters';
import { reportFixture, admin, worker } from './fixtures';
import type { ReportFilters } from '../api/types';

const november: ReportFilters = { from: '2026-11-01', to: '2026-11-30', orderDate: 'ready' };
const december: ReportFilters = { from: '2026-12-01', to: '2026-12-31', orderDate: 'ready' };

test('Kyiv boundaries put a UTC November correction in December without rewriting November economics', () => {
  const source = reportFixture();
  const before = structuredClone(source);
  assert.equal(reportDate('2026-11-30T22:00:00Z'), '2026-12-01');
  const nov = buildPeriodReport(source.workspace, source.movements, admin, november);
  const dec = buildPeriodReport(source.workspace, source.movements, admin, december);
  assert.equal(nov.economics!.checkCents, 1800000);
  assert.equal(nov.economics!.employeeAccrualsCents, 870000);
  assert.equal(nov.economics!.workshopRemainderCents, 580000);
  assert.equal(nov.postings.length, 1);
  assert.equal(dec.postings.length, 1);
  assert.deepEqual(dec.economics, {
    checkCents: 0,
    materialsCents: 100000,
    employeeAccrualsCents: -60000,
    subcontractCostsCents: 0,
    workshopRemainderCents: -40000
  });
  assert.deepEqual(source, before);
});

test('order cohort dates differ from posting dates, use the version at period end and preserve unknown legacy totals', () => {
  const { workspace, movements } = reportFixture();
  const nov = buildPeriodReport(workspace, movements, admin, november);
  assert.deepEqual(
    nov.orders.map((row) => row.id),
    ['a', 'legacy']
  );
  assert.equal(nov.orders[0].revision, 1);
  assert.equal(nov.orders[0].economics!.materialsCents, 350000);
  assert.equal(nov.orders[1].economics, null);
  const created = buildPeriodReport(workspace, movements, admin, {
    ...november,
    orderDate: 'created'
  });
  assert.deepEqual(
    created.orders.map((row) => row.id),
    ['b', 'legacy']
  );
  assert.deepEqual(created.economics, nov.economics);
  assert.deepEqual(created.materials, nov.materials);
});

test('carryover balances and future cash cancellation retain original period payout and affect only reversal date', () => {
  const { workspace, movements } = reportFixture();
  const nov = buildPeriodReport(workspace, movements, admin, november);
  const dec = buildPeriodReport(workspace, movements, admin, december);
  const row = nov.settlements.orders.find((row) => row.order.id === 'a' && row.payee.id === 'p')!;
  assert.equal(row.openingCents, -200000);
  assert.equal(row.payoutCents, 640000);
  assert.equal(row.accrualCents, 840000);
  assert.equal(row.closingCents, 0);
  const corrected = dec.settlements.orders.find(
    (row) => row.order.id === 'a' && row.payee.id === 'p'
  )!;
  assert.equal(corrected.adjustmentCents, -60000);
  assert.equal(corrected.reversalCents, 640000);
  assert.equal(corrected.closingCents, 580000);
  const noActivity = buildPeriodReport(workspace, movements, worker, {
    from: '2026-12-20',
    to: '2026-12-21',
    orderDate: 'ready'
  });
  assert.equal(noActivity.settlements.events.length, 0);
  assert.equal(
    noActivity.settlements.orders.find((row) => row.order.id === 'a')!.openingCents,
    580000
  );
});

test('payee totals keep due on one car and advance on another separately', () => {
  const { workspace, movements } = reportFixture();
  workspace.finance!.events = workspace.finance!.events.filter(
    (event) => event.id !== 'payout' && event.id !== 'reversal'
  );
  const report = buildPeriodReport(workspace, movements, admin, november);
  const painter = report.settlements.payees.find((row) => row.payee.id === 'p')!;
  assert.equal(painter.closingCents, 340000);
  assert.equal(painter.payableCents, 640000);
  assert.equal(painter.advanceCents, 300000);
});

test('customer receipts, refunds and cancellations belong to their own dates, including a negative month', () => {
  const { workspace, movements } = reportFixture();
  assert.equal(buildPeriodReport(workspace, movements, admin, november).cash!.netCents, 1900000);
  const dec = buildPeriodReport(workspace, movements, admin, december);
  assert.equal(dec.cash!.netCents, -140000);
  assert.equal(dec.cash!.rows.length, 2);
});

test('material matrix uses dated signed stock movements and never replaces unknown cost with zero', () => {
  const { workspace, movements } = reportFixture();
  const nov = buildPeriodReport(workspace, movements, admin, november);
  const dec = buildPeriodReport(workspace, movements, admin, december);
  assert.equal(nov.materials.rows.find((row) => row.id === 'paint')!.quantityMilli, 3000);
  const unknown = nov.materials.rows.find((row) => row.id === 'lacquer')!;
  assert.equal(unknown.costCents, null);
  assert.equal(unknown.unknownMovements, 1);
  assert.equal(unknown.quantityMilli, 800);
  const returned = dec.materials.rows.find((row) => row.id === 'lacquer')!;
  assert.equal(returned.quantityMilli, -800);
  assert.equal(returned.costCents, null);
  const combined = buildPeriodReport(workspace, movements, admin, { ...november, to: december.to });
  const cancelled = combined.materials.rows.find((row) => row.id === 'lacquer')!;
  assert.equal(cancelled.quantityMilli, 0);
  assert.equal(cancelled.costCents, 0);
  assert.equal(cancelled.unknownMovements, 0);
});

test('worker DTO and every CSV tab contain only own settlements, without administrative data', () => {
  const { workspace, movements } = reportFixture();
  workspace.finance!.events.push({
    ...workspace.finance!.events[0],
    id: 'secret',
    payee: { kind: 'contractor', id: 'p', name: 'Таємний підрядник' },
    note: 'Секретний платіж'
  });
  const report = buildPeriodReport(workspace, movements, worker, november);
  assert.equal(report.economics, null);
  assert.equal(report.cash, null);
  assert.deepEqual(report.orders, []);
  assert.deepEqual(report.materials, { orders: [], rows: [] });
  assert.ok(
    report.settlements.payees.every((row) => row.payee.id === 'p' && row.payee.kind === 'worker')
  );
  assert.ok(!JSON.stringify(report).includes('Секретний платіж'));
  for (const tab of ['postings', 'orders', 'materials', 'settlements'] as const) {
    const csv = reportCsv(report, tab);
    assert.ok(csv.includes('Маляр'));
    assert.ok(!csv.includes('Полірувальник'));
    assert.ok(!csv.includes('Таємний підрядник'));
  }
});

test('arbitrary dates validate real calendar dates and CSV preserves decimals, text and unknown values', () => {
  assert.equal(reportFiltersSchema.safeParse({ ...november, from: '2026-02-30' }).success, false);
  assert.equal(reportFiltersSchema.safeParse({ ...november, from: '2026-12-01' }).success, false);
  const { workspace, movements } = reportFixture();
  const report = buildPeriodReport(workspace, movements, admin, {
    ...november,
    from: '2026-11-02',
    to: '2026-11-05'
  });
  const csv = reportCsv(report, 'materials');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"0,800"'));
  assert.ok(csv.includes('Не визначено'));
  assert.equal(
    encodeCsv([['=1+1', 'Лак; "Sprint"\n0.8']]),
    '\uFEFF"\'=1+1";"Лак; ""Sprint""\n0.8"\r\n'
  );
});

test('invalid dated rows are excluded with a warning and safe integer aggregation rejects overflow', () => {
  const { workspace, movements } = reportFixture();
  workspace.finance!.events[0].createdAt = 'bad date';
  assert.equal(buildPeriodReport(workspace, movements, worker, november).undatedRecords, 1);
  workspace.finance!.events[0].createdAt = '2026-11-01T10:00:00Z';
  workspace.finance!.events[0].amountCents = Number.MAX_SAFE_INTEGER;
  assert.throws(() => buildPeriodReport(workspace, movements, worker, november), /точність/);
});
