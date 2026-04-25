import { t, getLang, setLang, langs, onLangChange } from './i18n.js';
import * as R from './router.js';
import { registerPages } from './pages.js';
import { registerTrading } from './trading.js';
import { registerAccount } from './account.js';
import { registerAuth } from './auth-view.js';
import { registerAdmin } from './admin.js';

// 跨页共享的实时行情状态（全站单连 WS）
export const live = {
  ticker: {}, symbols: [],
  listeners: new Set(),
  ws: null,
};

// 公开功能开关（由管理员在后台 /api/settings 下发）
// 任一读取失败都当作「开启」，避免后台临时不可用时前台功能误关。
export const features = { finance: true, loan: true };

async function loadFeatures() {
  try {
    const cfg = await R.api('/api/settings', { auth: false });
    features.finance = (cfg && cfg.feature_finance) !== '0';
    features.loan    = (cfg && cfg.feature_loan)    !== '0';
  } catch (_) { /* 静默失败，保留默认开启 */ }
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  live.ws = ws;
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'snapshot') live.ticker = msg.data;
    else if (msg.type === 'ticks') {
      // 合并而非替换 — 薄 tick（price/prev/high24/low24/...）不能覆盖
      // 仅在快照中出现的字段，如 mark/index/funding/vol24*/openInterest。
      msg.data.forEach(t => {
        live.ticker[t.symbol] = Object.assign(live.ticker[t.symbol] || {}, t);
      });
    }
    live.listeners.forEach(fn => { try { fn(msg); } catch (_) {} });
  };
  ws.onclose = () => setTimeout(connectWS, 2000);
}

async function bootstrap() {
  try {
    live.symbols = await R.api('/api/symbols', { auth: false });
    live.ticker = await R.api('/api/ticker', { auth: false });
  } catch (_) {}
  await loadFeatures();
  connectWS();

  registerPages();
  registerTrading();
  registerAccount();
  registerAuth();
  registerAdmin();

  renderHeader();
  renderFooter();
  renderMobileNav();
  renderCS();
  onLangChange(() => { renderHeader(); renderFooter(); renderMobileNav(); renderCS(); });
  window.addEventListener('hashchange', updateHeaderActive);

  // 暴露给 admin 页面保存设置后即时刷新功能开关
  window.__refreshFeatures = async () => {
    await loadFeatures();
    renderHeader(); renderFooter(); renderMobileNav();
  };

  R.start();
}

function renderHeader() {
  const el = document.getElementById('app-header');
  const a = R.auth();
  const name = (a.user && (a.user.username || '').slice(0, 2).toUpperCase()) || 'U';
  const navLinks = [
    ['/', 'nav.home'], ['/market', 'nav.market'], ['/trading', 'nav.trading'],
    ['/assets', 'nav.assets'], ['/news', 'nav.news'], ['/faq', 'nav.faq'],
    ['/service', 'nav.service'],
  ];
  el.innerHTML = `
    <div class="wide nav">
      <a href="#/" class="logo"><span class="diamond"></span>${t('brand.name')}</a>
      <div class="nav-links">
        ${navLinks.map(([r, k]) => `<a href="#${r}" data-route="${r}">${t(k)}</a>`).join('')}
      </div>
      <div class="nav-tools">
        <div class="lang-switch" id="lang-switch">
          <button type="button">🌐 ${langs.find(l => l.code === getLang()).name}</button>
          <div class="lang-menu">
            ${langs.map(l => `<button data-lang="${l.code}" class="${l.code === getLang() ? 'active' : ''}">${l.flag} ${l.name}</button>`).join('')}
          </div>
        </div>
        ${a.token ? `
          <div class="user-chip-wrap" id="user-chip-wrap">
            <div class="user-chip">
              <div class="avatar">${name}</div>
              <span>${a.user.username}</span>
            </div>
            <div class="user-dropdown">
              <div class="head"><b>${a.user.username}</b><small>${t('common.welcome')}</small></div>
              <a href="#/profile">👤 ${t('profile.title')}</a>
              <a href="#/assets">💼 ${t('assets.title')}</a>
              <a href="#/deposit">💰 ${t('deposit.title')}</a>
              <a href="#/withdraw">💸 ${t('withdraw.title')}</a>
              <a href="#/kyc">🛡 ${t('kyc.title')}</a>
              ${a.user.is_admin ? `<a href="#/admin">🛠 ${t('admin.title')}</a>` : ''}
              <hr/>
              <button id="logout-btn">🚪 ${t('auth.logout')}</button>
            </div>
          </div>
        ` : `
          <a href="#/login" class="btn ghost">${t('auth.login')}</a>
          <a href="#/signup" class="btn primary">${t('auth.signup')}</a>
        `}
      </div>
    </div>`;

  // 交互绑定
  const ls = el.querySelector('#lang-switch');
  ls.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); ls.classList.toggle('open'); });
  ls.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
    setLang(b.dataset.lang); ls.classList.remove('open');
  }));
  document.addEventListener('click', () => ls.classList.remove('open'));
  const uc = el.querySelector('#user-chip-wrap');
  if (uc) {
    uc.querySelector('.user-chip').addEventListener('click', (e) => { e.stopPropagation(); uc.classList.toggle('open'); });
    document.addEventListener('click', () => uc.classList.remove('open'));
    el.querySelector('#logout-btn').addEventListener('click', R.logout);
  }
  updateHeaderActive();
}

