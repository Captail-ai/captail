import { t } from './i18n.js';
import * as R from './router.js';
import { live } from './app.js';

function statusText(st) { return t('status.' + st) || st; }

/* ================ ASSETS ================ */
async function viewAssets(el) {
  el.innerHTML = `<div class="page-head"><div class="wide">
    <h1>${t('assets.title')}</h1><p>${t('assets.sub')}</p></div></div>
    <div class="wide"><div id="as-wrap">${t('common.loading')}</div></div>`;
  try {
    const [acc, orders, trades, deps, wds] = await Promise.all([
      R.api('/api/account'), R.api('/api/orders'),
      R.api('/api/trades'), R.api('/api/deposit-requests'),
      R.api('/api/withdraw-requests'),
    ]);
    render(acc, orders, trades, deps, wds);
  } catch (e) {
    document.getElementById('as-wrap').innerHTML = `<div class="msg">${e.message}</div>`;
  }

  function render(acc, orders, trades, deps, wds) {
    const posValue = acc.positions.reduce((a, p) => a + (p.market_value || 0), 0);
    const pnl = acc.positions.reduce((a, p) => a + (p.pnl || 0), 0);
    const totalCash = (acc.spot_cash || 0) + (acc.option_cash || 0);
    const equity = totalCash + posValue;
    document.getElementById('as-wrap').innerHTML = `
      <div class="stat-grid">
        <div class="stat"><label>${t('assets.equity')}</label><b>$${R.fmt(equity)}</b>
          <span class="pill">${acc.positions.length} ${t('assets.tab.positions')}</span></div>
        <div class="stat alt"><label>${t('assets.spot_cash')}</label>
          <b>$${R.fmt(acc.spot_cash || 0)}</b>
          <span class="pill">${t('assets.spot_hint')}</span></div>
        <div class="stat alt"><label>${t('assets.option_cash')}</label>
          <b>$${R.fmt(acc.option_cash || 0)}</b>
          <span class="pill">${t('assets.option_hint')}</span></div>
        <div class="stat alt"><label>${t('assets.pnl')}</label>
          <b class="${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? '+' : ''}$${R.fmt(pnl)}</b></div>
      </div>
      <div class="row-end" style="margin-bottom:16px">
        <a href="#/service" class="btn primary">${t('assets.deposit')}</a>
        <a href="#/withdraw" class="btn outline">${t('assets.withdraw')}</a>
        <button id="as-transfer-btn" class="btn outline" type="button">${t('assets.transfer')}</button>
      </div>
      <div id="as-transfer" class="card" style="display:none;margin-bottom:16px">
        <h3>${t('assets.transfer.title')}</h3>
        <p style="color:var(--text-500);font-size:13px;margin-bottom:12px">${t('assets.transfer.tip')}</p>
        <form id="as-transfer-form" class="grid-3">
          <div class="field"><label>${t('assets.transfer.from')}</label>
            <select name="from">
              <option value="spot">${t('assets.spot_cash')}</option>
              <option value="option">${t('assets.option_cash')}</option>
            </select></div>
          <div class="field"><label>${t('assets.transfer.to')}</label>
            <select name="to">
              <option value="option">${t('assets.option_cash')}</option>
              <option value="spot">${t('assets.spot_cash')}</option>
            </select></div>
          <div class="field"><label>${t('assets.transfer.amount')} (USD)</label>
            <input name="amount" type="number" step="0.01" min="0.01" required/></div>
          <div class="field" style="grid-column:1 / -1">
            <button class="btn primary" type="submit">${t('assets.transfer.submit')}</button>
            <div class="msg" id="as-transfer-msg"></div>
          </div>
        </form>
      </div>
      <div class="tabs-pill" id="as-tabs">
        <button data-p="positions" class="active">${t('assets.tab.positions')}</button>
        <button data-p="orders">${t('assets.tab.orders')}</button>
        <button data-p="trades">${t('assets.tab.trades')}</button>
        <button data-p="deposits">${t('assets.tab.deposits')}</button>
        <button data-p="withdraws">${t('assets.tab.withdraws')}</button>
      </div>
      <div id="as-pane" style="margin-top:16px"></div>`;

    const panes = {
      positions: () => tbl(
        [t('trading.col.symbol'), t('trading.col.qty'), t('trading.col.cost'),
         t('trading.col.last'), t('trading.col.value'), t('trading.col.pnl')],
        acc.positions.map(p => [p.symbol, R.fmt(p.qty, 4), R.fmt(p.avg_price),
          R.fmt(p.last), R.fmt(p.market_value),
          `<span class="${p.pnl >= 0 ? 'buy' : 'sell'}">${R.fmt(p.pnl)}</span>`])),
      orders: () => tbl(
        [t('trading.col.time'), t('trading.col.symbol'), t('trading.col.side'),
         t('trading.col.type'), t('trading.col.price'), t('trading.col.qty'),
         t('trading.col.filled'), t('trading.col.status')],
        orders.map(o => [R.fmtTs(o.created_at), o.symbol,
          `<span class="${o.side}">${o.side === 'buy' ? t('trading.buy') : t('trading.sell')}</span>`,
          o.type === 'market' ? t('trading.market') : t('trading.limit'),
          o.price != null ? R.fmt(o.price) : '—',
          R.fmt(o.qty, 4), R.fmt(o.filled_qty, 4),
          `<span class="badge ${o.status}">${statusText(o.status)}</span>`])),
      trades: () => tbl(
        [t('trading.col.time'), t('trading.col.symbol'), t('trading.col.side'),
         t('trading.col.price'), t('trading.col.qty'), t('trading.col.fee'),
         t('trading.col.amount')],
        trades.map(tr => [R.fmtTs(tr.created_at), tr.symbol,
          `<span class="${tr.side}">${tr.side === 'buy' ? t('trading.buy') : t('trading.sell')}</span>`,
          R.fmt(tr.price), R.fmt(tr.qty, 4), R.fmt(tr.fee, 4), R.fmt(tr.price * tr.qty)])),
      deposits: () => tbl(
        [t('trading.col.time'), t('deposit.method'), t('deposit.amount'),
         t('trading.col.status')],
        deps.map(d => [R.fmtTs(d.created_at), d.method, R.fmt(d.amount),
          `<span class="badge ${d.status}">${statusText(d.status)}</span>`])),
      withdraws: () => tbl(
        [t('trading.col.time'), t('withdraw.method'), t('withdraw.amount'),
         t('trading.col.status')],
        wds.map(w => [R.fmtTs(w.created_at), w.method, R.fmt(w.amount),
          `<span class="badge ${w.status}">${statusText(w.status)}</span>`])),
    };
    function show(key) {
      document.getElementById('as-pane').innerHTML = panes[key]();
    }
    show('positions');
    document.getElementById('as-tabs').querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => {
        document.getElementById('as-tabs').querySelectorAll('button')
          .forEach(x => x.classList.toggle('active', x === b));
        show(b.dataset.p);
      }));

    // 钱包互转：按钮切换 + 表单提交
    const tBtn = document.getElementById('as-transfer-btn');
    const tBox = document.getElementById('as-transfer');
    tBtn.addEventListener('click', () => {
      tBox.style.display = tBox.style.display === 'none' ? 'block' : 'none';
    });
    const tForm = document.getElementById('as-transfer-form');
    const fromSel = tForm.querySelector('select[name=from]');
    const toSel = tForm.querySelector('select[name=to]');
    // 自动保证 from / to 不一致
    fromSel.addEventListener('change', () => {
      toSel.value = fromSel.value === 'spot' ? 'option' : 'spot';
    });
    toSel.addEventListener('change', () => {
      fromSel.value = toSel.value === 'spot' ? 'option' : 'spot';
    });
    tForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(tForm);
      const msg = document.getElementById('as-transfer-msg');
      msg.className = 'msg'; msg.textContent = '';
      try {
        await R.api('/api/account/transfer', { method: 'POST',
          body: { from: fd.get('from'), to: fd.get('to'),
                  amount: Number(fd.get('amount')) } });
        msg.className = 'msg ok'; msg.textContent = t('assets.transfer.success');
        R.toast(t('assets.transfer.success'), 'ok');
        tForm.reset();
        viewAssets(el);
      } catch (err) { msg.textContent = err.message; }
    });
  }
}

