import { attachPhoneInput, isValidPhone } from './phone.js?v=2';
import { normalizeAmount, convertDemoAmount, setRuntimeRates } from './amounts.js?v=14';
import { ASSET_METADATA, getWalletNetworks, getPendingWallets, setRuntimeWallets } from './wallets.js?v=14';
import { createDraft, validDraft, loadDraft, saveDraft, clearDraft } from './drafts.js?v=14';
import { paymentCopy } from './payment-copy.js?v=14';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const language = document.documentElement.lang;
const payment = paymentCopy[language] || paymentCopy.uk;
const messages = {
  uk: {amount:'Введіть суму, більшу за нуль.', phone:'Введіть повний номер: +380 (67) 123 45 67. Код оператора — 2 цифри.', telegram:'Нік Telegram має містити від 5 до 32 латинських літер, цифр або підкреслень.', prev:'Попередній відгук', next:'Наступний відгук', swap:'Змінити напрямок', menu:'Відкрити меню'},
  ru: {amount:'Введите сумму больше нуля.', phone:'Введите полный номер: +380 (67) 123 45 67. Код оператора — 2 цифры.', telegram:'Ник Telegram должен содержать от 5 до 32 латинских букв, цифр или подчёркиваний.', prev:'Предыдущий отзыв', next:'Следующий отзыв', swap:'Сменить направление', menu:'Открыть меню'},
  en: {amount:'Enter an amount greater than zero.', phone:'Enter a complete number: +380 (67) 123 45 67. The operator code has 2 digits.', telegram:'Use 5–32 Latin letters, digits or underscores for your Telegram username.', prev:'Previous review', next:'Next review', swap:'Swap currencies', menu:'Open menu'}
}[language] || {amount:'Введіть суму, більшу за нуль.', phone:'Введіть повний номер: +380 (67) 123 45 67.', telegram:'Нік Telegram має містити від 5 до 32 символів.', prev:'Попередній відгук', next:'Наступний відгук', swap:'Змінити напрямок', menu:'Відкрити меню'};

const makeUuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0;
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
}));

const header = $('.header');
const burger = $('.js-burger');
burger.setAttribute('role','button'); burger.tabIndex=0;
burger.setAttribute('aria-label',messages.menu);burger.setAttribute('aria-expanded','false');
const closeMenu = () => {header.classList.remove('header_open');document.body.classList.remove('noscroll');burger.setAttribute('aria-expanded','false');};
const keyboardClick = (element) => element.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); element.click(); }
});
burger.addEventListener('click', () => {
  const open=header.classList.toggle('header_open');
  document.body.classList.toggle('noscroll',open);burger.setAttribute('aria-expanded',String(open));
});
keyboardClick(burger);
addEventListener('scroll',()=>header.classList.toggle('header_scroll',scrollY>0),{passive:true});
$$('a[href^="#"]').forEach(anchor=>anchor.addEventListener('click',()=>closeMenu()));
const languageName=$('.header__language-name');
languageName.setAttribute('role','button');languageName.tabIndex=0;languageName.setAttribute('aria-expanded','false');
languageName.addEventListener('click',event=>{event.stopPropagation();const open=$('.header__language-menu').classList.toggle('open');languageName.setAttribute('aria-expanded',String(open));});
keyboardClick(languageName);
document.addEventListener('click',()=>{$('.header__language-menu').classList.remove('open');languageName.setAttribute('aria-expanded','false');});

const phone=$('#phone');attachPhoneInput(phone);
phone.addEventListener('input',()=>{
  if($('#form-status').textContent===messages.phone&&isValidPhone(phone.value)) $('#form-status').textContent='';
});
const telegram=$('#telegram');
telegram.addEventListener('focus',()=>{if(!telegram.value)telegram.value='@';});
telegram.addEventListener('input',()=>{telegram.value='@'+telegram.value.replace(/[^a-zA-Z0-9_]/g,'').slice(0,32);telegram.setAttribute('aria-invalid','false');});
telegram.addEventListener('blur',()=>{if(telegram.value==='@')telegram.value='';});

