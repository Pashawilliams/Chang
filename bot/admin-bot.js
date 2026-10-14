import fs from 'node:fs';
import path from 'node:path';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const GH_TOKEN = process.env.BOT_GH_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const GH_REPO = process.env.GITHUB_REPOSITORY || 'Pashawilliams/Chang';
const STATE_BRANCH = process.env.BOT_STATE_BRANCH || 'bot-state';
const STATE_FILE = 'state/bot-data.json';
const SUPER_ADMIN_ID = 7906546417;

// 5 hours 20 minutes = 320 minutes = 19,200,000 ms
const CYCLE_MINUTES = Number(process.env.BOT_MAX_MINUTES) || 320;
const MAX_RUNTIME_MS = CYCLE_MINUTES * 60 * 1000;

const LOCAL_DATA_DIR = path.resolve(process.cwd(), '.bot-runtime');
const LOCAL_STATE_PATH = path.join(LOCAL_DATA_DIR, 'bot-data.json');
fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });

const DEFAULT_CONFIG = {
  version: 2,
  updatedAt: new Date().toISOString(),
  superAdminId: SUPER_ADMIN_ID,
  admins: [
    {
      id: SUPER_ADMIN_ID,
      role: 'superadmin',
      label: 'Главный администратор',
      addedAt: '2026-10-14T01:15:00.000Z'
    }
  ],
  rates: {
    uah_per_usd: '44.20',
    usdt: '1',
    usdc: '1',
    usd: '1',
    btc: '65000',
    eth: '3500',
    bnb: '600',
    sol: '150',
    trx: '0.15',
    doge: '0.12',
    ltc: '80'
  },
  wallets: {
    'usdt:ton': 'UQBSNF5LmSE6yoDFuGDxTjHL2eD6D9FchgZgjuYgBM6Z3R4V',
    'usdt:tron': 'TDDGTd8hP4vfQK7ygVuikwwt9E6eszPTJ1',
    'usdt:solana': 'a8SkbQtuwhpmPjHC9w1gHZzdLpNodJuVqGqZgiMHt3m',
    'usdt:ethereum': '0x8Db560e6A8B6108aAC314A82b23778a1A131B0e3',
    'usdt:bsc': '0x8Db560e6A8B6108aAC314A82b23778a1A131B0e3',
    'usdc:ethereum': '0x8Db560e6A8B6108aAC314A82b23778a1A131B0e3',
    'usdc:solana': 'a8SkbQtuwhpmPjHC9w1gHZzdLpNodJuVqGqZgiMHt3m',
    'usdc:bsc': '0x8Db560e6A8B6108aAC314A82b23778a1A131B0e3',
    'sol:solana': 'a8SkbQtuwhpmPjHC9w1gHZzdLpNodJuVqGqZgiMHt3m',
    'trx:tron': 'TDDGTd8hP4vfQK7ygVuikwwt9E6eszPTJ1',
    'btc:bitcoin': 'bc1qqv6wkxrufsklfj3309xxaqe2hqsjwj3848tq2f',
    'eth:ethereum': '0x8Db560e6A8B6108aAC314A82b23778a1A131B0e3',
    'doge:dogecoin': 'D74jrQYHbuGqmMbyBD4VEXC9XRj6zyS9Kg',
    'ltc:litecoin': 'ltc1qhjn8g40f7f44s5ej2gzflyuuzq7fqp94curv7u'
  },
  contacts: {
    telegram: '@CryptoSpace092',
    phone: '+380773364200'
  },
  settings: {
    exchangeEnabled: true,
    paymentTimerMinutes: 15,
    maintenanceMessage: 'Сервіс тимчасово оновлює резерви. Спробуйте через декілька хвилин.'
  }
};

const WALLET_LABELS = {
  'usdt:tron': 'USDT · TRON (TRC20)',
  'usdt:ton': 'USDT · TON (Jetton)',
  'usdt:solana': 'USDT · Solana (SPL)',
  'usdt:ethereum': 'USDT · Ethereum (ERC20)',
  'usdt:bsc': 'USDT · BNB Chain (BEP20)',
  'usdc:ethereum': 'USDC · Ethereum (ERC20)',
  'usdc:solana': 'USDC · Solana (SPL)',
  'usdc:bsc': 'USDC · BNB Chain (BEP20)',
  'btc:bitcoin': 'BTC · Bitcoin',
  'eth:ethereum': 'ETH · Ethereum (ERC20)',
  'sol:solana': 'SOL · Solana',
  'trx:tron': 'TRX · TRON (TRC20)',
  'doge:dogecoin': 'DOGE · Dogecoin',
  'ltc:litecoin': 'LTC · Litecoin'
};

const RATE_LABELS = {
  uah_per_usd: '🇺🇦 Курс UAH за 1 USD',
  btc: '₿ Bitcoin (BTC) в USD',
  eth: 'Ξ Ethereum (ETH) в USD',
  sol: '◎ Solana (SOL) в USD',
  ltc: 'Ł Litecoin (LTC) в USD',
  trx: '🔺 TRON (TRX) в USD',
  doge: 'Ð Dogecoin (DOGE) в USD',
  usdt: '💵 Tether (USDT) в USD',
  usdc: '💵 USD Coin (USDC) в USD'
};

const sessionStartTime = Date.now();
const plannedRestartTime = sessionStartTime + MAX_RUNTIME_MS;

let config = structuredClone(DEFAULT_CONFIG);
let orders = [];
let sessions = new Map(); // String(chatId) -> { step, ... }
let offset = 0;
let sessionStats = {
  sessionNumber: 1,
  cycleDurationMinutes: CYCLE_MINUTES,
  startedAt: new Date(sessionStartTime).toISOString(),
  lastSavedAt: new Date(sessionStartTime).toISOString(),
  nextRestartAt: new Date(plannedRestartTime).toISOString()
};

let stateFileSha = null;
let offsetDirty = false;
let shuttingDown = false;
let saveInFlight = Promise.resolve();

function isAdmin(userId) {
  const num = Number(userId);
  if (num === SUPER_ADMIN_ID) return true;
  return Array.isArray(config.admins) && config.admins.some(a => Number(a.id) === num);
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDurationLeft(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h} ч ${m} мин ${s} сек`;
}

async function tgApi(method, payload = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25000)
  });
  return res.json();
}

function ghHeaders() {
  return {
    ...(GH_TOKEN ? { Authorization: `token ${GH_TOKEN}` } : {}),
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'CryptoSpace-Admin-Bot'
  };
}

function mergeConfig(rawCfg = {}) {
  const merged = {
    ...DEFAULT_CONFIG,
    ...rawCfg,
    superAdminId: SUPER_ADMIN_ID,
    rates: { ...DEFAULT_CONFIG.rates, ...(rawCfg.rates || {}) },
    wallets: { ...DEFAULT_CONFIG.wallets, ...(rawCfg.wallets || {}) },
    contacts: { ...DEFAULT_CONFIG.contacts, ...(rawCfg.contacts || {}) },
    settings: { ...DEFAULT_CONFIG.settings, ...(rawCfg.settings || {}) }
  };
  if (!Array.isArray(merged.admins)) merged.admins = [...DEFAULT_CONFIG.admins];
  if (!merged.admins.some(a => Number(a.id) === SUPER_ADMIN_ID)) {
    merged.admins.unshift(DEFAULT_CONFIG.admins[0]);
  }
  return merged;
}

function serializeFullState() {
  const serializedSessions = {};
  for (const [k, v] of sessions.entries()) {
    serializedSessions[String(k)] = v;
  }
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    offset,
    sessionStats: {
      ...sessionStats,
      cycleDurationMinutes: CYCLE_MINUTES,
      lastSavedAt: new Date().toISOString(),
      nextRestartAt: new Date(plannedRestartTime).toISOString()
    },
    config,
    orders,
    sessions: serializedSessions
  };
}

function applyLoadedState(parsed) {
  if (!parsed || typeof parsed !== 'object') return;
  if (parsed.config) { delete parsed.config.botToken; config = mergeConfig(parsed.config); }
  if (Array.isArray(parsed.orders)) orders = parsed.orders;
  if (typeof parsed.offset === 'number' && parsed.offset > offset) {
    offset = parsed.offset;
  }
  if (parsed.sessions && typeof parsed.sessions === 'object') {
    sessions = new Map(Object.entries(parsed.sessions));
  }
  const prevNum = Number(parsed.sessionStats?.sessionNumber) || 0;
  sessionStats = {
    sessionNumber: prevNum + 1,
    cycleDurationMinutes: CYCLE_MINUTES,
    startedAt: new Date(sessionStartTime).toISOString(),
    lastSavedAt: new Date().toISOString(),
    nextRestartAt: new Date(plannedRestartTime).toISOString()
  };
}

async function loadBotStateFromGitHub() {
  try {
    if (fs.existsSync(LOCAL_STATE_PATH)) {
      const localParsed = JSON.parse(fs.readFileSync(LOCAL_STATE_PATH, 'utf8'));
      applyLoadedState(localParsed);
    }
  } catch (e) {
    console.error('Local state read warning:', e.message);
  }

  if (!GH_TOKEN) {
    console.warn('No GH_TOKEN provided; running with local state only.');
    return;
  }

  try {
    const apiUrl = `https://api.github.com/repos/${GH_REPO}/contents/${STATE_FILE}?ref=${STATE_BRANCH}`;
    const res = await fetch(apiUrl, { headers: ghHeaders() });
    if (res.ok) {
      const data = await res.json();
      stateFileSha = data.sha;
      const contentStr = Buffer.from(data.content, 'base64').toString('utf8');
      const remoteParsed = JSON.parse(contentStr);
      applyLoadedState(remoteParsed);
      console.log(`Loaded persistent state from ${STATE_BRANCH}/${STATE_FILE} (Session #${sessionStats.sessionNumber}, Orders: ${orders.length}, Admins: ${config.admins.length}, Offset: ${offset})`);
    } else {
      console.log(`Remote state file not found (${res.status}), initializing fresh state on ${STATE_BRANCH}.`);
    }
  } catch (e) {
    console.error('Error loading state from GitHub:', e.message);
  }
}

