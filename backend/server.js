const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const bcrypt = require('bcryptjs');
const db = require('./db');
const market = require('./market');
const engine = require('./engine');
const mail = require('./mail');
const ratelimit = require('./ratelimit');
const { register, login, authMiddleware, adminMiddleware, ensureAdmin, tryAuth,
        logSecurityEvent } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- admin audit log ----------
const insertAdminOp = db.prepare(
  `INSERT INTO admin_ops(admin_id, admin_username, action, target_user_id, details, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`);
function logAdminOp(req, action, targetUserId, details) {
  try {
    insertAdminOp.run(
      req.user.id, req.user.username, action,
      targetUserId == null ? null : Number(targetUserId),
      details == null ? null : JSON.stringify(details),
      Date.now());
  } catch (_) { /* 审计写入失败绝不影响业务请求本身 */ }
}

// ---------- auth ----------
function genCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

function issueVerificationCode(userId, email) {
  const now = Date.now();
  const code = genCode();
  db.prepare(`INSERT INTO email_verifications(user_id, code, expires_at, created_at)
    VALUES(?, ?, ?, ?)`).run(userId, code, now + 10 * 60 * 1000, now);
  mail.sendVerificationCode(email, code);
  return code;
}

app.post('/api/register', (req, res) => {
  const { username, password, email } = req.body || {};
  try {
    const r = register(username, password, email);
    logSecurityEvent(req, 'auth.register.success',
      { userId: r.user.id, username: r.user.username });
    if (!r.user.email_verified) {
      const code = issueVerificationCode(r.user.id, email);
      const out = { user: r.user, needs_verification: true };
      if (mail.devEcho()) out.dev_code = code;
      return res.json(out);
    }
    res.json(r);
  } catch (e) {
    logSecurityEvent(req, 'auth.register.failure',
      { username, details: { reason: e.message } });
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/auth/verify-email', (req, res) => {
  const { username, code } = req.body || {};
  const row = db.prepare('SELECT id, email, email_verified FROM users WHERE username=?').get(username);
  if (!row) return res.status(400).json({ error: '用户不存在' });
  if (row.email_verified) return res.json({ ok: true, already: true });
  const v = db.prepare(`SELECT * FROM email_verifications WHERE user_id=? AND code=?
    AND consumed_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1`)
    .get(row.id, String(code || ''), Date.now());
  if (!v) {
    logSecurityEvent(req, 'auth.verify.failure',
      { userId: row.id, username, details: { reason: 'code invalid or expired' } });
    return res.status(400).json({ error: '验证码无效或已过期' });
  }
  const now = Date.now();
  db.transaction(() => {
    db.prepare('UPDATE email_verifications SET consumed_at=? WHERE id=?').run(now, v.id);
    db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(row.id);
  })();
  logSecurityEvent(req, 'auth.verify.success', { userId: row.id, username });
  res.json({ ok: true });
});

app.post('/api/auth/resend-code', (req, res) => {
  const { username } = req.body || {};
  const row = db.prepare('SELECT id, email, email_verified FROM users WHERE username=?').get(username);
  if (!row) return res.status(400).json({ error: '用户不存在' });
  if (row.email_verified) return res.status(400).json({ error: '邮箱已验证' });
  // 简单限流：每 30 秒最多发送一次验证码
  const last = db.prepare(
    'SELECT created_at FROM email_verifications WHERE user_id=? ORDER BY id DESC LIMIT 1'
  ).get(row.id);
  if (last && Date.now() - last.created_at < 30_000) {
    return res.status(429).json({ error: '发送过于频繁，请稍后再试',
      retryAfter: Math.ceil((30_000 - (Date.now() - last.created_at)) / 1000) });
  }
  const code = issueVerificationCode(row.id, row.email);
  logSecurityEvent(req, 'auth.verify.resend', { userId: row.id, username });
  const out = { ok: true };
  if (mail.devEcho()) out.dev_code = code;
  res.json(out);
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const userKey = 'user:' + (username || '');
  const ipKey   = 'ip:'   + ip;
  const locked = ratelimit.check(userKey) ;
  const lockedIp = ratelimit.check(ipKey);
  if (locked.locked || lockedIp.locked) {
    const retryAfter = Math.max(locked.retryAfter || 0, lockedIp.retryAfter || 0);
    logSecurityEvent(req, 'auth.login.blocked',
      { username, details: { retryAfter, ip } });
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: '登录尝试次数过多，请稍后再试', retryAfter });
  }
  try {
    const r = login(username, password);
    ratelimit.clear(userKey); ratelimit.clear(ipKey);
    logSecurityEvent(req, 'auth.login.success',
      { userId: r.user.id, username: r.user.username,
        details: { is_admin: !!r.user.is_admin } });
    res.json(r);
  } catch (e) {
    if (e.code === 'unverified') {
      logSecurityEvent(req, 'auth.login.unverified',
        { userId: e.userId, username, details: { reason: e.message } });
      return res.status(403).json({ error: e.message, needs_verification: true });
    }
    // 只有真正的凭据错误才计入登录失败限流
    ratelimit.recordFailure(userKey);
    ratelimit.recordFailure(ipKey);
    logSecurityEvent(req, 'auth.login.failure',
      { username, details: { reason: e.message, ip } });
    res.status(400).json({ error: e.message });
  }
});

