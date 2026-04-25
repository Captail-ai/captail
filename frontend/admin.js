import { t } from './i18n.js';
import * as R from './router.js';

const tabs = [
  { k: 'users',     key: 'admin.tab.users' },
  { k: 'kyc',       key: 'admin.tab.kyc' },
  { k: 'deposits',  key: 'admin.tab.deposits' },
  { k: 'withdraws', key: 'admin.tab.withdraws' },
  { k: 'messages',  key: 'admin.tab.messages' },
  { k: 'news',      key: 'admin.tab.news' },
  { k: 'ops',       key: 'admin.tab.ops' },
  { k: 'security',  key: 'admin.tab.security' },
  { k: 'settings',  key: 'admin.tab.settings' },
];

async function viewAdmin(el) {
  const a = R.auth();
  if (!a.user || !a.user.is_admin) {
    el.innerHTML = `<div class="page-head"><div class="wide"><h1>${t('admin.title')}</h1>
      <p class="msg">${t('admin.only')}</p></div></div>`;
    return;
  }

  const s = { tab: 'users', autoOps: false, autoSec: false };
  let autoTimer = null;
  function stopAuto() { if (autoTimer) { clearInterval(autoTimer); autoTimer = null; } }
  function startAuto(fn) { stopAuto(); autoTimer = setInterval(fn, 5000); }
  el.innerHTML = `
    <div class="page-head"><div class="wide">
      <h1>${t('admin.title')}</h1><p>${t('admin.sub')}</p>
    </div></div>
    <div class="wide">
      <div class="stat-grid" id="ad-overview"></div>
      <div class="tabs" id="ad-tabs">
        ${tabs.map(x => `<button class="tb ${x.k === s.tab ? 'active' : ''}" data-k="${x.k}">${t(x.key)}</button>`).join('')}
      </div>
      <div class="card" id="ad-body">${t('common.loading')}</div>
    </div>`;

  async function loadOverview() {
    try {
      const o = await R.api('/api/admin/overview');
      document.getElementById('ad-overview').innerHTML = [
        ['admin.users', o.userCount], ['admin.kyc_pending', o.kycPending],
        ['admin.dep_pending', o.depPending], ['admin.wd_pending', o.wdPending],
        ['admin.trade24_count', o.trade24Count],
        ['admin.trade24_vol', '$' + R.fmt(o.trade24Volume)],
      ].map(([k, v]) => `<div class="stat"><div class="k">${t(k)}</div><div class="v">${v}</div></div>`).join('');
    } catch (e) { document.getElementById('ad-overview').innerHTML = `<div class="msg">${e.message}</div>`; }
  }

  function table(headers, rows) {
    return `<table class="list"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--text-500)">${t('common.empty')}</td></tr>`}</tbody></table>`;
  }

  async function loadTab() {
    const host = document.getElementById('ad-body');
    host.innerHTML = t('common.loading');
    try {
      if (s.tab === 'users') {
        const rows = await R.api('/api/admin/users');
        host.innerHTML = table(
          [t('admin.col.user'), t('admin.col.email'), t('admin.col.phone'),
           t('admin.col.cash'), t('admin.col.kyc'), t('admin.col.created'), t('admin.col.action')],
          rows.map(u => `<tr data-uid="${u.id}"><td><b>${u.username}</b>${u.is_banned ? ' <span class="badge rejected">'+t('admin.banned')+'</span>' : ''}<br/><small>#${u.id}</small></td>
            <td>${u.email || '—'}</td><td>${u.phone || '—'}</td><td>$${R.fmt(u.cash || 0)}</td>
            <td><span class="badge ${u.kyc_status || 'unsubmitted'}">${t('status.' + (u.kyc_status || 'unsubmitted'))}</span></td>
            <td>${R.fmtTs(u.created_at)}</td>
            <td><button class="btn small" data-detail="${u.id}">${t('admin.detail')}</button></td></tr>`));
        host.querySelectorAll('button[data-detail]').forEach(b =>
          b.addEventListener('click', () => openUserDetail(Number(b.dataset.detail))));
      } else if (s.tab === 'news') {
        await renderNewsTab(host);
      } else if (s.tab === 'ops') {
        await renderOpsTab(host);
      } else if (s.tab === 'security') {
        await renderSecurityTab(host);
      } else if (s.tab === 'settings') {
        await renderSettingsTab(host);
      } else if (s.tab === 'kyc') {
        const rows = await R.api('/api/admin/kyc');
        host.innerHTML = table(
          [t('admin.col.user'), t('admin.col.name'), t('admin.col.id'), t('admin.col.country'), t('admin.col.status'), t('admin.col.action')],
          rows.map(k => `<tr><td>${k.username}</td><td>${k.real_name || '—'}</td>
            <td>${k.id_number || '—'}</td><td>${k.country || '—'}</td>
            <td><span class="badge ${k.status}">${t('status.' + k.status)}</span></td>
            <td>${k.status === 'reviewing' ? `
              <button class="btn small ok" data-act="approve" data-uid="${k.user_id}" data-kind="kyc">${t('common.approve')}</button>
              <button class="btn small danger" data-act="reject" data-uid="${k.user_id}" data-kind="kyc">${t('common.reject')}</button>` : '—'}</td></tr>`));
      } else if (s.tab === 'deposits' || s.tab === 'withdraws') {
        const rows = await R.api('/api/admin/' + s.tab);
        host.innerHTML = table(
          [t('admin.col.user'), t('admin.col.method'), t('admin.col.amount'),
           s.tab === 'deposits' ? t('admin.col.ref') : t('admin.col.target'),
           t('admin.col.status'), t('admin.col.created'), t('admin.col.action')],
          rows.map(d => `<tr><td>${d.username}</td><td>${d.method}</td>
            <td>$${R.fmt(d.amount)}</td><td>${d.ref_info || d.target || '—'}</td>
            <td><span class="badge ${d.status}">${t('status.' + d.status)}</span></td>
            <td>${R.fmtTs(d.created_at)}</td>
            <td>${d.status === 'pending' ? `
              <button class="btn small ok" data-act="approve" data-id="${d.id}" data-kind="${s.tab}">${t('common.approve')}</button>
              <button class="btn small danger" data-act="reject" data-id="${d.id}" data-kind="${s.tab}">${t('common.reject')}</button>` : '—'}</td></tr>`));
      } else if (s.tab === 'messages') {
        const rows = await R.api('/api/admin/messages');
        host.innerHTML = table(
          [t('admin.col.user'), t('admin.col.name'), t('admin.col.email'), t('admin.col.content'), t('admin.col.created')],
          rows.map(m => `<tr><td>${m.username || '—'}</td><td>${m.name || '—'}</td>
            <td>${m.email || '—'}</td><td style="max-width:360px;white-space:normal">${m.content}</td>
            <td>${R.fmtTs(m.created_at)}</td></tr>`));
      }
      host.querySelectorAll('button[data-act]').forEach(b => b.addEventListener('click', async () => {
        const { act, kind, id, uid } = b.dataset;
        if (!confirm(t('admin.confirm'))) return;
        try {
          if (kind === 'kyc') await R.api('/api/admin/kyc/' + uid, { method: 'POST', body: { action: act } });
          else                await R.api(`/api/admin/${kind}/${id}`, { method: 'POST', body: { action: act } });
          R.toast('OK', 'ok'); loadOverview(); loadTab();
        } catch (e) { R.toast(e.message, 'error'); }
      }));
    } catch (e) { host.innerHTML = `<div class="msg">${e.message}</div>`; }
  }

  /* ---------------- user detail modal ---------------- */
  async function openUserDetail(uid) {
    let d;
    try { d = await R.api('/api/admin/users/' + uid); }
    catch (e) { R.toast(e.message, 'error'); return; }
    const u = d.user, a = d.account, k = d.kyc;
    const host = document.createElement('div');
    host.className = 'modal-back';
    host.innerHTML = `
      <div class="modal wide">
        <div class="modal-head"><h3>${t('admin.user_detail')} · ${u.username} <small>#${u.id}</small></h3>
          <button class="x" data-close>×</button></div>
        <div class="modal-body grid-2">
          <div class="card">
            <h4>${t('admin.edit_profile')}</h4>
            <form id="uf-edit" class="space-y">
              <div class="field"><label>${t('profile.email')}</label><input name="email" value="${u.email || ''}"/></div>
              <div class="field"><label>${t('profile.phone')}</label><input name="phone" value="${u.phone || ''}"/></div>
              <div class="field"><label>${t('profile.nickname')}</label><input name="nickname" value="${u.nickname || ''}"/></div>
              <div class="field"><label>${t('admin.new_password')}</label><input name="password" type="password" placeholder="${t('admin.leave_blank')}"/></div>
              <div class="field"><label><input type="checkbox" name="is_admin" ${u.is_admin ? 'checked' : ''}/> ${t('admin.is_admin')}</label></div>
              <div class="field"><label><input type="checkbox" name="is_banned" ${u.is_banned ? 'checked' : ''}/> ${t('admin.is_banned')}</label></div>
              <button class="btn primary" type="submit">${t('profile.save')}</button>
            </form>
          </div>
          <div class="card">
            <h4>${t('admin.adjust_cash')}</h4>
            <p><b>${t('admin.col.cash')}:</b> $${R.fmt(a.cash)}</p>
            <form id="uf-cash" class="space-y">
              <div class="field"><label>${t('admin.mode')}</label>
                <select name="mode">
                  <option value="adjust">${t('admin.mode.adjust')}</option>
                  <option value="set">${t('admin.mode.set')}</option>
                </select></div>
              <div class="field"><label>${t('admin.col.amount')}</label><input name="amount" type="number" step="0.01" required/></div>
              <button class="btn primary" type="submit">${t('common.apply')}</button>
            </form>
            <h4 style="margin-top:20px">${t('admin.adjust_position')}</h4>
            <form id="uf-pos" class="space-y">
              <div class="field"><label>${t('trading.col.symbol')}</label>
                <select name="symbol">${['XAU','XAG','XPT','XPD'].map(x => `<option value="${x}">${x}</option>`).join('')}</select></div>
              <div class="field"><label>${t('trading.col.qty')}</label><input name="qty" type="number" step="0.0001" required/></div>
              <div class="field"><label>${t('admin.avg_price')}</label><input name="avg_price" type="number" step="0.01" required/></div>
              <button class="btn primary" type="submit">${t('common.apply')}</button>
            </form>
          </div>
          <div class="card" style="grid-column: 1/-1">
            <h4>${t('admin.overview_title')}</h4>
            <div class="kv">
              <label>KYC</label><b><span class="badge ${k.status}">${t('status.'+k.status)}</span> ${k.real_name || ''}</b>
              <label>${t('admin.positions')}</label><b>${d.positions.map(p => `${p.symbol} ${R.fmt(p.qty,4)}@${R.fmt(p.avg_price)}`).join(' · ') || '—'}</b>
              <label>${t('admin.recent_orders')}</label><b>${d.orders.length}</b>
              <label>${t('admin.recent_trades')}</label><b>${d.trades.length}</b>
              <label>${t('admin.deposits')}</label><b>${d.deposits.length}</b>
              <label>${t('admin.withdraws')}</label><b>${d.withdraws.length}</b>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(host);
    const close = () => host.remove();
    host.querySelector('[data-close]').addEventListener('click', close);
    host.addEventListener('click', (e) => { if (e.target === host) close(); });

    host.querySelector('#uf-edit').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        email: fd.get('email') || '',
        phone: fd.get('phone') || '',
        nickname: fd.get('nickname') || '',
        is_admin:  e.target.is_admin.checked,
        is_banned: e.target.is_banned.checked,
      };
      const pw = fd.get('password'); if (pw) body.password = pw;
      try { await R.api('/api/admin/users/' + uid, { method: 'POST', body });
        R.toast('OK', 'ok'); close(); loadTab(); }
      catch (err) { R.toast(err.message, 'error'); }
    });
    host.querySelector('#uf-cash').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { await R.api(`/api/admin/users/${uid}/cash`, { method: 'POST',
        body: { mode: fd.get('mode'), amount: Number(fd.get('amount')) } });
        R.toast('OK', 'ok'); close(); loadTab(); loadOverview(); }
      catch (err) { R.toast(err.message, 'error'); }
    });
    host.querySelector('#uf-pos').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { await R.api(`/api/admin/users/${uid}/positions`, { method: 'POST',
        body: { symbol: fd.get('symbol'),
                qty: Number(fd.get('qty')), avg_price: Number(fd.get('avg_price')) } });
        R.toast('OK', 'ok'); close(); loadTab(); }
      catch (err) { R.toast(err.message, 'error'); }
    });
  }

  /* ---------------- news tab ---------------- */
  async function renderNewsTab(host) {
    const rows = await R.api('/api/admin/news');
    host.innerHTML = `
      <div style="margin-bottom:12px"><button class="btn primary" id="news-new">+ ${t('admin.news.add')}</button></div>
      ${table([t('admin.col.created'), t('admin.news.title_zh'), t('admin.news.title_en'), t('admin.col.action')],
        rows.map(n => `<tr data-nid="${n.id}">
          <td>${n.date}</td><td>${n.title_zh}</td><td>${n.title_en}</td>
          <td><button class="btn small" data-news-edit="${n.id}">${t('admin.edit')}</button>
              <button class="btn small danger" data-news-del="${n.id}">${t('admin.delete')}</button></td></tr>`))}`;
    host.querySelector('#news-new').addEventListener('click', () => openNewsEditor(null));
    host.querySelectorAll('button[data-news-edit]').forEach(b =>
      b.addEventListener('click', () => openNewsEditor(rows.find(x => x.id === Number(b.dataset.newsEdit)))));
    host.querySelectorAll('button[data-news-del]').forEach(b =>
      b.addEventListener('click', async () => {
        if (!confirm(t('admin.confirm'))) return;
        try { await R.api('/api/admin/news/' + b.dataset.newsDel, { method: 'DELETE' });
          R.toast('OK', 'ok'); loadTab(); }
        catch (e) { R.toast(e.message, 'error'); }
      }));
  }

  function openNewsEditor(n) {
    const isEdit = !!n;
    const m = document.createElement('div');
    m.className = 'modal-back';
    m.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>${isEdit ? t('admin.edit') : t('admin.news.add')}</h3>
          <button class="x" data-close>×</button></div>
        <div class="modal-body">
          <form id="news-form" class="space-y">
            <div class="field"><label>${t('admin.col.created')}</label><input name="date" type="date" required value="${n?.date || new Date().toISOString().slice(0,10)}"/></div>
            <div class="field"><label>${t('admin.news.title_zh')}</label><input name="title_zh" required value="${n?.title_zh || ''}"/></div>
            <div class="field"><label>${t('admin.news.title_en')}</label><input name="title_en" required value="${n?.title_en || ''}"/></div>
            <div class="field"><label>${t('admin.news.summary_zh')}</label><textarea name="summary_zh" rows="2">${n?.summary_zh || ''}</textarea></div>
            <div class="field"><label>${t('admin.news.summary_en')}</label><textarea name="summary_en" rows="2">${n?.summary_en || ''}</textarea></div>
            <div class="field"><label>${t('admin.news.body_zh')}</label><textarea name="body_zh" rows="4">${n?.body_zh || ''}</textarea></div>
            <div class="field"><label>${t('admin.news.body_en')}</label><textarea name="body_en" rows="4">${n?.body_en || ''}</textarea></div>
            <button class="btn primary" type="submit">${t('profile.save')}</button>
          </form>
        </div>
      </div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.querySelector('[data-close]').addEventListener('click', close);
    m.addEventListener('click', (e) => { if (e.target === m) close(); });
    m.querySelector('#news-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      try {
        if (isEdit) await R.api('/api/admin/news/' + n.id, { method: 'PUT', body });
        else        await R.api('/api/admin/news',        { method: 'POST', body });
        R.toast('OK', 'ok'); close(); loadTab();
      } catch (err) { R.toast(err.message, 'error'); }
    });
  }

  /* ---------------- ops / audit log tab ---------------- */
  async function renderOpsTab(host) {
    host.innerHTML = `
      <form class="filter-row" id="ops-filter">
        <input name="action" placeholder="${t('admin.ops.filter_action')}" value="${s.opsAction || ''}"/>
        <input name="target" type="number" min="1" placeholder="${t('admin.ops.filter_target')}" value="${s.opsTarget || ''}"/>
        <button class="btn small" type="submit">${t('admin.ops.reload')}</button>
        <button class="btn small" type="reset">${t('admin.ops.clear')}</button>
        <label class="auto-refresh"><input type="checkbox" id="ops-auto" ${s.autoOps ? 'checked' : ''}/> ${t('admin.auto_refresh')}</label>
      </form>
      <div id="ops-body">${t('common.loading')}</div>`;
    const form = host.querySelector('#ops-filter');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      s.opsAction = (fd.get('action') || '').trim();
      s.opsTarget = (fd.get('target') || '').trim();
      loadOps();
    });
    form.addEventListener('reset', () => {
      s.opsAction = ''; s.opsTarget = '';
      setTimeout(loadOps, 0);
    });
    host.querySelector('#ops-auto').addEventListener('change', (e) => {
      s.autoOps = e.target.checked;
      if (s.autoOps) startAuto(loadOps); else stopAuto();
    });
    if (s.autoOps) startAuto(loadOps); else stopAuto();
    await loadOps();

    async function loadOps() {
      const body = host.querySelector('#ops-body');
      const q = new URLSearchParams({ limit: '200' });
      if (s.opsAction) q.set('action', s.opsAction);
      if (s.opsTarget) q.set('target', s.opsTarget);
      try {
        const rows = await R.api('/api/admin/ops?' + q.toString());
        body.innerHTML = rows.length ? table(
          [t('admin.col.created'), t('admin.ops.admin'), t('admin.ops.action'),
           t('admin.ops.target'), t('admin.ops.details')],
          rows.map(r => `<tr>
            <td>${R.fmtTs(r.created_at)}</td>
            <td>${escapeHtml(r.admin_username)} <small>#${r.admin_id}</small></td>
            <td><code>${escapeHtml(r.action)}</code></td>
            <td>${r.target_user_id ? '#' + r.target_user_id : '—'}</td>
            <td><small style="color:var(--text-500)">${r.details ? escapeHtml(JSON.stringify(r.details)) : '—'}</small></td>
          </tr>`))
          : `<div class="msg">${t('common.empty')}</div>`;
      } catch (e) { body.innerHTML = `<div class="msg">${e.message}</div>`; }
    }
  }

  /* ---------------- security events tab ---------------- */
  async function renderSecurityTab(host) {
    host.innerHTML = `
      <form class="filter-row" id="sec-filter">
        <input name="kind" placeholder="${t('admin.sec.filter_kind')}" value="${s.secKind || ''}"/>
        <input name="user_id" type="number" min="1" placeholder="${t('admin.sec.filter_user')}" value="${s.secUser || ''}"/>
        <button class="btn small" type="submit">${t('admin.ops.reload')}</button>
        <button class="btn small" type="reset">${t('admin.ops.clear')}</button>
        <label class="auto-refresh"><input type="checkbox" id="sec-auto" ${s.autoSec ? 'checked' : ''}/> ${t('admin.auto_refresh')}</label>
      </form>
      <div id="sec-body">${t('common.loading')}</div>`;
    const form = host.querySelector('#sec-filter');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      s.secKind = (fd.get('kind') || '').trim();
      s.secUser = (fd.get('user_id') || '').trim();
      loadSec();
    });
    form.addEventListener('reset', () => {
      s.secKind = ''; s.secUser = '';
      setTimeout(loadSec, 0);
    });
    host.querySelector('#sec-auto').addEventListener('change', (e) => {
      s.autoSec = e.target.checked;
      if (s.autoSec) startAuto(loadSec); else stopAuto();
    });
    if (s.autoSec) startAuto(loadSec); else stopAuto();
    await loadSec();

    async function loadSec() {
      const body = host.querySelector('#sec-body');
      const q = new URLSearchParams({ limit: '200' });
      if (s.secKind) q.set('kind', s.secKind);
      if (s.secUser) q.set('user_id', s.secUser);
      try {
        const rows = await R.api('/api/admin/security?' + q.toString());
        body.innerHTML = rows.length ? table(
          [t('admin.col.created'), t('admin.sec.kind'), t('admin.sec.user'),
           t('admin.sec.ip'), t('admin.ops.details')],
          rows.map(r => `<tr>
            <td>${R.fmtTs(r.created_at)}</td>
            <td><code>${escapeHtml(r.kind)}</code></td>
            <td>${r.user_id ? (escapeHtml(r.username || '?') + ' <small>#' + r.user_id + '</small>') : (r.username ? escapeHtml(r.username) : '—')}</td>
            <td><small style="color:var(--text-500)">${r.ip ? escapeHtml(r.ip) : '—'}</small></td>
            <td><small style="color:var(--text-500)">${r.details ? escapeHtml(JSON.stringify(r.details)) : '—'}</small></td>
          </tr>`))
          : `<div class="msg">${t('common.empty')}</div>`;
      } catch (e) { body.innerHTML = `<div class="msg">${e.message}</div>`; }
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------------- 系统设置 tab ---------------- */
  async function renderSettingsTab(host) {
    const cfg = await R.api('/api/admin/settings');
    const svc = (cfg.service_url && cfg.service_url.value) || '';
    const fin = ((cfg.feature_finance && cfg.feature_finance.value) ?? '1') !== '0';
    const loan = ((cfg.feature_loan && cfg.feature_loan.value) ?? '1') !== '0';
    host.innerHTML = `
      <form id="set-form" class="space-y" style="max-width:640px">
        <div class="field">
          <label>${t('admin.settings.service_url')}</label>
          <input name="service_url" type="url" value="${svc}" placeholder="https://..."/>
          <small style="color:var(--text-500)">${t('admin.settings.service_url_hint')}</small>
        </div>
        <div class="field">
          <label>${t('admin.settings.features')}</label>
          <label class="chk"><input type="checkbox" name="feature_finance" ${fin ? 'checked' : ''}/>
            <span>${t('admin.settings.feature_finance')}</span></label>
          <label class="chk"><input type="checkbox" name="feature_loan" ${loan ? 'checked' : ''}/>
            <span>${t('admin.settings.feature_loan')}</span></label>
          <small style="color:var(--text-500)">${t('admin.settings.feature_hint')}</small>
        </div>
        <button class="btn primary" type="submit">${t('profile.save')}</button>
      </form>`;
    host.querySelector('#set-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const items = [
        { key: 'service_url',     value: fd.get('service_url') || '' },
        { key: 'feature_finance', value: fd.get('feature_finance') ? '1' : '0' },
        { key: 'feature_loan',    value: fd.get('feature_loan')    ? '1' : '0' },
      ];
      try {
        for (const it of items) {
          await R.api('/api/admin/settings', { method: 'POST', body: it });
        }
        R.toast('OK', 'ok');
        // 通知 app.js 重新拉取公开配置并刷新导航显隐
        if (typeof window.__refreshFeatures === 'function') window.__refreshFeatures();
      } catch (err) { R.toast(err.message, 'error'); }
    });
  }

  document.getElementById('ad-tabs').querySelectorAll('.tb').forEach(b => b.addEventListener('click', () => {
    stopAuto();
    s.tab = b.dataset.k;
    document.getElementById('ad-tabs').querySelectorAll('.tb').forEach(x => x.classList.toggle('active', x === b));
    loadTab();
  }));

  loadOverview();
  loadTab();
}

export function registerAdmin() {
  R.register('/admin', { render: viewAdmin, auth: true });
}
