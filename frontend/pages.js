import { t, getLang } from './i18n.js';
import * as R from './router.js';
import { live, features } from './app.js';

// 功能模块被关闭时的通用占位页
function renderFeatureDisabled(el, titleKey) {
  el.innerHTML = `
    <div class="page-head"><div class="wide"><h1>${t(titleKey)}</h1></div></div>
    <div class="wide"><div class="empty-box" style="text-align:center;padding:60px 20px">
      <div style="font-size:48px;margin-bottom:12px">🔒</div>
      <h3 style="margin:0 0 8px">${t('common.feature_disabled')}</h3>
      <p style="color:var(--text-500);margin:0 0 20px">${t('common.feature_disabled_sub')}</p>
      <a href="#/" class="btn primary">${t('common.back_home')}</a>
    </div></div>`;
}

/* ================= 首页 ================= */
function viewHome(el) {
  const iconMap = { XAU: '🥇', XAG: '🥈', XPT: '⚪', XPD: '🔷' };
  function tickerHTML() {
    return Object.entries(live.ticker).map(([sym, ti]) => {
      const up = ti.price >= ti.prev;
      const diff = ti.price - ti.prev;
      const pct = ti.prev ? (diff / ti.prev * 100) : 0;
      const nm = (live.symbols.find(s => s.symbol === sym) || {}).name || '';
      return `<div class="row">
        <div class="sym">${sym}</div>
        <div class="nm">${nm}</div>
        <div class="px">${R.fmt(ti.price)}</div>
        <div class="chg ${up ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${pct.toFixed(2)}%</div>
      </div>`;
    }).join('');
  }
  el.innerHTML = `
    <section class="hero">
      <div class="wide hero-inner">
        <div>
          <h1>${t('home.hero.title_1')} <span class="gold">${t('home.hero.title_2')}</span> ${t('home.hero.title_3')}</h1>
          <p class="lead">${t('home.hero.sub')}</p>
          <div class="hero-cta">
            <a href="#/signup" class="btn primary big">${t('home.cta.start')} →</a>
            <a href="#/trading" class="btn ghost big">${t('home.cta.explore')}</a>
          </div>
          <div class="hero-stats">
            <div class="st"><b>1.2M+</b><span>${t('home.stat.users')}</span></div>
            <div class="st"><b>$8.6B</b><span>${t('home.stat.volume')}</span></div>
            <div class="st"><b>180+</b><span>${t('home.stat.countries')}</span></div>
            <div class="st"><b>99.99%</b><span>${t('home.stat.uptime')}</span></div>
          </div>
        </div>
        <div class="hero-ticker" id="home-ticker">
          <h4>${t('home.live.title')}</h4>
          ${tickerHTML()}
        </div>
      </div>
    </section>

    <section class="section alt">
      <div class="wide">
        <h2>${t('home.features.title')}</h2>
        <p class="sub">${t('home.features.sub')}</p>
        <div class="grid-3">
          ${['f1','f2','f3','f4','f5','f6'].map(k => `
            <div class="feature">
              <div class="ic">${['⚡','📊','🛡','🌐','💳','💬'][['f1','f2','f3','f4','f5','f6'].indexOf(k)]}</div>
              <h3>${t('home.' + k + '.t')}</h3>
              <p>${t('home.' + k + '.d')}</p>
            </div>`).join('')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="wide">
        <h2>${t('market.title')}</h2>
        <p class="sub">${t('market.sub')}</p>
        ${marketTable()}
      </div>
    </section>

    <section class="section alt">
      <div class="wide">
        <div class="cta-banner">
          <div>
            <h2>${t('home.cta_banner.t')}</h2>
            <p>${t('home.cta_banner.d')}</p>
          </div>
          <a href="#/signup" class="btn primary big">${t('home.cta.start')} →</a>
        </div>
      </div>
    </section>
  `;

  const fn = () => {
    const host = document.getElementById('home-ticker');
    if (host) host.innerHTML = `<h4>${t('home.live.title')}</h4>` + tickerHTML();
    updateMarketRows(el);
  };
  live.listeners.add(fn);
  wireMarketClicks(el);
  return () => live.listeners.delete(fn);
}