// ---------- market (public) ----------
app.get('/api/symbols', (_, res) => {
  res.json(Object.entries(market.SYMBOLS).map(([s, c]) => ({ symbol: s, name: c.name })));
});

app.get('/api/ticker', (_, res) => res.json(market.getSnapshot()));

app.get('/api/candles', (req, res) => {
  const { symbol, interval = '1m', limit = 200 } = req.query;
  if (!market.SYMBOLS[symbol]) return res.status(400).json({ error: '无效品种' });
  res.json(market.getCandles(symbol, interval, Math.min(Number(limit) || 200, 20000)));
});

app.get('/api/depth', (req, res) => {
  const { symbol, levels = 15 } = req.query;
  if (!market.SYMBOLS[symbol]) return res.status(400).json({ error: '无效品种' });
  res.json(market.getDepth(symbol, Math.min(Number(levels) || 15, 50)));
});

// ---------- account (private) ----------
app.get('/api/account', authMiddleware, (req, res) => {
  const acc = engine.getAccount(req.user.id) || { cash: 0 };
  const positions = db.prepare('SELECT symbol, qty, avg_price FROM positions WHERE user_id=? AND qty > 0')
    .all(req.user.id);
  const snap = market.getSnapshot();
  const enriched = positions.map(p => {
    const last = snap[p.symbol]?.price ?? p.avg_price;
    const pnl = (last - p.avg_price) * p.qty;
    return { ...p, last, pnl, market_value: last * p.qty };
  });
  res.json({ cash: acc.cash, positions: enriched });
});

app.post('/api/deposit', authMiddleware, (req, res) => {
  const amt = Number(req.body?.amount);
  if (!(amt > 0) || amt > 1_000_000) return res.status(400).json({ error: '充值金额非法 (0, 1000000]' });
  db.prepare('UPDATE accounts SET cash = cash + ? WHERE user_id=?').run(amt, req.user.id);
  const acc = engine.getAccount(req.user.id);
  res.json({ cash: acc.cash });
});

