const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'metals-exchange-dev-secret';
const JWT_EXPIRES = '7d';

// 安全事件审计 — 容错设计：审计失败绝不阻断业务请求。
const insertSecEvent = db.prepare(
  `INSERT INTO security_events(kind, user_id, username, ip, user_agent, details, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`);
function logSecurityEvent(req, kind, { userId = null, username = null, details = null } = {}) {
  try {
    const ip = (req && (req.ip || req.headers?.['x-forwarded-for'] || '')) || null;
    const ua = (req && req.headers?.['user-agent']) || null;
    insertSecEvent.run(
      kind,
      userId == null ? null : Number(userId),
      username || null, ip, ua,
      details == null ? null : JSON.stringify(details),
      Date.now());
  } catch (_) { /* 审计失败静默吞掉，不影响主流程 */ }
}

function signToken(user) {
  return jwt.sign({ uid: user.id, username: user.username, admin: !!user.is_admin },
    JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function ensureAdmin() {
  const row = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (row) {
    db.prepare('UPDATE users SET is_admin = 1, email_verified = 1 WHERE id = ?').run(row.id);
    return;
  }
  const hash = bcrypt.hashSync('admin123', 10);
  const info = db.prepare(
    'INSERT INTO users(username, password, is_admin, email_verified, created_at) VALUES (?,?,?,?,?)'
  ).run('admin', hash, 1, 1, Date.now());
  db.prepare('INSERT INTO accounts(user_id, spot_cash, option_cash) VALUES (?, 0, 0)')
    .run(info.lastInsertRowid);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function register(username, password, email) {
  if (!username || username.length < 3) throw new Error('用户名至少 3 个字符');
  if (!password || password.length < 6) throw new Error('密码至少 6 个字符');
  if (!email || !EMAIL_RE.test(email))  throw new Error('请填写有效的邮箱');
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) throw new Error('用户名已被占用');
  const emailTaken = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (emailTaken) throw new Error('邮箱已被占用');
  const hash = bcrypt.hashSync(password, 10);
  const now = Date.now();
  const autoVerify = process.env.DEV_AUTO_VERIFY === '1' ? 1 : 0;
  const info = db.prepare(
    `INSERT INTO users(username, password, email, email_verified, created_at) VALUES (?,?,?,?,?)`
  ).run(username, hash, email, autoVerify, now);
  // 赠送 100,000 USD 试玩金 — 进入期权钱包（现货钱包仍为 0，需 KYC 后充值）
  db.prepare('INSERT INTO accounts(user_id, spot_cash, option_cash) VALUES (?, 0, ?)')
    .run(info.lastInsertRowid, 100000);
  const user = { id: info.lastInsertRowid, username, email_verified: !!autoVerify };
  // 仅当账号已完成邮箱验证时，才返回可用 token
  const token = autoVerify ? signToken({ id: user.id, username, is_admin: 0 }) : null;
  return { user, token };
}

function login(username, password) {
  const row = db.prepare(
    'SELECT id, username, password, is_admin, is_banned, email_verified FROM users WHERE username = ?'
  ).get(username);
  if (!row) throw new Error('用户名或密码错误');
  if (!bcrypt.compareSync(password, row.password)) throw new Error('用户名或密码错误');
  if (!row.email_verified) {
    const e = new Error('邮箱未验证');
    e.code = 'unverified';
    e.userId = row.id;
    throw e;
  }
  const user = { id: row.id, username: row.username, is_admin: !!row.is_admin };
  return { user, token: signToken(user) };
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/);
  if (!m) return res.status(401).json({ error: '未登录' });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.user = { id: payload.uid, username: payload.username, admin: !!payload.admin };
    next();
  } catch (_) {
    logSecurityEvent(req, 'auth.token_invalid', { details: { path: req.path } });
    return res.status(401).json({ error: '登录已过期' });
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (!req.user.admin) {
      logSecurityEvent(req, 'admin.denied',
        { userId: req.user.id, username: req.user.username, details: { path: req.path } });
      return res.status(403).json({ error: '仅管理员可访问' });
    }
    next();
  });
}

// 尽力解析 Bearer token；成功返回类似 user 的对象，否则返回 null。
function tryAuth(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/);
  if (!m) return null;
  try {
    const p = jwt.verify(m[1], JWT_SECRET);
    return { id: p.uid, username: p.username, admin: !!p.admin };
  } catch (_) { return null; }
}

module.exports = {
  register, login, authMiddleware, adminMiddleware, ensureAdmin, tryAuth,
  logSecurityEvent,
};