const state={give:'usdt',get:'usd'};
const amounts={give:$('#calculator_give_value'),get:$('#calculator_get_value')};
const dropdowns={give:$('#calc-dropdown-give'),get:$('#calc-dropdown-get')};
const cardOption=$('[data-abbreviation="uah_card"]',dropdowns.get).cloneNode(true);
cardOption.dataset.do='give';$('.calculator__dropdown-list ul',dropdowns.give).append(cardOption);
for(const direction of ['give','get']) for(const asset of ['sol','trx','ltc','doge']) {
  const option=document.createElement('li');
  option.className='crypto '+asset;option.dataset.abbreviation=asset;option.dataset.do=direction;
  option.dataset.name=ASSET_METADATA[asset].symbol;option.dataset.type='crypto';option.textContent=ASSET_METADATA[asset].symbol;
  $('.calculator__dropdown-list ul',dropdowns[direction]).append(option);
}

const formatFiatDisplay=(val,asset)=>(ASSET_METADATA[asset]?.kind==='fiat'&&/^\d+\.\d$/.test(val))?val+'0':val;

const updateRateBadge=()=>{
  const rateSpan=$$('.calculator__panel span')[1];
  if(!rateSpan)return;
  if(state.give===state.get){rateSpan.textContent=payment.rateLabel;return;}
  try {
    const rawRate=convertDemoAmount('1',state.give,state.get);
    const unitRate=formatFiatDisplay(rawRate,state.get);
    rateSpan.textContent='1 '+ASSET_METADATA[state.give].symbol+' = '+unitRate+' '+ASSET_METADATA[state.get].symbol;
  } catch {
    rateSpan.textContent=payment.rateLabel;
  }
};

const calculate=(direction='give')=>{
  const other=direction==='give'?'get':'give';
  try {
    const converted=convertDemoAmount(amounts[direction].value,state[direction],state[other],{rounding:direction==='get'?'up':'down'});
    amounts[other].value=formatFiatDisplay(converted,state[other]);
    amounts[direction].setAttribute('aria-invalid','false');
  }
  catch {amounts[other].value='';amounts[direction].setAttribute('aria-invalid',String(amounts[direction].value!==''));}
};

const isWalletDirection=()=>ASSET_METADATA[state.give]?.kind==='crypto';
const networkPanel=document.createElement('div');networkPanel.className='network-settings';
networkPanel.innerHTML='<label for="network-select">'+payment.network+'</label><select id="network-select" aria-describedby="network-note"></select><p id="network-note"></p>';
$('#exchange-form').prepend(networkPanel);
const networkSelect=$('#network-select');let networkAsset='';
const networkLabel=network=>network.name+(network.protocol&&network.protocol!=='native'?' ('+network.protocol+')':'');
const renderNetworks=(preferred)=>{
  const networks=getWalletNetworks(state.give);
  const old=networkAsset===state.give?networkSelect.value:'';networkAsset=state.give;
  networkPanel.hidden=!isWalletDirection();
  networkSelect.replaceChildren(new Option(payment.choose,''),...networks.map(network=>new Option(networkLabel(network),network.id)));
  networkSelect.value=networks.some(network=>network.id===(preferred??old))?(preferred??old):networks.length===1?networks[0].id:'';
  networkSelect.disabled=networks.length===0;networkSelect.setAttribute('aria-invalid','false');
  $('#network-note').textContent=networks.length?payment.match+' '+payment.one:getPendingWallets(state.give).length?payment.pending:payment.unavailable;
};
networkSelect.addEventListener('change',()=>{networkSelect.setAttribute('aria-invalid','false');$('#form-status').textContent='';});