// ---------- orders ----------
app.post('/api/orders', authMiddleware, (req, res) => {
  try {
    const o = engine.placeOrder(req.user.id, req.body || {});
    res.json(o);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/orders', authMiddleware, (req, res) => {
  const status = req.query.status;
  const rows = status
    ? db.prepare('SELECT * FROM orders WHERE user_id=? AND status=? ORDER BY id DESC LIMIT 200').all(req.user.id, status)
    : db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 200').all(req.user.id);
  res.json(rows);
});

app.delete('/api/orders/:id', authMiddleware, (req, res) => {
  try { res.json(engine.cancelOrder(req.user.id, Number(req.params.id))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/trades', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM trades WHERE user_id=? ORDER BY id DESC LIMIT 200').all(req.user.id);
  res.json(rows);
});

// ---------- profile ----------
app.get('/api/profile', authMiddleware, (req, res) => {
  const u = db.prepare('SELECT username, email, phone, nickname, created_at FROM users WHERE id=?').get(req.user.id);
  const k = db.prepare('SELECT status, real_name, country FROM kyc WHERE user_id=?').get(req.user.id) || { status: 'unsubmitted' };
  res.json({ ...u, kyc: k });
});

app.post('/api/profile', authMiddleware, (req, res) => {
  const { email, phone, nickname } = req.body || {};
  db.prepare('UPDATE users SET email=COALESCE(?, email), phone=COALESCE(?, phone), nickname=COALESCE(?, nickname) WHERE id=?')
    .run(email ?? null, phone ?? null, nickname ?? null, req.user.id);
  res.json({ ok: true });
});

// ---------- KYC ----------
app.get('/api/kyc', authMiddleware, (req, res) => {
  const k = db.prepare('SELECT * FROM kyc WHERE user_id=?').get(req.user.id);
  res.json(k || { status: 'unsubmitted' });
});

app.post('/api/kyc', authMiddleware, (req, res) => {
  const { real_name, id_type, id_number, country } = req.body || {};
  if (!real_name || !id_number || !country) return res.status(400).json({ error: '请填写完整信息' });
  const now = Date.now();
  db.prepare(`
    INSERT INTO kyc(user_id, real_name, id_type, id_number, country, status, submitted_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      real_name=excluded.real_name, id_type=excluded.id_type,
      id_number=excluded.id_number, country=excluded.country,
      status='reviewing', submitted_at=excluded.submitted_at
  `).run(req.user.id, real_name, id_type || 'id_card', id_number, country, 'reviewing', now);
  res.json({ status: 'reviewing', submitted_at: now });
});

// ---------- deposit / withdraw requests ----------
app.post('/api/deposit-requests', authMiddleware, (req, res) => {
  const { method, amount, ref_info } = req.body || {};
  const amt = Number(amount);
  if (!method || !(amt > 0)) return res.status(400).json({ error: '参数非法' });
  const info = db.prepare(`INSERT INTO deposit_requests(user_id, method, amount, ref_info, created_at) VALUES(?,?,?,?,?)`)
    .run(req.user.id, method, amt, ref_info || '', Date.now());
  res.json({ id: info.lastInsertRowid, status: 'pending' });
});

app.get('/api/deposit-requests', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM deposit_requests WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id));
});

app.post('/api/withdraw-requests', authMiddleware, (req, res) => {
  const { method, amount, target } = req.body || {};
  const amt = Number(amount);
  if (!method || !(amt > 0)) return res.status(400).json({ error: '参数非法' });
  const acc = engine.getAccount(req.user.id);
  if (acc.cash < amt) return res.status(400).json({ error: '可用资金不足' });
  const info = db.prepare(`INSERT INTO withdraw_requests(user_id, method, amount, target, created_at) VALUES(?,?,?,?,?)`)
    .run(req.user.id, method, amt, target || '', Date.now());
  res.json({ id: info.lastInsertRowid, status: 'pending' });
});

app.get('/api/withdraw-requests', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM withdraw_requests WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id));
});

// ---------- current session ----------
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const u = db.prepare('SELECT id, username, is_admin FROM users WHERE id=?').get(req.user.id);
  res.json({ id: u.id, username: u.username, is_admin: !!u.is_admin });
});

