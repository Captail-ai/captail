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
    const equity = acc.cash + posValue;
    document.getElementById('as-wrap').innerHTML = `
      <div class="stat-grid">
        <div class="stat"><label>${t('assets.equity')}</label><b>$${R.fmt(equity)}</b>
          <span class="pill">${acc.positions.length} ${t('assets.tab.positions')}</span></div>
        <div class="stat alt"><label>${t('assets.cash')}</label><b>$${R.fmt(acc.cash)}</b></div>
        <div class="stat alt"><label>${t('assets.positions_value')}</label><b>$${R.fmt(posValue)}</b></div>
        <div class="stat alt"><label>${t('assets.pnl')}</label>
          <b class="${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? '+' : ''}$${R.fmt(pnl)}</b></div>
      </div>
      <div class="row-end" style="margin-bottom:16px">
        <a href="#/deposit" class="btn primary">${t('assets.deposit')}</a>
        <a href="#/withdraw" class="btn outline">${t('assets.withdraw')}</a>
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
  }
}

function tbl(heads, rows) {
  if (!rows.length) return `<div class="card" style="text-align:center;color:var(--text-500)">${t('common.empty')}</div>`;
  return `<table class="list">
    <thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

/* ================ DEPOSIT ================ */
async function viewDeposit(el) {
  el.innerHTML = `<div class="page-head"><div class="wide">
    <h1>${t('deposit.title')}</h1><p>${t('deposit.sub')}</p></div></div>
    <div class="wide"><div class="grid-2">
      <div class="card">
        <h3>${t('deposit.title')}</h3>
        <form id="dep-form">
          <div class="field"><label>${t('deposit.method')}</label>
            <select name="method" required>
              <option value="bank">${t('deposit.method.bank')}</option>
              <option value="usdt">${t('deposit.method.usdt')}</option>
              <option value="wallet">${t('deposit.method.wallet')}</option>
            </select></div>
          <div class="field"><label>${t('deposit.amount')} (USD)</label>
            <input name="amount" type="number" step="0.01" min="1" max="1000000" required/></div>
          <div class="field"><label>${t('deposit.ref')}</label>
            <input name="ref_info" placeholder="tx hash / remark"/></div>
          <button class="btn primary block" type="submit">${t('deposit.submit')}</button>
          <div class="msg" id="dep-msg"></div>
        </form>
      </div>
      <div class="card">
        <h3>${t('deposit.history')}</h3>
        <div id="dep-list">${t('common.loading')}</div>
      </div>
    </div></div>`;
  async function refresh() {
    const list = await R.api('/api/deposit-requests');
    document.getElementById('dep-list').innerHTML = tbl(
      [t('trading.col.time'), t('deposit.method'), t('deposit.amount'), t('trading.col.status')],
      list.map(d => [R.fmtTs(d.created_at), d.method, R.fmt(d.amount),
        `<span class="badge ${d.status}">${statusText(d.status)}</span>`]));
  }
  refresh();
  document.getElementById('dep-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById('dep-msg');
    try {
      await R.api('/api/deposit-requests', { method: 'POST',
        body: { method: fd.get('method'), amount: Number(fd.get('amount')), ref_info: fd.get('ref_info') } });
      msg.className = 'msg ok'; msg.textContent = t('deposit.success');
      R.toast(t('deposit.success'), 'ok');
      e.target.reset();
      refresh();
    } catch (err) { msg.className = 'msg'; msg.textContent = err.message; }
  });
}