async function saveBotStateToGitHub(reason = 'Update bot state') {
  saveInFlight = saveInFlight.then(async () => {
    const payloadObj = serializeFullState();
    const jsonStr = JSON.stringify(payloadObj, null, 2) + '\n';
    try {
      fs.writeFileSync(LOCAL_STATE_PATH, jsonStr);
    } catch (e) {
      console.error('Local write warning:', e.message);
    }

    if (!GH_TOKEN) return false;

    const apiUrl = `https://api.github.com/repos/${GH_REPO}/contents/${STATE_FILE}`;
    const contentBase64 = Buffer.from(jsonStr, 'utf8').toString('base64');

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!stateFileSha || attempt > 0) {
          const getRes = await fetch(`${apiUrl}?ref=${STATE_BRANCH}`, { headers: ghHeaders() });
          if (getRes.ok) {
            const getData = await getRes.json();
            stateFileSha = getData.sha;
          }
        }
        const putRes = await fetch(apiUrl, {
          method: 'PUT',
          headers: ghHeaders(),
          body: JSON.stringify({
            message: `[bot-state] ${reason}`,
            content: contentBase64,
            branch: STATE_BRANCH,
            ...(stateFileSha ? { sha: stateFileSha } : {})
          })
        });
        if (putRes.ok) {
          const putData = await putRes.json();
          stateFileSha = putData.content?.sha || stateFileSha;
          sessionStats.lastSavedAt = new Date().toISOString();
          offsetDirty = false;
          return true;
        }
        if (putRes.status === 409 || putRes.status === 422) {
          stateFileSha = null;
          continue;
        }
        const errTxt = await putRes.text();
        console.error(`State save HTTP ${putRes.status}: ${errTxt}`);
        return false;
      } catch (e) {
        console.error('saveBotStateToGitHub error:', e.message);
      }
    }
    return false;
  });
  return saveInFlight;
}

async function syncConfigToMainBranch(commitMessage = 'Update site-config.json via Telegram Admin Bot') {
  config.updatedAt = new Date().toISOString();
  await saveBotStateToGitHub(commitMessage);

  if (!GH_TOKEN) return false;

  const contentBase64 = Buffer.from(JSON.stringify(config, null, 2) + '\n', 'utf8').toString('base64');
  const paths = ['assets/site-config.json', 'dist/assets/site-config.json'];
  for (const filePath of paths) {
    const apiUrl = `https://api.github.com/repos/${GH_REPO}/contents/${filePath}`;
    let sha = undefined;
    try {
      const getRes = await fetch(`${apiUrl}?ref=main`, { headers: ghHeaders() });
      if (getRes.ok) {
        const data = await getRes.json();
        sha = data.sha;
      }
    } catch (e) {
      console.error('GitHub GET main error:', e.message);
    }

    const putRes = await fetch(apiUrl, {
      method: 'PUT',
      headers: ghHeaders(),
      body: JSON.stringify({
        message: commitMessage,
        content: contentBase64,
        branch: 'main',
        ...(sha ? { sha } : {})
      })
    });
    if (!putRes.ok) {
      const errText = await putRes.text();
      throw new Error(`GitHub main sync failed for ${filePath}: ${putRes.status} ${errText}`);
    }
  }
  return true;
}

async function triggerNextWorkflowRun() {
  if (!GH_TOKEN) return false;
  try {
    const url = `https://api.github.com/repos/${GH_REPO}/actions/workflows/telegram-bot.yml/dispatches`;
    const res = await fetch(url, {
      method: 'POST',
      headers: ghHeaders(),
      body: JSON.stringify({ ref: 'main' })
    });
    console.log(`Triggered next 5h 20m workflow dispatch: HTTP ${res.status}`);
    return res.ok || res.status === 204;
  } catch (e) {
    console.error('Failed to trigger next workflow run:', e.message);
    return false;
  }
}

const clearedReplyKeyboardChats = new Set();
async function ensureReplyKeyboardRemoved(chatId) {
  const key = String(chatId);
  if (clearedReplyKeyboardChats.has(key)) return;
  clearedReplyKeyboardChats.add(key);
  try {
    const tmp = await tgApi('sendMessage', {
      chat_id: chatId,
      text: '⏳',
      reply_markup: { remove_keyboard: true }
    });
    if (tmp.ok && tmp.result?.message_id) {
      await tgApi('deleteMessage', {
        chat_id: chatId,
        message_id: tmp.result.message_id
      });
    }
  } catch (e) {
    // ignore
  }
}

function buildDashboardText() {
  const totalOrders = orders.length;
  const doneOrders = orders.filter(o => o.status === 'done').length;
  const procOrders = orders.filter(o => o.status === 'processing' || o.status === 'new').length;
  const statusIcon = config.settings.exchangeEnabled ? '🟢 Включён (Активен)' : '🔴 Техработы (Пауза)';
  const kyivTime = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kyiv' });
  const leftMs = Math.max(0, plannedRestartTime - Date.now());

  return [
    '🛡 <b>CRYPTOSPACE — ГЛАВНАЯ АДМИН-ПАНЕЛЬ</b>',
    '━━━━━━━━━━━━━━━━━━━━━━',
    '🌐 <b>Домен:</b> <a href="https://cryptospace.kyiv.ua">https://cryptospace.kyiv.ua</a>',
    `⚡ <b>Статус приёма заявок:</b> ${statusIcon}`,
    `⏱ <b>Таймер оплаты:</b> <code>${config.settings.paymentTimerMinutes} мин</code>`,
    `🔄 <b>Сессия #${sessionStats.sessionNumber} (цикл 5ч 20м):</b> до перезапуска <code>${formatDurationLeft(leftMs)}</code>`,
    '━━━━━━━━━━━━━━━━━━━━━━',
    '💱 <b>Ключевые курсы сейчас:</b>',
    `• <b>1 USD / USDT</b> = <code>${escapeHtml(config.rates.uah_per_usd)} UAH</code>`,
    `• <b>1 BTC</b> = <code>${escapeHtml(config.rates.btc)} USD</code>`,
    `• <b>1 ETH</b> = <code>${escapeHtml(config.rates.eth)} USD</code>`,
    `• <b>1 SOL</b> = <code>${escapeHtml(config.rates.sol)} USD</code> | <b>1 LTC</b> = <code>${escapeHtml(config.rates.ltc)} USD</code>`,
    '━━━━━━━━━━━━━━━━━━━━━━',
    `📦 <b>Заявки в базе:</b> всего <code>${totalOrders}</code> (в работе: <code>${procOrders}</code>, выполнено: <code>${doneOrders}</code>)`,
    `👥 <b>Администраторов:</b> <code>${config.admins.length}</code>`,
    `📞 <b>Контакты на сайте:</b> ${escapeHtml(config.contacts.telegram)} | <code>${escapeHtml(config.contacts.phone)}</code>`,
    `🕒 <b>Время сервера (Киев):</b> <code>${kyivTime}</code>`
  ].join('\n');
}

