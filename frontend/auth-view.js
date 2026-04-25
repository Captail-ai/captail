import { t } from './i18n.js';
import * as R from './router.js';

function sidePanel() {
  const bullets = [
    { zh: '机构级撮合引擎，毫秒级成交', en: 'Institutional matching, ms-level execution' },
    { zh: '真·冷热分离的资金托管', en: 'Cold/hot wallet segregation' },
    { zh: '全球多法域合规 · KYC/AML', en: 'Global compliance · KYC/AML' },
    { zh: '7 × 24 多语言专属客服', en: '7×24 multilingual support' },
  ];
  const lang = localStorage.getItem('lang') || 'zh';
  return `
    <div class="auth-side">
      <div class="logo"><span class="diamond"></span>${t('brand.name')}</div>
      <h2 style="margin-top:24px">${t('brand.tagline')}</h2>
      <p>${t('home.hero.sub')}</p>
      <ul>${bullets.map(b => `<li>${lang === 'en' ? b.en : b.zh}</li>`).join('')}</ul>
    </div>`;
}

function verifyFormHtml(username, extraNote = '') {
  return `
    <form class="auth-form" id="verify-form">
      <h1>${t('auth.verify_title')}</h1>
      <p class="sub">${t('auth.verify_sub')}</p>
      ${extraNote ? `<p class="sub" style="color:var(--gold)">${extraNote}</p>` : ''}
      <input type="hidden" name="username" value="${username}"/>
      <div class="field">
        <label>${t('auth.verify_code')}</label>
        <input name="code" required pattern="\\d{6}" maxlength="6"
               inputmode="numeric" placeholder="______"/>
      </div>
      <button class="btn primary big block" type="submit">${t('auth.verify_submit')}</button>
      <div class="msg" id="verify-msg"></div>
      <div class="alt-link">
        <a href="#" id="resend-code">${t('auth.verify_resend')}</a>
      </div>
    </form>`;
}

function wireVerifyForm(wrap, onDone) {
  wrap.querySelector('#verify-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = wrap.querySelector('#verify-msg');
    try {
      await R.api('/api/auth/verify-email', {
        method: 'POST', auth: false,
        body: { username: fd.get('username'), code: fd.get('code') },
      });
      onDone(fd.get('username'));
    } catch (err) {
      msg.className = 'msg'; msg.textContent = err.message;
    }
  });
  wrap.querySelector('#resend-code').addEventListener('click', async (e) => {
    e.preventDefault();
    const username = wrap.querySelector('#verify-form [name=username]').value;
    const msg = wrap.querySelector('#verify-msg');
    try {
      const r = await R.api('/api/auth/resend-code', {
        method: 'POST', auth: false, body: { username },
      });
      msg.className = 'msg ok';
      msg.textContent = r.dev_code
        ? t('auth.verify_resent') + ' (dev: ' + r.dev_code + ')'
        : t('auth.verify_resent');
    } catch (err) {
      msg.className = 'msg'; msg.textContent = err.message;
    }
  });
}