/* ================= 行情列表（首页/市场页共用） ================= */
function marketTable() {
  const icCls = { XAU: '', XAG: 'silver', XPT: 'platinum', XPD: 'palladium' };
  const rows = live.symbols.map(s => {
    const ti = live.ticker[s.symbol] || { price: 0, prev: 0 };
    const up = ti.price >= ti.prev;
    const diff = ti.price - ti.prev;
    const pct = ti.prev ? (diff / ti.prev * 100) : 0;
    return `<tr data-sym="${s.symbol}">
      <td class="sym-cell">
        <div class="sym-ic ${icCls[s.symbol] || ''}">${s.symbol.slice(1)}</div>
        <div><b>${s.symbol}/USD</b><br/><small style="color:var(--text-500)">${s.name}</small></div>
      </td>
      <td class="tight" data-role="price">${R.fmt(ti.price)}</td>
      <td class="tight ${up ? 'up' : 'down'}" data-role="chg">${diff >= 0 ? '+' : ''}${pct.toFixed(3)}%</td>
      <td class="tight" data-role="high">${R.fmt(ti.price * 1.004)}</td>
      <td class="tight" data-role="low">${R.fmt(ti.price * 0.996)}</td>
      <td><div class="mini-chart" id="mini-${s.symbol}"></div></td>
      <td><a class="btn outline" href="#/trading?symbol=${s.symbol}">${t('market.trade')}</a></td>
    </tr>`;
  }).join('');
  return `<table class="market-table">
    <thead><tr>
      <th>${t('market.col.symbol')}</th><th>${t('market.col.price')}</th>
      <th>${t('market.col.change')}</th><th>${t('market.col.high')}</th>
      <th>${t('market.col.low')}</th><th>${t('market.col.trend')}</th>
      <th>${t('market.col.action')}</th>
    </tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function wireMarketClicks(root) {
  root.querySelectorAll('.market-table tbody tr').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a,button')) return;
      R.navigate('/trading?symbol=' + tr.dataset.sym);
    });
  });
  drawMiniCharts();
}

async function drawMiniCharts() {
  if (!window.echarts) return;
  for (const s of live.symbols) {
    const el = document.getElementById('mini-' + s.symbol);
    if (!el) continue;
    try {
      const rows = await R.api(`/api/candles?symbol=${s.symbol}&interval=1m&limit=30`, { auth: false });
      const c = echarts.init(el);
      const up = rows.length && rows[rows.length - 1].close >= rows[0].open;
      c.setOption({
        animation: false, grid: { top: 4, bottom: 4, left: 0, right: 0 },
        xAxis: { type: 'category', show: false, data: rows.map((_, i) => i) },
        yAxis: { type: 'value', show: false, scale: true },
        series: [{ type: 'line', smooth: true, showSymbol: false, data: rows.map(r => r.close),
          lineStyle: { color: up ? '#16a34a' : '#dc2626', width: 1.5 },
          areaStyle: { color: up ? 'rgba(22,163,74,.15)' : 'rgba(220,38,38,.15)' } }],
      });
    } catch (_) {}
  }
}
function updateMarketRows(root) {
  if (!root) return;
  root.querySelectorAll('.market-table tbody tr').forEach(tr => {
    const sym = tr.dataset.sym;
    const ti = live.ticker[sym]; if (!ti) return;
    const up = ti.price >= ti.prev;
    const diff = ti.price - ti.prev;
    const pct = ti.prev ? (diff / ti.prev * 100) : 0;
    const pr = tr.querySelector('[data-role=price]'); if (pr) pr.textContent = R.fmt(ti.price);
    const ch = tr.querySelector('[data-role=chg]');
    if (ch) { ch.textContent = (diff >= 0 ? '+' : '') + pct.toFixed(3) + '%';
      ch.className = 'tight ' + (up ? 'up' : 'down'); }
  });
}

/* ================= 市场页 ================= */
function viewMarket(el) {
  el.innerHTML = `
    <div class="page-head"><div class="wide"><h1>${t('market.title')}</h1><p>${t('market.sub')}</p></div></div>
    <div class="wide">${marketTable()}</div>`;
  wireMarketClicks(el);
  const fn = () => updateMarketRows(el);
  live.listeners.add(fn);
  return () => live.listeners.delete(fn);
}

/* ================= 资讯 ================= */
async function viewNews(el) {
  el.innerHTML = `<div class="page-head"><div class="wide"><h1>${t('news.title')}</h1><p>${t('news.sub')}</p></div></div>
    <div class="wide"><div id="news-list" class="news-list"><div style="color:var(--text-500)">${t('common.loading')}</div></div></div>`;
  try {
    const list = await R.api('/api/news', { auth: false });
    const lang = getLang();
    document.getElementById('news-list').innerHTML = list.map(n => `
      <div class="news-item" data-id="${n.id}">
        <div class="date">${n.date.slice(5)}<small>${n.date.slice(0,4)}</small></div>
        <div>
          <h4>${lang === 'en' ? n.title_en : n.title_zh}</h4>
          <p>${lang === 'en' ? n.summary_en : n.summary_zh}</p>
        </div>
      </div>`).join('');
  } catch (e) {
    document.getElementById('news-list').innerHTML = `<div class="msg">${e.message}</div>`;
  }
}

/* ================= 常见问题（后台配置） ================= */
async function viewFAQ(el) {
  el.innerHTML = `<div class="page-head"><div class="wide"><h1>${t('faq.title')}</h1><p>${t('faq.sub')}</p></div></div>
    <div class="wide"><div id="faq-wrap">${t('common.loading')}</div></div>`;
  try {
    const list = await R.api('/api/faqs', { auth: false });
    const en = getLang() === 'en';
    const wrap = document.getElementById('faq-wrap');
    if (!list.length) { wrap.innerHTML = `<div class="empty-box">${t('common.empty')}</div>`; return; }
    wrap.innerHTML = `<div class="faq">${list.map(f => {
      const q = en ? (f.question_en || f.question_zh) : (f.question_zh || f.question_en);
      const a = en ? (f.answer_en || f.answer_zh) : (f.answer_zh || f.answer_en);
      return `<details><summary>${q}</summary><div class="body">${a}</div></details>`;
    }).join('')}</div>`;
  } catch (e) {
    document.getElementById('faq-wrap').innerHTML = `<div class="msg">${e.message}</div>`;
  }
}

/* ================= 在线客服 ================= */
async function viewService(el) {
  el.innerHTML = `<div class="page-head"><div class="wide"><h1>${t('service.title')}</h1>
    <p>${t('service.sub')}</p></div></div>
    <div class="wide"><div class="card">${t('common.loading')}</div></div>`;

  let svcUrl = '';
  try {
    const cfg = await R.api('/api/settings');
    svcUrl = (cfg && cfg.service_url || '').trim();
  } catch (_) { /* 非关键路径，静默失败 */ }

  if (svcUrl) {
    el.innerHTML = `
      <div class="page-head"><div class="wide"><h1>${t('service.title')}</h1>
        <p>${t('service.sub')}</p></div></div>
      <div class="wide"><div class="card" style="padding:0;overflow:hidden">
        <iframe src="${svcUrl}" title="${t('service.title')}"
          style="width:100%;height:720px;border:0;display:block"
          allow="clipboard-read; clipboard-write; microphone; camera"></iframe>
      </div></div>`;
    return;
  }

  el.innerHTML = `
    <div class="page-head"><div class="wide"><h1>${t('service.title')}</h1><p>${t('service.sub')}</p></div></div>
    <div class="wide">
      <div class="grid-2">
        <div class="card">
          <h3>📮 ${t('service.email')}</h3>
          <p style="color:var(--text-500)">support@captail.xyz</p>
          <h3 style="margin-top:20px">⏰ ${t('service.hours')}</h3>
          <p style="color:var(--text-500)">7 × 24 Hours · Multilingual</p>
          <h3 style="margin-top:20px">🌐 Global Hotline</h3>
          <p style="color:var(--text-500)">+1 (800) 000-0000 · +852 0000 0000</p>
        </div>
        <div class="card">
          <h3>📨 ${t('service.title')}</h3>
          <form id="svc-form">
            <div class="field"><label>${t('service.form.name')}</label><input name="name" required/></div>
            <div class="field"><label>${t('profile.email')}</label><input name="email" type="email" required/></div>
            <div class="field"><label>${t('service.form.content')}</label><textarea name="msg" rows="5" required></textarea></div>
            <button class="btn primary block" type="submit">${t('service.form.send')}</button>
            <div class="msg" id="svc-msg"></div>
          </form>
        </div>
      </div>
    </div>`;
  document.getElementById('svc-form').addEventListener('submit', (e) => {
    e.preventDefault();
    document.getElementById('svc-msg').className = 'msg ok';
    document.getElementById('svc-msg').textContent = t('service.form.success');
    e.target.reset();
  });
}

/* ================= 法律文本 ================= */
const LEGAL_BODY = {
  agreement: {
    zh: `<h2>一、服务说明</h2><p>Captail 是一个面向全球用户的贵金属电子交易平台。用户在使用本平台前，应充分理解其中可能产生的市场风险与操作风险。</p>
         <h2>二、用户义务</h2><p>用户应保证提交信息的真实性与完整性，不得利用平台从事任何违法行为。任何因用户原因造成的损失由用户自行承担。</p>
         <h2>三、服务变更与中断</h2><p>Captail 有权因维护、升级或不可抗力原因暂停或变更相关服务，并将在可能的情况下提前通知用户。</p>
         <h2>四、条款变更</h2><p>本协议的最终解释权归 Captail 所有。继续使用本平台视为接受最新条款。</p>`,
    en: `<h2>1. Service</h2><p>Captail is a precious-metals electronic trading platform serving global users. Users must fully understand market and operational risks before using the service.</p>
         <h2>2. Obligations</h2><p>Users must ensure their submitted information is truthful and complete, and must not engage in any illegal activities via the platform. Any loss caused by the user is their sole responsibility.</p>
         <h2>3. Changes</h2><p>Captail may suspend or modify services for maintenance, upgrades or force-majeure events, with prior notice where possible.</p>
         <h2>4. Amendments</h2><p>Captail retains final interpretation rights. Continued use constitutes acceptance of the latest terms.</p>`,
  },
  privacy: {
    zh: `<h2>一、信息收集</h2><p>我们收集您的账户信息、身份信息与操作日志以提供服务与满足合规要求。</p>
         <h2>二、信息使用</h2><p>您的信息仅用于账户管理、风险控制与法律合规，不会被出售给任何第三方。</p>
         <h2>三、信息保护</h2><p>我们采用业界领先的加密技术与访问控制机制来保护您的信息安全。</p>
         <h2>四、用户权利</h2><p>您有权访问、更正或请求删除您的个人信息。</p>`,
    en: `<h2>1. Data Collection</h2><p>We collect account, identity and operational data to deliver services and satisfy compliance requirements.</p>
         <h2>2. Usage</h2><p>Your data is used solely for account management, risk control and legal compliance, and is never sold to third parties.</p>
         <h2>3. Protection</h2><p>We employ industry-leading encryption and access controls to protect your data.</p>
         <h2>4. Rights</h2><p>You may access, correct or request deletion of your personal data at any time.</p>`,
  },
  'anti-fraud': {
    zh: `<h2>反欺诈声明</h2><p>Captail 严禁任何形式的欺诈、洗钱、市场操纵行为。</p>
         <p>我们提醒用户谨防冒充客服、私下转账、钓鱼网站等常见骗局。任何自称 Captail 员工、索取密码或私下收款的行为均为欺诈，请立即举报。</p>
         <h2>举报渠道</h2><p>若发现可疑行为，请立即联系 report@captail.xyz 并保留相关证据。</p>`,
    en: `<h2>Anti-Fraud Statement</h2><p>Captail strictly forbids any form of fraud, money laundering or market manipulation.</p>
         <p>Users should beware of scams involving fake customer service, off-platform transfers, and phishing sites. Anyone claiming to be a Captail employee who asks for your password or off-platform payment is fraudulent—please report immediately.</p>
         <h2>Report</h2><p>If you encounter suspicious activity, contact report@captail.xyz with supporting evidence.</p>`,
  },
  commitment: {
    zh: `<h2>平台承诺</h2><p>Captail 始终将用户资产安全放在首位，承诺以下事项：</p>
         <p>1. 所有客户资金独立于平台运营资金存放。<br/>2. 所有交易明细 24 × 7 可随时查询。<br/>3. 所有下单请求将按订单优先级及时间优先原则公平撮合。<br/>4. 绝不使用客户资金进行任何投机性操作。<br/>5. 定期接受独立第三方审计并公开审计结果。</p>`,
    en: `<h2>Platform Commitment</h2><p>Captail treats user asset safety as our top priority:</p>
         <p>1. Client funds are segregated from operational funds.<br/>2. All transaction records are available 24×7.<br/>3. Orders are matched strictly by priority and time.<br/>4. Client funds are never used for speculation.<br/>5. Regular third-party audits with public results.</p>`,
  },
};
function viewLegal(el, params) {
  const kind = params.kind;
  const body = (LEGAL_BODY[kind] || LEGAL_BODY.agreement)[getLang() === 'en' ? 'en' : 'zh'];
  const titleKey = {
    agreement: 'legal.agreement', privacy: 'legal.privacy',
    'anti-fraud': 'legal.anti_fraud', commitment: 'legal.commitment',
  }[kind] || 'legal.agreement';
  el.innerHTML = `
    <div class="page-head"><div class="wide"><h1>${t(titleKey)}</h1><p>Effective date: 2026-01-01</p></div></div>
    <div class="wide"><div class="prose">${body}</div></div>`;
}

/* ================= 个人资料 ================= */
async function viewProfile(el) {
  el.innerHTML = `<div class="page-head"><div class="wide"><h1>${t('profile.title')}</h1><p>${t('profile.sub')}</p></div></div>
    <div class="wide"><div id="pf-wrap">${t('common.loading')}</div></div>`;
  try {
    const p = await R.api('/api/profile');
    const k = p.kyc || { status: 'unsubmitted' };
    document.getElementById('pf-wrap').innerHTML = `
      <div class="grid-2">
        <div class="card">
          <h3>${t('profile.basic')}</h3>
          <form id="pf-form" class="space-y">
            <div class="field"><label>${t('auth.username')}</label><input value="${p.username}" disabled/></div>
            <div class="field"><label>${t('profile.nickname')}</label><input name="nickname" value="${p.nickname || ''}"/></div>
            <div class="field"><label>${t('profile.email')}</label><input name="email" type="email" value="${p.email || ''}"/></div>
            <div class="field"><label>${t('profile.phone')}</label><input name="phone" value="${p.phone || ''}"/></div>
            <button class="btn primary" type="submit">${t('profile.save')}</button>
            <div class="msg" id="pf-msg"></div>
          </form>
        </div>
        <div class="card">
          <h3>${t('profile.security')}</h3>
          <div class="kv">
            <label>${t('profile.joined')}</label><b>${R.fmtTs(p.created_at)}</b>
            <label>${t('profile.kyc_status')}</label>
            <b><span class="badge ${k.status}">${t('status.' + k.status)}</span></b>
          </div>
          <div style="margin-top:16px">
            <a href="#/kyc" class="btn outline">${t('kyc.title')} →</a>
          </div>
        </div>
      </div>`;
    document.getElementById('pf-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await R.api('/api/profile', { method: 'POST',
          body: { nickname: fd.get('nickname'), email: fd.get('email'), phone: fd.get('phone') } });
        document.getElementById('pf-msg').className = 'msg ok';
        document.getElementById('pf-msg').textContent = 'Saved';
        R.toast('Saved', 'ok');
      } catch (err) {
        document.getElementById('pf-msg').className = 'msg';
        document.getElementById('pf-msg').textContent = err.message;
      }
    });
  } catch (e) {
    document.getElementById('pf-wrap').innerHTML = `<div class="msg">${e.message}</div>`;
  }
}

/* ================= 理财（后台配置） ================= */
async function viewFinance(el) {
  if (!features.finance) return renderFeatureDisabled(el, 'finance.title');
  el.innerHTML = `
    <div class="page-head"><div class="wide"><h1>${t('finance.title')}</h1><p>${t('finance.sub')}</p></div></div>
    <div class="wide"><div id="fin-wrap">${t('common.loading')}</div></div>`;
  try {
    const list = await R.api('/api/finance/products', { auth: false });
    const en = getLang() === 'en';
    const wrap = document.getElementById('fin-wrap');
    if (!list.length) { wrap.innerHTML = `<div class="empty-box">${t('common.empty')}</div>`; return; }
    const colors = ['blue', 'gold', 'green', 'purple'];
    wrap.innerHTML = `<div class="plan-grid">${list.map((p, i) => {
      const name = en ? (p.name_en || p.name_zh) : (p.name_zh || p.name_en);
      const desc = en ? (p.description_en || p.description_zh || '') : (p.description_zh || p.description_en || '');
      const apy = (p.daily_rate * 365 * 100).toFixed(2) + '%';
      const left = p.total_quota > 0 ? Math.max(0, p.total_quota - p.sold_quota) : null;
      return `<div class="plan-card ${colors[i % colors.length]}">
        <div class="plan-head">
          <span class="tag">${name}</span>
          ${p.vip_tag ? `<span class="badge approved">${p.vip_tag}</span>` : ''}
        </div>
        <div class="plan-apr"><b>${apy}</b><small>${t('finance.apy')}</small></div>
        <div class="plan-rows">
          <div><span>${t('finance.daily_rate')}</span><b>${(p.daily_rate * 100).toFixed(3)}%</b></div>
          <div><span>${t('finance.lock')}</span><b>${p.lock_days} ${t('finance.days')}</b></div>
          <div><span>${t('finance.range')}</span><b>$${p.min_amount}-${p.max_amount}</b></div>
          ${left !== null ? `<div><span>${t('finance.quota_left')}</span><b>$${R.fmt(left)}</b></div>` : ''}
        </div>
        ${desc ? `<p style="font-size:13px;color:var(--text-500);margin:10px 0">${desc}</p>` : ''}
        <button class="btn primary block" data-fin="${p.id}" data-min="${p.min_amount}" data-max="${p.max_amount}">${t('finance.subscribe')}</button>
      </div>`;
    }).join('')}</div>`;
    wrap.querySelectorAll('button[data-fin]').forEach(b => {
      b.addEventListener('click', () => subscribeFinance(
        Number(b.dataset.fin), Number(b.dataset.min), Number(b.dataset.max)));
    });
  } catch (e) {
    document.getElementById('fin-wrap').innerHTML = `<div class="msg">${e.message}</div>`;
  }
}
async function subscribeFinance(productId, min, max) {
  if (!localStorage.getItem('token')) return R.navigate('/login');
  const amt = Number(prompt(t('finance.amount_prompt') + ` (${min}-${max})`));
  if (!amt || amt < min || amt > max) return;
  try {
    await R.api('/api/finance/subscribe', { method: 'POST',
      body: { product_id: productId, amount: amt } });
    R.toast(t('finance.subscribe_ok'), 'ok');
    R.navigate('/assets');
  } catch (e) { R.toast(e.message, 'error'); }
}

/* ================= 借贷（后台配置） ================= */
async function viewLoan(el) {
  if (!features.loan) return renderFeatureDisabled(el, 'loan.title');
  el.innerHTML = `
    <div class="page-head"><div class="wide"><h1>${t('loan.title')}</h1><p>${t('loan.sub')}</p></div></div>
    <div class="wide"><div id="loan-wrap">${t('common.loading')}</div></div>`;
  try {
    const list = await R.api('/api/loan/products', { auth: false });
    const en = getLang() === 'en';
    const wrap = document.getElementById('loan-wrap');
    if (!list.length) { wrap.innerHTML = `<div class="empty-box">${t('common.empty')}</div>`; return; }
    wrap.innerHTML = `<table class="list">
      <thead><tr><th>${t('loan.product')}</th><th>${t('loan.rate')}</th>
        <th>${t('loan.term')}</th><th>${t('finance.range')}</th><th></th></tr></thead>
      <tbody>${list.map(p => {
        const name = en ? (p.name_en || p.name_zh) : (p.name_zh || p.name_en);
        return `<tr>
          <td><b>${name}</b></td>
          <td>${(p.daily_rate * 100).toFixed(3)}% / ${t('finance.day')}</td>
          <td>${p.term_days} ${t('finance.days')}</td>
          <td>$${p.min_amount}-${p.max_amount}</td>
          <td><button class="btn outline small" data-loan="${p.id}" data-min="${p.min_amount}" data-max="${p.max_amount}" data-term="${p.term_days}">${t('loan.apply')}</button></td>
        </tr>`;
      }).join('')}</tbody></table>`;
    wrap.querySelectorAll('button[data-loan]').forEach(b => {
      b.addEventListener('click', () => applyLoan(
        Number(b.dataset.loan), Number(b.dataset.min), Number(b.dataset.max), Number(b.dataset.term)));
    });
  } catch (e) {
    document.getElementById('loan-wrap').innerHTML = `<div class="msg">${e.message}</div>`;
  }
}
async function applyLoan(productId, min, max, termDays) {
  if (!localStorage.getItem('token')) return R.navigate('/login');
  const amt = Number(prompt(t('loan.amount_prompt') + ` (${min}-${max})`));
  if (!amt || amt < min || amt > max) return;
  try {
    await R.api('/api/loan/apply', { method: 'POST',
      body: { product_id: productId, amount: amt, term_days: termDays } });
    R.toast(t('loan.apply_ok'), 'ok');
    R.navigate('/assets');
  } catch (e) { R.toast(e.message, 'error'); }
}

/* ================= 关于我们 ================= */
function viewAbout(el) {
  el.innerHTML = `
    <div class="page-head"><div class="wide"><h1>${t('about.title')}</h1><p>${t('about.sub')}</p></div></div>
    <div class="wide">
      <div class="stat-grid">
        <div class="stat"><div class="v">15+</div><div class="k">${t('about.num.experience')}</div></div>
        <div class="stat"><div class="v">$8.6B</div><div class="k">${t('about.num.assets')}</div></div>
        <div class="stat"><div class="v">99.99%</div><div class="k">${t('about.num.uptime')}</div></div>
        <div class="stat"><div class="v">32</div><div class="k">${t('about.num.awards')}</div></div>
      </div>
      <div class="grid-2" style="margin-top:24px">
        <div class="card"><h3>${t('about.story_t')}</h3><p style="color:var(--text-500);line-height:1.8">${t('about.story_d')}</p></div>
        <div class="card"><h3>${t('about.mission_t')}</h3><p style="color:var(--text-500);line-height:1.8">${t('about.mission_d')}</p></div>
      </div>
    </div>`;
}

/* 秒级合约功能已并入 /trading 的「期权」二级 tab；旧 viewSeconds 已删除 */

function view404(el) {
  el.innerHTML = `<div class="page"><div class="wide" style="text-align:center;padding:120px 20px">
    <h1 style="font-size:72px;color:var(--gold-500);margin:0">404</h1>
    <p style="color:var(--text-500)">Page not found.</p>
    <a href="#/" class="btn primary">${t('common.back')}</a>
  </div></div>`;
}

export function registerPages() {
  R.register('/', { render: viewHome });
  R.register('/market', { render: viewMarket });
  R.register('/news', { render: viewNews });
  R.register('/faq', { render: viewFAQ });
  R.register('/service', { render: viewService });
  R.register('/finance', { render: viewFinance });
  R.register('/loan', { render: viewLoan });
  R.register('/about', { render: viewAbout });
  R.register('/legal/:kind', { render: viewLegal });
  R.register('/profile', { render: viewProfile, auth: true });
  R.register('/404', { render: view404 });
}