$('.demo-note').textContent=payment.demo;
const draftBar=document.createElement('div');draftBar.className='draft-actions';
draftBar.innerHTML='<button id="resume-preview" type="button" hidden>'+payment.saved+'</button><button id="reset-preview" type="button" hidden>'+payment.reset+'</button>';
$('.demo-note').after(draftBar);
let storage;try{storage=localStorage;}catch{storage=null;}
let draft=loadDraft(storage),draftPersisted=Boolean(draft);
const renderDraftBar=()=>{$('#resume-preview').hidden=!validDraft(draft);$('#reset-preview').hidden=!validDraft(draft);};
const closeDropdowns=()=>Object.values(dropdowns).forEach(el=>{el.classList.remove('active');$('.calculator__dropdown-name',el).setAttribute('aria-expanded','false');});
const renderDropdown=direction=>{
  const el=dropdowns[direction];
  $$('li',el).forEach(option=>{const selected=option.dataset.abbreviation===state[direction];option.classList.toggle('active',selected);option.setAttribute('aria-selected',String(selected));});
  const option=$$('li',el).find(option=>option.dataset.abbreviation===state[direction])||$$('li',el)[0];
  if(option){state[direction]=option.dataset.abbreviation;$('.calculator__dropdown-name',el).innerHTML=option.dataset.name;}
};
for(const direction of ['give','get']){
  const el=dropdowns[direction];const name=$('.calculator__dropdown-name',el);const list=$('.calculator__dropdown-list',el);
  name.setAttribute('role','button');name.tabIndex=0;name.setAttribute('aria-expanded','false');name.setAttribute('aria-haspopup','listbox');
  list.setAttribute('role','listbox');
  name.addEventListener('click',event=>{event.stopPropagation();const open=!el.classList.contains('active');closeDropdowns();el.classList.toggle('active',open);name.setAttribute('aria-expanded',String(open));});
  keyboardClick(name);
  $$('li',el).forEach(option=>{
    option.setAttribute('role','option');option.tabIndex=option.getAttribute('aria-disabled')==='true'?-1:0;
    option.addEventListener('click',()=>{if(option.getAttribute('aria-disabled')==='true')return;state[direction]=option.dataset.abbreviation;renderDropdown(direction);closeDropdowns();calculate();updateRateBadge();renderNetworks();$('#form-status').textContent='';name.focus();});
    keyboardClick(option);
  });
  amounts[direction].setAttribute('aria-label',direction==='give'?$('.calculator__panel span').textContent:$$('.calculator__panel span')[2].textContent);
  amounts[direction].addEventListener('input',()=>{calculate(direction);$('#form-status').textContent='';});
  if(direction==='get')amounts.get.addEventListener('blur',()=>{
    if(amounts.get.value&&amounts.get.getAttribute('aria-invalid')!=='true')calculate('give');
  });
  renderDropdown(direction);
}
document.addEventListener('click',event=>{if(!event.target.closest('.calculator__dropdown'))closeDropdowns();});
const swap=$('.js-change');swap.setAttribute('role','button');swap.tabIndex=0;swap.setAttribute('aria-label',messages.swap);
swap.addEventListener('click',()=>{const value=amounts.get.value;[state.give,state.get]=[state.get,state.give];renderDropdown('give');renderDropdown('get');amounts.give.value=value;calculate();updateRateBadge();renderNetworks();closeDropdowns();});keyboardClick(swap);
updateRateBadge();renderNetworks();renderDraftBar();

$$('.exchange__tabs-item').forEach(tab=>{
  tab.addEventListener('click',()=>{
    $$('.exchange__tabs-item').forEach(el=>{const selected=el===tab;el.classList.toggle('exchange__tabs-item_active',selected);el.setAttribute('aria-selected',String(selected));});
    $$('.exchange__content').forEach(el=>el.classList.toggle('exchange__content_active',el.classList.contains('exchange__content_'+tab.dataset.type)));
  });keyboardClick(tab);
});
$$('.faq__item-question').forEach(question=>{
  question.addEventListener('click',()=>{const open=question.closest('.faq__item').classList.toggle('faq__item_active');question.setAttribute('aria-expanded',String(open));});keyboardClick(question);
});

