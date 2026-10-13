import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, validDraft, loadDraft, saveDraft, clearDraft, DRAFT_STORAGE_KEY } from '../dist/assets/drafts.js';

const input = { give: 'usdt', get: 'uah_card', giveAmount: '100', network: 'tron' };
const storage = () => {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
};

test('unchanged conditions retain the reference and address; changed conditions create a new preview', () => {
  const now = Date.now();
  const first = createDraft(input, null, now);
  assert.equal(first.getAmount, '4420');
  assert.equal(createDraft({ ...input, giveAmount: '100.000000' }, first, now + 1), first);
  const changed = createDraft({ ...input, network: 'ethereum' }, first, now + 1);
  assert.notEqual(changed.id, first.id);
  assert.notEqual(changed.address, first.address);
});

test('saved recipient details survive reload without persisting contacts or card data', () => {
  const store = storage();
  const draft = createDraft(input);
  assert.equal(saveDraft({ ...draft, phone: '+380671234567', telegram: '@example', card: 'private' }, store), true);
  const saved = JSON.parse(store.getItem(DRAFT_STORAGE_KEY));
  for (const key of ['phone', 'telegram', 'card']) assert.equal(key in saved, false);
  assert.deepEqual(loadDraft(store), draft);
  clearDraft(store);
  assert.equal(loadDraft(store), null);
});

test('modified wallet, network and demonstration amounts are rejected', () => {
  const draft = createDraft(input);
  assert.equal(validDraft({ ...draft, address: 'wrong-address' }), false);
  assert.equal(validDraft({ ...draft, network: 'solana' }), false);
  assert.equal(validDraft({ ...draft, getAmount: '4421' }), false);
  assert.equal(validDraft({ ...draft, giveAmount: '1e3' }), false);
  assert.equal(validDraft({ ...draft, giveAmount: '0', getAmount: '0' }), false);
});

test('old, future and corrupt stored previews are discarded', () => {
  const now = Date.now();
  const draft = createDraft(input, null, now);
  assert.equal(validDraft(draft, now + 24 * 60 * 60 * 1000), false);
  assert.equal(validDraft(draft, now - 1), false);
  const store = storage();store.setItem(DRAFT_STORAGE_KEY, '{invalid');
  assert.equal(loadDraft(store), null);
  store.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...draft, address: 'wrong' }));
  assert.equal(loadDraft(store), null);
  assert.equal(store.getItem(DRAFT_STORAGE_KEY), null);
});

test('unavailable browser storage does not crash a memory-only preview', () => {
  const draft = createDraft(input);
  assert.equal(saveDraft(draft, null), false);
  assert.equal(loadDraft(null), null);
  assert.doesNotThrow(() => clearDraft(null));
});

test('pending pairs and zero receiving amount cannot produce a recipient preview', () => {
  assert.throws(() => createDraft({ ...input, give: 'bnb', network: 'ethereum' }), RangeError);
  assert.throws(() => createDraft({ ...input, giveAmount: '0.000001', get: 'usd' }), RangeError);
});
