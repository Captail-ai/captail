const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { WebSocketServer } = require('ws');

const bcrypt = require('bcryptjs');
const db = require('./db');
const market = require('./market');
const engine = require('./engine');
const seconds = require('./seconds');
const mail = require('./mail');
const telegram = require('./telegram');
const ratelimit = require('./ratelimit');
const { register, login, authMiddleware, adminMiddleware, ensureAdmin, tryAuth,
        logSecurityEvent } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- KYC 文件上传配置 ----------
// 存储路径：backend/uploads/kyc/<uid>/<field>-<ts>.<ext>
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const KYC_DIR = path.join(UPLOAD_ROOT, 'kyc');
const WITHDRAW_DIR = path.join(UPLOAD_ROOT, 'withdraw');
fs.mkdirSync(KYC_DIR, { recursive: true });
fs.mkdirSync(WITHDRAW_DIR, { recursive: true });

function makeStorage(rootDir) {
  return multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(rootDir, String(req.user.id));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      cb(null, `${file.fieldname}-${Date.now()}${ext}`);
    },
  });
}
const imgFilter = (_req, file, cb) => {
  if (/^image\//.test(file.mimetype)) cb(null, true);
  else cb(new Error('仅支持图片文件'));
};
const kycUpload = multer({
  storage: makeStorage(KYC_DIR),
  limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imgFilter,
});
// 提现收款码上传（微信/支付宝）
const withdrawUpload = multer({
  storage: makeStorage(WITHDRAW_DIR),
  limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imgFilter,
});

// 管理员可见上传文件（用于审核 KYC 图片）
// <img> 无法发 Authorization 头，故允许从 ?token= 取
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'metals-exchange-dev-secret';
function adminQueryTokenMiddleware(req, res, next) {
  const tk = req.query.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!tk) return res.status(401).json({ error: '未登录' });
  try {
    const p = jwt.verify(tk, JWT_SECRET);
    if (!p.admin) return res.status(403).json({ error: '仅管理员可访问' });
    next();
  } catch (_) { return res.status(401).json({ error: '登录已过期' }); }
}
app.use('/api/admin/uploads', adminQueryTokenMiddleware,
  express.static(UPLOAD_ROOT, { fallthrough: false }));

// ---------- KYC 准入中间件 ----------
// requireKyc(1) = 需初级；requireKyc(2) = 需高级。失败返回 403 + reason='kyc_required'。
const kycLevelStmt = db.prepare('SELECT kyc_level FROM users WHERE id = ?');
function requireKyc(min) {
  return (req, res, next) => {
    const row = kycLevelStmt.get(req.user.id);
    const lvl = row?.kyc_level || 0;
    if (lvl < min) {
      return res.status(403).json({ error: '请先完成实名认证', reason: 'kyc_required',
        required_level: min, current_level: lvl });
    }
    next();
  };
}

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
  const acc = engine.getAccount(req.user.id) || { spot_cash: 0, option_cash: 0, cash: 0 };
  const positions = db.prepare('SELECT symbol, qty, avg_price FROM positions WHERE user_id=? AND qty > 0')
    .all(req.user.id);
  const snap = market.getSnapshot();
  const enriched = positions.map(p => {
    const last = snap[p.symbol]?.price ?? p.avg_price;
    const pnl = (last - p.avg_price) * p.qty;
    return { ...p, last, pnl, market_value: last * p.qty };
  });
  res.json({ spot_cash: acc.spot_cash, option_cash: acc.option_cash, cash: acc.cash,
             positions: enriched });
});

// 钱包内部划转：spot ↔ option，无手续费
app.post('/api/account/transfer', authMiddleware, requireKyc(1), (req, res) => {
  const { from, to, amount } = req.body || {};
  const amt = Number(amount);
  if (!(amt > 0)) return res.status(400).json({ error: '金额必须大于 0' });
  const valid = (from === 'spot' && to === 'option') || (from === 'option' && to === 'spot');
  if (!valid) return res.status(400).json({ error: '划转方向非法' });
  const srcCol = from === 'spot' ? 'spot_cash' : 'option_cash';
  const dstCol = to   === 'spot' ? 'spot_cash' : 'option_cash';
  try {
    db.transaction(() => {
      const acc = db.prepare(`SELECT ${srcCol} AS bal FROM accounts WHERE user_id=?`).get(req.user.id);
      if (!acc || acc.bal < amt - 1e-9) throw new Error('源钱包余额不足');
      db.prepare(`UPDATE accounts SET ${srcCol} = ${srcCol} - ?, ${dstCol} = ${dstCol} + ? WHERE user_id=?`)
        .run(amt, amt, req.user.id);
    })();
  } catch (e) { return res.status(400).json({ error: e.message }); }
  const acc = engine.getAccount(req.user.id);
  res.json({ spot_cash: acc.spot_cash, option_cash: acc.option_cash });
});