/* ================ WITHDRAW ================ */
async function viewWithdraw(el) {
  el.innerHTML = `<div class="page-head"><div class="wide">
    <h1>${t('withdraw.title')}</h1><p>${t('withdraw.sub')}</p></div></div>
    <div class="wide"><div class="grid-2">
      <div class="card">
        <h3>${t('withdraw.title')}</h3>
        <form id="wd-form">
          <div class="field"><label>${t('withdraw.method')}</label>
            <select name="method" required>
              <option value="bank">${t('deposit.method.bank')}</option>
              <option value="usdt">${t('deposit.method.usdt')}</option>
              <option value="wallet">${t('deposit.method.wallet')}</option>
            </select></div>
          <div class="field"><label>${t('withdraw.amount')} (USD)</label>
            <input name="amount" type="number" step="0.01" min="1" required/></div>
          <div class="field"><label>${t('withdraw.target')}</label>
            <input name="target" required/></div>
          <button class="btn primary block" type="submit">${t('withdraw.submit')}</button>
          <div class="msg" id="wd-msg"></div>
        </form>
      </div>
      <div class="card">
        <h3>${t('withdraw.history')}</h3>
        <div id="wd-list">${t('common.loading')}</div>
      </div>
    </div></div>`;
  async function refresh() {
    const list = await R.api('/api/withdraw-requests');
    document.getElementById('wd-list').innerHTML = tbl(
      [t('trading.col.time'), t('withdraw.method'), t('withdraw.amount'), t('trading.col.status')],
      list.map(w => [R.fmtTs(w.created_at), w.method, R.fmt(w.amount),
        `<span class="badge ${w.status}">${statusText(w.status)}</span>`]));
  }
  refresh();
  document.getElementById('wd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById('wd-msg');
    try {
      await R.api('/api/withdraw-requests', { method: 'POST',
        body: { method: fd.get('method'), amount: Number(fd.get('amount')), target: fd.get('target') } });
      msg.className = 'msg ok'; msg.textContent = t('withdraw.success');
      R.toast(t('withdraw.success'), 'ok');
      e.target.reset(); refresh();
    } catch (err) { msg.className = 'msg'; msg.textContent = err.message; }
  });
}

/* ================ KYC ================ */
async function viewKyc(el) {
  el.innerHTML = `<div class="page-head"><div class="wide">
    <h1>${t('kyc.title')}</h1><p>${t('kyc.sub')}</p></div></div>
    <div class="wide"><div id="kyc-wrap">${t('common.loading')}</div></div>`;
  const k = await R.api('/api/kyc');
  const disabled = k.status === 'reviewing' || k.status === 'approved';
  document.getElementById('kyc-wrap').innerHTML = `
    <div class="grid-2">
      <div class="card">
        <h3>${t('kyc.title')}</h3>
        <form id="kyc-form">
          <div class="field"><label>${t('kyc.real_name')}</label>
            <input name="real_name" value="${k.real_name || ''}" required ${disabled ? 'disabled' : ''}/></div>
          <div class="field"><label>${t('kyc.id_type')}</label>
            <select name="id_type" ${disabled ? 'disabled' : ''}>
              <option value="id_card"${k.id_type === 'id_card' ? ' selected' : ''}>${t('kyc.id_card')}</option>
              <option value="passport"${k.id_type === 'passport' ? ' selected' : ''}>${t('kyc.passport')}</option>
              <option value="driver"${k.id_type === 'driver' ? ' selected' : ''}>${t('kyc.driver')}</option>
            </select></div>
          <div class="field"><label>${t('kyc.id_number')}</label>
            <input name="id_number" value="${k.id_number || ''}" required ${disabled ? 'disabled' : ''}/></div>
          <div class="field"><label>${t('kyc.country')}</label>
            <input name="country" value="${k.country || ''}" required ${disabled ? 'disabled' : ''}/></div>
          <button class="btn primary block" type="submit" ${disabled ? 'disabled' : ''}>${t('kyc.submit')}</button>
          <div class="msg" id="kyc-msg"></div>
        </form>
      </div>
      <div class="card">
        <h3>${t('profile.kyc_status')}</h3>
        <div style="margin:8px 0 20px"><span class="badge ${k.status}">${statusText(k.status)}</span></div>
        ${k.submitted_at ? `<div class="kv">
          <label>${t('trading.col.time')}</label><b>${R.fmtTs(k.submitted_at)}</b>
        </div>` : ''}
        <p style="color:var(--text-500);font-size:13px;margin-top:16px">🔒 ${t('kyc.tip')}</p>
      </div>
    </div>`;
  if (!disabled) {
    document.getElementById('kyc-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await R.api('/api/kyc', { method: 'POST',
          body: Object.fromEntries(fd.entries()) });
        R.toast('Submitted', 'ok'); viewKyc(el);
      } catch (err) {
        document.getElementById('kyc-msg').className = 'msg';
        document.getElementById('kyc-msg').textContent = err.message;
      }
    });
  }
}

export function registerAccount() {
  R.register('/assets', { render: viewAssets, auth: true });
  R.register('/deposit', { render: viewDeposit, auth: true });
  R.register('/withdraw', { render: viewWithdraw, auth: true });
  R.register('/kyc', { render: viewKyc, auth: true });
}


