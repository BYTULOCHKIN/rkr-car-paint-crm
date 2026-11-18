import assert from 'node:assert/strict';
import test from 'node:test';
import { compactMoney, compactNumber, formatPercentage } from '../lib/format';

test('overview values use a single decimal, compact suffixes and correct currency units', () => {
  assert.equal(compactNumber(11249), '11.2K');
  assert.equal(compactNumber(11250), '11.3K');
  assert.equal(compactNumber(999950), '1M');
  assert.equal(compactNumber(1380000), '1.4M');
  assert.equal(compactNumber(23), '23');
  assert.equal(compactMoney(1124900), '11.2K грн');
  assert.equal(compactMoney(0), '0 грн');
  assert.equal(compactMoney(-1124900), '-11.2K грн');
});

test('percentage labels keep their sign and at most one decimal without grouping or negative zero', () => {
  assert.equal(formatPercentage(102.1111), '+102.1%');
  assert.equal(formatPercentage(-22.26), '-22.3%');
  assert.equal(formatPercentage(100), '+100%');
  assert.equal(formatPercentage(1102.111), '+1102.1%');
  assert.equal(formatPercentage(0), '0%');
  assert.equal(formatPercentage(-0.001), '0%');
});