function buildDashboardInline() {
  return {
    inline_keyboard: [
      [
        { text: '📦 Заявки (' + orders.length + ')', callback_data: 'menu:orders' },
        { text: '💱 Изменить курсы', callback_data: 'menu:rates' }
      ],
      [
        { text: '👛 Кошельки и сети', callback_data: 'menu:wallets' },
        { text: '👥 Администраторы (' + config.admins.length + ')', callback_data: 'menu:admins' }
      ],
      [
        { text: '📞 Контакты сайта', callback_data: 'menu:contacts' },
        { text: '⚙️ Настройки и Таймер', callback_data: 'menu:settings' }
      ],
      [
        { text: '📊 Статистика и CSV', callback_data: 'menu:stats' },
        { text: '🔄 Сессия 5ч 20м / База', callback_data: 'menu:session' }
      ],
      [
        { text: '🧪 Тестовая заявка', callback_data: 'orders:test' },
        { text: '🚀 Синхр. с сайтом', callback_data: 'sync:now' }
      ]
    ]
  };
}

function buildSessionMenu() {
  const leftMs = Math.max(0, plannedRestartTime - Date.now());
  const elapsedMs = Date.now() - sessionStartTime;
  const startKyiv = new Date(sessionStartTime).toLocaleString('ru-RU', { timeZone: 'Europe/Kyiv' });
  const nextKyiv = new Date(plannedRestartTime).toLocaleString('ru-RU', { timeZone: 'Europe/Kyiv' });
  const savedKyiv = new Date(sessionStats.lastSavedAt || Date.now()).toLocaleString('ru-RU', { timeZone: 'Europe/Kyiv' });

  const text = [
    '🔄 <b>ОБХОД 6-ЧАСОВОГО ЛИМИТА (СЕССИЯ 5Ч 20М)</b>',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `🔢 <b>Текущая сессия:</b> <code>#${sessionStats.sessionNumber}</code>`,
    `⏱ <b>Длительность цикла:</b> <code>5 часов 20 минут (320 мин)</code>`,
    `🟢 <b>Запущена (Киев):</b> <code>${startKyiv}</code>`,
    `⏳ <b>В работе:</b> <code>${formatDurationLeft(elapsedMs)}</code>`,
    `🔜 <b>До автоперезапуска:</b> <code>${formatDurationLeft(leftMs)}</code> (в <code>${nextKyiv}</code>)`,
    '━━━━━━━━━━━━━━━━━━━━━━',
    '💾 <b>СОХРАНЕНИЕ ДАННЫХ МЕЖДУ СЕАНСАМИ</b>',
    `• <b>Ветка БД:</b> <code>${STATE_BRANCH}/${STATE_FILE}</code>`,
    `• <b>Последнее сохранение:</b> <code>${savedKyiv}</code>`,
    `• <b>Сохранено заявок:</b> <code>${orders.length} шт.</code>`,
    `• <b>Сохранено админов:</b> <code>${config.admins.length} чел.</code>`,
    `• <b>Активных диалогов:</b> <code>${sessions.size}</code>`,
    `• <b>Telegram Offset:</b> <code>${offset}</code>`,
    '',
    '<i>Все заявки, статусы, курсы, кошельки, контакты, админы и даже незавершённые шаги ввода сохраняются мгновенно и автоматически восстанавливаются в новой сессии.</i>'
  ].join('\n');

  const keyboard = {
    inline_keyboard: [
      [
        { text: '💾 Сохранить все данные сейчас', callback_data: 'session:save_now' }
      ],
      [
        { text: '🔄 Перезапустить сессию сейчас (тест)', callback_data: 'session:restart_now' }
      ],
      [
        { text: '⬅️ Назад в панель', callback_data: 'menu:home' }
      ]
    ]
  };
  return { text, keyboard };
}

function buildRatesMenu() {
  const uah = config.rates.uah_per_usd;
  const text = [
    '💱 <b>УПРАВЛЕНИЕ КУРСАМИ ВАЛЮТ</b>',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `🇺🇦 <b>Курс покупки гривны (UAH за 1 USD / USDT):</b>`,
    `👉 <b><code>${escapeHtml(uah)} UAH</code></b>`,
    '',
    '📊 <b>Курсы криптовалют (в USD за 1 монету):</b>',
    `• <b>BTC:</b> <code>${escapeHtml(config.rates.btc)} USD</code>`,
    `• <b>ETH:</b> <code>${escapeHtml(config.rates.eth)} USD</code>`,
    `• <b>SOL:</b> <code>${escapeHtml(config.rates.sol)} USD</code>`,
    `• <b>LTC:</b> <code>${escapeHtml(config.rates.ltc)} USD</code>`,
    `• <b>TRX:</b> <code>${escapeHtml(config.rates.trx)} USD</code>`,
    `• <b>DOGE:</b> <code>${escapeHtml(config.rates.doge)} USD</code>`,
    `• <b>USDT / USDC:</b> <code>${escapeHtml(config.rates.usdt)} / ${escapeHtml(config.rates.usdc)} USD</code>`,
    '',
    '<i>Любое изменение автоматически сохраняется в базу сессий и сразу применяется на сайте https://cryptospace.kyiv.ua</i>'
  ].join('\n');

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🇺🇦 UAH -0.50', callback_data: 'rate_step:uah_per_usd:-0.5' },
        { text: '🇺🇦 UAH -0.10', callback_data: 'rate_step:uah_per_usd:-0.1' },
        { text: '🇺🇦 UAH +0.10', callback_data: 'rate_step:uah_per_usd:0.1' },
        { text: '🇺🇦 UAH +0.50', callback_data: 'rate_step:uah_per_usd:0.5' }
      ],
      [
        { text: `✏️ Ввести свой курс UAH (${uah})`, callback_data: 'rate_edit:uah_per_usd' }
      ],
      [
        { text: `₿ BTC (${config.rates.btc})`, callback_data: 'rate_edit:btc' },
        { text: `Ξ ETH (${config.rates.eth})`, callback_data: 'rate_edit:eth' }
      ],
      [
        { text: `◎ SOL (${config.rates.sol})`, callback_data: 'rate_edit:sol' },
        { text: `Ł LTC (${config.rates.ltc})`, callback_data: 'rate_edit:ltc' }
      ],
      [
        { text: `🔺 TRX (${config.rates.trx})`, callback_data: 'rate_edit:trx' },
        { text: `Ð DOGE (${config.rates.doge})`, callback_data: 'rate_edit:doge' }
      ],
      [
        { text: `💵 USDT (${config.rates.usdt})`, callback_data: 'rate_edit:usdt' },
        { text: `💵 USDC (${config.rates.usdc})`, callback_data: 'rate_edit:usdc' }
      ],
      [
        { text: '⬅️ Назад в панель', callback_data: 'menu:home' }
      ]
    ]
  };
  return { text, keyboard };
}

function buildWalletsMenu() {
  const lines = [
    '👛 <b>УПРАВЛЕНИЕ КОШЕЛЬКАМИ ОПЛАТЫ</b>',
    '━━━━━━━━━━━━━━━━━━━━━━',
    'Выберите валюту и сеть, чтобы посмотреть или заменить адрес кошелька на сайте:'
  ];
  const entries = Object.keys(WALLET_LABELS);
  const rows = [];
  for (let i = 0; i < entries.length; i += 2) {
    const row = [];
    for (const key of entries.slice(i, i + 2)) {
      row.push({ text: WALLET_LABELS[key], callback_data: `wallet_view:${key}` });
    }
    rows.push(row);
  }
  rows.push([{ text: '⬅️ Назад в панель', callback_data: 'menu:home' }]);
  return { text: lines.join('\n'), keyboard: { inline_keyboard: rows } };
}