// ---------- customer service messages ----------
app.post('/api/service/messages', (req, res) => {
  const { name, email, content } = req.body || {};
  if (!content || content.length < 2) return res.status(400).json({ error: '内容不能为空' });
  const u = tryAuth(req);
  db.prepare(`INSERT INTO service_messages(user_id, name, email, content, created_at) VALUES(?,?,?,?,?)`)
    .run(u ? u.id : null, name || null, email || null, content, Date.now());
  res.json({ ok: true });
});

// ---------- admin ----------
app.get('/api/admin/overview', adminMiddleware, (_, res) => {
  const userCount = db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin=0').get().c;
  const kycPending = db.prepare(`SELECT COUNT(*) c FROM kyc WHERE status='reviewing'`).get().c;
  const depPending = db.prepare(`SELECT COUNT(*) c FROM deposit_requests WHERE status='pending'`).get().c;
  const wdPending = db.prepare(`SELECT COUNT(*) c FROM withdraw_requests WHERE status='pending'`).get().c;
  const trades24 = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(price*qty),0) v FROM trades WHERE created_at > ?')
    .get(Date.now() - 86400000);
  res.json({ userCount, kycPending, depPending, wdPending,
    trade24Count: trades24.c, trade24Volume: trades24.v });
});

app.get('/api/admin/users', adminMiddleware, (_, res) => {
  res.json(db.prepare(`
    SELECT u.id, u.username, u.email, u.phone, u.nickname, u.created_at, u.is_admin,
           a.cash, k.status AS kyc_status
    FROM users u
    LEFT JOIN accounts a ON a.user_id = u.id
    LEFT JOIN kyc k ON k.user_id = u.id
    WHERE u.is_admin = 0
    ORDER BY u.id DESC LIMIT 500`).all());
});

app.get('/api/admin/kyc', adminMiddleware, (req, res) => {
  const status = req.query.status;
  const sql = `SELECT k.*, u.username FROM kyc k JOIN users u ON u.id=k.user_id ${
    status ? 'WHERE k.status=?' : ''} ORDER BY k.submitted_at DESC LIMIT 200`;
  res.json(status ? db.prepare(sql).all(status) : db.prepare(sql).all());
});

app.post('/api/admin/kyc/:uid', adminMiddleware, (req, res) => {
  const action = req.body?.action; // 'approve' | 'reject'
  const status = action === 'approve' ? 'approved' : 'rejected';
  const uid = Number(req.params.uid);
  const info = db.prepare('UPDATE kyc SET status=? WHERE user_id=?').run(status, uid);
  if (info.changes) logAdminOp(req, 'kyc.' + action, uid, { status });
  res.json({ changes: info.changes, status });
});

app.get('/api/admin/deposits', adminMiddleware, (req, res) => {
  const status = req.query.status;
  const sql = `SELECT d.*, u.username FROM deposit_requests d JOIN users u ON u.id=d.user_id ${
    status ? 'WHERE d.status=?' : ''} ORDER BY d.id DESC LIMIT 200`;
  res.json(status ? db.prepare(sql).all(status) : db.prepare(sql).all());
});

// 充值/提现共用同一个审批流程工厂，只是对余额的符号正负不同
function approveHandler(table, sign) {
  const selectRow = db.prepare(`SELECT * FROM ${table} WHERE id=?`);
  const updateStatus = db.prepare(`UPDATE ${table} SET status=? WHERE id=?`);
  const updateCash = db.prepare(
    `UPDATE accounts SET cash = cash ${sign > 0 ? '+' : '-'} ? WHERE user_id=?`);
  const kind = table === 'deposit_requests' ? 'deposit' : 'withdraw';
  return (req, res) => {
    const id = Number(req.params.id);
    const row = selectRow.get(id);
    if (!row) return res.status(404).json({ error: '记录不存在' });
    if (row.status !== 'pending') return res.status(400).json({ error: '该请求已处理' });
    const status = req.body?.action === 'approve' ? 'approved' : 'rejected';
    db.transaction(() => {
      updateStatus.run(status, id);
      if (status === 'approved') updateCash.run(row.amount, row.user_id);
    })();
    logAdminOp(req, `${kind}.${status}`, row.user_id,
      { request_id: id, amount: row.amount, method: row.method, sign });
    res.json({ status });
  };
}
app.post('/api/admin/deposits/:id', adminMiddleware, approveHandler('deposit_requests', +1));