function viewLogin(el) {
  el.innerHTML = `
    <div class="auth-wrap">
      ${sidePanel()}
      <div class="auth-form-wrap" id="login-wrap">
        <form class="auth-form" id="login-form">
          <h1>${t('auth.login_title')}</h1>
          <p class="sub">${t('auth.login_sub')}</p>
          <div class="field">
            <label>${t('auth.username')}</label>
            <input name="username" autocomplete="username" required minlength="3"
                   placeholder="${t('auth.placeholder_user')}"/>
          </div>
          <div class="field">
            <label>${t('auth.password')}</label>
            <input name="password" type="password" autocomplete="current-password"
                   required minlength="6" placeholder="${t('auth.placeholder_pwd')}"/>
          </div>
          <button class="btn primary big block" type="submit">${t('auth.login')}</button>
          <div class="msg" id="login-msg"></div>
          <div class="alt-link">
            ${t('auth.no_account')} <a href="#/signup">${t('auth.signup')}</a>
          </div>
        </form>
      </div>
    </div>`;
  const wrap = document.getElementById('login-wrap');
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById('login-msg');
    const username = fd.get('username').trim();
    try {
      const r = await R.api('/api/login', {
        method: 'POST', auth: false,
        body: { username, password: fd.get('password') },
      });
      localStorage.setItem('token', r.token);
      localStorage.setItem('user', JSON.stringify(r.user));
      const after = localStorage.getItem('after_login') || '#/';
      localStorage.removeItem('after_login');
      location.href = after;
      location.reload();
    } catch (err) {
      if (err.data && err.data.needs_verification) {
        // Unverified \u2014 pivot to the verification form; on success bounce back.
        wrap.innerHTML = verifyFormHtml(username, t('auth.verify_needed'));
        wireVerifyForm(wrap, () => viewLogin(el));
        return;
      }
      if (err.status === 429 && err.data && err.data.retryAfter) {
        msg.className = 'msg';
        msg.textContent = t('auth.rate_limited').replace('{s}', err.data.retryAfter);
        return;
      }
      msg.className = 'msg'; msg.textContent = err.message;
    }
  });
}

function viewSignup(el) {
  el.innerHTML = `
    <div class="auth-wrap">
      ${sidePanel()}
      <div class="auth-form-wrap" id="signup-wrap">
        <form class="auth-form" id="signup-form">
          <h1>${t('auth.signup_title')}</h1>
          <p class="sub">${t('auth.signup_sub')}</p>
          <div class="field">
            <label>${t('auth.username')}</label>
            <input name="username" autocomplete="username" required minlength="3"
                   placeholder="${t('auth.placeholder_user')}"/>
            <small>${t('auth.min_user')}</small>
          </div>
          <div class="field">
            <label>${t('auth.email')}</label>
            <input name="email" type="email" autocomplete="email" required
                   placeholder="${t('auth.placeholder_email')}"/>
          </div>
          <div class="field">
            <label>${t('auth.password')}</label>
            <input name="password" type="password" autocomplete="new-password"
                   required minlength="6" placeholder="${t('auth.placeholder_pwd')}"/>
            <small>${t('auth.min_pwd')}</small>
          </div>
          <div class="field">
            <label>${t('auth.confirm_password')}</label>
            <input name="confirm" type="password" autocomplete="new-password" required minlength="6"/>
          </div>
          <button class="btn primary big block" type="submit">${t('auth.signup')}</button>
          <div class="msg" id="signup-msg"></div>
          <p style="color:var(--text-500);font-size:12px;text-align:center;margin-top:8px">${t('auth.bonus')}</p>
          <div class="alt-link">
            ${t('auth.has_account')} <a href="#/login">${t('auth.login')}</a>
          </div>
        </form>
      </div>
    </div>`;
  const wrap = document.getElementById('signup-wrap');
  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById('signup-msg');
    if (fd.get('password') !== fd.get('confirm')) {
      msg.className = 'msg'; msg.textContent = t('auth.pwd_mismatch');
      return;
    }
    const username = fd.get('username').trim();
    try {
      const r = await R.api('/api/register', {
        method: 'POST', auth: false,
        body: {
          username, password: fd.get('password'),
          email: (fd.get('email') || '').trim(),
        },
      });
      if (r.needs_verification) {
        const note = r.dev_code
          ? t('auth.verify_sent') + ' (dev: ' + r.dev_code + ')'
          : t('auth.verify_sent');
        wrap.innerHTML = verifyFormHtml(username, note);
        wireVerifyForm(wrap, () => { location.href = '#/login'; });
        return;
      }
      localStorage.setItem('token', r.token);
      localStorage.setItem('user', JSON.stringify(r.user));
      location.href = '#/assets';
      location.reload();
    } catch (err) {
      msg.className = 'msg'; msg.textContent = err.message;
    }
  });
}

export function registerAuth() {
  R.register('/login', { render: viewLogin });
  R.register('/signup', { render: viewSignup });
}

