import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkerSettlementEntry } from '../api/types';
import { workerSettlementBalance } from '../lib/worker-balance';

test('an advance before readiness is visible without inventing an accrual', () => {
  assert.deepEqual(workerSettlementBalance([{ kind: 'payout', amountCents: 200000 }]), {
    accruedCents: 0,
    paidCents: 200000,
    balanceCents: -200000,
    payableCents: 0,
    advanceCents: 200000
  });
});

test('partial payments reduce the amount due independently of accrual timing', () => {
  const entries: WorkerSettlementEntry[] = [
    { kind: 'payout', amountCents: 200000 },
    { kind: 'accrual', amountCents: 840000 },
    { kind: 'payout', amountCents: 300000 }
  ];
  assert.equal(workerSettlementBalance(entries).payableCents, 340000);
  assert.equal(workerSettlementBalance(entries).paidCents, 500000);
});

test('a negative correction exposes overpayment without rewriting the payout', () => {
  const entries: WorkerSettlementEntry[] = [
    { kind: 'accrual', amountCents: 840000 },
    { kind: 'payout', amountCents: 840000 },
    { kind: 'adjustment', amountCents: -60000 }
  ];
  const original = structuredClone(entries);
  const balance = workerSettlementBalance(entries);
  assert.equal(balance.accruedCents, 780000);
  assert.equal(balance.paidCents, 840000);
  assert.equal(balance.advanceCents, 60000);
  assert.equal(balance.payableCents, 0);
  assert.deepEqual(entries, original);
  const returned = workerSettlementBalance([...entries, { kind: 'return', amountCents: 60000 }]);
  assert.equal(returned.balanceCents, 0);
  assert.equal(returned.paidCents, 780000);
});

test('empty and exactly settled accounts have no payable balance or advance', () => {
  assert.deepEqual(workerSettlementBalance([]), {
    accruedCents: 0,
    paidCents: 0,
    balanceCents: 0,
    payableCents: 0,
    advanceCents: 0
  });
  assert.equal(
    workerSettlementBalance([
      { kind: 'accrual', amountCents: 100 },
      { kind: 'payout', amountCents: 100 }
    ]).balanceCents,
    0
  );
});

test('invalid payments, excessive returns, negative accruals and overflow are rejected', () => {
  for (const entries of [
    [{ kind: 'payout', amountCents: -1 }],
    [{ kind: 'accrual', amountCents: 0.5 }],
    [{ kind: 'adjustment', amountCents: -1 }],
    [{ kind: 'return', amountCents: 1 }],
    [{ kind: 'accrual', amountCents: Infinity }],
    [
      { kind: 'accrual', amountCents: Number.MAX_SAFE_INTEGER },
      { kind: 'accrual', amountCents: 1 }
    ]
  ] satisfies WorkerSettlementEntry[][]) {
    assert.throws(() => workerSettlementBalance(entries));
  }
});