app.get('/api/admin/withdraws', adminMiddleware, (req, res) => {
  const status = req.query.status;
  const sql = `SELECT w.*, u.username FROM withdraw_requests w JOIN users u ON u.id=w.user_id ${
    status ? 'WHERE w.status=?' : ''} ORDER BY w.id DESC LIMIT 200`;
  res.json(status ? db.prepare(sql).all(status) : db.prepare(sql).all());
});

app.post('/api/admin/withdraws/:id', adminMiddleware, approveHandler('withdraw_requests', -1));

app.get('/api/admin/messages', adminMiddleware, (_, res) => {
  res.json(db.prepare(`
    SELECT m.*, u.username FROM service_messages m
    LEFT JOIN users u ON u.id = m.user_id
    ORDER BY m.id DESC LIMIT 200`).all());
});

// ---------- admin: user detail + mutations ----------
app.get('/api/admin/users/:id', adminMiddleware, (req, res) => {
  const uid = Number(req.params.id);
  const user = db.prepare(`SELECT id, username, email, phone, nickname, created_at,
                                  is_admin, is_banned FROM users WHERE id=?`).get(uid);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const account   = db.prepare('SELECT cash FROM accounts WHERE user_id=?').get(uid) || { cash: 0 };
  const kyc       = db.prepare('SELECT * FROM kyc WHERE user_id=?').get(uid) || { status: 'unsubmitted' };
  const positions = db.prepare('SELECT symbol, qty, avg_price FROM positions WHERE user_id=? AND qty>0').all(uid);
  const orders    = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 50').all(uid);
  const trades    = db.prepare('SELECT * FROM trades WHERE user_id=? ORDER BY id DESC LIMIT 50').all(uid);
  const deposits  = db.prepare('SELECT * FROM deposit_requests  WHERE user_id=? ORDER BY id DESC LIMIT 50').all(uid);
  const withdraws = db.prepare('SELECT * FROM withdraw_requests WHERE user_id=? ORDER BY id DESC LIMIT 50').all(uid);
  res.json({ user, account, kyc, positions, orders, trades, deposits, withdraws });
});

app.post('/api/admin/users/:id', adminMiddleware, (req, res) => {
  const uid = Number(req.params.id);
  const u = db.prepare('SELECT id, is_admin FROM users WHERE id=?').get(uid);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const { email, phone, nickname, is_banned, is_admin, password } = req.body || {};
  const patch = [];
  const args = [];
  const changed = {};
  if (email    !== undefined) { patch.push('email=?');    args.push(email    || null); changed.email = email || null; }
  if (phone    !== undefined) { patch.push('phone=?');    args.push(phone    || null); changed.phone = phone || null; }
  if (nickname !== undefined) { patch.push('nickname=?'); args.push(nickname || null); changed.nickname = nickname || null; }
  if (is_banned !== undefined) { patch.push('is_banned=?'); args.push(is_banned ? 1 : 0); changed.is_banned = is_banned ? 1 : 0; }
  if (is_admin  !== undefined) { patch.push('is_admin=?');  args.push(is_admin  ? 1 : 0); changed.is_admin  = is_admin  ? 1 : 0; }
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: '密码至少 6 个字符' });
    patch.push('password=?'); args.push(bcrypt.hashSync(password, 10));
    changed.password_reset = true;
  }
  if (!patch.length) return res.status(400).json({ error: '无可更新字段' });
  args.push(uid);
  db.prepare(`UPDATE users SET ${patch.join(', ')} WHERE id=?`).run(...args);
  logAdminOp(req, 'user.update', uid, changed);
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/cash', adminMiddleware, (req, res) => {
  const uid = Number(req.params.id);
  const { mode, amount } = req.body || {};
  const amt = Number(amount);
  if (!isFinite(amt)) return res.status(400).json({ error: '金额非法' });
  const exists = db.prepare('SELECT user_id FROM accounts WHERE user_id=?').get(uid);
  if (!exists) db.prepare('INSERT INTO accounts(user_id, cash) VALUES(?, 0)').run(uid);
  const before = db.prepare('SELECT cash FROM accounts WHERE user_id=?').get(uid).cash;
  if (mode === 'set') {
    if (amt < 0) return res.status(400).json({ error: '金额不能为负' });
    db.prepare('UPDATE accounts SET cash=? WHERE user_id=?').run(amt, uid);
  } else {
    // 'adjust' (default): add delta (may be negative)
    db.prepare('UPDATE accounts SET cash = cash + ? WHERE user_id=?').run(amt, uid);
  }
  const after = db.prepare('SELECT cash FROM accounts WHERE user_id=?').get(uid).cash;
  logAdminOp(req, 'cash.' + (mode === 'set' ? 'set' : 'adjust'), uid,
    { mode: mode || 'adjust', amount: amt, before, after });
  res.json({ cash: after });
});