function updateHeaderActive() {
  const p = R.currentPath();
  document.querySelectorAll('.app-header .nav-links a[data-route]').forEach(a => {
    const r = a.dataset.route;
    a.classList.toggle('active', p === r || (r !== '/' && p.startsWith(r)));
  });
  document.querySelectorAll('.mobile-nav a[data-route]').forEach(a => {
    const r = a.dataset.route;
    a.classList.toggle('active', p === r || (r !== '/' && p.startsWith(r)));
  });
}

function renderFooter() {
  const el = document.getElementById('app-footer');
  el.innerHTML = `
    <div class="wide">
      <div class="footer-grid">
        <div class="footer-brand">
          <div class="logo"><span class="diamond"></span>${t('brand.name')}</div>
          <p>${t('footer.about_desc')}</p>
        </div>
        <div>
          <h5>${t('footer.product')}</h5>
          <a href="#/market">${t('nav.market')}</a>
          <a href="#/trading">${t('nav.trading')}</a>
          <a href="#/assets">${t('nav.assets')}</a>
          ${features.finance ? `<a href="#/finance">${t('nav.finance')}</a>` : ''}
          ${features.loan ? `<a href="#/loan">${t('nav.loan')}</a>` : ''}
          <a href="#/news">${t('nav.news')}</a>
        </div>
        <div>
          <h5>${t('footer.support')}</h5>
          <a href="#/faq">${t('nav.faq')}</a>
          <a href="#/service">${t('nav.service')}</a>
          <a href="#/kyc">${t('kyc.title')}</a>
        </div>
        <div>
          <h5>${t('footer.legal')}</h5>
          <a href="#/legal/agreement">${t('legal.agreement')}</a>
          <a href="#/legal/privacy">${t('legal.privacy')}</a>
          <a href="#/legal/anti-fraud">${t('legal.anti_fraud')}</a>
          <a href="#/legal/commitment">${t('legal.commitment')}</a>
        </div>
        <div>
          <h5>${t('footer.about')}</h5>
          <a href="#/about">${t('nav.about')}</a>
          <a>Support@Captail.xyz</a>
          <a>7 × 24 Hours</a>
        </div>
      </div>
      <div class="footer-copy">${t('footer.copy')}</div>
    </div>`;
}

function renderMobileNav() {
  const el = document.getElementById('mobile-nav');
  // 使用短标签（'nav.profile' = "我的"/"Me"）避免 4 字文案挤爆 5 项 flex 布局
  const links = [
    ['/', '🏠', 'nav.home'], ['/market', '📈', 'nav.market'],
    ['/trading', '⚡', 'nav.trading'], ['/assets', '💼', 'nav.assets'],
    ['/profile', '👤', 'nav.profile'],
  ];
  el.innerHTML = links.map(([r, i, k]) =>
    `<a href="#${r}" data-route="${r}"><span class="ico">${i}</span><span class="lbl">${t(k)}</span></a>`).join('');
  updateHeaderActive();
}

async function renderCS() {
  let host = document.getElementById('cs-widget');
  if (!host) {
    host = document.createElement('div');
    host.id = 'cs-widget';
    document.body.appendChild(host);
  }
  let svcUrl = '';
  try {
    const cfg = await R.api('/api/settings');
    svcUrl = (cfg && cfg.service_url || '').trim();
  } catch (_) { /* 非关键路径，静默失败 */ }

  host.innerHTML = `
    <button class="cs-bubble" id="cs-bubble" title="${t('cs.title')}">💬</button>
    <div class="cs-panel" id="cs-panel" aria-hidden="true">
      <header><b>${t('cs.title')}</b><button class="cs-close" id="cs-close">×</button></header>
      <div class="cs-log" id="cs-log">
        <div class="cs-msg bot">${t('cs.welcome')}</div>
      </div>
      <form class="cs-form" id="cs-form">
        <input name="msg" placeholder="${t('cs.placeholder')}" autocomplete="off" required/>
        <button class="btn primary" type="submit">${t('cs.send')}</button>
      </form>
    </div>`;
  const panel = host.querySelector('#cs-panel');
  host.querySelector('#cs-bubble').addEventListener('click', () => {
    if (svcUrl) { window.open(svcUrl, '_blank', 'noopener'); return; }
    panel.classList.toggle('open');
  });
  host.querySelector('#cs-close').addEventListener('click', () => panel.classList.remove('open'));
  host.querySelector('#cs-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const content = (fd.get('msg') || '').toString().trim();
    if (!content) return;
    const log = host.querySelector('#cs-log');
    log.insertAdjacentHTML('beforeend', `<div class="cs-msg user">${content}</div>`);
    log.scrollTop = log.scrollHeight;
    e.target.reset();
    try {
      const u = R.auth().user;
      await R.api('/api/service/messages', { method: 'POST', auth: !!R.auth().token,
        body: { name: u?.username, email: u?.email, content } });
    } catch (_) {}
    setTimeout(() => {
      log.insertAdjacentHTML('beforeend', `<div class="cs-msg bot">${t('cs.auto')}</div>`);
      log.scrollTop = log.scrollHeight;
    }, 500);
  });
}

bootstrap();

