import { chooseWallet, WALLET_REGISTRY, ASSET_METADATA, isConfiguredWalletAddress } from './wallets.js?v=14';
import { normalizeAmount, convertDemoAmount } from './amounts.js?v=14';

export const DRAFT_STORAGE_KEY = 'cryptospace.active-order.v1';
const DAY = 24 * 60 * 60 * 1000;
const fields = ['give', 'get', 'giveAmount', 'getAmount', 'network'];

export function validDraft(value, now = Date.now()) {
  try {
    if (!value || value.version !== 1 || !/^(?:ORDER|PREVIEW)-[a-f0-9-]{36}$/i.test(value.id)) return false;
    if (!Number.isSafeInteger(value.createdAt) || value.createdAt > now || now - value.createdAt >= DAY) return false;
    if (!ASSET_METADATA[value.get] || value.give === value.get) return false;
    if (normalizeAmount(value.giveAmount, value.give) !== value.giveAmount || normalizeAmount(value.getAmount, value.get) !== value.getAmount) return false;
    if (value.giveAmount === '0' || value.getAmount === '0' || convertDemoAmount(value.giveAmount, value.give, value.get) !== value.getAmount) return false;
    return isConfiguredWalletAddress ? isConfiguredWalletAddress(value.give, value.network, value.address, value.memo) : WALLET_REGISTRY.some(row => row.asset === value.give && row.network === value.network && row.address === value.address && row.memo === value.memo);
  } catch { return false; }
}

export function createDraft(input, previous = null, now = Date.now()) {
  const snapshot = {
    give: input.give, get: input.get, network: input.network,
    giveAmount: normalizeAmount(input.giveAmount, input.give),
    getAmount: convertDemoAmount(input.giveAmount, input.give, input.get)
  };
  if (validDraft(previous, now) && fields.every(field => previous[field] === snapshot[field])) return previous;
  const wallet = chooseWallet(snapshot.give, snapshot.network);
  const result = Object.freeze({ version: 1, id: 'ORDER-' + (globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); })), createdAt: now, ...snapshot, address: wallet.address, memo: wallet.memo });
  if (!validDraft(result, now)) throw new RangeError('Unsupported order parameters');
  return result;
}

export function loadDraft(storage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(DRAFT_STORAGE_KEY));
    if (validDraft(value, now)) return value;
    storage.removeItem(DRAFT_STORAGE_KEY);
  } catch { /* Storage may be disabled or contain an expired order. */ }
  return null;
}

export function saveDraft(value, storage) {
  if (!validDraft(value)) return false;
  const { version, id, createdAt, give, get, giveAmount, getAmount, network, address, memo } = value;
  try { storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ version, id, createdAt, give, get, giveAmount, getAmount, network, address, memo })); return true; }
  catch { return false; }
}

export function clearDraft(storage) {
  try { storage.removeItem(DRAFT_STORAGE_KEY); } catch { /* Session-only state still works. */ }
}