function buildAdminsMenu() {
  const lines = [
    '👥 <b>УПРАВЛЕНИЕ АДМИНИСТРАТОРАМИ</b>',
    '━━━━━━━━━━━━━━━━━━━━━━',
    'Бот отвечает <b>только</b> пользователям из этого списка. Все администраторы сохраняются между перезапусками и получают уведомления о новых заявках:',
    ''
  ];
  config.admins.forEach((adm, idx) => {
    const isSuper = Number(adm.id) === SUPER_ADMIN_ID;
    const badge = isSuper ? '👑 <b>Главный админ (SuperAdmin)</b>' : '🛡 <b>Администратор</b>';
    lines.push(`${idx + 1}. ${badge}\n   ID: <code>${adm.id}</code> — ${escapeHtml(adm.label || 'Без метки')}`);
  });

  const rows = [
    [{ text: '➕ Добавить администратора по ID', callback_data: 'admin:add' }]
  ];
  for (const adm of config.admins) {
    if (Number(adm.id) !== SUPER_ADMIN_ID) {
      rows.push([
        { text: `🗑 Удалить админа ${adm.id} (${adm.label || ''})`, callback_data: `admin_del:${adm.id}` }
      ]);
    }
  }
  rows.push([{ text: '⬅️ Назад в панель', callback_data: 'menu:home' }]);
  return { text: lines.join('\n'), keyboard: { inline_keyboard: rows } };
}

function buildContactsMenu() {
  const text = [
    '📞 <b>КОНТАКТЫ НА САЙТЕ</b>',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `✈️ <b>Telegram поддержки:</b> ${escapeHtml(config.contacts.telegram)}`,
    `📱 <b>Номер телефона:</b> <code>${escapeHtml(config.contacts.phone)}</code>`,
    '',
    '<i>При изменении контакты автоматически сохраняются и обновляются в шапке, футере и на плавающих кнопках сайта.</i>'
  ].join('\n');

  const keyboard = {
    inline_keyboard: [
      [
        { text: '✏️ Изменить Telegram', callback_data: 'contact_edit:telegram' },
        { text: '✏️ Изменить телефон', callback_data: 'contact_edit:phone' }
      ],
      [{ text: '⬅️ Назад в панель', callback_data: 'menu:home' }]
    ]
  };
  return { text, keyboard };
}

function buildSettingsMenu() {
  const enabled = config.settings.exchangeEnabled;
  const text = [
    '⚙️ <b>НАСТРОЙКИ САЙТА И ТАЙМЕРА</b>',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `⚡ <b>Приём заявок на сайте:</b> ${enabled ? '🟢 Включён' : '🔴 Выключен (Техработы)'}`,
    `⏱ <b>Таймер на оплату заявки:</b> <code>${config.settings.paymentTimerMinutes} минут</code>`,
    `💬 <b>Текст при техработах:</b>\n<i>${escapeHtml(config.settings.maintenanceMessage)}</i>`
  ].join('\n');

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: enabled ? '🔴 Включить режим техработ (пауза)' : '🟢 Включить приём заявок',
          callback_data: 'settings:toggle_exchange'
        }
      ],
      [
        { text: '⏱ 10 мин', callback_data: 'timer_set:10' },
        { text: '⏱ 15 мин', callback_data: 'timer_set:15' },
        { text: '⏱ 20 мин', callback_data: 'timer_set:20' },
        { text: '⏱ 30 мин', callback_data: 'timer_set:30' }
      ],
      [
        { text: '✏️ Ввести своё время таймера', callback_data: 'settings:edit_timer' }
      ],
      [
        { text: '✏️ Изменить текст техработ', callback_data: 'settings:edit_maint' }
      ],
      [
        { text: '⬅️ Назад в панель', callback_data: 'menu:home' }
      ]
    ]
  };
  return { text, keyboard };
}

function buildOrdersMenu(filter = 'all') {
  let list = [...orders].reverse();
  if (filter === 'active') list = list.filter(o => o.status === 'new' || o.status === 'processing');
  if (filter === 'done') list = list.filter(o => o.status === 'done');
  if (filter === 'rejected') list = list.filter(o => o.status === 'rejected');

  const statusNames = {
    new: '🆕 Новая',
    processing: '⏳ В работе',
    done: '✅ Выполнена',
    rejected: '❌ Отклонена'
  };

  const lines = [
    `📦 <b>СПИСОК ЗАЯВОК (${filter === 'all' ? 'Все' : filter}) — Всего: ${list.length}</b>`,
    '━━━━━━━━━━━━━━━━━━━━━━'
  ];

  if (list.length === 0) {
    lines.push('<i>Заявок в этой категории пока нет. Все заявки с сайта сохраняются в постоянную базу между перезапусками.</i>');
  } else {
    for (const item of list.slice(0, 8)) {
      const st = statusNames[item.status] || '🆕 Новая';
      lines.push(
        `• <b>#${escapeHtml(item.code)}</b> [${st}] — <code>${escapeHtml(item.give)}</code> ➡️ <code>${escapeHtml(item.get)}</code>` +
        (item.card ? `\n  💳 Карта: <code>${escapeHtml(item.card)}</code>` : '') +
        `\n  📞 <code>${escapeHtml(item.phone || '—')}</code> | ✈️ ${escapeHtml(item.telegram || '—')} | 🕒 ${escapeHtml(item.time || '')}`
      );
    }
  }

  const rows = [
    [
      { text: filter === 'all' ? '🔘 Все' : 'Все', callback_data: 'orders_filter:all' },
      { text: filter === 'active' ? '🔘 В работе' : '⏳ В работе', callback_data: 'orders_filter:active' },
      { text: filter === 'done' ? '🔘 Выполненные' : '✅ Выполненные', callback_data: 'orders_filter:done' },
      { text: filter === 'rejected' ? '🔘 Отклонённые' : '❌ Отклонённые', callback_data: 'orders_filter:rejected' }
    ]
  ];

  for (const item of list.slice(0, 5)) {
    rows.push([
      { text: `📋 Заявка #${item.code} (${item.give} → ${item.get})`, callback_data: `order_view:${item.code}` }
    ]);
  }

  rows.push([
    { text: '🔍 Поиск заявки', callback_data: 'orders:search' },
    { text: '🧪 Создать тест-заявку', callback_data: 'orders:test' }
  ]);
  rows.push([
    { text: '📥 Выгрузить CSV', callback_data: 'orders:csv' },
    { text: '⬅️ Назад в панель', callback_data: 'menu:home' }
  ]);

  return { text: lines.join('\n\n'), keyboard: { inline_keyboard: rows } };
}

function buildStatsMenu() {
  const total = orders.length;
  const done = orders.filter(o => o.status === 'done').length;
  const proc = orders.filter(o => o.status === 'processing' || o.status === 'new').length;
  const rej = orders.filter(o => o.status === 'rejected').length;
  const uahOrders = orders.filter(o => String(o.get || '').includes('UAH')).length;

  const text = [
    '📊 <b>СТАТИСТИКА И АНАЛИТИКА ОБМЕННИКА</b>',
    '━━━━━━━━━━━━━━━━━━━━━━',
    `📦 <b>Всего заявок в постоянной БД:</b> <code>${total}</code>`,
    `⏳ <b>Новые / В обработке:</b> <code>${proc}</code>`,
    `✅ <b>Успешно выполнено:</b> <code>${done}</code>`,
    `❌ <b>Отклонено:</b> <code>${rej}</code>`,
    `💳 <b>Заявок с выплатой на карту UAH:</b> <code>${uahOrders}</code>`,
    '━━━━━━━━━━━━━━━━━━━━━━',
    `🔄 <b>Текущая сессия:</b> <code>#${sessionStats.sessionNumber}</code> (цикл 5ч 20м)`,
    `💾 <b>Облачная БД:</b> <code>${STATE_BRANCH}/${STATE_FILE}</code>`,
    `🌐 <b>Активный домен:</b> https://cryptospace.kyiv.ua`
  ].join('\n');

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📥 Скачать базу заявок (CSV)', callback_data: 'orders:csv' }
      ],
      [
        { text: '🗑 Очистить историю заявок', callback_data: 'orders:clear_confirm' }
      ],
      [
        { text: '⬅️ Назад в панель', callback_data: 'menu:home' }
      ]
    ]
  };
  return { text, keyboard };
}

