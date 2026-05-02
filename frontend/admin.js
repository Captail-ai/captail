import { t } from './i18n.js';
import * as R from './router.js';

const tabs = [
  { k: 'users',     key: 'admin.tab.users' },
  { k: 'kyc',       key: 'admin.tab.kyc' },
  { k: 'deposits',  key: 'admin.tab.deposits' },
  { k: 'withdraws', key: 'admin.tab.withdraws' },
  { k: 'all_orders', key: 'admin.tab.all_orders' },
  { k: 'loan_apps', key: 'admin.tab.loan_apps' },
  { k: 'messages',  key: 'admin.tab.messages' },
  { k: 'news',      key: 'admin.tab.news' },
  { k: 'options',   key: 'admin.tab.options' },
  { k: 'finance',   key: 'admin.tab.finance' },
  { k: 'loans',     key: 'admin.tab.loans' },
  { k: 'faqs',      key: 'admin.tab.faqs' },
  { k: 'ops',       key: 'admin.tab.ops' },
  { k: 'security',  key: 'admin.tab.security' },
  { k: 'settings',  key: 'admin.tab.settings' },
];

// 可配置实体的元数据，驱动 CRUD 表与表单
const CFG_ENTITIES = {
  options: {
    endpoint: '/api/admin/option-periods',
    cols: [
      ['id', '#'],
      ['duration_sec', 'admin.opt.duration'],
      ['payout_rate', 'admin.opt.payout'],
      ['min_amount', 'admin.opt.min'],
      ['max_amount', 'admin.opt.max'],
      ['label_zh', 'admin.opt.label_zh'],
      ['sort_order', 'admin.cfg.sort'],
      ['enabled', 'admin.cfg.enabled'],
    ],
    fields: [
      { k: 'duration_sec', label: 'admin.opt.duration', type: 'number', step: 1, required: true },
      { k: 'payout_rate',  label: 'admin.opt.payout',   type: 'number', step: 0.01, required: true },
      { k: 'min_amount',   label: 'admin.opt.min',      type: 'number', step: 1 },
      { k: 'max_amount',   label: 'admin.opt.max',      type: 'number', step: 1 },
      { k: 'label_zh',     label: 'admin.opt.label_zh', type: 'text' },
      { k: 'label_en',     label: 'admin.opt.label_en', type: 'text' },
      { k: 'sort_order',   label: 'admin.cfg.sort',     type: 'number', step: 1 },
      { k: 'enabled',      label: 'admin.cfg.enabled',  type: 'checkbox' },
    ],
  },
  finance: {
    endpoint: '/api/admin/finance/products',
    cols: [
      ['id', '#'],
      ['name_zh', 'admin.fin.name_zh'],
      ['vip_tag', 'admin.fin.vip_tag'],
      ['daily_rate', 'admin.fin.daily_rate'],
      ['min_amount', 'admin.opt.min'],
      ['max_amount', 'admin.opt.max'],
      ['lock_days', 'admin.fin.lock_days'],
      ['sold_quota', 'admin.fin.sold_quota'],
      ['sort_order', 'admin.cfg.sort'],
      ['enabled', 'admin.cfg.enabled'],
    ],
    fields: [
      { k: 'name_zh',        label: 'admin.fin.name_zh',    type: 'text', required: true },
      { k: 'name_en',        label: 'admin.fin.name_en',    type: 'text', required: true },
      { k: 'vip_tag',        label: 'admin.fin.vip_tag',    type: 'text' },
      { k: 'daily_rate',     label: 'admin.fin.daily_rate', type: 'number', step: 0.0001, required: true },
      { k: 'min_amount',     label: 'admin.opt.min',        type: 'number', step: 1 },
      { k: 'max_amount',     label: 'admin.opt.max',        type: 'number', step: 1 },
      { k: 'lock_days',      label: 'admin.fin.lock_days',  type: 'number', step: 1 },
      { k: 'total_quota',    label: 'admin.fin.total_quota', type: 'number', step: 1 },
      { k: 'description_zh', label: 'admin.fin.desc_zh',    type: 'textarea' },
      { k: 'description_en', label: 'admin.fin.desc_en',    type: 'textarea' },
      { k: 'sort_order',     label: 'admin.cfg.sort',       type: 'number', step: 1 },
      { k: 'enabled',        label: 'admin.cfg.enabled',    type: 'checkbox' },
    ],
  },
  loans: {
    endpoint: '/api/admin/loan/products',
    cols: [
      ['id', '#'],
      ['name_zh', 'admin.fin.name_zh'],
      ['daily_rate', 'admin.fin.daily_rate'],
      ['min_amount', 'admin.opt.min'],
      ['max_amount', 'admin.opt.max'],
      ['term_days', 'admin.loan.term_days'],
      ['sort_order', 'admin.cfg.sort'],
      ['enabled', 'admin.cfg.enabled'],
    ],
    fields: [
      { k: 'name_zh',        label: 'admin.fin.name_zh',    type: 'text', required: true },
      { k: 'name_en',        label: 'admin.fin.name_en',    type: 'text', required: true },
      { k: 'daily_rate',     label: 'admin.fin.daily_rate', type: 'number', step: 0.0001, required: true },
      { k: 'min_amount',     label: 'admin.opt.min',        type: 'number', step: 1 },
      { k: 'max_amount',     label: 'admin.opt.max',        type: 'number', step: 1 },
      { k: 'term_days',      label: 'admin.loan.term_days', type: 'number', step: 1 },
      { k: 'description_zh', label: 'admin.fin.desc_zh',    type: 'textarea' },
      { k: 'description_en', label: 'admin.fin.desc_en',    type: 'textarea' },
      { k: 'sort_order',     label: 'admin.cfg.sort',       type: 'number', step: 1 },
      { k: 'enabled',        label: 'admin.cfg.enabled',    type: 'checkbox' },
    ],
  },
  faqs: {
    endpoint: '/api/admin/faqs',
    cols: [
      ['id', '#'],
      ['question_zh', 'admin.faq.q_zh'],
      ['question_en', 'admin.faq.q_en'],
      ['sort_order', 'admin.cfg.sort'],
      ['enabled', 'admin.cfg.enabled'],
    ],
    fields: [
      { k: 'question_zh', label: 'admin.faq.q_zh',    type: 'text', required: true },
      { k: 'question_en', label: 'admin.faq.q_en',    type: 'text', required: true },
      { k: 'answer_zh',   label: 'admin.faq.a_zh',    type: 'textarea', required: true },
      { k: 'answer_en',   label: 'admin.faq.a_en',    type: 'textarea', required: true },
      { k: 'sort_order',  label: 'admin.cfg.sort',    type: 'number', step: 1 },
      { k: 'enabled',     label: 'admin.cfg.enabled', type: 'checkbox' },
    ],
  },
};

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
        const userMap = new Map(rows.map(u => [u.id, u]));
        host.innerHTML = table(
          [t('admin.col.user'), t('admin.col.email'), t('admin.col.phone'),
           t('admin.col.cash'), t('admin.col.kyc'), t('admin.col.created'), t('admin.col.action')],
          rows.map(u => `<tr data-uid="${u.id}"><td><b>${u.username}</b>${u.is_banned ? ' <span class="badge rejected">'+t('admin.banned')+'</span>' : ''}<br/><small>#${u.id}</small></td>
            <td>${u.email || '—'}</td><td>${u.phone || '—'}</td><td>$${R.fmt(u.cash || 0)}</td>
            <td><span class="badge ${u.kyc_status || 'unsubmitted'}">${t('status.' + (u.kyc_status || 'unsubmitted'))}</span>${
              u.kyc_status === 'approved' && u.kyc_real_name ? `<br/><small>${u.kyc_real_name}</small>` : ''}</td>
            <td>${R.fmtTs(u.created_at)}</td>
            <td class="row-actions">
              <button class="btn small"        data-uact="edit"     data-uid="${u.id}">${t('admin.edit')}</button>
              <button class="btn small ok"     data-uact="deposit"  data-uid="${u.id}">${t('admin.btn.deposit')}</button>
              <button class="btn small"        data-uact="withdraw" data-uid="${u.id}">${t('admin.btn.withdraw')}</button>
              <button class="btn small"        data-uact="adjust"   data-uid="${u.id}">${t('admin.btn.adjust')}</button>
              <button class="btn small ${u.force_outcome ? 'danger' : ''}" data-uact="force" data-uid="${u.id}">${t('admin.btn.force')}${u.force_outcome ? ' ●' : ''}</button>
              <button class="btn small ${u.is_banned ? 'ok' : ''}" data-uact="pause" data-uid="${u.id}">${u.is_banned ? t('admin.btn.resume') : t('admin.btn.pause')}</button>
              <button class="btn small danger" data-uact="delete"   data-uid="${u.id}">${t('admin.delete')}</button>
            </td></tr>`));
        host.querySelectorAll('button[data-uact]').forEach(b => b.addEventListener('click', async () => {
          const uid = Number(b.dataset.uid);
          const u = userMap.get(uid);
          const act = b.dataset.uact;
          if (act === 'edit')        return openUserDetail(uid);
          if (act === 'deposit')     return openWalletOp(uid, u, 'deposit');
          if (act === 'withdraw')    return openWalletOp(uid, u, 'withdraw');
          if (act === 'adjust')      return openWalletOp(uid, u, 'adjust');
          if (act === 'force')       return openForceOutcome(uid, u);
          if (act === 'pause')       return togglePause(uid, u);
          if (act === 'delete')      return confirmDeleteUser(uid, u);
        }));
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
        const tk = R.auth().token;
        // 高级 KYC 已上传图片的行，点击缩略图可大图查看
        const imgCell = (rel) => rel
          ? `<a href="/api/admin/uploads/${rel}?token=${encodeURIComponent(tk || '')}" target="_blank">
               <img src="/api/admin/uploads/${rel}?token=${encodeURIComponent(tk || '')}" alt=""
                 style="height:48px;border-radius:4px;border:1px solid var(--border)"/></a>` : '—';
        host.innerHTML = table(
          [t('admin.col.user'), t('admin.col.name'), t('admin.col.id'),
           t('admin.kyc.level'), t('admin.kyc.basic'),
           t('kyc.id_front'), t('kyc.id_back'), t('kyc.holding'),
           t('admin.kyc.advanced'), t('admin.col.action')],
          rows.map(k => `<tr><td>${k.username}</td><td>${k.real_name || '—'}</td>
            <td>${k.id_number || '—'}</td>
            <td>${'L' + (k.kyc_level || 0)}</td>
            <td><span class="badge ${k.status}">${t('status.' + k.status)}</span></td>
            <td>${imgCell(k.id_front_path)}</td>
            <td>${imgCell(k.id_back_path)}</td>
            <td>${imgCell(k.holding_path)}</td>
            <td>${k.advanced_status
              ? `<span class="badge ${k.advanced_status}">${t('status.' + k.advanced_status)}</span>`
              : '—'}</td>
            <td>${[
              k.status === 'reviewing'
                ? `<button class="btn small ok" data-act="approve" data-uid="${k.user_id}" data-kind="kyc" data-stage="basic">${t('admin.kyc.approve_basic')}</button>
                   <button class="btn small danger" data-act="reject" data-uid="${k.user_id}" data-kind="kyc" data-stage="basic">${t('admin.kyc.reject_basic')}</button>`
                : '',
              k.advanced_status === 'reviewing'
                ? `<button class="btn small ok" data-act="approve" data-uid="${k.user_id}" data-kind="kyc" data-stage="advanced">${t('admin.kyc.approve_advanced')}</button>
                   <button class="btn small danger" data-act="reject" data-uid="${k.user_id}" data-kind="kyc" data-stage="advanced">${t('admin.kyc.reject_advanced')}</button>`
                : '',
            ].filter(Boolean).join(' ') || '—'}</td></tr>`));
      } else if (s.tab === 'deposits') {
        const rows = await R.api('/api/admin/deposits');
        host.innerHTML = table(
          [t('admin.col.user'), t('admin.col.method'), t('admin.col.amount'),
           t('admin.col.ref'), t('admin.col.status'), t('admin.col.created'), t('admin.col.action')],
          rows.map(d => `<tr><td>${d.username}</td><td>${d.method}</td>
            <td>$${R.fmt(d.amount)}</td><td>${d.ref_info || d.target || '—'}</td>
            <td><span class="badge ${d.status}">${t('status.' + d.status)}</span></td>
            <td>${R.fmtTs(d.created_at)}</td>
            <td>${d.status === 'pending' ? `
              <button class="btn small ok" data-act="approve" data-id="${d.id}" data-kind="deposits">${t('common.approve')}</button>
              <button class="btn small danger" data-act="reject" data-id="${d.id}" data-kind="deposits">${t('common.reject')}</button>` : '—'}</td></tr>`));
      } else if (s.tab === 'withdraws') {
        const rows = await R.api('/api/admin/withdraws');
        const tk = R.auth().token;
        const qrCell = (rel) => {
          if (!rel) return '<span style="color:var(--text-500)">—</span>';
          const url = `/api/admin/uploads/${rel}?token=${encodeURIComponent(tk || '')}`;
          // onerror 时回落显示文件名链接，方便识别是 404 还是 NULL
          const fallback = `<a href="${url}" target="_blank" style="font-size:11px;color:var(--down)" title="${rel}">${rel.split('/').pop()}</a>`;
          return `<a href="${url}" target="_blank" title="${rel}">
            <img src="${url}" alt="${rel}"
              onerror="this.outerHTML='${fallback.replace(/'/g, '&#39;')}'"
              style="height:40px;border-radius:4px;border:1px solid var(--border)"/></a>`;
        };
        host.innerHTML = table(
          [t('admin.col.user'), t('admin.col.method'), t('admin.col.amount'),
           t('admin.col.fee'), t('admin.col.net'),
           t('admin.col.holder'), t('admin.col.account'), t('admin.col.bank'),
           t('admin.col.qr'), t('admin.col.status'), t('admin.col.created'), t('admin.col.action')],
          rows.map(d => `<tr><td>${d.username}</td><td>${d.method}</td>
            <td>$${R.fmt(d.amount)}</td>
            <td>${R.fmt(d.fee || 0)}</td>
            <td>${R.fmt(d.net_amount || d.amount)}</td>
            <td>${d.account_name || '—'}</td>
            <td><small>${d.address || d.target || '—'}</small></td>
            <td>${d.bank_name || '—'}</td>
            <td>${qrCell(d.qr_code_path)}</td>
            <td><span class="badge ${d.status}">${t('status.' + d.status)}</span></td>
            <td>${R.fmtTs(d.created_at)}</td>
            <td>${d.status === 'pending' ? `
              <button class="btn small ok" data-act="approve" data-id="${d.id}" data-kind="withdraws">${t('common.approve')}</button>
              <button class="btn small danger" data-act="reject" data-id="${d.id}" data-kind="withdraws">${t('common.reject')}</button>` : '—'}</td></tr>`));
      } else if (s.tab === 'all_orders') {
        await renderAllOrdersTab(host);
      } else if (s.tab === 'messages') {
        const rows = await R.api('/api/admin/messages');
        host.innerHTML = table(
          [t('admin.col.user'), t('admin.col.name'), t('admin.col.email'), t('admin.col.content'), t('admin.col.created')],
          rows.map(m => `<tr><td>${m.username || '—'}</td><td>${m.name || '—'}</td>
            <td>${m.email || '—'}</td><td style="max-width:360px;white-space:normal">${m.content}</td>
            <td>${R.fmtTs(m.created_at)}</td></tr>`));
      } else if (s.tab === 'loan_apps') {
        await renderLoanAppsTab(host);
      } else if (CFG_ENTITIES[s.tab]) {
        await renderCfgTab(host, s.tab);
      }
      host.querySelectorAll('button[data-act]').forEach(b => b.addEventListener('click', async () => {
        const { act, kind, id, uid } = b.dataset;
        if (!confirm(t('admin.confirm'))) return;
        try {
          if (kind === 'kyc') {
            const stage = b.dataset.stage || 'basic';
            await R.api('/api/admin/kyc/' + uid, { method: 'POST',
              body: { action: act, stage } });
          } else                await R.api(`/api/admin/${kind}/${id}`, { method: 'POST', body: { action: act } });
          R.toast('OK', 'ok'); loadOverview(); loadTab();
        } catch (e) { R.toast(e.message, 'error'); }
      }));
    } catch (e) { host.innerHTML = `<div class="msg">${e.message}</div>`; }
  }

  /* ---------------- 极简钱包操作弹窗：充值 / 提现 / 上下分共用 ---------------- */
  // op ∈ 'deposit' | 'withdraw' | 'adjust'
  //   deposit  → spot   wallet, +amount
  //   withdraw → spot   wallet, -amount
  //   adjust   → option wallet, signed amount
  async function openWalletOp(uid, u, op) {
    const titleKey = op === 'deposit' ? 'admin.op.deposit'
                   : op === 'withdraw' ? 'admin.op.withdraw' : 'admin.op.adjust';
    const wallet = (op === 'adjust') ? 'option' : 'spot';
    const signHint = op === 'withdraw' ? '−' : (op === 'deposit' ? '+' : '±');
    const host = document.createElement('div');
    host.className = 'modal-back';
    host.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>${t(titleKey)} · ${u.username} <small>#${u.id}</small></h3>
          <button class="x" data-close>×</button></div>
        <div class="modal-body">
          <form id="wf" class="space-y">
            <div class="field"><label>${t('admin.col.amount')} (${signHint})</label>
              <input name="amount" type="number" step="0.01" min="${op === 'adjust' ? '' : '0'}" required autofocus/></div>
            <div class="field"><label>${t('admin.reason')} *</label>
              <input name="reason" type="text" maxlength="200" required
                placeholder="${t('admin.reason.placeholder')}"/></div>
            <button class="btn primary" type="submit">${t('common.apply')}</button>
          </form>
        </div>
      </div>`;
    document.body.appendChild(host);
    const close = () => host.remove();
    host.querySelector('[data-close]').addEventListener('click', close);
    host.addEventListener('click', (e) => { if (e.target === host) close(); });
    host.querySelector('#wf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const reason = String(fd.get('reason') || '').trim();
      if (reason.length < 2) { R.toast(t('admin.reason.required'), 'error'); return; }
      let amt = Number(fd.get('amount'));
      if (!isFinite(amt)) { R.toast(t('admin.col.amount'), 'error'); return; }
      if (op === 'withdraw') amt = -Math.abs(amt);
      if (op === 'deposit')  amt =  Math.abs(amt);
      try {
        await R.api(`/api/admin/users/${uid}/cash`, { method: 'POST',
          body: { wallet, mode: 'adjust', amount: amt, reason } });
        R.toast('OK', 'ok'); close(); loadTab(); loadOverview();
      } catch (err) { R.toast(err.message, 'error'); }
    });
  }

  async function togglePause(uid, u) {
    const next = !u.is_banned;
    if (!confirm(next ? t('admin.pause_confirm') : t('admin.resume_confirm'))) return;
    try {
      await R.api('/api/admin/users/' + uid, { method: 'POST',
        body: { is_banned: next, is_admin: !!u.is_admin,
                email: u.email || '', phone: u.phone || '', nickname: u.nickname || '' } });
      R.toast('OK', 'ok'); loadTab();
    } catch (e) { R.toast(e.message, 'error'); }
  }

  async function confirmDeleteUser(uid, u) {
    const host = document.createElement('div');
    host.className = 'modal-back';
    host.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>${t('admin.delete_title')} · ${u.username} <small>#${u.id}</small></h3>
          <button class="x" data-close>×</button></div>
        <div class="modal-body">
          <p style="color:var(--danger,#c33)">${t('admin.delete_warn')}</p>
          <form id="df" class="space-y">
            <div class="field"><label>${t('admin.delete_confirm_label')} (<b>${u.username}</b>)</label>
              <input name="confirm_username" type="text" autocomplete="off" required autofocus/></div>
            <div class="field"><label>${t('admin.reason')} *</label>
              <input name="reason" type="text" maxlength="200" required
                placeholder="${t('admin.reason.placeholder')}"/></div>
            <button class="btn danger" type="submit">${t('admin.delete')}</button>
          </form>
        </div>
      </div>`;
    document.body.appendChild(host);
    const close = () => host.remove();
    host.querySelector('[data-close]').addEventListener('click', close);
    host.addEventListener('click', (e) => { if (e.target === host) close(); });
    host.querySelector('#df').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const confirm_username = String(fd.get('confirm_username') || '').trim();
      const reason = String(fd.get('reason') || '').trim();
      if (confirm_username !== u.username) { R.toast(t('admin.delete_confirm_mismatch'), 'error'); return; }
      if (reason.length < 2) { R.toast(t('admin.reason.required'), 'error'); return; }
      try {
        await R.api('/api/admin/users/' + uid, { method: 'DELETE',
          body: { confirm_username, reason } });
        R.toast('OK', 'ok'); close(); loadTab(); loadOverview();
      } catch (err) { R.toast(err.message, 'error'); }
    });
  }

  async function openForceOutcome(uid, u) {
    const cur = u.force_outcome || 'none';
    const host = document.createElement('div');
    host.className = 'modal-back';
    host.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>${t('admin.force_outcome')} · ${u.username} <small>#${u.id}</small></h3>
          <button class="x" data-close>×</button></div>
        <div class="modal-body">
          <form id="ff" class="space-y">
            <div class="field">
              ${[
                ['none', 'admin.force.none'],
                ['next_win', 'admin.force.next_win'],
                ['next_lose', 'admin.force.next_lose'],
                ['always_win', 'admin.force.always_win'],
                ['always_lose', 'admin.force.always_lose'],
              ].map(([v, k]) => `<label style="display:flex;align-items:center;gap:8px;margin:6px 0">
                <input type="radio" name="mode" value="${v}" ${cur === v ? 'checked' : ''}/> ${t(k)}</label>`).join('')}
            </div>
            <small style="color:var(--text-500)">${t('admin.force_hint')}</small>
            <div><button class="btn primary" type="submit">${t('common.apply')}</button></div>
          </form>
        </div>
      </div>`;
    document.body.appendChild(host);
    const close = () => host.remove();
    host.querySelector('[data-close]').addEventListener('click', close);
    host.addEventListener('click', (e) => { if (e.target === host) close(); });
    host.querySelector('#ff').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await R.api(`/api/admin/users/${uid}/force-outcome`, { method: 'POST',
          body: { mode: fd.get('mode') } });
        R.toast('OK', 'ok'); close(); loadTab();
      } catch (err) { R.toast(err.message, 'error'); }
    });
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
            <p><b>${t('assets.spot_cash')}:</b> $${R.fmt(a.spot_cash || 0)}
               &nbsp; <b>${t('assets.option_cash')}:</b> $${R.fmt(a.option_cash || 0)}
               &nbsp; <b>${t('admin.col.cash')}:</b> $${R.fmt(a.cash || 0)}</p>
            <form id="uf-cash" class="space-y">
              <div class="field"><label>${t('admin.wallet') || 'Wallet'}</label>
                <select name="wallet">
                  <option value="spot">${t('assets.spot_cash')}</option>
                  <option value="option">${t('assets.option_cash')}</option>
                </select></div>
              <div class="field"><label>${t('admin.mode')}</label>
                <select name="mode">
                  <option value="adjust">${t('admin.mode.adjust')}</option>
                  <option value="set">${t('admin.mode.set')}</option>
                </select></div>
              <div class="field"><label>${t('admin.col.amount')}</label><input name="amount" type="number" step="0.01" required/></div>
              <div class="field"><label>${t('admin.reason')} *</label>
                <input name="reason" type="text" maxlength="200" required
                  placeholder="${t('admin.reason.placeholder')}"/></div>
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
            <h4>${t('admin.force_outcome')}</h4>
            <form id="uf-force" class="space-y">
              <div class="field">
                ${[
                  ['none', 'admin.force.none'],
                  ['next_win', 'admin.force.next_win'],
                  ['next_lose', 'admin.force.next_lose'],
                  ['always_win', 'admin.force.always_win'],
                  ['always_lose', 'admin.force.always_lose'],
                ].map(([v, k]) => `<label style="display:inline-flex;align-items:center;gap:6px;margin-right:14px">
                  <input type="radio" name="mode" value="${v}" ${(u.force_outcome || 'none') === v ? 'checked' : ''}/> ${t(k)}</label>`).join('')}
              </div>
              <small style="color:var(--text-500)">${t('admin.force_hint')}</small>
              <div><button class="btn primary" type="submit">${t('common.apply')}</button></div>
            </form>
          </div>
          <div class="card" style="grid-column: 1/-1">
            <h4>${t('admin.overview_title')}</h4>
            <div class="kv">
              <label>KYC</label><b><span class="badge ${k.status}">${t('status.'+k.status)}</span> ${k.real_name || ''}</b>
              <label>${t('admin.positions')}</label><b>${d.positions.map(p => `${p.symbol} ${R.fmt(p.qty,4)}@${R.fmt(p.avg_price)}`).join(' · ') || '—'}</b>
            </div>
            <div class="sub-tabs" id="ud-subtabs">
              <button type="button" class="st active" data-sub="orders">${t('admin.recent_orders')} (${d.orders.length})</button>
              <button type="button" class="st" data-sub="trades">${t('admin.recent_trades')} (${d.trades.length})</button>
              <button type="button" class="st" data-sub="seconds">${t('admin.recent_seconds')} (${(d.seconds_orders||[]).length})</button>
              <button type="button" class="st" data-sub="deposits">${t('admin.deposits')} (${d.deposits.length})</button>
              <button type="button" class="st" data-sub="withdraws">${t('admin.withdraws')} (${d.withdraws.length})</button>
            </div>
            <div class="sub-pane table-scroll" id="ud-subpane"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(host);
    const close = () => host.remove();
    host.querySelector('[data-close]').addEventListener('click', close);
    host.addEventListener('click', (e) => { if (e.target === host) close(); });

    // 子 tab：现货委托 / 现货成交 / 期权订单 / 充值 / 提现
    const subPane = host.querySelector('#ud-subpane');
    const subBtns = [...host.querySelectorAll('#ud-subtabs .st')];
    function renderSub(key) {
      if (key === 'orders') {
        subPane.innerHTML = table(
          [t('trading.col.time'), t('trading.col.symbol'), t('trading.col.side'),
           t('trading.col.type'), t('trading.col.price'), t('trading.col.qty'),
           t('trading.col.filled'), t('trading.col.avg'), t('trading.col.status')],
          d.orders.map(o => `<tr><td>${R.fmtTs(o.created_at)}</td><td>${o.symbol}</td>
            <td class="${o.side}">${o.side === 'buy' ? t('trading.buy') : t('trading.sell')}</td>
            <td>${o.type === 'market' ? t('trading.market') : t('trading.limit')}</td>
            <td>${o.price != null ? R.fmt(o.price) : '—'}</td>
            <td>${R.fmt(o.qty, 4)}</td><td>${R.fmt(o.filled_qty, 4)}</td>
            <td>${o.avg_fill ? R.fmt(o.avg_fill) : '—'}</td>
            <td><span class="badge ${o.status === 'open' ? 'open' : o.status === 'filled' ? 'approved' : 'rejected'}">${t('status.' + o.status)}</span></td></tr>`));
      } else if (key === 'trades') {
        subPane.innerHTML = table(
          [t('trading.col.time'), t('trading.col.symbol'), t('trading.col.side'),
           t('trading.col.price'), t('trading.col.qty'), t('trading.col.fee'), t('trading.col.total')],
          d.trades.map(tr => `<tr><td>${R.fmtTs(tr.created_at)}</td><td>${tr.symbol}</td>
            <td class="${tr.side}">${tr.side === 'buy' ? t('trading.buy') : t('trading.sell')}</td>
            <td>${R.fmt(tr.price)}</td><td>${R.fmt(tr.qty, 4)}</td>
            <td>${R.fmt(tr.fee, 4)}</td><td>${R.fmt(tr.price * tr.qty)}</td></tr>`));
      } else if (key === 'seconds') {
        const list = d.seconds_orders || [];
        subPane.innerHTML = table(
          [t('sec.col.time'), t('sec.col.symbol'), t('sec.col.dir'), t('sec.col.duration'),
           t('sec.col.amount'), t('sec.col.open'), t('sec.col.settle'),
           t('sec.col.status'), t('sec.col.pnl')],
          list.map(c => `<tr><td>${R.fmtTs(c.created_at)}</td><td>${c.symbol}</td>
            <td class="${c.direction === 'up' ? 'buy' : 'sell'}">${c.direction === 'up' ? '▲' : '▼'}</td>
            <td>${c.duration}s</td><td>$${R.fmt(c.amount)}</td>
            <td>${R.fmt(c.open_price)}</td>
            <td>${c.settle_price != null ? R.fmt(c.settle_price) : '—'}</td>
            <td><span class="badge ${c.status === 'won' ? 'approved' : c.status === 'lost' ? 'rejected' : 'open'}">${t('sec.status.' + c.status)}</span></td>
            <td class="${c.pnl > 0 ? 'buy' : c.pnl < 0 ? 'sell' : ''}">${c.pnl != null ? (c.pnl >= 0 ? '+' : '') + R.fmt(c.pnl) : '—'}</td></tr>`));
      } else if (key === 'deposits') {
        subPane.innerHTML = table(
          [t('admin.col.created'), t('admin.col.method'), t('admin.col.amount'),
           t('admin.col.currency'), t('admin.col.ref'), t('admin.col.status')],
          d.deposits.map(x => `<tr><td>${R.fmtTs(x.created_at)}</td><td>${x.method}</td>
            <td>${R.fmt(x.amount)}</td><td>${x.currency || 'USD'}</td>
            <td><small>${x.ref_info || '—'}</small></td>
            <td><span class="badge ${x.status}">${t('status.' + x.status)}</span></td></tr>`));
      } else if (key === 'withdraws') {
        subPane.innerHTML = table(
          [t('admin.col.created'), t('admin.col.method'), t('admin.col.amount'),
           t('admin.col.fee'), t('admin.col.net'), t('admin.col.target'), t('admin.col.status')],
          d.withdraws.map(x => `<tr><td>${R.fmtTs(x.created_at)}</td><td>${x.method}</td>
            <td>${R.fmt(x.amount)}</td><td>${R.fmt(x.fee || 0)}</td>
            <td>${R.fmt(x.net_amount || x.amount)}</td>
            <td><small>${x.target || x.address || x.account_name || '—'}</small></td>
            <td><span class="badge ${x.status}">${t('status.' + x.status)}</span></td></tr>`));
      }
    }
    subBtns.forEach(b => b.addEventListener('click', () => {
      subBtns.forEach(x => x.classList.toggle('active', x === b));
      renderSub(b.dataset.sub);
    }));
    renderSub('orders');

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
      const reason = String(fd.get('reason') || '').trim();
      if (reason.length < 2) { R.toast(t('admin.reason.required'), 'error'); return; }
      try { await R.api(`/api/admin/users/${uid}/cash`, { method: 'POST',
        body: { wallet: fd.get('wallet'), mode: fd.get('mode'),
                amount: Number(fd.get('amount')), reason } });
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
    host.querySelector('#uf-force').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try { await R.api(`/api/admin/users/${uid}/force-outcome`, { method: 'POST',
        body: { mode: fd.get('mode') } });
        R.toast('OK', 'ok'); close(); loadTab(); }
      catch (err) { R.toast(err.message, 'error'); }
    });
  }

  /* ---------------- 通用可配置实体 CRUD ---------------- */
  async function renderCfgTab(host, key) {
    const conf = CFG_ENTITIES[key];
    let rows = [];
    try { rows = await R.api(conf.endpoint); }
    catch (e) { host.innerHTML = `<div class="msg">${e.message}</div>`; return; }
    const headers = conf.cols.map(([, lk]) => lk === '#' ? '#' : t(lk))
      .concat([t('admin.col.action')]);
    host.innerHTML = `
      <div style="margin-bottom:12px"><button class="btn primary" id="cfg-new">+ ${t('admin.cfg.add')}</button></div>
      ${table(headers, rows.map(r => {
        const tds = conf.cols.map(([k]) => {
          const v = r[k];
          if (k === 'enabled') return `<td>${v ? '✅' : '—'}</td>`;
          if (typeof v === 'number') return `<td>${R.fmt(v, k.includes('rate') ? 4 : 2)}</td>`;
          return `<td>${escapeHtml(v == null ? '—' : String(v))}</td>`;
        }).join('');
        return `<tr>${tds}<td>
          <button class="btn small" data-cfg-edit="${r.id}">${t('admin.edit')}</button>
          <button class="btn small danger" data-cfg-del="${r.id}">${t('admin.delete')}</button>
        </td></tr>`;
      }))}`;
    host.querySelector('#cfg-new').addEventListener('click', () => openCfgEditor(key, null));
    host.querySelectorAll('button[data-cfg-edit]').forEach(b =>
      b.addEventListener('click', () => openCfgEditor(key,
        rows.find(x => x.id === Number(b.dataset.cfgEdit)))));
    host.querySelectorAll('button[data-cfg-del]').forEach(b =>
      b.addEventListener('click', async () => {
        if (!confirm(t('admin.confirm'))) return;
        try { await R.api(`${conf.endpoint}/${b.dataset.cfgDel}`, { method: 'DELETE' });
          R.toast('OK', 'ok'); loadTab(); }
        catch (e) { R.toast(e.message, 'error'); }
      }));
  }

  function openCfgEditor(key, row) {
    const conf = CFG_ENTITIES[key];
    const isEdit = !!row;
    const m = document.createElement('div');
    m.className = 'modal-back';
    const fieldHtml = conf.fields.map(f => {
      const v = row && row[f.k] != null ? row[f.k] : '';
      if (f.type === 'textarea') {
        return `<div class="field"><label>${t(f.label)}</label>
          <textarea name="${f.k}" rows="3"${f.required ? ' required' : ''}>${escapeHtml(String(v))}</textarea></div>`;
      }
      if (f.type === 'checkbox') {
        const checked = (row ? !!row[f.k] : true) ? ' checked' : '';
        return `<div class="field"><label><input type="checkbox" name="${f.k}"${checked}/> ${t(f.label)}</label></div>`;
      }
      const step = f.step != null ? ` step="${f.step}"` : '';
      const req = f.required ? ' required' : '';
      return `<div class="field"><label>${t(f.label)}</label>
        <input name="${f.k}" type="${f.type}"${step}${req} value="${escapeHtml(String(v))}"/></div>`;
    }).join('');
    m.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>${isEdit ? t('admin.edit') : t('admin.cfg.add')}</h3>
          <button class="x" data-close>×</button></div>
        <div class="modal-body">
          <form id="cfg-form" class="space-y">${fieldHtml}
            <button class="btn primary" type="submit">${t('profile.save')}</button>
          </form>
        </div>
      </div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.querySelector('[data-close]').addEventListener('click', close);
    m.addEventListener('click', (e) => { if (e.target === m) close(); });
    m.querySelector('#cfg-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {};
      for (const f of conf.fields) {
        if (f.type === 'checkbox') {
          body[f.k] = e.target[f.k].checked ? 1 : 0;
        } else if (f.type === 'number') {
          const raw = fd.get(f.k);
          body[f.k] = raw === '' || raw == null ? null : Number(raw);
        } else {
          const raw = fd.get(f.k);
          body[f.k] = raw == null ? null : String(raw);
        }
      }
      try {
        if (isEdit) await R.api(`${conf.endpoint}/${row.id}`, { method: 'PUT', body });
        else        await R.api(conf.endpoint,                { method: 'POST', body });
        R.toast('OK', 'ok'); close(); loadTab();
      } catch (err) { R.toast(err.message, 'error'); }
    });
  }

  /* ---------------- 全部订单（跨用户）：现货委托 / 现货成交 / 期权 ---------------- */
  async function renderAllOrdersTab(host) {
    host.innerHTML = `
      <div class="sub-tabs" id="ao-subtabs">
        <button type="button" class="st active" data-sub="orders">${t('admin.all.orders')}</button>
        <button type="button" class="st" data-sub="trades">${t('admin.all.trades')}</button>
        <button type="button" class="st" data-sub="seconds">${t('admin.all.seconds')}</button>
      </div>
      <form class="filter-row" id="ao-filter" style="margin:8px 0">
        <input name="user_id" type="number" min="1" placeholder="${t('admin.all.user_filter')}" style="max-width:160px"/>
        <button class="btn small" type="submit">${t('common.apply')}</button>
        <button class="btn small" type="button" data-act="reset">${t('common.reset')}</button>
      </form>
      <div class="sub-pane table-scroll" id="ao-pane">${t('common.loading')}</div>`;
    let curSub = 'orders';
    let uidFilter = null;
    const pane = host.querySelector('#ao-pane');
    async function render() {
      pane.innerHTML = t('common.loading');
      const qs = uidFilter ? ('?user_id=' + uidFilter) : '';
      try {
        if (curSub === 'orders') {
          const rows = await R.api('/api/admin/all-orders' + qs);
          pane.innerHTML = table(
            [t('admin.col.user'), t('trading.col.time'), t('trading.col.symbol'),
             t('trading.col.side'), t('trading.col.type'), t('trading.col.price'),
             t('trading.col.qty'), t('trading.col.filled'), t('trading.col.avg'),
             t('trading.col.status')],
            rows.map(o => `<tr><td><b>${o.username}</b> <small>#${o.user_id}</small></td>
              <td>${R.fmtTs(o.created_at)}</td><td>${o.symbol}</td>
              <td class="${o.side}">${o.side === 'buy' ? t('trading.buy') : t('trading.sell')}</td>
              <td>${o.type === 'market' ? t('trading.market') : t('trading.limit')}</td>
              <td>${o.price != null ? R.fmt(o.price) : '—'}</td>
              <td>${R.fmt(o.qty, 4)}</td><td>${R.fmt(o.filled_qty, 4)}</td>
              <td>${o.avg_fill ? R.fmt(o.avg_fill) : '—'}</td>
              <td><span class="badge ${o.status === 'open' ? 'open' : o.status === 'filled' ? 'approved' : 'rejected'}">${t('status.' + o.status)}</span></td></tr>`));
        } else if (curSub === 'trades') {
          const rows = await R.api('/api/admin/all-trades' + qs);
          pane.innerHTML = table(
            [t('admin.col.user'), t('trading.col.time'), t('trading.col.symbol'),
             t('trading.col.side'), t('trading.col.price'), t('trading.col.qty'),
             t('trading.col.fee'), t('trading.col.total')],
            rows.map(tr => `<tr><td><b>${tr.username}</b> <small>#${tr.user_id}</small></td>
              <td>${R.fmtTs(tr.created_at)}</td><td>${tr.symbol}</td>
              <td class="${tr.side}">${tr.side === 'buy' ? t('trading.buy') : t('trading.sell')}</td>
              <td>${R.fmt(tr.price)}</td><td>${R.fmt(tr.qty, 4)}</td>
              <td>${R.fmt(tr.fee, 4)}</td><td>${R.fmt(tr.price * tr.qty)}</td></tr>`));
        } else {
          const rows = await R.api('/api/admin/all-seconds' + qs);
          pane.innerHTML = table(
            [t('admin.col.user'), t('sec.col.time'), t('sec.col.symbol'), t('sec.col.dir'),
             t('sec.col.duration'), t('sec.col.amount'), t('sec.col.open'), t('sec.col.settle'),
             t('sec.col.status'), t('sec.col.pnl')],
            rows.map(c => `<tr><td><b>${c.username}</b> <small>#${c.user_id}</small></td>
              <td>${R.fmtTs(c.created_at)}</td><td>${c.symbol}</td>
              <td class="${c.direction === 'up' ? 'buy' : 'sell'}">${c.direction === 'up' ? '▲' : '▼'}</td>
              <td>${c.duration}s</td><td>$${R.fmt(c.amount)}</td>
              <td>${R.fmt(c.open_price)}</td>
              <td>${c.settle_price != null ? R.fmt(c.settle_price) : '—'}</td>
              <td><span class="badge ${c.status === 'won' ? 'approved' : c.status === 'lost' ? 'rejected' : 'open'}">${t('sec.status.' + c.status)}</span></td>
              <td class="${c.pnl > 0 ? 'buy' : c.pnl < 0 ? 'sell' : ''}">${c.pnl != null ? (c.pnl >= 0 ? '+' : '') + R.fmt(c.pnl) : '—'}</td></tr>`));
        }
      } catch (e) { pane.innerHTML = `<div class="msg">${e.message}</div>`; }
    }
    host.querySelectorAll('#ao-subtabs .st').forEach(b => b.addEventListener('click', () => {
      host.querySelectorAll('#ao-subtabs .st').forEach(x => x.classList.toggle('active', x === b));
      curSub = b.dataset.sub; render();
    }));
    const filter = host.querySelector('#ao-filter');
    filter.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = Number(new FormData(filter).get('user_id')) || null;
      uidFilter = v; render();
    });
    filter.querySelector('[data-act="reset"]').addEventListener('click', () => {
      filter.reset(); uidFilter = null; render();
    });
    render();
  }

  /* ---------------- 贷款申请审核 ---------------- */
  async function renderLoanAppsTab(host) {
    let rows = [];
    try { rows = await R.api('/api/admin/loan/applications'); }
    catch (e) { host.innerHTML = `<div class="msg">${e.message}</div>`; return; }
    host.innerHTML = table(
      [t('admin.loan.applicant'), t('admin.loan.product'), t('admin.col.amount'),
       t('admin.loan.term_days'), t('admin.loan.total_repay'), t('admin.col.status'),
       t('admin.loan.applied_at'), t('admin.col.action')],
      rows.map(a => `<tr>
        <td>${escapeHtml(a.username)} <small>#${a.user_id}</small></td>
        <td>${escapeHtml(a.name_zh || ('#' + a.product_id))}</td>
        <td>$${R.fmt(a.amount)}</td>
        <td>${a.term_days}</td>
        <td>$${R.fmt(a.total_repay)}</td>
        <td><span class="badge ${a.status}">${t('status.' + a.status)}</span></td>
        <td>${R.fmtTs(a.applied_at)}</td>
        <td>${a.status === 'pending' ? `
          <button class="btn small ok" data-loan-act="approve" data-id="${a.id}">${t('common.approve')}</button>
          <button class="btn small danger" data-loan-act="reject" data-id="${a.id}">${t('common.reject')}</button>` : '—'}</td>
      </tr>`));
    host.querySelectorAll('button[data-loan-act]').forEach(b =>
      b.addEventListener('click', async () => {
        if (!confirm(t('admin.confirm'))) return;
        try {
          await R.api(`/api/admin/loan/applications/${b.dataset.id}`, {
            method: 'POST', body: { action: b.dataset.loanAct } });
          R.toast('OK', 'ok'); loadTab(); loadOverview();
        } catch (e) { R.toast(e.message, 'error'); }
      }));
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