function tbl(heads, rows) {
  if (!rows.length) return `<div class="card" style="text-align:center;color:var(--text-500)">${t('common.empty')}</div>`;
  return `<table class="list">
    <thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

/* ================ DEPOSIT（直接跳转客服） ================ */
async function viewDeposit(el) {
  el.innerHTML = `<div class="page-head"><div class="wide">
    <h1>${t('deposit.title')}</h1><p>${t('deposit.sub')}</p></div></div>
    <div class="wide"><div class="card" style="text-align:center;padding:48px 24px;max-width:560px;margin:0 auto">
      <div style="font-size:48px;margin-bottom:12px">💬</div>
      <h3 style="margin:0 0 12px">${t('deposit.contact_title')}</h3>
      <p style="color:var(--text-500);margin:0 0 24px;line-height:1.7">${t('deposit.contact_tip')}</p>
      <a href="#/service" class="btn primary big">${t('deposit.contact_btn')} →</a>
    </div></div>`;
}

/* ================ WITHDRAW（4 通道 + QR + 1% 手续费 + 每日 3 次） ================ */
async function viewWithdraw(el) {
  el.innerHTML = `<div class="page-head"><div class="wide">
    <h1>${t('withdraw.title')}</h1><p>${t('withdraw.sub')}</p></div></div>
    <div class="wide"><div class="grid-2">
      <div class="card">
        <h3>${t('withdraw.title')}</h3>
        <div class="msg" style="background:var(--bg-200);color:var(--text-700);margin-bottom:14px;line-height:1.7">
          <div>⚠️ ${t('withdraw.warn.fee')}</div>
          <div>⚠️ ${t('withdraw.warn.limit')}</div>
          <div>⚠️ ${t('withdraw.warn.qr')}</div>
        </div>
        <form id="wd-form">
          <div class="field"><label>${t('withdraw.method')}</label>
            <select name="method" id="wd-method" required>
              <option value="wechat">${t('withdraw.method.wechat')}</option>
              <option value="alipay">${t('withdraw.method.alipay')}</option>
              <option value="bank">${t('withdraw.method.bank')}</option>
              <option value="usdt_trc20">${t('withdraw.method.usdt_trc20')}</option>
            </select></div>
          <div class="field"><label>${t('withdraw.amount')} (USD)</label>
            <input name="amount" id="wd-amount" type="number" step="0.01" min="10" required/>
            <small id="wd-fee-preview" style="color:var(--text-500)"></small></div>

          <div id="wd-fields"></div>

          <button class="btn primary block" type="submit">${t('withdraw.submit')}</button>
          <div class="msg" id="wd-msg"></div>
        </form>
      </div>
      <div class="card">
        <h3>${t('withdraw.history')}</h3>
        <div id="wd-list">${t('common.loading')}</div>
      </div>
    </div></div>`;

  function fieldsHtml(method) {
    if (method === 'wechat' || method === 'alipay') {
      return `
        <div class="field"><label>${t('withdraw.account_name')}</label>
          <input name="account_name" required/></div>
        <div class="field"><label>${t('withdraw.qr_code')}</label>
          <input name="qr_code" type="file" accept="image/*" required/>
          <small style="color:var(--text-500)">${t('withdraw.qr_hint')}</small></div>`;
    }
    if (method === 'bank') {
      return `
        <div class="field"><label>${t('withdraw.account_name')}</label>
          <input name="account_name" required/></div>
        <div class="field"><label>${t('withdraw.bank_name')}</label>
          <input name="bank_name" required/></div>
        <div class="field"><label>${t('withdraw.bank_account')}</label>
          <input name="address" required/></div>`;
    }
    return `
      <div class="field"><label>${t('withdraw.usdt_address')}</label>
        <input name="address" required placeholder="T..."/></div>`;
  }

  function updatePreview() {
    const amt = Number(document.getElementById('wd-amount').value);
    const prev = document.getElementById('wd-fee-preview');
    if (!(amt >= 10)) { prev.textContent = ''; return; }
    const fee = +(amt * 0.01).toFixed(2);
    const net = +(amt - fee).toFixed(2);
    prev.textContent = `${t('withdraw.fee')}: $${fee}  ·  ${t('withdraw.net')}: $${net}`;
  }

  function rerender() {
    document.getElementById('wd-fields').innerHTML =
      fieldsHtml(document.getElementById('wd-method').value);
  }
  rerender();
  document.getElementById('wd-method').addEventListener('change', rerender);
  document.getElementById('wd-amount').addEventListener('input', updatePreview);

  async function refresh() {
    const list = await R.api('/api/withdraw-requests');
    document.getElementById('wd-list').innerHTML = tbl(
      [t('trading.col.time'), t('withdraw.method'), t('withdraw.amount'),
       t('withdraw.fee'), t('trading.col.status')],
      list.map(w => [R.fmtTs(w.created_at), t('withdraw.method.' + w.method) || w.method,
        R.fmt(w.amount), R.fmt(w.fee || 0),
        `<span class="badge ${w.status}">${statusText(w.status)}</span>`]));
  }
  refresh();

  document.getElementById('wd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById('wd-msg');
    try {
      // 后端使用 multer 接收 multipart，所以直接传 FormData
      const r = await R.api('/api/withdraw-requests', { method: 'POST', body: fd });
      msg.className = 'msg ok';
      msg.textContent = `${t('withdraw.success')} ${t('withdraw.fee')}: $${R.fmt(r.fee)}, ${t('withdraw.net')}: $${R.fmt(r.net_amount)}`;
      R.toast(t('withdraw.success'), 'ok');
      e.target.reset(); rerender(); updatePreview(); refresh();
    } catch (err) { msg.className = 'msg'; msg.textContent = err.message; }
  });
}

/* ================ KYC（两段式） ================ */
async function viewKyc(el) {
  el.innerHTML = `<div class="page-head"><div class="wide">
    <h1>${t('kyc.title')}</h1><p>${t('kyc.sub')}</p></div></div>
    <div class="wide"><div id="kyc-wrap">${t('common.loading')}</div></div>`;
  const k = await R.api('/api/kyc');
  const lvl = k.kyc_level || 0;
  const advStatus = k.advanced_status || 'unsubmitted';
  const basicLocked = lvl >= 1; // 初级已通过 → 表单只读

  document.getElementById('kyc-wrap').innerHTML = `
    <div class="grid-2">
      <div class="card">
        <h3>${t('kyc.basic.title')}
          <span class="badge ${lvl >= 1 ? 'approved' : 'pending'}" style="margin-left:8px">
            ${lvl >= 1 ? t('kyc.basic.passed') : t('kyc.basic.todo')}</span></h3>
        <p style="color:var(--text-500);font-size:13px;margin-bottom:12px">${t('kyc.basic.desc')}</p>
        <form id="kyc-basic">
          <div class="field"><label>${t('kyc.real_name')}</label>
            <input name="real_name" value="${k.real_name || ''}" required ${basicLocked ? 'disabled' : ''}/></div>
          <div class="field"><label>${t('kyc.id_type')}</label>
            <select name="id_type" ${basicLocked ? 'disabled' : ''}>
              <option value="id_card"${k.id_type === 'id_card' ? ' selected' : ''}>${t('kyc.id_card')}</option>
              <option value="passport"${k.id_type === 'passport' ? ' selected' : ''}>${t('kyc.passport')}</option>
              <option value="driver"${k.id_type === 'driver' ? ' selected' : ''}>${t('kyc.driver')}</option>
            </select></div>
          <div class="field"><label>${t('kyc.id_number')}</label>
            <input name="id_number" value="${k.id_number || ''}" required ${basicLocked ? 'disabled' : ''}/></div>
          <button class="btn primary block" type="submit" ${basicLocked ? 'disabled' : ''}>${t('kyc.basic.submit')}</button>
          <div class="msg" id="kyc-basic-msg"></div>
        </form>
      </div>
      <div class="card">
        <h3>${t('kyc.advanced.title')}
          <span class="badge ${lvl >= 2 ? 'approved' : advStatus}" style="margin-left:8px">
            ${lvl >= 2 ? t('kyc.advanced.passed') : statusText(advStatus)}</span></h3>
        <p style="color:var(--text-500);font-size:13px;margin-bottom:12px">${t('kyc.advanced.desc')}</p>
        ${lvl < 1 ? `<div class="msg">${t('kyc.advanced.need_basic')}</div>` : ''}
        ${lvl >= 2 ? `<div class="msg ok">${t('kyc.advanced.reward_received')}</div>` : `
        <form id="kyc-advanced" enctype="multipart/form-data" ${lvl < 1 || advStatus === 'reviewing' ? 'style="opacity:.55;pointer-events:none"' : ''}>
          <div class="field"><label>${t('kyc.id_front')}</label>
            <input type="file" name="id_front" accept="image/*" required/></div>
          <div class="field"><label>${t('kyc.id_back')}</label>
            <input type="file" name="id_back" accept="image/*" required/></div>
          <div class="field"><label>${t('kyc.holding')}</label>
            <input type="file" name="holding" accept="image/*" required/></div>
          <p style="color:var(--brand-300);font-size:12px;margin:8px 0">${t('kyc.advanced.reward_hint')}</p>
          <button class="btn primary block" type="submit">${t('kyc.advanced.submit')}</button>
          <div class="msg" id="kyc-adv-msg"></div>
        </form>`}
        <p style="color:var(--text-500);font-size:13px;margin-top:16px">🔒 ${t('kyc.tip')}</p>
      </div>
    </div>`;

  if (!basicLocked) {
    document.getElementById('kyc-basic').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const msg = document.getElementById('kyc-basic-msg');
      try {
        await R.api('/api/kyc/basic', { method: 'POST',
          body: Object.fromEntries(fd.entries()) });
        R.toast(t('kyc.basic.success'), 'ok');
        viewKyc(el);
      } catch (err) { msg.className = 'msg'; msg.textContent = err.message; }
    });
  }
  const advForm = document.getElementById('kyc-advanced');
  if (advForm && lvl >= 1 && advStatus !== 'reviewing') {
    advForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const msg = document.getElementById('kyc-adv-msg');
      try {
        // multipart 上传走 fetch 直接传 FormData，不要 JSON
        await R.api('/api/kyc/advanced', { method: 'POST', body: fd, raw: true });
        R.toast(t('kyc.advanced.success'), 'ok');
        viewKyc(el);
      } catch (err) { msg.className = 'msg'; msg.textContent = err.message; }
    });
  }
}

export function registerAccount() {
  R.register('/assets', { render: viewAssets, auth: true });
  R.register('/deposit', { render: viewDeposit, auth: true });
  R.register('/withdraw', { render: viewWithdraw, auth: true });
  R.register('/kyc', { render: viewKyc, auth: true });
}


