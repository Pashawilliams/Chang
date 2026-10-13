import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSET_METADATA, NETWORK_METADATA, WALLET_REGISTRY, PENDING_WALLETS,
  getWalletNetworks, getPendingWallets, chooseWallet, chooseFromPool
} from '../dist/assets/wallets.js';

// Independent fixtures keep address transcription mistakes visible.
const TON = 'UQBSNF5LmSE6yoDFuGDxTjHL2eD6D9FchgZgjuYgBM6Z3R4V';
const TRON = 'TDDGTd8hP4vfQK7ygVuikwwt9E6eszPTJ1';
const SOLANA = 'a8SkbQtuwhpmPjHC9w1gHZzdLpNodJuVqGqZgiMHt3m';
const EVM = '0x8Db560e6A8B6108aAC314A82b23778a1A131B0e3';
const configured = [
  ['usdt', 'ton', TON, 'Jetton', 'TON'],
  ['usdt', 'tron', TRON, 'TRC20', 'Tron TRC20'],
  ['usdt', 'solana', SOLANA, 'SPL', 'Solana'],
  ['usdt', 'ethereum', EVM, 'ERC20', 'Ethereum (ERC20)'],
  ['usdt', 'bsc', EVM, 'BEP20', 'BEP 20'],
  ['usdc', 'ethereum', EVM, 'ERC20', 'ERC20'],
  ['usdc', 'solana', SOLANA, 'SPL', 'SPL'],
  ['usdc', 'bsc', EVM, 'BEP20', 'BEP20'],
  ['sol', 'solana', SOLANA, 'native', 'Solana'],
  ['trx', 'tron', TRON, 'native', 'TRC20'],
  ['btc', 'bitcoin', 'bc1qqv6wkxrufsklfj3309xxaqe2hqsjwj3848tq2f', 'native', 'BTC'],
  ['eth', 'ethereum', EVM, 'native', 'ERC20'],
  ['doge', 'dogecoin', 'D74jrQYHbuGqmMbyBD4VEXC9XRj6zyS9Kg', 'native', null],
  ['ltc', 'litecoin', 'ltc1qhjn8g40f7f44s5ej2gzflyuuzq7fqp94curv7u', 'native', null]
];

test('every configured wallet preserves the exact supplied address and pair', () => {
  assert.equal(WALLET_REGISTRY.length, configured.length);
  for (const [asset, network, address, protocol, suppliedNetwork] of configured) {
    const entry = chooseWallet(asset, network);
    assert.deepEqual(entry, {asset, network, address, protocol, suppliedNetwork, memo: null});
    assert.ok(Object.isFrozen(entry));
  }
});

test('pending ambiguities preserve their addresses without becoming payment networks', () => {
  assert.deepEqual(PENDING_WALLETS, [
    {asset: 'gram', network: 'ton', address: TON, protocol: null, suppliedNetwork: 'Ton', memo: null, reason: 'confirm_asset'},
    {asset: 'bnb', network: 'ethereum', address: EVM, protocol: 'ERC20', suppliedNetwork: 'ERC20', memo: null, reason: 'confirm_network'},
    {asset: 'xaut', network: null, address: EVM, protocol: null, suppliedNetwork: null, memo: null, reason: 'network_missing'}
  ]);
  for (const entry of PENDING_WALLETS) {
    assert.equal(getPendingWallets(entry.asset)[0], entry);
    assert.deepEqual(getWalletNetworks(entry.asset), []);
    assert.throws(() => chooseWallet(entry.asset, entry.network), {code: 'WALLET_PAIR_UNAVAILABLE'});
  }
  assert.deepEqual(getPendingWallets('usdt'), []);
});

test('asset networks are explicit and include no unrelated address fallbacks', () => {
  assert.deepEqual(getWalletNetworks('usdt').map(network => network.id), ['ton', 'tron', 'solana', 'ethereum', 'bsc']);
  assert.deepEqual(getWalletNetworks('usdc').map(network => network.id), ['ethereum', 'solana', 'bsc']);
  assert.deepEqual(getWalletNetworks('btc'), [{id: 'bitcoin', name: 'Bitcoin', protocol: 'native'}]);
  for (const pair of [['usdc', 'ton'], ['btc', 'ethereum'], ['eth', 'bsc'], ['sol', 'tron'], ['usdt', 'TRC20'], ['busd', 'ethereum'], ['usd', 'ethereum'], ['made-up', 'ton'], ['usdt', undefined]]) {
    assert.throws(() => chooseWallet(...pair), {code: 'WALLET_PAIR_UNAVAILABLE'});
  }
  assert.deepEqual(getWalletNetworks('unknown'), []);
  assert.deepEqual(getWalletNetworks('busd'), []);
});

