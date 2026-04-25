import { t, onLangChange } from './i18n.js';

const routes = {};
let currentDispose = null;
let currentView = null;
let currentParams = {};
const auth = () => ({
  token: localStorage.getItem('token'),
  user: JSON.parse(localStorage.getItem('user') || 'null'),
});

export function register(path, def) { routes[path] = def; }

export function navigate(hash) {
  if (!hash.startsWith('#')) hash = '#' + hash;
  if (location.hash === hash) handle();
  else location.hash = hash;
}

export function currentPath() { return (location.hash || '#/').slice(1).split('?')[0] || '/'; }
export function getParams() { return currentParams; }

function parseHash() {
  const raw = (location.hash || '#/').slice(1);
  const [path, query] = raw.split('?');
  const params = {};
  if (query) new URLSearchParams(query).forEach((v, k) => { params[k] = v; });
  return { path: path || '/', params };
}

function matchRoute(path) {
  if (routes[path]) return { def: routes[path], vars: {} };
  for (const pattern of Object.keys(routes)) {
    if (!pattern.includes(':')) continue;
    const pp = pattern.split('/');
    const cp = path.split('/');
    if (pp.length !== cp.length) continue;
    const vars = {};
    let ok = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) vars[pp[i].slice(1)] = cp[i];
      else if (pp[i] !== cp[i]) { ok = false; break; }
    }
    if (ok) return { def: routes[pattern], vars };
  }
  return null;
}

async function handle() {
  const { path, params } = parseHash();
  const m = matchRoute(path) || matchRoute('/404') || { def: routes['/'] || {}, vars: {} };
  currentParams = { ...params, ...m.vars };
  const def = m.def;

  if (def.auth && !auth().token) {
    localStorage.setItem('after_login', '#' + path);
    return navigate('/login');
  }

  if (currentDispose) { try { currentDispose(); } catch (_) {} currentDispose = null; }
  const view = document.getElementById('app-view');
  view.innerHTML = '';
  view.className = 'app-view ' + (def.bodyClass || '');
  document.body.classList.toggle('page-dark', !!def.dark);
  currentView = path;

  if (def.render) {
    const res = await def.render(view, currentParams);
    if (typeof res === 'function') currentDispose = res;
  }
  window.scrollTo(0, 0);
  updateActiveNav();
}

function updateActiveNav() {
  document.querySelectorAll('.nav-links a[data-route]').forEach(a => {
    const r = a.dataset.route;
    a.classList.toggle('active', currentView === r ||
      (r !== '/' && currentView.startsWith(r)));
  });
  document.querySelectorAll('.mobile-nav a[data-route]').forEach(a => {
    const r = a.dataset.route;
    a.classList.toggle('active', currentView === r);
  });
}

export function start() {
  window.addEventListener('hashchange', handle);
  onLangChange(() => handle());
  handle();
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  navigate('/');
  location.reload();
}

// utility helpers used by views
export function toast(msg, type = 'info') {
  const host = document.getElementById('toast-host');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .2s'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

export function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtTs(ts) {
  return new Date(ts).toLocaleString(localStorage.getItem('lang') === 'en' ? 'en-US' : 'zh-CN',
    { hour12: false });
}

// Compact formatter for large notional figures (B / M / K).
export function fmtCompact(n) {
  if (n == null || !isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(3) + 'B';
  if (abs >= 1e6) return (n / 1e6).toFixed(3) + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(3) + 'K';
  return Number(n).toFixed(2);
}

export function fmtCountdown(ms) {
  if (!(ms > 0)) return '00:00:00';
  const sec = Math.floor(ms / 1000);
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${ss}`;
}

// Simple moving average over a close-price array; returns array of same length
// with '-' placeholders for the leading (n-1) bars.
export function sma(closes, n) {
  const out = new Array(closes.length).fill('-');
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= n) sum -= closes[i - n];
    if (i >= n - 1) out[i] = +(sum / n).toFixed(4);
  }
  return out;
}

// Coalesce rapid calls to a single requestAnimationFrame; last call wins.
export function rafThrottle(fn) {
  let pending = false;
  let lastArgs = null;
  return function (...args) {
    lastArgs = args;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      fn.apply(this, lastArgs);
    });
  };
}

export async function api(url, { method = 'GET', body, auth: needAuth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (needAuth) {
    const tk = auth().token;
    if (tk) headers.Authorization = 'Bearer ' + tk;
  }
  const res = await fetch(url, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || ('HTTP ' + res.status));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export { auth };

