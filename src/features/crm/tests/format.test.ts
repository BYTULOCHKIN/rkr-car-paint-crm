import assert from 'node:assert/strict';
import test from 'node:test';
import { money } from '../components/format';

test('UAH output has a fixed label and non-breaking spaces for SSR hydration', () => {
  assert.equal(money(0), '0,00\u00a0грн');
  assert.equal(money(1), '0,01\u00a0грн');
  assert.equal(money(105), '1,05\u00a0грн');
  assert.equal(money(99999), '999,99\u00a0грн');
  assert.equal(money(123456), '1\u00a0234,56\u00a0грн');
  assert.equal(money(123456789), '1\u00a0234\u00a0567,89\u00a0грн');
  assert.equal(money(-123456), '-1\u00a0234,56\u00a0грн');
});
