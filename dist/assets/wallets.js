// Public receiving addresses supplied by the site owner. They are not private keys.
// A network is selected explicitly; random selection is limited to its address pool.
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const ASSET_METADATA = freeze({
  usdt: {symbol: 'USDT', decimals: 6, kind: 'crypto'},
  usdc: {symbol: 'USDC', decimals: 6, kind: 'crypto'},
  sol: {symbol: 'SOL', decimals: 9, kind: 'crypto'},
  trx: {symbol: 'TRX', decimals: 6, kind: 'crypto'},
  btc: {symbol: 'BTC', decimals: 8, kind: 'crypto'},
  eth: {symbol: 'ETH', decimals: 18, kind: 'crypto'},
  doge: {symbol: 'DOGE', decimals: 8, kind: 'crypto'},
  ltc: {symbol: 'LTC', decimals: 8, kind: 'crypto'},
  bnb: {symbol: 'BNB', decimals: 18, kind: 'crypto'},
  xaut: {symbol: 'XAUT', decimals: 6, kind: 'crypto'},
  gram: {symbol: 'GRAM', decimals: 9, kind: 'crypto', provisional: true},
  busd: {symbol: 'BUSD', decimals: 18, kind: 'crypto'},
  usd: {symbol: 'USD', decimals: 2, kind: 'fiat'},
  uah: {symbol: 'UAH', decimals: 2, kind: 'fiat'},
  uah_cash: {symbol: 'UAH', decimals: 2, kind: 'fiat'},
  uah_card: {symbol: 'UAH', decimals: 2, kind: 'fiat'}
});

export const NETWORK_METADATA = freeze({
  ton: {id: 'ton', name: 'TON'},
  tron: {id: 'tron', name: 'TRON'},
  solana: {id: 'solana', name: 'Solana'},
  ethereum: {id: 'ethereum', name: 'Ethereum'},
  bsc: {id: 'bsc', name: 'BNB Smart Chain'},
  bitcoin: {id: 'bitcoin', name: 'Bitcoin'},
  dogecoin: {id: 'dogecoin', name: 'Dogecoin'},
  litecoin: {id: 'litecoin', name: 'Litecoin'}
});

const addresses = freeze({
  ton: 'UQBSNF5LmSE6yoDFuGDxTjHL2eD6D9FchgZgjuYgBM6Z3R4V',
  tron: 'TDDGTd8hP4vfQK7ygVuikwwt9E6eszPTJ1',
  solana: 'a8SkbQtuwhpmPjHC9w1gHZzdLpNodJuVqGqZgiMHt3m',
  evm: '0x8Db560e6A8B6108aAC314A82b23778a1A131B0e3',
  bitcoin: 'bc1qqv6wkxrufsklfj3309xxaqe2hqsjwj3848tq2f',
  dogecoin: 'D74jrQYHbuGqmMbyBD4VEXC9XRj6zyS9Kg',
  litecoin: 'ltc1qhjn8g40f7f44s5ej2gzflyuuzq7fqp94curv7u'
});

const wallet = (asset, network, address, protocol, suppliedNetwork) => ({
  asset, network, address, protocol, suppliedNetwork, memo: null
});

export const WALLET_REGISTRY = freeze([
  wallet('usdt', 'ton', addresses.ton, 'Jetton', 'TON'),
  wallet('usdt', 'tron', addresses.tron, 'TRC20', 'Tron TRC20'),
  wallet('usdt', 'solana', addresses.solana, 'SPL', 'Solana'),
  wallet('usdt', 'ethereum', addresses.evm, 'ERC20', 'Ethereum (ERC20)'),
  wallet('usdt', 'bsc', addresses.evm, 'BEP20', 'BEP 20'),
  wallet('usdc', 'ethereum', addresses.evm, 'ERC20', 'ERC20'),
  wallet('usdc', 'solana', addresses.solana, 'SPL', 'SPL'),
  wallet('usdc', 'bsc', addresses.evm, 'BEP20', 'BEP20'),
  wallet('sol', 'solana', addresses.solana, 'native', 'Solana'),
  wallet('trx', 'tron', addresses.tron, 'native', 'TRC20'),
  wallet('btc', 'bitcoin', addresses.bitcoin, 'native', 'BTC'),
  wallet('eth', 'ethereum', addresses.evm, 'native', 'ERC20'),
  wallet('doge', 'dogecoin', addresses.dogecoin, 'native', null),
  wallet('ltc', 'litecoin', addresses.litecoin, 'native', null)
]);