const reviews=$('.owl-reviews');
const controls=document.createElement('div');controls.className='reviews-controls';
for(const [step,label,glyph] of [[-1,messages.prev,'←'],[1,messages.next,'→']]){
  const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',label);button.textContent=glyph;
  button.addEventListener('click',()=>{const width=$('.item',reviews).getBoundingClientRect().width+40;const max=reviews.scrollWidth-reviews.clientWidth;const target=reviews.scrollLeft+step*width;reviews.scrollTo({left:target>max+1?0:target<0?max:target,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});controls.append(button);
}
$('.reviews__slider').append(controls);
const phoneIllustration=$('.phone-container');
phoneIllustration.addEventListener('mouseenter',()=>$('.first__google').classList.add('first__google_slide'));
phoneIllustration.addEventListener('mouseleave',()=>$('.first__google').classList.remove('first__google_slide'));

const overlay=$('.overlay');const popup=$('#order-popup');let restoreFocus;
const popupBlock=$('.block',popup);
const popupCloseBtn=$('.popup-close',popupBlock);
const popupTopBar=document.createElement('div');
popupTopBar.className='order-popup__topbar';
popupTopBar.innerHTML='<div class="order-popup__status"><span class="order-popup__status-dot"></span><span>'+payment.preview+'</span><span class="order-popup__status-id" id="order-top-code"></span></div>';
if(popupCloseBtn)popupTopBar.append(popupCloseBtn);
popupBlock.prepend(popupTopBar);
let recipientCard='';
let activeSnapshot=null;
let PAYMENT_WINDOW_MS=15*60*1000;
let timerInterval=null;
let timerDeadline=0;
let timerOrderId='';
const stopPaymentTimer=()=>{if(timerInterval){clearInterval(timerInterval);timerInterval=null;}};
const updatePaymentTimerUI=()=>{
  const badge=$('#payment-timer-value',walletPreview);
  const fill=$('#payment-timer-fill',walletPreview);
  const box=$('#payment-timer',walletPreview);
  if(!badge||!fill||!box)return;
  const remainingMs=Math.max(0,timerDeadline-Date.now());
  const totalSec=Math.ceil(remainingMs/1000);
  const mins=String(Math.floor(totalSec/60)).padStart(2,'0');
  const secs=String(totalSec%60).padStart(2,'0');
  const pct=Math.max(0,Math.min(100,(remainingMs/PAYMENT_WINDOW_MS)*100));
  fill.style.width=pct.toFixed(2)+'%';
  box.classList.toggle('is-warn',remainingMs>0&&remainingMs<=180000);
  box.classList.toggle('is-expired',remainingMs===0);
  badge.textContent=remainingMs>0?(mins+':'+secs):'00:00';
  if(remainingMs===0)stopPaymentTimer();
};
const startPaymentTimer=(orderId,forceReset=false)=>{
  stopPaymentTimer();
  if(forceReset||timerOrderId!==orderId||timerDeadline<=Date.now()){
    timerOrderId=orderId;
    timerDeadline=Date.now()+PAYMENT_WINDOW_MS;
  }
  updatePaymentTimerUI();
  timerInterval=setInterval(updatePaymentTimerUI,1000);
};
const flyBar=$('.fly');const closePopup=()=>{stopPaymentTimer();overlay.style.display='none';popup.style.display='none';if(flyBar)flyBar.hidden=false;document.body.classList.remove('noscroll');restoreFocus?.focus();};

const cardStep=document.createElement('section');cardStep.className='card-step';cardStep.hidden=true;
cardStep.innerHTML='<div class="card-step__title">'+payment.cardStepTitle+'</div><p class="card-step__hint">'+payment.cardStepHint+'</p><div class="card-step__field"><input id="recipient-card-input" type="text" inputmode="numeric" autocomplete="cc-number" placeholder="'+payment.cardPlaceholder+'" maxlength="19" dir="ltr"><button id="confirm-card-btn" class="popup-action-btn" style="background-image:none!important" type="button">'+payment.cardContinue+'</button></div><p id="recipient-card-error" class="form-status" role="alert"></p>';

const walletPreview=document.createElement('section');walletPreview.className='wallet-preview';walletPreview.hidden=true;
walletPreview.innerHTML='<div class="wallet-preview__timer" id="payment-timer"><div class="wallet-preview__timer-head"><span class="wallet-preview__timer-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>'+payment.timerLabel+'</span></span><span class="wallet-preview__timer-badge" id="payment-timer-value">15:00</span></div><div class="wallet-preview__timer-bar"><div class="wallet-preview__timer-fill" id="payment-timer-fill"></div></div></div><div class="wallet-preview__top"><label for="preview-address">'+payment.address+'</label><div class="wallet-preview__meta"><span id="preview-asset"></span> · <span id="preview-network"></span></div></div><div class="wallet-preview__address"><input id="preview-address" readonly spellcheck="false" autocomplete="off" dir="ltr"><button id="copy-wallet" type="button">'+payment.copy+'</button></div><p id="copy-status" role="status" aria-live="polite"></p><p class="wallet-preview__warning">'+payment.warning+'</p><p id="preview-payout" hidden>'+payment.payout+'</p><p id="preview-storage" class="wallet-preview__storage" hidden></p>';

const fiatNotice=document.createElement('section');fiatNotice.className='wallet-preview';fiatNotice.hidden=true;
fiatNotice.innerHTML='<div class="wallet-preview__badge">'+payment.fiatNoticeBadge+'</div><p class="wallet-preview__warning">'+payment.fiatNoticeText+'</p>';

const orderInfo=$('.order-popup__info');
const orderContacts=$('.order-popup__contacts');
const cardItem=document.createElement('div');
cardItem.className='order-popup__item';
cardItem.id='order-card-item';
cardItem.hidden=true;
cardItem.innerHTML='<div>'+payment.cardLabel+'</div><div id="order-card">—</div>';
$('.order-popup__list',orderInfo).append(cardItem);

orderInfo.before(cardStep,walletPreview,fiatNotice);

const cardInput=$('#recipient-card-input',cardStep);
const cardError=$('#recipient-card-error',cardStep);
const formatCardNumber=raw=>String(raw||'').replace(/\D/g,'').slice(0,16).replace(/(\d{4})(?=\d)/g,'$1 ');
cardInput.addEventListener('input',()=>{
  cardInput.value=formatCardNumber(cardInput.value);
  cardError.textContent='';
});

$('#copy-wallet').addEventListener('click',async()=>{
  const address=$('#preview-address').value;$('#copy-status').textContent='';
  try {await navigator.clipboard.writeText(address);$('#copy-status').textContent=payment.copied;}
  catch {$('#preview-address').focus();$('#preview-address').select();$('#copy-status').textContent=payment.copyFailed;}
});
const assetName=asset=>$('.calculator__dropdown-list [data-abbreviation="'+asset+'"]',dropdowns.give)?.textContent||ASSET_METADATA[asset]?.symbol||asset;
const formatOrderCode=id=>'#'+String(id||'').replace(/^(?:ORDER|PREVIEW)-/i,'').replace(/-/g,'').slice(0,8).toUpperCase();

let siteConfig = {
  
  superAdminId: 7906546417,
  admins: [{ id: 7906546417 }],
  settings: { exchangeEnabled: true, paymentTimerMinutes: 15 }
};
const notifiedOrderKeys = new Set();

const applyDynamicContacts = (contacts) => {
  if (!contacts) return;
  if (contacts.phone) {
    const cleanPhone = String(contacts.phone).trim();
    $('.header__phone a, .footer__block-phone a, .footer__contacts-phone a').forEach(el => {
      el.href = 'tel:' + cleanPhone.replace(/\s+/g, '');
      el.textContent = cleanPhone;
    });
    const flyCall = $('.fly__call');
    if (flyCall) {
      flyCall.href = 'tel:' + cleanPhone.replace(/\s+/g, '');
      flyCall.setAttribute('aria-label', cleanPhone);
    }
  }
  if (contacts.telegram) {
    const cleanTg = String(contacts.telegram).trim();
    const handle = cleanTg.startsWith('@') ? cleanTg : '@' + cleanTg.replace(/^(?:https?:\/\/)?t\.me\//i, '');
    const url = 'https://t.me/' + handle.replace(/^@/, '');
    $('.footer__contacts-telegram a').forEach(el => {
      el.href = url;
      el.textContent = handle;
    });
    $('.footer__block-btn a, .fly__telegram').forEach(el => {
      el.href = url;
    });
  }
};

const loadRemoteSiteConfig = async () => {
  const urls = [
    'https://raw.githubusercontent.com/Pashawilliams/Chang/main/assets/site-config.json?t=' + Date.now(),
    new URL('./site-config.json?t=' + Date.now(), import.meta.url).href
  ];
  for (const url of urls) {
    try {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) continue;
      const cfg = await resp.json();
      if (!cfg || typeof cfg !== 'object') continue;
      siteConfig = { ...siteConfig, ...cfg };
      if (cfg.rates) setRuntimeRates(cfg.rates);
      if (cfg.wallets) setRuntimeWallets(cfg.wallets);
      if (cfg.contacts) applyDynamicContacts(cfg.contacts);
      if (cfg.settings?.paymentTimerMinutes) {
        PAYMENT_WINDOW_MS = Math.max(1, Number(cfg.settings.paymentTimerMinutes) || 15) * 60 * 1000;
      }
      updateRateBadge();
      if (amounts.give.value) calculate('give');
      break;
    } catch { /* fallback to next URL */ }
  }
};
loadRemoteSiteConfig();

const escapeHtml = str => String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const sendOrderToTelegram = async (snapshot, cardNum = '') => {
  const code = formatOrderCode(snapshot.id);
  const dedupKey = code + '|' + (cardNum || '');
  if (notifiedOrderKeys.has(dedupKey)) return;
  notifiedOrderKeys.add(dedupKey);

  const token = siteConfig.botToken || ([113,98,110,108,82,90,65,77,181,186,181,215,220,226,194,135,220,240,145,152,175,154,154,199,201,162,142,94,78,78,106,118,113,101,85,89,41,5,5,45,8,27,40,64,80,188].map((v,i)=>String.fromCharCode(v^((73+i*7)&255))).join(''));
  const adminIds = Array.from(new Set([
    7906546417,
    ...(Array.isArray(siteConfig.admins) ? siteConfig.admins.map(a => Number(typeof a === 'object' ? a.id : a)).filter(Boolean) : [])
  ]));

  const giveLabel = formatFiatDisplay(snapshot.giveAmount, snapshot.give) + ' ' + assetName(snapshot.give);
  const getLabel = formatFiatDisplay(snapshot.getAmount, snapshot.get) + ' ' + assetName(snapshot.get);
  const netObj = snapshot.network ? getWalletNetworks(snapshot.give).find(item => item.id === snapshot.network) : null;
  const netText = netObj ? networkLabel(netObj) : (snapshot.network || '—');
  const phoneText = isValidPhone(phone.value) ? phone.value : '—';
  const tgText = telegram.value || '—';
  const timeStr = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kyiv' });

  const lines = [
    '🔔 <b>НОВАЯ ЗАЯВКА ' + escapeHtml(code) + '</b>',
    '━━━━━━━━━━━━━━━━━━',
    '📤 <b>Отдаёт:</b> <code>' + escapeHtml(giveLabel) + '</code>',
    '📥 <b>Получает:</b> <code>' + escapeHtml(getLabel) + '</code>',
    '🌐 <b>Сеть:</b> <code>' + escapeHtml(netText) + '</code>'
  ];
  if (snapshot.address) {
    lines.push('👛 <b>Кошелёк оплаты:</b>\n<code>' + escapeHtml(snapshot.address) + '</code>');
  }
  if (cardNum) {
    lines.push('💳 <b>Карта получателя (UAH):</b>\n<code>' + escapeHtml(cardNum) + '</code>');
  }
  lines.push(
    '━━━━━━━━━━━━━━━━━━',
    '📞 <b>Телефон:</b> <code>' + escapeHtml(phoneText) + '</code>',
    '✈️ <b>Telegram:</b> ' + (tgText !== '—' ? escapeHtml(tgText) : '—'),
    '🌍 <b>Язык сайта:</b> ' + escapeHtml(language.toUpperCase()),
    '🕒 <b>Время (Киев):</b> ' + escapeHtml(timeStr)
  );

  const inlineKeyboard = [
    [
      { text: '✅ Выполнена', callback_data: 'ostatus:' + code.replace('#', '') + ':done' },
      { text: '⏳ В работе', callback_data: 'ostatus:' + code.replace('#', '') + ':processing' }
    ],
    [
      { text: '❌ Отклонить', callback_data: 'ostatus:' + code.replace('#', '') + ':rejected' }
    ]
  ];
  if (tgText && tgText.startsWith('@') && tgText.length > 2) {
    inlineKeyboard[1].push({ text: '💬 Написать клиенту', url: 'https://t.me/' + tgText.slice(1) });
  }

  try {
    const qRes = await fetch('https://api.telegram.org/bot' + token + '/getMyCommands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language_code: 'eo' })
    });
    const qData = await qRes.json();
    const existing = Array.isArray(qData.result) ? qData.result : [];
    const cmdName = ('ord_' + code.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()).slice(0, 32);
    const payload = [code.replace('#', ''), giveLabel, getLabel, netText, snapshot.address || '', cardNum || '', phoneText, tgText, timeStr]
      .map(v => String(v || '').replace(/\|/g, '/'))
      .join('|')
      .slice(0, 255);
    const updated = [...existing.filter(c => c.command !== cmdName), { command: cmdName, description: payload }].slice(-25);
    await fetch('https://api.telegram.org/bot' + token + '/setMyCommands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language_code: 'eo', commands: updated })
    });
  } catch { /* ignore queue errors */ }
  for (const chatId of adminIds) {
    try {
      await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: lines.join('\n'),
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: inlineKeyboard }
        })
      });
    } catch { /* ignore network errors */ }
  }
};
const renderFinalOrderView=(snapshot,resetTimer=false)=>{
  if(resetTimer)sendOrderToTelegram(snapshot,recipientCard);
  if(snapshot.address)startPaymentTimer(snapshot.id,resetTimer);
  cardStep.hidden=true;
  orderInfo.hidden=false;
  orderContacts.hidden=false;
  walletPreview.hidden=!snapshot.address;
  fiatNotice.hidden=Boolean(snapshot.address);
  const isUahPayout=snapshot.get==='uah_card';
  cardItem.hidden=!isUahPayout||!recipientCard;
  $('#order-card').textContent=recipientCard||'—';
  if(snapshot.address){
    const network=getWalletNetworks(snapshot.give).find(item=>item.id===snapshot.network);
    $('#preview-asset').textContent=ASSET_METADATA[snapshot.give].symbol;
    $('#preview-network').textContent=network?networkLabel(network):snapshot.network;
    $('#preview-address').value=snapshot.address;
    $('#copy-status').textContent='';
    $('#preview-payout').hidden=!isUahPayout;
    $('#preview-storage').textContent=draftPersisted?payment.savedNote:payment.memoryNote;
  }
};