test('metadata keeps chain precision and cannot be mutated', () => {
  assert.equal(ASSET_METADATA.usdt.decimals, 6);
  assert.equal(ASSET_METADATA.usdc.decimals, 6);
  assert.equal(ASSET_METADATA.sol.decimals, 9);
  assert.equal(ASSET_METADATA.trx.decimals, 6);
  assert.equal(ASSET_METADATA.btc.decimals, 8);
  assert.equal(ASSET_METADATA.eth.decimals, 18);
  assert.equal(ASSET_METADATA.doge.decimals, 8);
  assert.equal(ASSET_METADATA.ltc.decimals, 8);
  assert.equal(ASSET_METADATA.bnb.decimals, 18);
  assert.equal(ASSET_METADATA.xaut.decimals, 6);
  assert.equal(ASSET_METADATA.gram.provisional, true);
  assert.equal(ASSET_METADATA.busd.decimals, 18);
  assert.equal(ASSET_METADATA.usd.decimals, 2);
  assert.equal(ASSET_METADATA.uah_card.decimals, 2);
  assert.throws(() => {ASSET_METADATA.eth.decimals = 2;}, TypeError);
  assert.throws(() => {NETWORK_METADATA.ton.id = 'ethereum';}, TypeError);
  assert.throws(() => {WALLET_REGISTRY.push(WALLET_REGISTRY[0]);}, TypeError);
  assert.throws(() => {getWalletNetworks('usdt')[0].id = 'bitcoin';}, TypeError);
  assert.throws(() => {PENDING_WALLETS[0].address = 'changed';}, TypeError);
});

const sample = address => ({asset: 'usdt', network: 'ethereum', address, memo: null});

test('a single supplied address is stable and never consumes random bytes', () => {
  const fail = () => {throw new Error('Unexpected random draw');};
  for (const [asset, network] of configured) {
    assert.equal(chooseWallet(asset, network, {randomBytes: fail}), chooseWallet(asset, network));
  }
  const entry = sample(EVM);
  assert.equal(chooseFromPool([entry, sample(EVM.toLowerCase())], fail), entry);
});

test('same-pair deduplication respects case-sensitive chains and memo distinctions', () => {
  const evm = sample(EVM);
  const evmMemo = {...evm, memo: 'payment-2'};
  assert.equal(chooseFromPool([evm, sample(EVM.toLowerCase()), evmMemo], () => new Uint8Array([0, 0, 0, 1])), evmMemo);
  const lower = {asset: 'sol', network: 'solana', address: 'aB', memo: null};
  const upper = {...lower, address: 'Ab'};
  assert.equal(chooseFromPool([lower, upper], () => new Uint8Array([0, 0, 0, 1])), upper);
});

test('random choice uses four secure bytes and rejection sampling for a three-address pool', () => {
  const pool = ['address-a', 'address-b', 'address-c'].map(sample);
  const draws = [new Uint8Array([255, 255, 255, 255]), new Uint8Array([0, 0, 0, 2])];
  let calls = 0;
  const selected = chooseFromPool(pool, length => {
    assert.equal(length, 4);
    return draws[calls++];
  });
  assert.equal(selected, pool[2]);
  assert.equal(calls, 2, 'the biased upper tail must be rejected');
  assert.equal(chooseFromPool(pool, () => new Uint8Array([0, 0, 0, 0])), pool[0]);
  assert.equal(chooseFromPool(pool.slice(0, 2), () => new Uint8Array([255, 255, 255, 255])), pool[1]);
});

test('malformed or mixed pools and failed random sources cannot produce a wallet', () => {
  assert.throws(() => chooseFromPool([]), RangeError);
  assert.throws(() => chooseFromPool([null]), TypeError);
  assert.throws(() => chooseFromPool([sample('a'), {...sample('b'), network: 'bsc'}]), RangeError);
  assert.throws(() => chooseFromPool([sample('a'), {...sample('b'), asset: 'usdc'}]), RangeError);
  assert.throws(() => chooseFromPool([{...sample('a'), memo: undefined}]), TypeError);
  assert.throws(() => chooseFromPool([sample('a'), sample('b')], () => [0, 0, 0, 0]), TypeError);
  assert.throws(() => chooseFromPool([sample('a'), sample('b')], () => new Uint8Array(3)), TypeError);
  assert.throws(() => chooseFromPool([sample('a'), sample('b'), sample('c')], () => new Uint8Array([255, 255, 255, 255])), /selection failed/);
});