function parseOrderFromMessageText(text, codeFallback) {
  const getMatch = (regex) => {
    const m = String(text || '').match(regex);
    return m ? m[1].trim() : '';
  };
  const code = getMatch(/НОВАЯ ЗАЯВКА #?([A-Z0-9]+)/i) || codeFallback;
  const give = getMatch(/Отдаёт:\s*([^\n]+)/i);
  const get = getMatch(/Получает:\s*([^\n]+)/i);
  const network = getMatch(/Сеть:\s*([^\n]+)/i);
  const address = getMatch(/Кошелёк оплаты:\s*\n?([^\n━]+)/i);
  const card = getMatch(/Карта получателя \(UAH\):\s*\n?([^\n━]+)/i);
  const phone = getMatch(/Телефон:\s*([^\n]+)/i);
  const telegram = getMatch(/Telegram:\s*([^\n]+)/i);
  const time = getMatch(/Время \(Киев\):\s*([^\n]+)/i) || new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kyiv' });
  return { code, give, get, network, address, card, phone, telegram, time };
}

async function upsertOrder(orderData, reason = 'Save order') {
  const idx = orders.findIndex(o => o.code === orderData.code);
  if (idx >= 0) {
    orders[idx] = { ...orders[idx], ...orderData, updatedAt: new Date().toISOString() };
  } else {
    orders.push({
      code: orderData.code,
      give: orderData.give || '—',
      get: orderData.get || '—',
      network: orderData.network || '—',
      address: orderData.address || '',
      card: orderData.card || '',
      phone: orderData.phone || '—',
      telegram: orderData.telegram || '—',
      time: orderData.time || new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kyiv' }),
      status: orderData.status || 'new',
      createdAt: new Date().toISOString()
    });
  }
  await saveBotStateToGitHub(`${reason} #${orderData.code}`);
}

async function consumeWebsiteOrderQueue() {
  try {
    const res = await tgApi('getMyCommands', { language_code: 'eo' });
    if (!res.ok || !Array.isArray(res.result) || res.result.length === 0) return;

    let addedAny = false;
    for (const cmd of res.result) {
      if (!String(cmd.command || '').startsWith('ord_')) continue;
      const parts = String(cmd.description || '').split('|');
      const [code, give, get, network, address, card, phone, telegram, time] = parts;
      if (code && !orders.some(o => o.code === code)) {
        orders.push({
          code,
          give: give || '—',
          get: get || '—',
          network: network || '—',
          address: address || '',
          card: card || '',
          phone: phone || '—',
          telegram: telegram || '—',
          time: time || new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kyiv' }),
          status: 'new',
          createdAt: new Date().toISOString()
        });
        addedAny = true;
      }
    }

    await tgApi('deleteMyCommands', { language_code: 'eo' });
    if (addedAny) {
      await saveBotStateToGitHub('Ingest new orders from website queue');
    }
  } catch (e) {
    // Ignore transient network errors
  }
}

async function sendCsvExport(chatId) {
  const header = 'Code,Status,Give,Get,Network,WalletAddress,CardUAH,Phone,Telegram,Time\n';
  const rows = orders.map(o =>
    [o.code, o.status, o.give, o.get, o.network, o.address, o.card, o.phone, o.telegram, o.time]
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  const csvContent = '\uFEFF' + header + rows.join('\n');
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('caption', `📊 Выгрузка заявок CryptoSpace (${orders.length} шт.)`);
  form.append('reply_markup', JSON.stringify({ inline_keyboard: [[{ text: '⬅️ Назад в панель', callback_data: 'menu:home' }]] }));
  form.append('document', new Blob([csvContent], { type: 'text/csv;charset=utf-8' }), `cryptospace-orders-${Date.now()}.csv`);

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
    method: 'POST',
    body: form
  });
}

async function setSession(chatId, sessionObj) {
  if (sessionObj === null) {
    if (sessions.has(String(chatId))) {
      sessions.delete(String(chatId));
      await saveBotStateToGitHub('Clear admin dialog session');
    }
  } else {
    sessions.set(String(chatId), sessionObj);
    await saveBotStateToGitHub(`Save admin dialog step ${sessionObj.step}`);
  }
}