app.post('/api/admin/users/:id/positions', adminMiddleware, (req, res) => {
  const uid = Number(req.params.id);
  const { symbol, qty, avg_price } = req.body || {};
  if (!market.SYMBOLS[symbol]) return res.status(400).json({ error: '无效品种' });
  const q = Number(qty), p = Number(avg_price);
  if (!(q >= 0) || !(p >= 0)) return res.status(400).json({ error: '参数非法' });
  if (q === 0) {
    db.prepare('DELETE FROM positions WHERE user_id=? AND symbol=?').run(uid, symbol);
  } else {
    db.prepare(`INSERT INTO positions(user_id, symbol, qty, avg_price) VALUES(?,?,?,?)
      ON CONFLICT(user_id, symbol) DO UPDATE SET qty=excluded.qty, avg_price=excluded.avg_price`)
      .run(uid, symbol, q, p);
  }
  logAdminOp(req, q === 0 ? 'position.delete' : 'position.upsert', uid,
    { symbol, qty: q, avg_price: p });
  res.json({ ok: true });
});

// ---------- admin: audit log ----------
app.get('/api/admin/ops', adminMiddleware, (req, res) => {
  const limit  = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const target = req.query.target ? Number(req.query.target) : null;
  const action = (req.query.action || '').trim();
  const where = [];
  const args = [];
  if (target) { where.push('target_user_id = ?'); args.push(target); }
  if (action) { where.push('action LIKE ?');      args.push('%' + action + '%'); }
  const sql = `SELECT * FROM admin_ops
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY id DESC LIMIT ?`;
  args.push(limit);
  const rows = db.prepare(sql).all(...args);
  res.json(rows.map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : null })));
});

// ---------- admin: security events ----------
app.get('/api/admin/security', adminMiddleware, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const uid   = req.query.user_id ? Number(req.query.user_id) : null;
  const kind  = (req.query.kind || '').trim();
  const where = [];
  const args = [];
  if (uid)  { where.push('user_id = ?'); args.push(uid); }
  if (kind) { where.push('kind LIKE ?'); args.push('%' + kind + '%'); }
  const sql = `SELECT * FROM security_events
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY id DESC LIMIT ?`;
  args.push(limit);
  const rows = db.prepare(sql).all(...args);
  res.json(rows.map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : null })));
});

// ---------- admin: news CRUD ----------
app.get('/api/admin/news', adminMiddleware, (_, res) => {
  res.json(db.prepare('SELECT * FROM news ORDER BY date DESC, id DESC LIMIT 500').all());
});