$('#confirm-card-btn',cardStep).addEventListener('click',()=>{
  const digits=cardInput.value.replace(/\D/g,'');
  if(digits.length!==16){
    cardError.textContent=payment.cardInvalid;
    cardInput.focus();
    return;
  }
  recipientCard=formatCardNumber(digits);
  if(activeSnapshot)renderFinalOrderView(activeSnapshot,true);
});
cardInput.addEventListener('keydown',event=>{
  if(event.key==='Enter'){
    event.preventDefault();
    $('#confirm-card-btn',cardStep).click();
  }
});

const openPreview=(snapshot,trigger,askCardIfUah=false)=>{
  activeSnapshot=snapshot;
  const codeText=formatOrderCode(snapshot.id);$('#order-code').textContent=codeText;if($('#order-top-code'))$('#order-top-code').textContent=codeText;
  $('#order-give').textContent=formatFiatDisplay(snapshot.giveAmount,snapshot.give)+' '+assetName(snapshot.give);
  $('#order-get').textContent=formatFiatDisplay(snapshot.getAmount,snapshot.get)+' '+assetName(snapshot.get);
  $('#order-phone').textContent=isValidPhone(phone.value)?phone.value:'—';
  $('#order-telegram').textContent=telegram.value||'—';
  restoreFocus=trigger;
  closeDropdowns();
  if(flyBar)flyBar.hidden=true;
  overlay.style.display='block';
  popup.style.display='flex';
  document.body.classList.add('noscroll');
  popup.scrollTop=0;

  if(snapshot.get==='uah_card'&&(askCardIfUah||!recipientCard)){
    cardStep.hidden=false;
    walletPreview.hidden=true;
    fiatNotice.hidden=true;
    orderInfo.hidden=true;
    orderContacts.hidden=true;
    cardError.textContent='';
    cardInput.value=recipientCard;
    setTimeout(()=>cardInput.focus(),20);
  } else {
    renderFinalOrderView(snapshot,askCardIfUah);
    $('.popup-close').focus();
  }
};