async function handleCallbackQuery(cb) {
  const fromId = cb.from?.id;
  if (!isAdmin(fromId)) return; // Strictly ignore non-admins

  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const data = cb.data || '';

  const editOrSend = async (text, reply_markup) => {
    if (chatId && messageId) {
      const res = await tgApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup
      });
      if (res.ok) return;
    }
    if (chatId) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup
      });
    }
  };

  if (data === 'menu:home') {
    await setSession(chatId, null);
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    await editOrSend(buildDashboardText(), buildDashboardInline());
    return;
  }

  if (data === 'menu:session') {
    await setSession(chatId, null);
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    const { text, keyboard } = buildSessionMenu();
    await editOrSend(text, keyboard);
    return;
  }

  if (data === 'session:save_now') {
    await tgApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: '💾 Сохраняю базу в ветку bot-state...'
    });
    await saveBotStateToGitHub('Manual state checkpoint from admin panel');
    const { text, keyboard } = buildSessionMenu();
    await editOrSend(text + '\n\n✅ <b>Все данные успешно сохранены в постоянное хранилище!</b>', keyboard);
    return;
  }

  if (data === 'session:restart_now') {
    await tgApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: '🔄 Сохраняю состояние и запускаю новую сессию 5ч 20м...'
    });
    await editOrSend(
      '🔄 <b>ПЕРЕЗАПУСК СЕССИИ (5Ч 20М)</b>\n━━━━━━━━━━━━━━━━━━━━━━\n1. Сохраняю все заявки, курсы, кошельки, админов и offset в <code>bot-state</code>...\n2. Запускаю новый цикл 5 часов 20 минут...',
      { inline_keyboard: [[{ text: '🖥 Главная панель', callback_data: 'menu:home' }]] }
    );
    shuttingDown = true;
    await saveBotStateToGitHub('Admin-initiated seamless session restart');
    await triggerNextWorkflowRun();
    setTimeout(() => process.exit(0), 500);
    return;
  }

  if (data === 'menu:rates') {
    await setSession(chatId, null);
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    const { text, keyboard } = buildRatesMenu();
    await editOrSend(text, keyboard);
    return;
  }

  if (data.startsWith('rate_step:')) {
    const [, asset, deltaStr] = data.split(':');
    const current = parseFloat(config.rates[asset] || '44.20');
    const next = Math.max(0.01, current + parseFloat(deltaStr)).toFixed(2);
    config.rates[asset] = next;
    await tgApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: `Курс обновлён: ${next} UAH. Синхронизация...`
    });
    try {
      await syncConfigToMainBranch(`Update ${asset} rate to ${next} via Telegram Admin Bot`);
    } catch (e) {
      console.error(e.message);
    }
    const { text, keyboard } = buildRatesMenu();
    await editOrSend(text, keyboard);
    return;
  }

  if (data.startsWith('rate_edit:')) {
    const asset = data.split(':')[1];
    const label = RATE_LABELS[asset] || asset.toUpperCase();
    await setSession(chatId, { step: 'await_rate', asset });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    await editOrSend(
      `✏️ <b>ИЗМЕНЕНИЕ КУРСА: ${escapeHtml(label)}</b>\n━━━━━━━━━━━━━━━━━━━━━━\nТекущее значение: <code>${escapeHtml(config.rates[asset])}</code>\n\nОтправьте новое числовое значение в чат (например: <code>44.50</code>):`,
      { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'menu:rates' }]] }
    );
    return;
  }

  if (data === 'menu:wallets') {
    await setSession(chatId, null);
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    const { text, keyboard } = buildWalletsMenu();
    await editOrSend(text, keyboard);
    return;
  }

  if (data.startsWith('wallet_view:')) {
    const key = data.slice('wallet_view:'.length);
    const label = WALLET_LABELS[key] || key;
    const addr = config.wallets[key] || '—';
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    await editOrSend(
      `👛 <b>РЕКВИЗИТЫ КОШЕЛЬКА</b>\n━━━━━━━━━━━━━━━━━━━━━━\n🌐 <b>Направление:</b> ${escapeHtml(label)}\n📋 <b>Текущий адрес на сайте:</b>\n<code>${escapeHtml(addr)}</code>`,
      {
        inline_keyboard: [
          [{ text: '✏️ Заменить адрес кошелька', callback_data: `wallet_edit:${key}` }],
          [{ text: '⬅️ Назад к списку кошельков', callback_data: 'menu:wallets' }]
        ]
      }
    );
    return;
  }

  if (data.startsWith('wallet_edit:')) {
    const key = data.slice('wallet_edit:'.length);
    const label = WALLET_LABELS[key] || key;
    await setSession(chatId, { step: 'await_wallet', key });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    await editOrSend(
      `✏️ <b>НОВЫЙ АДРЕС ДЛЯ: ${escapeHtml(label)}</b>\n━━━━━━━━━━━━━━━━━━━━━━\nТекущий адрес:\n<code>${escapeHtml(config.wallets[key])}</code>\n\nОтправьте новый адрес кошелька сообщением в чат:`,
      { inline_keyboard: [[{ text: '❌ Отмена', callback_data: `wallet_view:${key}` }]] }
    );
    return;
  }

  if (data === 'menu:admins') {
    await setSession(chatId, null);
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    const { text, keyboard } = buildAdminsMenu();
    await editOrSend(text, keyboard);
    return;
  }

  if (data === 'admin:add') {
    await setSession(chatId, { step: 'await_admin_add' });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    await editOrSend(
      '➕ <b>ДОБАВЛЕНИЕ АДМИНИСТРАТОРА</b>\n━━━━━━━━━━━━━━━━━━━━━━\nОтправьте <b>Telegram ID</b> нового администратора (числом) и через пробел его имя/метку.\n\nПример:\n<code>123456789 Менеджер Алексей</code>',
      { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'menu:admins' }]] }
    );
    return;
  }

  if (data.startsWith('admin_del:')) {
    const targetId = Number(data.split(':')[1]);
    if (targetId === SUPER_ADMIN_ID) {
      await tgApi('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: 'Главного администратора удалить нельзя!',
        show_alert: true
      });
      return;
    }
    config.admins = config.admins.filter(a => Number(a.id) !== targetId);
    try {
      await syncConfigToMainBranch(`Remove admin ${targetId} via Telegram Admin Bot`);
    } catch (e) {
      console.error(e.message);
    }
    await tgApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: `Администратор ${targetId} удалён.`
    });
    const { text, keyboard } = buildAdminsMenu();
    await editOrSend(text, keyboard);
    return;
  }

  if (data === 'menu:contacts') {
    await setSession(chatId, null);
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    const { text, keyboard } = buildContactsMenu();
    await editOrSend(text, keyboard);
    return;
  }

  if (data.startsWith('contact_edit:')) {
    const field = data.split(':')[1];
    await setSession(chatId, { step: 'await_contact', field });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    const promptText = field === 'telegram'
      ? `✏️ <b>ИЗМЕНЕНИЕ TELEGRAM НА САЙТЕ</b>\nТекущий: ${escapeHtml(config.contacts.telegram)}\n\nОтправьте новый юзернейм (например <code>@CryptoSpace092</code>):`
      : `✏️ <b>ИЗМЕНЕНИЕ НОМЕРА ТЕЛЕФОНА НА САЙТЕ</b>\nТекущий: <code>${escapeHtml(config.contacts.phone)}</code>\n\nОтправьте новый номер телефона (например <code>+380773364200</code>):`;
    await editOrSend(promptText, {
      inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'menu:contacts' }]]
    });
    return;
  }

  if (data === 'menu:settings') {
    await setSession(chatId, null);
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    const { text, keyboard } = buildSettingsMenu();
    await editOrSend(text, keyboard);
    return;
  }

  if (data === 'settings:toggle_exchange') {
    config.settings.exchangeEnabled = !config.settings.exchangeEnabled;
    try {
      await syncConfigToMainBranch(`Toggle exchangeEnabled=${config.settings.exchangeEnabled}`);
    } catch (e) {
      console.error(e.message);
    }
    await tgApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: config.settings.exchangeEnabled ? '🟢 Приём заявок включён!' : '🔴 Включён режим техработ!'
    });
    const { text, keyboard } = buildSettingsMenu();
    await editOrSend(text, keyboard);
    return;
  }

  if (data.startsWith('timer_set:')) {
    const mins = Math.max(1, Math.min(180, parseInt(data.split(':')[1], 10) || 15));
    config.settings.paymentTimerMinutes = mins;
    try {
      await syncConfigToMainBranch(`Set payment timer to ${mins} minutes`);
    } catch (e) {
      console.error(e.message);
    }
    await tgApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: `⏱ Таймер оплаты установлен на ${mins} мин!`
    });
    const { text, keyboard } = buildSettingsMenu();
    await editOrSend(text, keyboard);
    return;
  }

  if (data === 'settings:edit_timer') {
    await setSession(chatId, { step: 'await_timer' });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    await editOrSend(
      `⏱ <b>ВРЕМЯ ТАЙМЕРА ОПЛАТЫ</b>\nТекущее значение: <code>${config.settings.paymentTimerMinutes} мин</code>\n\nОтправьте число минут (от 1 до 120):`,
      { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'menu:settings' }]] }
    );
    return;
  }

  if (data === 'settings:edit_maint') {
    await setSession(chatId, { step: 'await_maint' });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    await editOrSend(
      `💬 <b>ТЕКСТ СООБЩЕНИЯ ПРИ ТЕХРАБОТАХ</b>\nТекущий:\n<i>${escapeHtml(config.settings.maintenanceMessage)}</i>\n\nОтправьте новый текст уведомления:`,
      { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'menu:settings' }]] }
    );
    return;
  }

  if (data === 'menu:orders' || data.startsWith('orders_filter:')) {
    await setSession(chatId, null);
    const filter = data.startsWith('orders_filter:') ? data.split(':')[1] : 'all';
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    const { text, keyboard } = buildOrdersMenu(filter);
    await editOrSend(text, keyboard);
    return;
  }

  if (data.startsWith('order_view:')) {
    const code = data.split(':')[1];
    const ord = orders.find(o => o.code === code);
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    if (!ord) {
      const { text, keyboard } = buildOrdersMenu('all');
      await editOrSend(text, keyboard);
      return;
    }
    const statusMap = {
      new: '🆕 Новая',
      processing: '⏳ В работе',
      done: '✅ Выполнена',
      rejected: '❌ Отклонена'
    };
    const detailText = [
      `📋 <b>КАРТОЧКА ЗАЯВКИ #${escapeHtml(ord.code)}</b>`,
      '━━━━━━━━━━━━━━━━━━━━━━',
      `📌 <b>Статус:</b> ${statusMap[ord.status] || ord.status}`,
      `📤 <b>Отдаёт:</b> <code>${escapeHtml(ord.give)}</code>`,
      `📥 <b>Получает:</b> <code>${escapeHtml(ord.get)}</code>`,
      `🌐 <b>Сеть:</b> <code>${escapeHtml(ord.network)}</code>`,
      ...(ord.address ? [`👛 <b>Кошелёк оплаты:</b>\n<code>${escapeHtml(ord.address)}</code>`] : []),
      ...(ord.card ? [`💳 <b>Карта клиента (UAH):</b>\n<code>${escapeHtml(ord.card)}</code>`] : []),
      `📞 <b>Телефон:</b> <code>${escapeHtml(ord.phone)}</code>`,
      `✈️ <b>Telegram:</b> ${escapeHtml(ord.telegram)}`,
      `🕒 <b>Создана:</b> ${escapeHtml(ord.time)}`
    ].join('\n');

    await editOrSend(detailText, {
      inline_keyboard: [
        [
          { text: '✅ Выполнена', callback_data: `ostatus:${ord.code}:done` },
          { text: '⏳ В работе', callback_data: `ostatus:${ord.code}:processing` },
          { text: '❌ Отклонить', callback_data: `ostatus:${ord.code}:rejected` }
        ],
        [{ text: '⬅️ Назад к заявкам', callback_data: 'menu:orders' }]
      ]
    });
    return;
  }

  if (data === 'orders:search') {
    await setSession(chatId, { step: 'await_order_search' });
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    await editOrSend(
      '🔍 <b>ПОИСК ЗАЯВКИ</b>\n━━━━━━━━━━━━━━━━━━━━━━\nОтправьте номер заявки, номер телефона, карту или @username клиента:',
      { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'menu:orders' }]] }
    );
    return;
  }

  if (data === 'orders:test') {
    const testCode = Math.random().toString(16).slice(2, 10).toUpperCase();
    const uahAmount = (100 * parseFloat(config.rates.uah_per_usd || '44.20')).toFixed(2).replace(/\.00$/, '');
    const nowStr = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kyiv' });
    const sampleOrder = {
      code: testCode,
      give: '100 USDT',
      get: `${uahAmount} UAH`,
      network: 'TRON (TRC20)',
      address: config.wallets['usdt:tron'],
      card: '4441 1144 8822 9012',
      phone: '+380 (77) 336 42 00',
      telegram: '@CryptoSpace092',
      time: nowStr,
      status: 'new'
    };
    await upsertOrder(sampleOrder, 'Create test order');

    await tgApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: `Тестовая заявка #${testCode} создана и сохранена в БД!`
    });

    const msgLines = [
      `🔔 <b>НОВАЯ ЗАЯВКА #${testCode} (ТЕСТ)</b>`,
      '━━━━━━━━━━━━━━━━━━',
      `📤 <b>Отдаёт:</b> <code>${sampleOrder.give}</code>`,
      `📥 <b>Получает:</b> <code>${sampleOrder.get}</code>`,
      `🌐 <b>Сеть:</b> <code>${sampleOrder.network}</code>`,
      `👛 <b>Кошелёк оплаты:</b>\n<code>${sampleOrder.address}</code>`,
      `💳 <b>Карта получателя (UAH):</b>\n<code>${sampleOrder.card}</code>`,
      '━━━━━━━━━━━━━━━━━━',
      `📞 <b>Телефон:</b> <code>${sampleOrder.phone}</code>`,
      `✈️ <b>Telegram:</b> ${sampleOrder.telegram}`,
      `🕒 <b>Время (Киев):</b> ${sampleOrder.time}`
    ];

    await tgApi('sendMessage', {
      chat_id: chatId,
      text: msgLines.join('\n'),
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Выполнена', callback_data: `ostatus:${testCode}:done` },
            { text: '⏳ В работе', callback_data: `ostatus:${testCode}:processing` }
          ],
          [
            { text: '❌ Отклонить', callback_data: `ostatus:${testCode}:rejected` },
            { text: '🖥 В панель', callback_data: 'menu:home' }
          ]
        ]
      }
    });
    return;
  }

  if (data.startsWith('ostatus:')) {
    const [, rawCode, newStatus] = data.split(':');
    const code = rawCode.replace(/^#/, '');
    const parsed = parseOrderFromMessageText(cb.message?.text || '', code);
    await upsertOrder({ ...parsed, code, status: newStatus }, `Update order status to ${newStatus}`);

    const statusBadge = {
      done: '🟢 <b>СТАТУС: ВЫПОЛНЕНА ✅</b>',
      processing: '🟡 <b>СТАТУС: В ОБРАБОТКЕ ⏳</b>',
      rejected: '🔴 <b>СТАТУС: ОТКЛОНЕНА ❌</b>'
    }[newStatus] || newStatus;

    const baseText = String(cb.message?.text || '')
      .replace(/\n\n(?:🟢|🟡|🔴) СТАТУС:[\s\S]*$/i, '');

    const updatedHtml = [
      escapeHtml(baseText),
      '',
      statusBadge,
      `<i>Обновлено и сохранено в БД: ${new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Kyiv' })}</i>`
    ].join('\n');

    await tgApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: `Статус заявки #${code} сохранён в базу!`
    });

    if (chatId && messageId) {
      await tgApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: updatedHtml,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: newStatus === 'done' ? '🔘 Выполнена ✅' : '✅ Выполнена', callback_data: `ostatus:${code}:done` },
              { text: newStatus === 'processing' ? '🔘 В работе ⏳' : '⏳ В работе', callback_data: `ostatus:${code}:processing` }
            ],
            [
              { text: newStatus === 'rejected' ? '🔘 Отклонена ❌' : '❌ Отклонить', callback_data: `ostatus:${code}:rejected` },
              { text: '📦 Все заявки', callback_data: 'menu:orders' }
            ]
          ]
        }
      });
    }
    return;
  }

  if (data === 'menu:stats') {
    await setSession(chatId, null);
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    const { text, keyboard } = buildStatsMenu();
    await editOrSend(text, keyboard);
    return;
  }

  if (data === 'orders:csv') {
    await tgApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: 'Формирую CSV-файл...'
    });
    await sendCsvExport(chatId);
    return;
  }

  if (data === 'orders:clear_confirm') {
    await tgApi('answerCallbackQuery', { callback_query_id: cb.id });
    await editOrSend(
      '⚠️ <b>ОЧИСТКА ИСТОРИИ ЗАЯВОК</b>\nВы уверены, что хотите очистить сохранённый список заявок в постоянной БД?',
      {
        inline_keyboard: [
          [
            { text: '🗑 Да, очистить', callback_data: 'orders:clear_do' },
            { text: '❌ Отмена', callback_data: 'menu:stats' }
          ]
        ]
      }
    );
    return;
  }

  if (data === 'orders:clear_do') {
    orders = [];
    await saveBotStateToGitHub('Clear orders history');
    await tgApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: 'История заявок очищена.'
    });
    const { text, keyboard } = buildStatsMenu();
    await editOrSend(text, keyboard);
    return;
  }

  if (data === 'sync:now') {
    await tgApi('answerCallbackQuery', {
      callback_query_id: cb.id,
      text: 'Синхронизация конфигурации с GitHub Pages и БД...'
    });
    try {
      await syncConfigToMainBranch('Manual sync from Telegram Admin Bot');
      await editOrSend(
        buildDashboardText() + '\n\n✅ <b>Синхронизация с сайтом и постоянной базой успешно выполнена!</b>',
        buildDashboardInline()
      );
    } catch (e) {
      await editOrSend(
        buildDashboardText() + `\n\n⚠️ <b>Ошибка синхронизации:</b> <code>${escapeHtml(e.message)}</code>`,
        buildDashboardInline()
      );
    }
    return;
  }
}