app.post('/api/admin/news', adminMiddleware, (req, res) => {
  const { date, title_zh, title_en, summary_zh, summary_en, body_zh, body_en } = req.body || {};
  if (!date || !title_zh || !title_en) return res.status(400).json({ error: '日期/中英标题必填' });
  const now = Date.now();
  const info = db.prepare(`INSERT INTO news(date, title_zh, title_en, summary_zh, summary_en, body_zh, body_en, created_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(date, title_zh, title_en, summary_zh || '', summary_en || '', body_zh || '', body_en || '', now, now);
  logAdminOp(req, 'news.create', null, { id: info.lastInsertRowid, date, title_zh, title_en });
  res.json({ id: info.lastInsertRowid });
});

app.put('/api/admin/news/:id', adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT id FROM news WHERE id=?').get(id);
  if (!cur) return res.status(404).json({ error: '记录不存在' });
  const { date, title_zh, title_en, summary_zh, summary_en, body_zh, body_en } = req.body || {};
  db.prepare(`UPDATE news SET date=COALESCE(?,date), title_zh=COALESCE(?,title_zh),
      title_en=COALESCE(?,title_en), summary_zh=COALESCE(?,summary_zh),
      summary_en=COALESCE(?,summary_en), body_zh=COALESCE(?,body_zh),
      body_en=COALESCE(?,body_en), updated_at=? WHERE id=?`)
    .run(date ?? null, title_zh ?? null, title_en ?? null,
         summary_zh ?? null, summary_en ?? null, body_zh ?? null, body_en ?? null,
         Date.now(), id);
  logAdminOp(req, 'news.update', null, { id, patch: req.body });
  res.json({ ok: true });
});

app.delete('/api/admin/news/:id', adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM news WHERE id=?').run(id);
  if (info.changes) logAdminOp(req, 'news.delete', null, { id });
  res.json({ deleted: info.changes });
});

// ---------- 全局设置：公开只读子集 + 管理员可写 ----------
const PUBLIC_SETTING_KEYS = new Set(['service_url', 'feature_finance', 'feature_loan']);
app.get('/api/settings', (_, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) if (PUBLIC_SETTING_KEYS.has(r.key)) out[r.key] = r.value || '';
  res.json(out);
});

app.get('/api/admin/settings', adminMiddleware, (_, res) => {
  const rows = db.prepare('SELECT key, value, updated_at FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = { value: r.value || '', updated_at: r.updated_at };
  res.json(out);
});

app.post('/api/admin/settings', adminMiddleware, (req, res) => {
  const { key, value } = req.body || {};
  if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key 必填' });
  const v = value == null ? '' : String(value);
  db.prepare(`INSERT INTO settings(key, value, updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .run(key, v, Date.now());
  logAdminOp(req, 'settings.update', null, { key, value: v });
  res.json({ ok: true });
});

// ---------- news (DB-backed, admin-editable) ----------
app.get('/api/news', (_, res) => {
  res.json(db.prepare('SELECT * FROM news ORDER BY date DESC, id DESC LIMIT 200').all());
});
app.get('/api/news/:id', (req, res) => {
  const n = db.prepare('SELECT * FROM news WHERE id=?').get(Number(req.params.id));
  if (!n) return res.status(404).json({ error: 'not found' });
  res.json(n);
});

// ---------- static frontend ----------
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// 始终确保默认管理员账号存在（测试用例也依赖）
ensureAdmin();

// 导出 app 给 supertest 使用；仅在直接执行本文件（而非被测试模块 require）时，
// 才启动 WebSocket、行情轮询并调用 listen()。
module.exports = { app };

if (require.main === module) {
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'snapshot', data: market.getSnapshot() }));
  });

  const broadcast = (msg) => {
    const s = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === 1) c.send(s); });
  };

  market.onTick((ticks) => {
    engine.scanOpenOrders(ticks);
    broadcast({ type: 'ticks', data: ticks });
  });
  engine.onTrade((t) => broadcast({ type: 'trade', data: t }));

  market.start();

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, () => console.log(`Metals exchange running at http://localhost:${PORT}`));
}
