import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_DECIMALS, DEMO_RATES, normalizeAmount, convertDemoAmount } from '../dist/assets/amounts.js';

test('normalizes decimal punctuation and harmless zeroes without converting to Number', () => {
  assert.equal(normalizeAmount('0.00100', 'usdt'), '0.001');
  assert.equal(normalizeAmount('0001', 'usdt'), '1');
  assert.equal(normalizeAmount('.5', 'usdt'), '0.5');
  assert.equal(normalizeAmount('1.', 'usdt'), '1');
  assert.equal(normalizeAmount(' 0001,2500 ', 'usdt'), '1.25');
  assert.equal(normalizeAmount('0.000000', 'usdt'), '0');
  assert.equal(normalizeAmount('999999999999.999999999999999999', 'eth'), '999999999999.999999999999999999');
});

test('rejects malformed input instead of turning it into a different amount', () => {
  for (const raw of ['', ' ', '.', ',', '1e3', '1E3', '+1', '-1', 'Infinity', 'NaN', '1abc', '1 000', '1,2,3', '1.2.3', '0x10', '١']) {
    assert.throws(() => normalizeAmount(raw, 'usdt'), RangeError, raw);
  }
  assert.throws(() => normalizeAmount(1.01, 'usdt'), RangeError);
  assert.throws(() => normalizeAmount(null, 'usdt'), RangeError);
});

test('enforces integer and per-asset fractional limits without truncating pasted values', () => {
  assert.throws(() => normalizeAmount('1000000000000', 'usdt'), RangeError);
  assert.equal(normalizeAmount('0000000000000001', 'usdt'), '1');
  for (const asset of Object.keys(ASSET_DECIMALS)) {
    const decimals = ASSET_DECIMALS[asset];
    const valid = '1.' + '1'.repeat(decimals);
    assert.equal(normalizeAmount(valid, asset), valid);
    assert.throws(() => normalizeAmount(valid + '0', asset), RangeError, asset);
  }
  assert.throws(() => normalizeAmount('1.230', 'uah_card'), RangeError);
});

test('preserves crypto precision even for amounts above one unit', () => {
  assert.equal(convertDemoAmount('1.12345678', 'btc', 'btc'), '1.12345678');
  assert.equal(convertDemoAmount('1.123456789123456789', 'eth', 'eth'), '1.123456789123456789');
  assert.equal(convertDemoAmount('999999999999.999999999999999999', 'eth', 'eth'), '999999999999.999999999999999999');
  assert.equal(convertDemoAmount('3500.000001', 'usdt', 'eth'), '1.000000000285714285');
});

test('floors the result to the target precision, including fiat cents', () => {
  assert.equal(convertDemoAmount('1.12345678', 'btc', 'uah_card'), '3227691.32');
  assert.equal(convertDemoAmount('1.123456789123456789', 'eth', 'uah_card'), '173798.76');
  assert.equal(convertDemoAmount('0.000001', 'usdt', 'uah_card'), '0');
  assert.equal(convertDemoAmount('0.000001', 'trx', 'usdt'), '0');
  assert.equal(convertDemoAmount('1', 'usd', 'doge'), '8.33333333');
  assert.equal(convertDemoAmount('8.33333333', 'doge', 'usd'), '0.99');
  assert.equal(convertDemoAmount('0.01', 'uah_card', 'eth'), '0.000000064641241111');
});

test('uses rational demo prices consistently in both currency directions', () => {
  assert.equal(convertDemoAmount('100', 'usdt', 'uah_card'), '4420');
  assert.equal(convertDemoAmount('4420', 'uah_card', 'usdt'), '100');
  assert.equal(convertDemoAmount('1', 'usdt', 'trx'), '6.666666');
  assert.equal(convertDemoAmount('1', 'ltc', 'sol'), '0.533333333');
  assert.equal(convertDemoAmount('0', 'btc', 'usdt'), '0');
});

test('rounds required payment amounts up so the forward conversion covers the requested payout', () => {
  assert.equal(convertDemoAmount('1000', 'uah_card', 'btc'), '0.00034806');
  const requiredPayment = convertDemoAmount('1000', 'uah_card', 'btc', { rounding: 'up' });
  assert.equal(requiredPayment, '0.00034807');
  assert.equal(convertDemoAmount(requiredPayment, 'btc', 'uah_card'), '1000');
  assert.equal(convertDemoAmount('0.000000000000000001', 'eth', 'usd', { rounding: 'up' }), '0.01');
  assert.equal(convertDemoAmount('0', 'eth', 'usd', { rounding: 'up' }), '0');
  assert.equal(convertDemoAmount('100', 'usdt', 'uah_card', { rounding: 'up' }), '4420');
  assert.equal(convertDemoAmount('1', 'usd', 'doge', { rounding: 'down' }), '8.33333333');
});

test('rejects unsupported rounding choices rather than silently choosing a direction', () => {
  for (const rounding of ['nearest', 'floor', '', null, 1]) {
    assert.throws(() => convertDemoAmount('1', 'usdt', 'uah_card', { rounding }), RangeError);
  }
  for (const options of [null, [], 'up', true]) {
    assert.throws(() => convertDemoAmount('1', 'usdt', 'uah_card', options), RangeError);
  }
});

test('rejects unknown or unpriced assets, invalid source precision and output overflow', () => {
  for (const asset of ['gram', 'xaut', 'unknown', 'toString', '__proto__']) {
    assert.throws(() => normalizeAmount('1', asset), RangeError);
    assert.throws(() => convertDemoAmount('1', asset, 'usdt'), RangeError);
    assert.throws(() => convertDemoAmount('1', 'usdt', asset), RangeError);
  }
  assert.throws(() => convertDemoAmount('1e3', 'usdt', 'uah_card'), RangeError);
  assert.throws(() => convertDemoAmount('1.0000001', 'usdt', 'uah_card'), RangeError);
  assert.throws(() => convertDemoAmount('999999999999', 'btc', 'uah_card'), RangeError);
  assert.ok(Object.isFrozen(DEMO_RATES));
  assert.ok(Object.isFrozen(DEMO_RATES.usdt));
  assert.ok(Object.isFrozen(ASSET_DECIMALS));
  assert.equal(DEMO_RATES.trx.numerator, 15n);
  assert.equal(DEMO_RATES.trx.denominator, 100n);
});