async function handleMessage(msg) {
  const fromId = msg.from?.id;
  if (!isAdmin(fromId)) return; // Strictly ignore any user except 7906546417 and added admins

  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  if (!text) return;

  await ensureReplyKeyboardRemoved(chatId);

  if (text === '/start' || text === '/admin' || text === '/menu') {
    await setSession(chatId, null);
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: buildDashboardText(),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: buildDashboardInline()
    });
    return;
  }

  if (text === '📦 Заявки' || text === '/orders') {
    await setSession(chatId, null);
    const { text: t, keyboard } = buildOrdersMenu('all');
    await tgApi('sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: keyboard });
    return;
  }

  if (text === '💱 Курсы валют' || text === '/rates') {
    await setSession(chatId, null);
    const { text: t, keyboard } = buildRatesMenu();
    await tgApi('sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: keyboard });
    return;
  }

  if (text === '👛 Кошельки' || text === '/wallets') {
    await setSession(chatId, null);
    const { text: t, keyboard } = buildWalletsMenu();
    await tgApi('sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: keyboard });
    return;
  }

  if (text === '👥 Админы' || text === '/admins') {
    await setSession(chatId, null);
    const { text: t, keyboard } = buildAdminsMenu();
    await tgApi('sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: keyboard });
    return;
  }

  if (text === '📞 Контакты' || text === '/contacts') {
    await setSession(chatId, null);
    const { text: t, keyboard } = buildContactsMenu();
    await tgApi('sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: keyboard });
    return;
  }

  if (text === '⚙️ Настройки' || text === '/settings') {
    await setSession(chatId, null);
    const { text: t, keyboard } = buildSettingsMenu();
    await tgApi('sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: keyboard });
    return;
  }

  if (text === '🔄 Сессия 5ч 20м' || text === '/session') {
    await setSession(chatId, null);
    const { text: t, keyboard } = buildSessionMenu();
    await tgApi('sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: keyboard });
    return;
  }

  if (text === '📊 Статистика' || text === '/stats') {
    await setSession(chatId, null);
    const { text: t, keyboard } = buildStatsMenu();
    await tgApi('sendMessage', { chat_id: chatId, text: t, parse_mode: 'HTML', reply_markup: keyboard });
    return;
  }

  const session = sessions.get(String(chatId));
  if (!session) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: buildDashboardText(),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: buildDashboardInline()
    });
    return;
  }

  if (session.step === 'await_rate') {
    const cleanVal = text.replace(',', '.').trim();
    if (!/^\d+(?:\.\d{1,8})?$/.test(cleanVal) || parseFloat(cleanVal) <= 0) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: '⚠️ Введите корректное положительное число (например: <code>44.20</code> или <code>65000</code>).',
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'menu:rates' }]] }
      });
      return;
    }
    const asset = session.asset;
    config.rates[asset] = asset === 'uah_per_usd' && /^\d+\.\d$/.test(cleanVal) ? cleanVal + '0' : cleanVal;
    sessions.delete(String(chatId));
    try {
      await syncConfigToMainBranch(`Set ${asset} rate to ${config.rates[asset]} via Telegram Admin Bot`);
    } catch (e) {
      console.error(e.message);
    }
    const { text: t, keyboard } = buildRatesMenu();
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: `✅ <b>Курс успешно обновлён на сайте и сохранён в БД:</b> <code>${escapeHtml(config.rates[asset])}</code>\n\n` + t,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    return;
  }

  if (session.step === 'await_wallet') {
    const newAddr = text.trim();
    if (newAddr.length < 16 || /\s/.test(newAddr)) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: '⚠️ Введите корректный адрес кошелька без пробелов.',
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'menu:wallets' }]] }
      });
      return;
    }
    const key = session.key;
    config.wallets[key] = newAddr;
    sessions.delete(String(chatId));
    try {
      await syncConfigToMainBranch(`Update wallet ${key} via Telegram Admin Bot`);
    } catch (e) {
      console.error(e.message);
    }
    const { text: t, keyboard } = buildWalletsMenu();
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: `✅ <b>Адрес для ${escapeHtml(WALLET_LABELS[key] || key)} обновлён на сайте и в БД:</b>\n<code>${escapeHtml(newAddr)}</code>\n\n` + t,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    return;
  }

  if (session.step === 'await_admin_add') {
    const parts = text.split(/\s+/);
    const idStr = parts[0];
    const label = parts.slice(1).join(' ') || 'Администратор';
    if (!/^\d{5,15}$/.test(idStr)) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: '⚠️ Введите корректный числовой Telegram ID (например: <code>123456789 Менеджер</code>).',
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'menu:admins' }]] }
      });
      return;
    }
    const newId = Number(idStr);
    if (!config.admins.some(a => Number(a.id) === newId)) {
      config.admins.push({
        id: newId,
        role: 'admin',
        label,
        addedAt: new Date().toISOString()
      });
      try {
        await syncConfigToMainBranch(`Add admin ${newId} (${label}) via Telegram Admin Bot`);
      } catch (e) {
        console.error(e.message);
      }
    }
    sessions.delete(String(chatId));
    const { text: t, keyboard } = buildAdminsMenu();
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: `✅ <b>Администратор <code>${newId}</code> (${escapeHtml(label)}) добавлен в постоянную БД и синхронизирован с сайтом!</b>\n\n` + t,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    return;
  }

  if (session.step === 'await_contact') {
    const field = session.field;
    if (field === 'telegram') {
      const handle = text.startsWith('@') ? text : '@' + text.replace(/^(?:https?:\/\/)?t\.me\//i, '');
      config.contacts.telegram = handle;
    } else {
      config.contacts.phone = text;
    }
    sessions.delete(String(chatId));
    try {
      await syncConfigToMainBranch(`Update contact ${field} via Telegram Admin Bot`);
    } catch (e) {
      console.error(e.message);
    }
    const { text: t, keyboard } = buildContactsMenu();
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: '✅ <b>Контактные данные обновлены на сайте и сохранены в БД!</b>\n\n' + t,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    return;
  }

  if (session.step === 'await_timer') {
    const mins = parseInt(text, 10);
    if (!Number.isFinite(mins) || mins < 1 || mins > 180) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: '⚠️ Введите число минут от 1 до 180.',
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'menu:settings' }]] }
      });
      return;
    }
    config.settings.paymentTimerMinutes = mins;
    sessions.delete(String(chatId));
    try {
      await syncConfigToMainBranch(`Set payment timer to ${mins} minutes`);
    } catch (e) {
      console.error(e.message);
    }
    const { text: t, keyboard } = buildSettingsMenu();
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: `✅ <b>Таймер оплаты установлен на ${mins} минут и сохранён в БД!</b>\n\n` + t,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    return;
  }

  if (session.step === 'await_maint') {
    config.settings.maintenanceMessage = text;
    sessions.delete(String(chatId));
    try {
      await syncConfigToMainBranch('Update maintenance message via Telegram Admin Bot');
    } catch (e) {
      console.error(e.message);
    }
    const { text: t, keyboard } = buildSettingsMenu();
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: '✅ <b>Текст уведомления при техработах обновлён и сохранён в БД!</b>\n\n' + t,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
    return;
  }

  if (session.step === 'await_order_search') {
    await setSession(chatId, null);
    const q = text.toLowerCase().replace(/^#/, '');
    const matches = orders.filter(o =>
      String(o.code || '').toLowerCase().includes(q) ||
      String(o.phone || '').toLowerCase().includes(q) ||
      String(o.telegram || '').toLowerCase().includes(q) ||
      String(o.card || '').toLowerCase().includes(q)
    );
    if (matches.length === 0) {
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `🔍 По запросу <code>${escapeHtml(text)}</code> заявок не найдено.`,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад к заявкам', callback_data: 'menu:orders' }]] }
      });
      return;
    }
    const rows = matches.slice(0, 8).map(o => [
      { text: `#${o.code} | ${o.give} → ${o.get} (${o.status})`, callback_data: `order_view:${o.code}` }
    ]);
    rows.push([{ text: '⬅️ Назад к заявкам', callback_data: 'menu:orders' }]);
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: `🔍 <b>Найдено заявок: ${matches.length}</b>`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows }
    });
  }
}