// Preserve the supplied information, but do not expose these as payment options
// until the owner identifies the token/network unambiguously.
export const PENDING_WALLETS = freeze([
  {...wallet('gram', 'ton', addresses.ton, null, 'Ton'), reason: 'confirm_asset'},
  {...wallet('bnb', 'ethereum', addresses.evm, 'ERC20', 'ERC20'), reason: 'confirm_network'},
  {...wallet('xaut', null, addresses.evm, null, null), reason: 'network_missing'}
]);

const empty = Object.freeze([]);
const networksByAsset = new Map();
for (const entry of WALLET_REGISTRY) {
  const list = networksByAsset.get(entry.asset) || [];
  if (!list.some(network => network.id === entry.network)) {
    list.push(freeze({...NETWORK_METADATA[entry.network], protocol: entry.protocol}));
  }
  networksByAsset.set(entry.asset, list);
}
for (const [asset, networks] of networksByAsset) networksByAsset.set(asset, freeze(networks));

export function getWalletNetworks(asset) {
  return networksByAsset.get(asset) || empty;
}

export function getPendingWallets(asset) {
  return freeze(PENDING_WALLETS.filter(entry => entry.asset === asset));
}

function secureRandomBytes(length) {
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure random generation is unavailable.');
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function uniquePool(pool) {
  if (!Array.isArray(pool) || pool.length === 0) throw new RangeError('The wallet pool is empty.');
  const seen = new Set();
  const first = pool[0];
  if (!first || typeof first.asset !== 'string' || typeof first.network !== 'string') {
    throw new TypeError('Each wallet must identify its asset and network.');
  }
  return pool.filter(entry => {
    if (!entry || entry.asset !== first.asset || entry.network !== first.network) {
      throw new RangeError('A wallet pool must contain exactly one asset and network.');
    }
    if (typeof entry.address !== 'string' || !entry.address ||
        !(entry.memo === null || typeof entry.memo === 'string')) {
      throw new TypeError('Each wallet must have an address and an explicit memo value.');
    }
    const address = ['ethereum', 'bsc'].includes(entry.network) ? entry.address.toLowerCase() : entry.address;
    const key = JSON.stringify([address, entry.memo]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Exported to test rejection sampling and to support additional receiving
// addresses later without changing how asset/network matching works.
export function chooseFromPool(pool, randomBytes = secureRandomBytes) {
  const entries = uniquePool(pool);
  if (entries.length === 1) return entries[0];
  if (typeof randomBytes !== 'function') throw new TypeError('randomBytes must be a function.');
  const range = 0x100000000;
  if (entries.length > range) throw new RangeError('The wallet pool is too large.');
  const limit = Math.floor(range / entries.length) * entries.length;
  for (let attempt = 0; attempt < 128; attempt++) {
    const bytes = randomBytes(4);
    if (!(bytes instanceof Uint8Array) || bytes.length !== 4) {
      throw new TypeError('randomBytes must return four bytes.');
    }
    const value = bytes[0] * 0x1000000 + bytes[1] * 0x10000 + bytes[2] * 0x100 + bytes[3];
    if (value < limit) return entries[value % entries.length];
  }
  throw new Error('Secure random selection failed.');
}


const runtimeWallets = new Map();
export function setRuntimeWallets(walletsConfig) {
  runtimeWallets.clear();
  if (!walletsConfig || typeof walletsConfig !== 'object') return;
  for (const [key, addr] of Object.entries(walletsConfig)) {
    if (typeof addr === 'string' && addr.trim()) {
      runtimeWallets.set(key.trim(), addr.trim());
    }
  }
}
export function isConfiguredWalletAddress(asset, network, address, memo = null) {
  const override = runtimeWallets.get(asset + ':' + network);
  if (override && override === address && memo === null) return true;
  return WALLET_REGISTRY.some(row => row.asset === asset && row.network === network && row.address === address && row.memo === memo);
}

export function chooseWallet(asset, network, {randomBytes} = {}) {
  const overrideAddr = runtimeWallets.get(asset + ":" + network);
  if (overrideAddr) {
    const base = WALLET_REGISTRY.find(entry => entry.asset === asset && entry.network === network);
    if (base) return freeze({ ...base, address: overrideAddr });
  }
  const pool = WALLET_REGISTRY.filter(entry => entry.asset === asset && entry.network === network);
  if (pool.length === 0) {
    const error = new RangeError('No configured receiving wallet exists for this asset and network.');
    error.code = 'WALLET_PAIR_UNAVAILABLE';
    throw error;
  }
  return chooseFromPool(pool, randomBytes);
}
