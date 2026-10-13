// Each fraction is the USD price of one whole asset unit.
export const DEMO_RATES = Object.freeze(Object.fromEntries([
  ['usdt', 1n, 1n], ['usdc', 1n, 1n], ['busd', 1n, 1n],
  ['btc', 65000n, 1n], ['eth', 3500n, 1n], ['bnb', 600n, 1n],
  ['sol', 150n, 1n], ['trx', 15n, 100n], ['doge', 12n, 100n],
  ['ltc', 80n, 1n], ['usd', 1n, 1n],
  ['uah_cash', 10n, 442n], ['uah_card', 10n, 442n]
].map(([asset, numerator, denominator]) => [asset, Object.freeze({ numerator, denominator })])));

export const ASSET_DECIMALS = Object.freeze({
  usdt: 6, usdc: 6, busd: 18, btc: 8, eth: 18, bnb: 18,
  sol: 9, trx: 6, doge: 8, ltc: 8, usd: 2, uah_cash: 2, uah_card: 2
});

const runtimeRates = new Map();

function parseDecimalToFraction(raw) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  const num = BigInt(w + f);
  const den = 10n ** BigInt(f.length);
  if (num <= 0n) return null;
  return Object.freeze({ numerator: num, denominator: den });
}

export function setRuntimeRates(ratesConfig) {
  runtimeRates.clear();
  if (!ratesConfig || typeof ratesConfig !== 'object') return;
  if (ratesConfig.uah_per_usd) {
    const uahFrac = parseDecimalToFraction(ratesConfig.uah_per_usd);
    if (uahFrac) {
      // Price of 1 UAH in USD is 1 / uah_per_usd = denominator / numerator
      const inverted = Object.freeze({ numerator: uahFrac.denominator, denominator: uahFrac.numerator });
      runtimeRates.set('uah_card', inverted);
      runtimeRates.set('uah_cash', inverted);
    }
  }
  for (const [asset, val] of Object.entries(ratesConfig)) {
    if (asset === 'uah_per_usd' || !Object.prototype.hasOwnProperty.call(ASSET_DECIMALS, asset)) continue;
    const frac = parseDecimalToFraction(val);
    if (frac) runtimeRates.set(asset, frac);
  }
}

const MAX_INTEGER_DIGITS = 12;
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const precisionFor = asset => {
  if (!owns(ASSET_DECIMALS, asset)) throw new RangeError('Unsupported asset.');
  return ASSET_DECIMALS[asset];
};
const checkIntegerSize = integer => {
  if (integer.length > MAX_INTEGER_DIGITS) throw new RangeError('Amount exceeds the supported range.');
};

export function normalizeAmount(raw, asset) {
  const precision = precisionFor(asset);
  if (typeof raw !== 'string') throw new RangeError('Amount must be a decimal string.');
  const value = raw.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) throw new RangeError('Invalid decimal amount.');
  const [whole, fraction = ''] = value.split('.');
  const integer = (whole || '0').replace(/^0+(?=\d)/, '');
  checkIntegerSize(integer);
  if (fraction.length > precision) throw new RangeError('Amount has too many decimal places.');
  const significantFraction = fraction.replace(/0+$/, '');
  return integer + (significantFraction ? '.' + significantFraction : '');
}

const scale = precision => 10n ** BigInt(precision);
const toUnits = (canonical, precision) => {
  const [integer, fraction = ''] = canonical.split('.');
  return BigInt(integer + fraction.padEnd(precision, '0'));
};
const fromUnits = (units, precision) => {
  const value = units.toString().padStart(precision + 1, '0');
  const integer = precision ? value.slice(0, -precision) : value;
  checkIntegerSize(integer);
  const fraction = precision ? value.slice(-precision).replace(/0+$/, '') : '';
  return integer + (fraction ? '.' + fraction : '');
};

export function convertDemoAmount(raw, from, to, options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new RangeError('Invalid rounding options.');
  const rounding = options.rounding === undefined ? 'down' : options.rounding;
  if (rounding !== 'down' && rounding !== 'up') throw new RangeError('Unsupported rounding mode.');
  const fromPrecision = precisionFor(from);
  const toPrecision = precisionFor(to);
  if (!owns(DEMO_RATES, from) || !owns(DEMO_RATES, to)) throw new RangeError('No illustrative rate for this asset.');
  const units = toUnits(normalizeAmount(raw, from), fromPrecision);
  const fromRate = runtimeRates.get(from) || DEMO_RATES[from];
  const toRate = runtimeRates.get(to) || DEMO_RATES[to];
  const numerator = units * fromRate.numerator * toRate.denominator * scale(toPrecision);
  const denominator = scale(fromPrecision) * fromRate.denominator * toRate.numerator;
  const roundedUnits = rounding === 'up' ? (numerator + denominator - 1n) / denominator : numerator / denominator;
  return fromUnits(roundedUnits, toPrecision);
}