async function setupBotCommands() {
  await tgApi('setMyCommands', {
    commands: [
      { command: 'start', description: '🖥 Открыть главную админ-панель' },
      { command: 'orders', description: '📦 Список и поиск заявок' },
      { command: 'rates', description: '💱 Управление курсами валют' },
      { command: 'wallets', description: '👛 Реквизиты кошельков и сетей' },
      { command: 'admins', description: '👥 Управление администраторами' },
      { command: 'contacts', description: '📞 Контакты поддержки на сайте' },
      { command: 'settings', description: '⚙️ Настройки сайта и таймера' },
      { command: 'session', description: '🔄 Статус сессии 5ч 20м и БД' },
      { command: 'stats', description: '📊 Статистика и выгрузка CSV' }
    ]
  });
}

async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}: saving persistent bot state to ${STATE_BRANCH}/${STATE_FILE}...`);
  await saveBotStateToGitHub(`Session #${sessionStats.sessionNumber} shutdown (${signal})`);
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function main() {
  await loadBotStateFromGitHub();
  await saveBotStateToGitHub(`Start Session #${sessionStats.sessionNumber} (5h 20m cycle)`);
  await setupBotCommands();
  for (const adm of config.admins) {
    if (adm && adm.id) {
      await ensureReplyKeyboardRemoved(adm.id);
    }
  }
  try {
    await tgApi('deleteWebhook', { drop_pending_updates: false });
  } catch (e) {}

  console.log(`CryptoSpace Admin Bot running — Session #${sessionStats.sessionNumber}, auto-restart in ${CYCLE_MINUTES} min (5h 20m).`);

  let lastQueueCheck = 0;
  let lastOffsetCheckpoint = Date.now();

  while (!shuttingDown) {
    // Check 5 hours 20 minutes (320 min) rotation timer
    if (Date.now() >= plannedRestartTime) {
      console.log(`Reached 5h 20m (${CYCLE_MINUTES} min) session limit. Flushing state and rotating session...`);
      shuttingDown = true;
      await saveBotStateToGitHub(`Session #${sessionStats.sessionNumber} completed 5h 20m cycle`);
      break;
    }

    // Periodically ingest website orders from the 'eo' queue
    if (Date.now() - lastQueueCheck > 5000) {
      lastQueueCheck = Date.now();
      await consumeWebsiteOrderQueue();
    }

    // Periodically checkpoint Telegram offset if changed
    if (offsetDirty && Date.now() - lastOffsetCheckpoint > 45000) {
      lastOffsetCheckpoint = Date.now();
      await saveBotStateToGitHub(`Checkpoint offset ${offset}`);
    }

    try {
      const remainingSec = Math.max(1, Math.min(20, Math.floor((plannedRestartTime - Date.now()) / 1000)));
      const res = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=${remainingSec}`,
        { signal: AbortSignal.timeout((remainingSec + 12) * 1000) }
      );
      const data = await res.json();
      if (!data.ok && data.error_code === 409) {
        if (String(data.description || '').toLowerCase().includes('webhook')) {
          console.warn('Webhook detected during polling — auto-deleting webhook...');
          await tgApi('deleteWebhook', { drop_pending_updates: false });
          continue;
        }
      }
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          offsetDirty = true;
          if (update.message) {
            await handleMessage(update.message);
          } else if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
          }
        }
      }
    } catch (e) {
      console.error('Polling error:', e.message);
      try { await tgApi('deleteWebhook', { drop_pending_updates: false }); } catch {}
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('Session loop finished cleanly.');
}

main();
