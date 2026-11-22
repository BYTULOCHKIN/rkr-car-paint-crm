import assert from 'node:assert/strict';
import test from 'node:test';
import type { OrderEconomicsInput } from '../api/types';
import {
  calculateOrderEconomics,
  DEFAULT_EMPLOYEE_SHARE_BPS,
  previewEconomicsAdjustment
} from '../lib/calculate';

function example(overrides: Partial<OrderEconomicsInput> = {}): OrderEconomicsInput {
  return {
    paintingPriceCents: 1800000,
    polishingPriceCents: 100000,
    assemblyPriceCents: 0,
    paintingMaterialsCents: 300000,
    polishingMaterialsCents: 50000,
    employeeShareBps: DEFAULT_EMPLOYEE_SHARE_BPS,
    subcontracts: [],
    ...overrides
  };
}

test('reproduces the Excel example without charging polishing twice', () => {
  assert.deepEqual(calculateOrderEconomics(example()), {
    checkCents: 1800000,
    materialsCents: 350000,
    painterBaseCents: 1400000,
    polisherBaseCents: 50000,
    assemblerBaseCents: 0,
    painterAccrualCents: 840000,
    polisherAccrualCents: 30000,
    assemblerAccrualCents: 0,
    employeeAccrualsCents: 870000,
    subcontractCostsCents: 0,
    workshopRemainderCents: 580000
  });
});

test('assembly earns 60%; the colorist receives the entire quoted amount', () => {
  const input = example({
    assemblyPriceCents: 100000,
    subcontracts: [
      { kind: 'color_matching', priceCents: 200000, costCents: 200000 },
      { kind: 'soldering', priceCents: 150000, costCents: 150000 }
    ]
  });
  const result = calculateOrderEconomics(input);
  assert.equal(result.checkCents, 2250000);
  assert.equal(result.assemblerAccrualCents, 60000);
  assert.equal(result.employeeAccrualsCents, 930000);
  assert.equal(result.subcontractCostsCents, 350000);
  assert.equal(result.workshopRemainderCents, 620000);
});

test('subcontract margin and loss remain explicit and never accrue 60% to a contractor', () => {
  const input = example({
    paintingPriceCents: 0,
    polishingPriceCents: 0,
    paintingMaterialsCents: 0,
    polishingMaterialsCents: 0,
    subcontracts: [{ kind: 'soldering', priceCents: 10000, costCents: 12000 }]
  });
  assert.equal(calculateOrderEconomics(input).workshopRemainderCents, -2000);
  assert.equal(calculateOrderEconomics(input).employeeAccrualsCents, 0);
  assert.throws(
    () =>
      calculateOrderEconomics({
        ...input,
        subcontracts: [{ kind: 'color_matching', priceCents: 10000, costCents: 12000 }]
      }),
    /колористу/
  );
});

test('rounding preserves every kopeck across all roles and rates', () => {
  for (const rate of [0, 1, 3333, 5000, 6000, 10000]) {
    for (const amount of [0, 1, 2, 3, 7, 101, 99999]) {
      const result = calculateOrderEconomics(
        example({
          paintingPriceCents: amount * 4,
          polishingPriceCents: amount,
          assemblyPriceCents: amount,
          paintingMaterialsCents: amount,
          polishingMaterialsCents: amount,
          employeeShareBps: rate
        })
      );
      assert.equal(
        result.materialsCents +
          result.employeeAccrualsCents +
          result.subcontractCostsCents +
          result.workshopRemainderCents,
        result.checkCents
      );
      assert.equal(result.polisherAccrualCents, 0);
      assert.ok(result.workshopRemainderCents >= 0);
    }
  }
  const halfKopeck = calculateOrderEconomics(
    example({
      paintingPriceCents: 1,
      polishingPriceCents: 0,
      paintingMaterialsCents: 0,
      polishingMaterialsCents: 0,
      employeeShareBps: 5000
    })
  );
  assert.equal(halfKopeck.painterAccrualCents, 1);
  assert.equal(halfKopeck.workshopRemainderCents, 0);
});

test('invalid bases are rejected instead of silently creating negative wages', () => {
  for (const overrides of [
    { polishingPriceCents: 1800001 },
    { paintingMaterialsCents: 1700001 },
    { polishingMaterialsCents: 100001 },
    { employeeShareBps: 10001 },
    { employeeShareBps: -1 },
    { employeeShareBps: 0.5 },
    { assemblyPriceCents: -1 },
    { paintingPriceCents: NaN },
    { paintingMaterialsCents: Infinity },
    { assemblyPriceCents: Number.MAX_SAFE_INTEGER + 1 }
  ]) {
    assert.throws(() => calculateOrderEconomics(example(overrides)));
  }
  assert.throws(() =>
    calculateOrderEconomics(example({ assemblyPriceCents: Number.MAX_SAFE_INTEGER }))
  );
});

test('correction previews report signed differences without changing the original inputs', () => {
  const original = Object.freeze(example());
  const corrected = example({ paintingMaterialsCents: 400000 });
  const preview = previewEconomicsAdjustment(original, corrected);
  assert.equal(preview.before.painterAccrualCents, 840000);
  assert.equal(preview.after.painterAccrualCents, 780000);
  assert.equal(preview.delta.materialsCents, 100000);
  assert.equal(preview.delta.painterAccrualCents, -60000);
  assert.equal(preview.delta.workshopRemainderCents, -40000);
  assert.equal(preview.delta.checkCents, 0);
  assert.equal(original.paintingMaterialsCents, 300000);
  const unchanged = previewEconomicsAdjustment(original, original);
  assert.ok(Object.values(unchanged.delta).every((amount) => amount === 0));
  const reversed = previewEconomicsAdjustment(corrected, original);
  assert.equal(reversed.delta.painterAccrualCents, 60000);
});

test('each calculation uses its explicit rate, preserving old calculation inputs', () => {
  const original = example();
  const preview = previewEconomicsAdjustment(original, example({ employeeShareBps: 7000 }));
  assert.equal(preview.before.painterAccrualCents, 840000);
  assert.equal(preview.after.painterAccrualCents, 980000);
  assert.equal(original.employeeShareBps, 6000);
});
