import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeValuedStock, receiveValuedStock, valuePurchase } from '../lib/stock-valuation';

test('purchases at different EUR rates form a weighted UAH balance', () => {
  const firstCost = valuePurchase({
    currency: 'EUR',
    amountMinor: 4000,
    exchangeRateMicros: 48000000
  });
  const secondCost = valuePurchase({
    currency: 'EUR',
    amountMinor: 6600,
    exchangeRateMicros: 50000000
  });
  assert.equal(firstCost, 192000);
  assert.equal(secondCost, 330000);
  const first = receiveValuedStock({ quantityMilli: 0, totalCostCents: 0 }, 2000, firstCost);
  const balance = receiveValuedStock(first, 3000, secondCost);
  const consumption = consumeValuedStock(balance, 500);
  assert.equal(consumption.costCents, 52200);
  assert.deepEqual(consumption.balance, { quantityMilli: 4500, totalCostCents: 469800 });
});

test('a new receipt averages the remaining inventory without revaluing past consumption', () => {
  const consumption = consumeValuedStock({ quantityMilli: 2000, totalCostCents: 200000 }, 1500);
  const priorConsumption = structuredClone(consumption);
  const balance = receiveValuedStock(consumption.balance, 1000, 200000);
  const next = consumeValuedStock(balance, 300);
  assert.equal(consumption.costCents, 150000);
  assert.equal(next.costCents, 50000);
  assert.deepEqual(consumption, priorConsumption);
});

test('fractional depletion conserves original value and leaves no residual cost', () => {
  let balance = { quantityMilli: 3000, totalCostCents: 100 };
  const costs: number[] = [];
  for (let count = 0; count < 3; count++) {
    const consumption = consumeValuedStock(balance, 1000);
    costs.push(consumption.costCents);
    balance = consumption.balance;
  }
  assert.deepEqual(costs, [33, 34, 33]);
  assert.deepEqual(balance, { quantityMilli: 0, totalCostCents: 0 });
  assert.equal(
    costs.reduce((sum, amount) => sum + amount, 0),
    100
  );
  assert.equal(consumeValuedStock({ quantityMilli: 2, totalCostCents: 1 }, 1).costCents, 1);
});

test('reversal restores original cost even after a different purchase price', () => {
  const consumption = consumeValuedStock({ quantityMilli: 1000, totalCostCents: 100000 }, 500);
  const purchased = receiveValuedStock(consumption.balance, 1000, 200000);
  const restored = receiveValuedStock(purchased, consumption.quantityMilli, consumption.costCents);
  assert.deepEqual(restored, { quantityMilli: 2000, totalCostCents: 300000 });
});

test('currency conversion rounds once and keeps exact intermediate products', () => {
  assert.equal(
    valuePurchase({ currency: 'UAH', amountMinor: 123, exchangeRateMicros: 1000000 }),
    123
  );
  assert.equal(
    valuePurchase({ currency: 'EUR', amountMinor: 1, exchangeRateMicros: 48500000 }),
    49
  );
  assert.equal(
    valuePurchase({
      currency: 'EUR',
      amountMinor: Number.MAX_SAFE_INTEGER,
      exchangeRateMicros: 1000000
    }),
    Number.MAX_SAFE_INTEGER
  );
});

test('invalid rates, unsafe amounts, inconsistent balances and insufficient stock are rejected', () => {
  for (const input of [
    { currency: 'UAH' as const, amountMinor: 100, exchangeRateMicros: 48000000 },
    { currency: 'EUR' as const, amountMinor: 100, exchangeRateMicros: 0 },
    { currency: 'EUR' as const, amountMinor: -100, exchangeRateMicros: 1000000 },
    { currency: 'EUR' as const, amountMinor: 0.5, exchangeRateMicros: 1000000 },
    { currency: 'EUR' as const, amountMinor: NaN, exchangeRateMicros: 1000000 },
    { currency: 'EUR' as const, amountMinor: Number.MAX_SAFE_INTEGER, exchangeRateMicros: 50000000 }
  ]) {
    assert.throws(() => valuePurchase(input));
  }
  const original = Object.freeze({ quantityMilli: 1000, totalCostCents: 100 });
  assert.throws(() => consumeValuedStock(original, 1001), /Недостатньо/);
  assert.throws(() => consumeValuedStock(original, 0));
  assert.throws(() => consumeValuedStock(original, 0.5));
  assert.throws(() => consumeValuedStock({ quantityMilli: 0, totalCostCents: 1 }, 1));
  assert.throws(() => receiveValuedStock(original, 1, -1));
  assert.throws(() => receiveValuedStock(original, Number.MAX_SAFE_INTEGER, 1));
  assert.deepEqual(original, { quantityMilli: 1000, totalCostCents: 100 });
});
