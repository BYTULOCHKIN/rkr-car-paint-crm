import test from 'node:test';
import assert from 'node:assert/strict';
import { accruedInPeriod, paidInPeriod, filterSettlementReport } from '../lib/settlements';
import { buildPeriodReport } from '../lib/report';
import { reportCsv } from '../lib/csv';
import { reportFixture, admin, worker } from './fixtures';

const november = { from: '2026-11-01', to: '2026-11-30', orderDate: 'ready' as const };

test('readable summaries preserve separately due amounts and advances without cross-car offsetting', () => {
  const source = reportFixture();
  const report = buildPeriodReport(source.workspace, source.movements, admin, november);
  const painter = report.settlements.payees.find((row) => row.payee.id === 'p')!;
  assert.equal(accruedInPeriod(painter), 840000);
  assert.equal(paidInPeriod(painter), 940000);
  assert.equal(painter.payableCents, 0);
  assert.equal(painter.advanceCents, 300000);
  const december = buildPeriodReport(source.workspace, source.movements, admin, {
    ...november,
    from: '2026-12-01',
    to: '2026-12-31'
  });
  const corrected = december.settlements.payees.find((row) => row.payee.id === 'p')!;
  assert.equal(accruedInPeriod(corrected), -60000);
  assert.equal(paidInPeriod(corrected), -640000);
  assert.equal(corrected.payableCents, 580000);
  assert.equal(corrected.advanceCents, 300000);
});

test('search scopes payees, car details, history and CSV together without mutating the original report', () => {
  const source = reportFixture();
  const report = buildPeriodReport(source.workspace, source.movements, admin, november);
  const before = JSON.stringify(report);
  const scoped = filterSettlementReport(report, { search: '  МАЛЯР  ', kind: 'worker' });
  assert.deepEqual(
    scoped.settlements.payees.map((row) => row.payee.id),
    ['p']
  );
  assert.equal(scoped.settlements.orders.length, 2);
  assert.ok(scoped.settlements.events.every((row) => row.payee.id === 'p'));
  assert.ok(!reportCsv(scoped, 'settlements').includes('Полірувальник'));
  assert.equal(JSON.stringify(report), before);
  assert.equal(
    filterSettlementReport(report, { search: '', kind: 'contractor' }).settlements.payees.length,
    0
  );
});

test('worker filters cannot select another person or hide personal results via administrative URL state', () => {
  const source = reportFixture();
  const report = buildPeriodReport(source.workspace, source.movements, worker, november);
  const scoped = filterSettlementReport(report, { search: 'Полірувальник', kind: 'contractor' });
  assert.strictEqual(scoped, report);
  assert.deepEqual(
    scoped.settlements.payees.map((row) => row.payee.id),
    ['p']
  );
});

test('net payouts handle returns, payout cancellations and cancelled returns without changing accruals', () => {
  const source = reportFixture();
  const row = buildPeriodReport(source.workspace, source.movements, admin, november).settlements
    .payees[0];
  assert.equal(
    paidInPeriod({ ...row, payoutCents: 10000, returnCents: 2000, reversalCents: 3000 }),
    5000
  );
  assert.equal(
    paidInPeriod({ ...row, payoutCents: 10000, returnCents: 2000, reversalCents: -2000 }),
    10000
  );
});