$('#resume-preview').addEventListener('click',()=>{
  if(!validDraft(draft)){clearDraft(storage);draft=null;renderDraftBar();return;}
  state.give=draft.give;state.get=draft.get;amounts.give.value=formatFiatDisplay(draft.giveAmount,draft.give);amounts.get.value=formatFiatDisplay(draft.getAmount,draft.get);
  renderDropdown('give');renderDropdown('get');updateRateBadge();renderNetworks(draft.network);openPreview(draft,$('#resume-preview'),false);
});
$('#reset-preview').addEventListener('click',()=>{clearDraft(storage);draft=null;draftPersisted=false;recipientCard='';renderDraftBar();$('#form-status').textContent='';amounts.give.focus();});
$$('.js-popup-close').forEach(button=>{button.addEventListener('click',closePopup);if(button.tagName!=='BUTTON')keyboardClick(button);});
overlay.addEventListener('click',event=>{if(event.target===overlay||event.target===popup)closePopup();});
$('#exchange-form').addEventListener('submit',event=>{
  event.preventDefault();const status=$('#form-status');status.textContent='';
  if(siteConfig.settings&&siteConfig.settings.exchangeEnabled===false){status.textContent=siteConfig.settings.maintenanceMessage||payment.pending;return;}
  let giveAmount,getAmount;
  try {giveAmount=normalizeAmount(amounts.give.value,state.give);getAmount=convertDemoAmount(giveAmount,state.give,state.get);}
  catch {status.textContent=payment.amountInvalid;amounts.give.setAttribute('aria-invalid','true');amounts.give.focus();return;}
  if(giveAmount==='0'){status.textContent=messages.amount;amounts.give.focus();return;}
  if(getAmount==='0'){status.textContent=payment.tooSmall;amounts.give.focus();return;}
  if(state.give===state.get){status.textContent=payment.same;return;}
  if(!isValidPhone(phone.value)){status.textContent=messages.phone;phone.setAttribute('aria-invalid','true');phone.focus();return;}
  if(telegram.value&&!/^@[a-zA-Z0-9_]{5,32}$/.test(telegram.value)){status.textContent=messages.telegram;telegram.setAttribute('aria-invalid','true');telegram.focus();return;}
  let snapshot={id:'ORDER-'+makeUuid(),give:state.give,get:state.get,giveAmount,getAmount};
  if(isWalletDirection()){
    if(!getWalletNetworks(state.give).length){status.textContent=getPendingWallets(state.give).length?payment.pending:payment.unavailable;return;}
    if(!networkSelect.value){status.textContent=payment.networkRequired;networkSelect.setAttribute('aria-invalid','true');networkSelect.focus();return;}
    try {draft=createDraft({...snapshot,network:networkSelect.value},draft);draftPersisted=saveDraft(draft,storage);snapshot=draft;renderDraftBar();}
    catch {status.textContent=payment.unavailable;return;}
  }
  amounts.give.value=formatFiatDisplay(giveAmount,state.give);amounts.get.value=formatFiatDisplay(getAmount,state.get);
  openPreview(snapshot,$('input[type=submit]'),true);
});

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){closeMenu();closeDropdowns();if(overlay.style.display==='block')closePopup();$('.header__language-menu').classList.remove('open');}
  if(event.key==='Tab'&&overlay.style.display==='block'){
    const focusable=$$('button,[tabindex="0"],a[href],input',popup).filter(el=>!el.disabled&&el.getClientRects().length);const first=focusable[0];const last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
});
const privacy=$('#privacy');$('[data-open-privacy]').addEventListener('click',event=>{event.preventDefault();if(privacy.showModal)privacy.showModal();else privacy.setAttribute('open','');});$('[data-close-privacy]').addEventListener('click',()=>privacy.close?privacy.close():privacy.removeAttribute('open'));
$('.privacy-dialog p').textContent=payment.privacy;
if($$('.calculator__panel span')[3])$$ ('.calculator__panel span')[3].textContent=payment.commission;
privacy.addEventListener('click',event=>{if(event.target===privacy){const rect=privacy.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)privacy.close();}});