app.post('/api/deposit', authMiddleware, (req, res) => {
  const amt = Number(req.body?.amount);
  if (!(amt > 0) || amt > 1_000_000) return res.status(400).json({ error: '充值金额非法 (0, 1000000]' });
  // 直充入现货钱包（用户后续可自行划转到期权钱包参与交易）
  db.prepare('UPDATE accounts SET spot_cash = spot_cash + ? WHERE user_id=?').run(amt, req.user.id);
  const acc = engine.getAccount(req.user.id);
  res.json({ spot_cash: acc.spot_cash, option_cash: acc.option_cash });
});

// ---------- orders ----------
app.post('/api/orders', authMiddleware, requireKyc(1), (req, res) => {
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

app.delete('/api/orders/:id', authMiddleware, requireKyc(1), (req, res) => {
  try { res.json(engine.cancelOrder(req.user.id, Number(req.params.id))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/trades', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM trades WHERE user_id=? ORDER BY id DESC LIMIT 200').all(req.user.id);
  res.json(rows);
});

// ---------- seconds (binary options) ----------
app.get('/api/seconds/config', (_, res) => {
  res.json({ durations: seconds.listDurations(),
             min_amount: seconds.MIN_AMOUNT, max_amount: seconds.MAX_AMOUNT });
});
// 公开期权时长（与 seconds/config 等价，新名字）
app.get('/api/option-periods', (_, res) => res.json(seconds.listPeriods()));

app.post('/api/seconds/orders', authMiddleware, requireKyc(1), (req, res) => {
  try {
    const c = seconds.placeContract(req.user.id, req.body || {});
    res.json(c);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/seconds/orders', authMiddleware, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  res.json(seconds.listOrders(req.user.id, limit));
});

app.get('/api/seconds/orders/active', authMiddleware, (req, res) => {
  res.json(seconds.listActive(req.user.id));
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
// 两段式 KYC：
//   1) 初级 (basic)：填写真实姓名 + 证件号 → 自动通过 → kyc_level=1
//   2) 高级 (advanced)：上传身份证正/反面 + 手持照 → 待管理员人工审核
//      管理员通过后 kyc_level=2，并向 spot_cash 一次性奖励 10 USD
app.get('/api/kyc', authMiddleware, (req, res) => {
  const k = db.prepare('SELECT * FROM kyc WHERE user_id=?').get(req.user.id);
  const u = db.prepare('SELECT kyc_level FROM users WHERE id=?').get(req.user.id);
  res.json({ ...(k || { status: 'unsubmitted' }), kyc_level: (u && u.kyc_level) || 0 });
});

// 初级认证：仅采集姓名 + 证件号，自动通过
app.post('/api/kyc/basic', authMiddleware, (req, res) => {
  const { real_name, id_type, id_number } = req.body || {};
  if (!real_name || !id_number) return res.status(400).json({ error: '请填写姓名与证件号' });
  const now = Date.now();
  db.transaction(() => {
    db.prepare(`
      INSERT INTO kyc(user_id, real_name, id_type, id_number, status, submitted_at)
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET
        real_name=excluded.real_name, id_type=excluded.id_type,
        id_number=excluded.id_number, status='approved', submitted_at=excluded.submitted_at
    `).run(req.user.id, real_name, id_type || 'id_card', id_number, 'approved', now);
    db.prepare('UPDATE users SET kyc_level = MAX(kyc_level, 1) WHERE id=?').run(req.user.id);
  })();
  res.json({ status: 'approved', kyc_level: 1, submitted_at: now });
});

// 高级认证：三张图（身份证正、反、手持），进入审核
app.post('/api/kyc/advanced', authMiddleware,
  kycUpload.fields([{ name: 'id_front', maxCount: 1 },
                    { name: 'id_back',  maxCount: 1 },
                    { name: 'holding',  maxCount: 1 }]),
  (req, res) => {
    const u = db.prepare('SELECT kyc_level FROM users WHERE id=?').get(req.user.id);
    if (!u || u.kyc_level < 1) {
      return res.status(400).json({ error: '请先完成初级认证' });
    }
    const files = req.files || {};
    const front = files.id_front && files.id_front[0];
    const back  = files.id_back  && files.id_back[0];
    const hold  = files.holding  && files.holding[0];
    if (!front || !back || !hold) {
      return res.status(400).json({ error: '请上传身份证正面、反面、手持身份证三张图片' });
    }
    // 路径相对 UPLOAD_ROOT，便于通过 /api/admin/uploads 静态挂载访问
    const rel = (f) => path.relative(UPLOAD_ROOT, f.path).replace(/\\/g, '/');
    const now = Date.now();
    db.prepare(`UPDATE kyc SET id_front_path=?, id_back_path=?, holding_path=?,
                advanced_status='reviewing', advanced_at=? WHERE user_id=?`)
      .run(rel(front), rel(back), rel(hold), now, req.user.id);
    res.json({ advanced_status: 'reviewing', advanced_at: now });
  });

// multer 错误处理：文件超限/格式不合返回 400 而非 500
app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError || /图片/.test(err && err.message || '')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ---------- deposit / withdraw requests ----------
app.post('/api/deposit-requests', authMiddleware, (req, res) => {
  const { method, amount, ref_info } = req.body || {};
  const amt = Number(amount);
  if (!method || !(amt > 0)) return res.status(400).json({ error: '参数非法' });
  const now = Date.now();
  const info = db.prepare(`INSERT INTO deposit_requests(user_id, method, amount, ref_info, created_at) VALUES(?,?,?,?,?)`)
    .run(req.user.id, method, amt, ref_info || '', now);
  telegram.notifyDeposit({
    id: info.lastInsertRowid, user_id: req.user.id, username: req.user.username,
    amount: amt, method, ref_info: ref_info || '', created_at: now,
  }).catch(() => {});
  res.json({ id: info.lastInsertRowid, status: 'pending' });
});

app.get('/api/deposit-requests', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM deposit_requests WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id));
});

// 提现 4 通道：wechat / alipay / bank / usdt_trc20
//  - wechat / alipay：account_name + qr_code 图片
//  - bank：account_name + bank_name + address (账号)
//  - usdt_trc20：address (TRC-20 地址)
// 1% 手续费、每日（UTC+8 自然日）最多 3 次、KYC 初级以上、资金从现货钱包扣
const WITHDRAW_METHODS = new Set(['wechat', 'alipay', 'bank', 'usdt_trc20']);
function startOfDayCN(ts = Date.now()) {
  // 中国时区 UTC+8 自然日 0 点对应的毫秒时间戳
  const off = 8 * 3600 * 1000;
  return Math.floor((ts + off) / 86400000) * 86400000 - off;
}
function getNum(key, fallback) {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  const n = Number(r?.value);
  return Number.isFinite(n) ? n : fallback;
}

app.post('/api/withdraw-requests', authMiddleware, requireKyc(1),
  withdrawUpload.fields([{ name: 'qr_code', maxCount: 1 }]),
  (req, res) => {
    const { method, amount, account_name, address, bank_name } = req.body || {};
    const amt = Number(amount);
    if (!WITHDRAW_METHODS.has(method)) return res.status(400).json({ error: '提现方式非法' });
    if (!(amt >= 10)) return res.status(400).json({ error: '最低提现金额 10 USD' });

    // 通道字段校验
    const qr = (req.files?.qr_code || [])[0];
    if (method === 'wechat' || method === 'alipay') {
      if (!account_name || !qr) return res.status(400).json({ error: '请提供收款人姓名与收款码' });
    } else if (method === 'bank') {
      if (!account_name || !bank_name || !address) {
        return res.status(400).json({ error: '请提供姓名、开户行、账号' });
      }
    } else if (method === 'usdt_trc20') {
      if (!address) return res.status(400).json({ error: '请提供 TRC-20 地址' });
    }

    // 每日次数限制（仅计成功提交的，无论审核结果）
    const dayStart = startOfDayCN();
    const cnt = db.prepare(
      'SELECT COUNT(*) c FROM withdraw_requests WHERE user_id=? AND created_at>=?'
    ).get(req.user.id, dayStart).c;
    const dailyLimit = getNum('withdraw_daily_limit', 3);
    if (cnt >= dailyLimit) {
      return res.status(400).json({ error: `每日最多提现 ${dailyLimit} 次，请明日再试` });
    }

    const feeRate = getNum('withdraw_fee_rate', 0.01);
    const fee = +(amt * feeRate).toFixed(8);
    const net = +(amt - fee).toFixed(8);
    const acc = engine.getAccount(req.user.id);
    if (!acc || acc.spot_cash < amt - 1e-9) return res.status(400).json({ error: '现货钱包资金不足' });

    const qrRel = qr ? path.relative(UPLOAD_ROOT, qr.path).replace(/\\/g, '/') : null;
    const now = Date.now();
    let id;
    db.transaction(() => {
      // 资金冻结：提现申请提交时即从现货钱包扣除（含手续费），驳回时再退回
      db.prepare('UPDATE accounts SET spot_cash = spot_cash - ? WHERE user_id=?').run(amt, req.user.id);
      const info = db.prepare(`INSERT INTO withdraw_requests
        (user_id, method, amount, target, created_at, account_name, qr_code_path,
         address, bank_name, fee, net_amount)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(
          req.user.id, method, amt, address || account_name || '', now,
          account_name || null, qrRel, address || null, bank_name || null, fee, net);
      id = info.lastInsertRowid;
    })();
    telegram.notifyWithdraw({
      id, user_id: req.user.id, username: req.user.username,
      amount: amt, method, address: address || null,
      account_name: account_name || null, bank_name: bank_name || null,
      created_at: now,
    }).catch(() => {});
    res.json({ id, status: 'pending', fee, net_amount: net });
  });

app.get('/api/withdraw-requests', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM withdraw_requests WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id));
});

// ---------- 理财（finance） ----------
app.get('/api/finance/products', (_, res) => {
  res.json(db.prepare(`SELECT * FROM finance_products WHERE enabled=1
    ORDER BY sort_order, id`).all());
});
app.get('/api/finance/holdings', authMiddleware, (req, res) => {
  res.json(db.prepare(`SELECT s.*, p.name_zh, p.name_en, p.vip_tag FROM finance_subscriptions s
    LEFT JOIN finance_products p ON p.id = s.product_id
    WHERE s.user_id=? ORDER BY s.id DESC LIMIT 200`).all(req.user.id));
});
app.post('/api/finance/subscribe', authMiddleware, requireKyc(1), (req, res) => {
  const { product_id, amount } = req.body || {};
  const amt = Number(amount);
  const p = db.prepare('SELECT * FROM finance_products WHERE id=? AND enabled=1').get(Number(product_id));
  if (!p) return res.status(400).json({ error: '理财产品不可用' });
  if (!(amt >= p.min_amount) || !(amt <= p.max_amount)) {
    return res.status(400).json({ error: `金额范围 ${p.min_amount}-${p.max_amount}` });
  }
  if (p.total_quota > 0 && p.sold_quota + amt > p.total_quota + 1e-9) {
    return res.status(400).json({ error: '额度已售罄' });
  }
  const acc = engine.getAccount(req.user.id);
  if (!acc || acc.spot_cash < amt - 1e-9) return res.status(400).json({ error: '现货钱包资金不足' });
  const now = Date.now();
  const endAt = now + p.lock_days * 86400000;
  let subId;
  db.transaction(() => {
    db.prepare('UPDATE accounts SET spot_cash = spot_cash - ? WHERE user_id=?').run(amt, req.user.id);
    db.prepare('UPDATE finance_products SET sold_quota = sold_quota + ? WHERE id=?').run(amt, p.id);
    const info = db.prepare(`INSERT INTO finance_subscriptions
      (user_id, product_id, amount, daily_rate, lock_days, last_settle_at,
       start_at, end_at, status, created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
        req.user.id, p.id, amt, p.daily_rate, p.lock_days, now, now, endAt, 'active', now);
    subId = info.lastInsertRowid;
  })();
  res.json({ id: subId, end_at: endAt });
});

// 到期赎回：本金 + 利息（amount * daily_rate * lock_days）回到现货钱包
app.post('/api/finance/holdings/:id/redeem', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM finance_subscriptions WHERE id=? AND user_id=?')
    .get(id, req.user.id);
  if (!row) return res.status(404).json({ error: '记录不存在' });
  if (row.status !== 'active') return res.status(400).json({ error: '该申购已赎回' });
  if (Date.now() < row.end_at) return res.status(400).json({ error: '锁定期未到，暂不可赎回' });
  const interest = +(row.amount * row.daily_rate * row.lock_days).toFixed(8);
  const total = +(row.amount + interest).toFixed(8);
  db.transaction(() => {
    db.prepare(`UPDATE finance_subscriptions SET status='redeemed', accrued=?, redeemed_at=? WHERE id=?`)
      .run(interest, Date.now(), id);
    db.prepare('UPDATE accounts SET spot_cash = spot_cash + ? WHERE user_id=?').run(total, req.user.id);
  })();
  res.json({ ok: true, principal: row.amount, interest, total });
});

// ---------- 贷款（loan） ----------
app.get('/api/loan/products', (_, res) => {
  res.json(db.prepare(`SELECT * FROM loan_products WHERE enabled=1
    ORDER BY sort_order, id`).all());
});
app.get('/api/loan/applications', authMiddleware, (req, res) => {
  res.json(db.prepare(`SELECT a.*, p.name_zh, p.name_en FROM loan_applications a
    LEFT JOIN loan_products p ON p.id = a.product_id
    WHERE a.user_id=? ORDER BY a.id DESC LIMIT 200`).all(req.user.id));
});
app.post('/api/loan/apply', authMiddleware, requireKyc(1), (req, res) => {
  const { product_id, amount, term_days, remark } = req.body || {};
  const amt = Number(amount);
  const p = db.prepare('SELECT * FROM loan_products WHERE id=? AND enabled=1').get(Number(product_id));
  if (!p) return res.status(400).json({ error: '贷款产品不可用' });
  if (!(amt >= p.min_amount) || !(amt <= p.max_amount)) {
    return res.status(400).json({ error: `金额范围 ${p.min_amount}-${p.max_amount}` });
  }
  const term = Number(term_days) || p.term_days;
  const total = +(amt * (1 + p.daily_rate * term)).toFixed(8);
  const info = db.prepare(`INSERT INTO loan_applications
    (user_id, product_id, amount, term_days, daily_rate, total_repay,
     status, applied_at, remark) VALUES(?,?,?,?,?,?,?,?,?)`).run(
      req.user.id, p.id, amt, term, p.daily_rate, total,
      'pending', Date.now(), remark || null);
  res.json({ id: info.lastInsertRowid, total_repay: total });
});

// ---------- FAQ ----------
app.get('/api/faqs', (_, res) => {
  res.json(db.prepare('SELECT * FROM faqs WHERE enabled=1 ORDER BY sort_order, id').all());
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
  const rows = db.prepare(`
    SELECT u.id, u.username, u.email, u.phone, u.nickname, u.created_at, u.is_admin,
           u.kyc_level, a.spot_cash, a.option_cash, k.status AS kyc_status
    FROM users u
    LEFT JOIN accounts a ON a.user_id = u.id
    LEFT JOIN kyc k ON k.user_id = u.id
    WHERE u.is_admin = 0
    ORDER BY u.id DESC LIMIT 500`).all();
  // 兼容老前端：暴露一个汇总 cash = spot + option
  res.json(rows.map(r => ({ ...r,
    cash: (r.spot_cash || 0) + (r.option_cash || 0) })));
});

// 列表支持按 ?stage=basic|advanced + ?status=pending|reviewing|approved|rejected 筛选
app.get('/api/admin/kyc', adminMiddleware, (req, res) => {
  const { status, stage } = req.query;
  const where = [];
  const args = [];
  if (stage === 'advanced') where.push("k.advanced_status IS NOT NULL");
  if (status && stage === 'advanced') { where.push("k.advanced_status=?"); args.push(status); }
  else if (status) { where.push("k.status=?"); args.push(status); }
  const sql = `SELECT k.*, u.username, u.kyc_level FROM kyc k JOIN users u ON u.id=k.user_id ${
    where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY k.submitted_at DESC LIMIT 200`;
  res.json(db.prepare(sql).all(...args));
});

// stage='basic'（默认）/'advanced'：审核基础或高级 KYC
app.post('/api/admin/kyc/:uid', adminMiddleware, (req, res) => {
  const action = req.body?.action; // 'approve' | 'reject'
  const stage = req.body?.stage === 'advanced' ? 'advanced' : 'basic';
  const status = action === 'approve' ? 'approved' : 'rejected';
  const uid = Number(req.params.uid);

  if (stage === 'basic') {
    const info = db.prepare('UPDATE kyc SET status=? WHERE user_id=?').run(status, uid);
    if (action === 'approve') {
      db.prepare('UPDATE users SET kyc_level = MAX(kyc_level, 1) WHERE id=?').run(uid);
    }
    if (info.changes) logAdminOp(req, 'kyc.' + action, uid, { stage, status });
    return res.json({ changes: info.changes, status });
  }

  // advanced 审核
  let reward = 0;
  db.transaction(() => {
    const k = db.prepare('SELECT advanced_reward FROM kyc WHERE user_id=?').get(uid);
    db.prepare('UPDATE kyc SET advanced_status=? WHERE user_id=?').run(status, uid);
    if (action === 'approve') {
      db.prepare('UPDATE users SET kyc_level = 2 WHERE id=?').run(uid);
      // 一次性奖励 10 USD 进入现货钱包，幂等
      if (!k || !k.advanced_reward) {
        db.prepare(`INSERT INTO accounts(user_id, spot_cash, option_cash) VALUES(?, 10, 0)
                    ON CONFLICT(user_id) DO UPDATE SET spot_cash = spot_cash + 10`).run(uid);
        db.prepare('UPDATE kyc SET advanced_reward=1 WHERE user_id=?').run(uid);
        reward = 10;
      }
    }
  })();
  logAdminOp(req, 'kyc.advanced.' + action, uid, { stage, status, reward });
  res.json({ status, reward });
});

app.get('/api/admin/deposits', adminMiddleware, (req, res) => {
  const status = req.query.status;
  const sql = `SELECT d.*, u.username FROM deposit_requests d JOIN users u ON u.id=d.user_id ${
    status ? 'WHERE d.status=?' : ''} ORDER BY d.id DESC LIMIT 200`;
  res.json(status ? db.prepare(sql).all(status) : db.prepare(sql).all());
});

// 充值/提现审批流程：
//  充值通过 → spot_cash += amount；驳回 → 不动
//  提现：申请提交时已冻结 amount（含手续费）。通过 → 资金已扣，不再动；驳回 → spot_cash += amount 退款
function approveHandler(table) {
  const selectRow = db.prepare(`SELECT * FROM ${table} WHERE id=?`);
  const updateStatus = db.prepare(`UPDATE ${table} SET status=? WHERE id=?`);
  const addCash = db.prepare(`UPDATE accounts SET spot_cash = spot_cash + ? WHERE user_id=?`);
  const kind = table === 'deposit_requests' ? 'deposit' : 'withdraw';
  return (req, res) => {
    const id = Number(req.params.id);
    const row = selectRow.get(id);
    if (!row) return res.status(404).json({ error: '记录不存在' });
    if (row.status !== 'pending') return res.status(400).json({ error: '该请求已处理' });
    const status = req.body?.action === 'approve' ? 'approved' : 'rejected';
    db.transaction(() => {
      updateStatus.run(status, id);
      if (kind === 'deposit' && status === 'approved') {
        addCash.run(row.amount, row.user_id);
      }
      if (kind === 'withdraw' && status === 'rejected') {
        // 退还冻结资金（含手续费）
        addCash.run(row.amount, row.user_id);
      }
    })();
    logAdminOp(req, `${kind}.${status}`, row.user_id,
      { request_id: id, amount: row.amount, method: row.method });
    res.json({ status });
  };
}
app.post('/api/admin/deposits/:id', adminMiddleware, approveHandler('deposit_requests'));

app.get('/api/admin/withdraws', adminMiddleware, (req, res) => {
  const status = req.query.status;
  const sql = `SELECT w.*, u.username FROM withdraw_requests w JOIN users u ON u.id=w.user_id ${
    status ? 'WHERE w.status=?' : ''} ORDER BY w.id DESC LIMIT 200`;
  res.json(status ? db.prepare(sql).all(status) : db.prepare(sql).all());
});

app.post('/api/admin/withdraws/:id', adminMiddleware, approveHandler('withdraw_requests'));

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
                                  is_admin, is_banned, kyc_level, force_outcome
                           FROM users WHERE id=?`).get(uid);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const accRow    = db.prepare('SELECT spot_cash, option_cash FROM accounts WHERE user_id=?').get(uid)
                    || { spot_cash: 0, option_cash: 0 };
  // cash 字段保留为汇总值，便于旧前端展示与测试
  const account   = { spot_cash: accRow.spot_cash, option_cash: accRow.option_cash,
                      cash: accRow.spot_cash + accRow.option_cash };
  const kyc       = db.prepare('SELECT * FROM kyc WHERE user_id=?').get(uid) || { status: 'unsubmitted' };
  const positions = db.prepare('SELECT symbol, qty, avg_price FROM positions WHERE user_id=? AND qty>0').all(uid);
  const orders    = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 50').all(uid);
  const trades    = db.prepare('SELECT * FROM trades WHERE user_id=? ORDER BY id DESC LIMIT 50').all(uid);
  const deposits  = db.prepare('SELECT * FROM deposit_requests  WHERE user_id=? ORDER BY id DESC LIMIT 50').all(uid);
  const withdraws = db.prepare('SELECT * FROM withdraw_requests WHERE user_id=? ORDER BY id DESC LIMIT 50').all(uid);
  const seconds_orders = db.prepare(
    'SELECT * FROM second_contracts WHERE user_id=? ORDER BY id DESC LIMIT 50').all(uid);
  res.json({ user, account, kyc, positions, orders, trades, deposits, withdraws, seconds_orders });
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
  const { mode, amount, wallet, reason } = req.body || {};
  const amt = Number(amount);
  if (!isFinite(amt)) return res.status(400).json({ error: '金额非法' });
  // wallet 可选：'spot' / 'option'，缺省 'spot'。'both' 用于同步两个钱包（仅 set 模式有意义）
  const w = (wallet || 'spot').toString();
  if (!['spot', 'option'].includes(w)) return res.status(400).json({ error: 'wallet 非法' });
  // reason 可选但若传则需 ≥2 字符；UI 强制必填
  const rsn = reason == null ? '' : String(reason).trim();
  if (rsn && rsn.length < 2) return res.status(400).json({ error: '原因至少 2 个字符' });
  const col = w === 'spot' ? 'spot_cash' : 'option_cash';
  const exists = db.prepare('SELECT user_id FROM accounts WHERE user_id=?').get(uid);
  if (!exists) db.prepare('INSERT INTO accounts(user_id, spot_cash, option_cash) VALUES(?, 0, 0)').run(uid);
  const beforeRow = db.prepare(`SELECT spot_cash, option_cash FROM accounts WHERE user_id=?`).get(uid);
  if (mode === 'set') {
    if (amt < 0) return res.status(400).json({ error: '金额不能为负' });
    db.prepare(`UPDATE accounts SET ${col}=? WHERE user_id=?`).run(amt, uid);
  } else {
    // 'adjust' (default): add delta (may be negative)
    db.prepare(`UPDATE accounts SET ${col} = ${col} + ? WHERE user_id=?`).run(amt, uid);
  }
  const afterRow = db.prepare(`SELECT spot_cash, option_cash FROM accounts WHERE user_id=?`).get(uid);
  logAdminOp(req, 'cash.' + (mode === 'set' ? 'set' : 'adjust'), uid,
    { wallet: w, mode: mode || 'adjust', amount: amt, reason: rsn || null,
      before: beforeRow, after: afterRow });
  // 返回兼容字段：cash = 总额；同时返回 spot/option 明细
  res.json({ cash: afterRow.spot_cash + afterRow.option_cash,
             spot_cash: afterRow.spot_cash, option_cash: afterRow.option_cash });
});

// 硬删除：连同 user 所有派生数据一并清掉；保留 admin_ops / security_events 作为审计留痕
app.delete('/api/admin/users/:id', adminMiddleware, (req, res) => {
  const uid = Number(req.params.id);
  const u = db.prepare('SELECT id, username, is_admin FROM users WHERE id=?').get(uid);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  if (u.is_admin) return res.status(400).json({ error: '不能删除管理员账号' });
  if (req.user && req.user.id === uid) return res.status(400).json({ error: '不能删除自己' });
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 2) return res.status(400).json({ error: '请填写删除原因（≥2 个字符）' });
  const confirmName = String(req.body?.confirm_username || '').trim();
  if (confirmName !== u.username) return res.status(400).json({ error: '请输入用户名以确认删除' });

  db.transaction(() => {
    db.prepare('DELETE FROM trades WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM orders WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM positions WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM second_contracts WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM deposit_requests WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM withdraw_requests WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM finance_subscriptions WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM loan_applications WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM email_verifications WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM service_messages WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM kyc WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM accounts WHERE user_id=?').run(uid);
    db.prepare('DELETE FROM users WHERE id=?').run(uid);
  })();
  logAdminOp(req, 'user.delete', uid, { username: u.username, reason });
  res.json({ ok: true, deleted: u.username });
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

// 秒级合约强制结果：mode ∈ none/next_win/next_lose/always_win/always_lose
app.post('/api/admin/users/:id/force-outcome', adminMiddleware, (req, res) => {
  const uid = Number(req.params.id);
  const before = seconds.readForceOutcome(uid);
  try {
    const value = seconds.setForceOutcome(uid, req.body?.mode);
    logAdminOp(req, 'force_outcome.set', uid, { before, after: value });
    res.json({ force_outcome: value });
  } catch (e) { res.status(400).json({ error: e.message }); }
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

// ---------- admin: option_periods CRUD ----------
app.get('/api/admin/option-periods', adminMiddleware, (_, res) => {
  res.json(db.prepare('SELECT * FROM option_periods ORDER BY sort_order, duration_sec').all());
});
app.post('/api/admin/option-periods', adminMiddleware, (req, res) => {
  const { duration_sec, payout_rate, min_amount, max_amount,
          label_zh, label_en, sort_order, enabled } = req.body || {};
  const dur = Number(duration_sec), rate = Number(payout_rate);
  if (!(dur > 0) || !(rate > 0)) return res.status(400).json({ error: '时长 / 赔率非法' });
  const now = Date.now();
  try {
    const info = db.prepare(`INSERT INTO option_periods
      (duration_sec, payout_rate, min_amount, max_amount, label_zh, label_en,
       sort_order, enabled, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .run(dur, rate, Number(min_amount) || 10, Number(max_amount) || 50000,
        label_zh || null, label_en || null, Number(sort_order) || 0,
        enabled === 0 ? 0 : 1, now, now);
    logAdminOp(req, 'option_period.create', null, { id: info.lastInsertRowid, dur, rate });
    res.json({ id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/admin/option-periods/:id', adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT id FROM option_periods WHERE id=?').get(id);
  if (!cur) return res.status(404).json({ error: '记录不存在' });
  const f = req.body || {};
  db.prepare(`UPDATE option_periods SET
    duration_sec = COALESCE(?, duration_sec),
    payout_rate  = COALESCE(?, payout_rate),
    min_amount   = COALESCE(?, min_amount),
    max_amount   = COALESCE(?, max_amount),
    label_zh     = COALESCE(?, label_zh),
    label_en     = COALESCE(?, label_en),
    sort_order   = COALESCE(?, sort_order),
    enabled      = COALESCE(?, enabled),
    updated_at   = ? WHERE id=?`).run(
      f.duration_sec ?? null, f.payout_rate ?? null,
      f.min_amount ?? null, f.max_amount ?? null,
      f.label_zh ?? null, f.label_en ?? null,
      f.sort_order ?? null, f.enabled ?? null,
      Date.now(), id);
  logAdminOp(req, 'option_period.update', null, { id, patch: f });
  res.json({ ok: true });
});
app.delete('/api/admin/option-periods/:id', adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM option_periods WHERE id=?').run(id);
  if (info.changes) logAdminOp(req, 'option_period.delete', null, { id });
  res.json({ deleted: info.changes });
});

// ---------- admin: finance_products / loan_products / faqs CRUD ----------
// 通用 CRUD 工厂：减少重复样板
function makeCrud(table, allowed, action) {
  const cols = allowed.join(', ');
  const ph = allowed.map(() => '?').join(',');
  return {
    list: (_, res) => res.json(db.prepare(
      `SELECT * FROM ${table} ORDER BY sort_order, id`).all()),
    create: (req, res) => {
      const f = req.body || {};
      const now = Date.now();
      const vals = allowed.map(k => f[k] ?? null);
      const info = db.prepare(
        `INSERT INTO ${table}(${cols}, created_at, updated_at) VALUES(${ph}, ?, ?)`)
        .run(...vals, now, now);
      logAdminOp(req, `${action}.create`, null, { id: info.lastInsertRowid });
      res.json({ id: info.lastInsertRowid });
    },
    update: (req, res) => {
      const id = Number(req.params.id);
      const cur = db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id);
      if (!cur) return res.status(404).json({ error: '记录不存在' });
      const f = req.body || {};
      const sets = allowed.map(k => `${k} = COALESCE(?, ${k})`).join(', ');
      const vals = allowed.map(k => f[k] ?? null);
      db.prepare(`UPDATE ${table} SET ${sets}, updated_at=? WHERE id=?`)
        .run(...vals, Date.now(), id);
      logAdminOp(req, `${action}.update`, null, { id, patch: f });
      res.json({ ok: true });
    },
    remove: (req, res) => {
      const id = Number(req.params.id);
      const info = db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
      if (info.changes) logAdminOp(req, `${action}.delete`, null, { id });
      res.json({ deleted: info.changes });
    },
  };
}
const finCrud = makeCrud('finance_products',
  ['name_zh','name_en','vip_tag','daily_rate','min_amount','max_amount','lock_days',
   'total_quota','description_zh','description_en','sort_order','enabled'], 'finance_product');
app.get('/api/admin/finance/products',         adminMiddleware, finCrud.list);
app.post('/api/admin/finance/products',        adminMiddleware, finCrud.create);
app.put('/api/admin/finance/products/:id',     adminMiddleware, finCrud.update);
app.delete('/api/admin/finance/products/:id',  adminMiddleware, finCrud.remove);

const loanCrud = makeCrud('loan_products',
  ['name_zh','name_en','daily_rate','min_amount','max_amount','term_days',
   'description_zh','description_en','sort_order','enabled'], 'loan_product');
app.get('/api/admin/loan/products',         adminMiddleware, loanCrud.list);
app.post('/api/admin/loan/products',        adminMiddleware, loanCrud.create);
app.put('/api/admin/loan/products/:id',     adminMiddleware, loanCrud.update);
app.delete('/api/admin/loan/products/:id',  adminMiddleware, loanCrud.remove);

const faqCrud = makeCrud('faqs',
  ['question_zh','question_en','answer_zh','answer_en','sort_order','enabled'], 'faq');
app.get('/api/admin/faqs',         adminMiddleware, faqCrud.list);
app.post('/api/admin/faqs',        adminMiddleware, faqCrud.create);
app.put('/api/admin/faqs/:id',     adminMiddleware, faqCrud.update);
app.delete('/api/admin/faqs/:id',  adminMiddleware, faqCrud.remove);

// ---------- admin: loan_applications 审批 ----------
app.get('/api/admin/loan/applications', adminMiddleware, (req, res) => {
  const status = req.query.status;
  const sql = `SELECT a.*, u.username, p.name_zh, p.name_en FROM loan_applications a
    JOIN users u ON u.id = a.user_id LEFT JOIN loan_products p ON p.id = a.product_id ${
    status ? 'WHERE a.status=?' : ''} ORDER BY a.id DESC LIMIT 200`;
  res.json(status ? db.prepare(sql).all(status) : db.prepare(sql).all());
});
app.post('/api/admin/loan/applications/:id', adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const action = req.body?.action;
  const row = db.prepare('SELECT * FROM loan_applications WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: '记录不存在' });
  if (row.status !== 'pending') return res.status(400).json({ error: '该申请已处理' });
  const now = Date.now();
  if (action === 'approve') {
    const dueAt = now + row.term_days * 86400000;
    db.transaction(() => {
      db.prepare(`UPDATE loan_applications SET status='approved', approved_at=?, due_at=? WHERE id=?`)
        .run(now, dueAt, id);
      // 贷款放款 → 现货钱包
      db.prepare('UPDATE accounts SET spot_cash = spot_cash + ? WHERE user_id=?').run(row.amount, row.user_id);
    })();
    logAdminOp(req, 'loan.approve', row.user_id, { id, amount: row.amount });
    return res.json({ status: 'approved', due_at: dueAt });
  }
  if (action === 'reject') {
    db.prepare(`UPDATE loan_applications SET status='rejected' WHERE id=?`).run(id);
    logAdminOp(req, 'loan.reject', row.user_id, { id });
    return res.json({ status: 'rejected' });
  }
  res.status(400).json({ error: 'action 非法' });
});

// ---------- 全局设置：公开只读子集 + 管理员可写 ----------
const PUBLIC_SETTING_KEYS = new Set([
  'service_url', 'feature_finance', 'feature_loan',
  'withdraw_fee_rate', 'withdraw_daily_limit', 'trade_fee_rate', 'signup_bonus',
]);
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
    try { seconds.settleDue(); } catch (_) { /* 结算异常不阻断行情广播 */ }
    broadcast({ type: 'ticks', data: ticks });
  });
  engine.onTrade((t) => broadcast({ type: 'trade', data: t }));

  market.start();

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, () => console.log(`Metals exchange running at http://localhost:${PORT}`));
}
