const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.join(__dirname, '..', 'data', 'exchange.db');
const DATA_DIR = path.dirname(DB_FILE);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT UNIQUE NOT NULL,
  password     TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  nickname     TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kyc (
  user_id       INTEGER PRIMARY KEY,
  real_name     TEXT,
  id_type       TEXT,
  id_number     TEXT,
  country       TEXT,
  status        TEXT NOT NULL DEFAULT 'unsubmitted',
  submitted_at  INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS deposit_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  method       TEXT NOT NULL,
  amount       REAL NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  ref_info     TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS withdraw_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  method       TEXT NOT NULL,
  amount       REAL NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USD',
  target       TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS accounts (
  user_id      INTEGER PRIMARY KEY,
  cash         REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS positions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  symbol       TEXT NOT NULL,
  qty          REAL NOT NULL DEFAULT 0,
  avg_price    REAL NOT NULL DEFAULT 0,
  UNIQUE(user_id, symbol),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  symbol       TEXT NOT NULL,
  side         TEXT NOT NULL,       -- buy | sell
  type         TEXT NOT NULL,       -- market | limit
  price        REAL,                -- null for market
  qty          REAL NOT NULL,
  filled_qty   REAL NOT NULL DEFAULT 0,
  avg_fill     REAL NOT NULL DEFAULT 0,
  status       TEXT NOT NULL,       -- open | filled | cancelled | rejected
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_open ON orders(status, symbol);

CREATE TABLE IF NOT EXISTS trades (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL,
  user_id      INTEGER NOT NULL,
  symbol       TEXT NOT NULL,
  side         TEXT NOT NULL,
  price        REAL NOT NULL,
  qty          REAL NOT NULL,
  fee          REAL NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_sym  ON trades(symbol, created_at DESC);

CREATE TABLE IF NOT EXISTS candles (
  symbol       TEXT NOT NULL,
  interval     TEXT NOT NULL,       -- 周期：1m / 5m / 1h 等
  ts           INTEGER NOT NULL,    -- 桶起始时间戳（毫秒）
  open         REAL NOT NULL,
  high         REAL NOT NULL,
  low          REAL NOT NULL,
  close        REAL NOT NULL,
  volume       REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (symbol, interval, ts)
);

CREATE TABLE IF NOT EXISTS service_messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER,
  name         TEXT,
  email        TEXT,
  content      TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS news (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  date         TEXT NOT NULL,
  title_zh     TEXT NOT NULL,
  title_en     TEXT NOT NULL,
  summary_zh   TEXT,
  summary_en   TEXT,
  body_zh      TEXT,
  body_en      TEXT,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_news_date ON news(date DESC);

CREATE TABLE IF NOT EXISTS settings (
  key          TEXT PRIMARY KEY,
  value        TEXT,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_ops (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id       INTEGER NOT NULL,
  admin_username TEXT NOT NULL,
  action         TEXT NOT NULL,
  target_user_id INTEGER,
  details        TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_ops_created ON admin_ops(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_ops_target  ON admin_ops(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_ops_action  ON admin_ops(action, created_at DESC);

CREATE TABLE IF NOT EXISTS security_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,
  user_id     INTEGER,
  username    TEXT,
  ip          TEXT,
  user_agent  TEXT,
  details     TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sec_created ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_kind    ON security_events(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_user    ON security_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS email_verifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  code        TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_ver_user ON email_verifications(user_id, created_at DESC);
`);

// 表结构迁移：对历史库做字段补齐
const userCols = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
if (!userCols.includes('is_admin')) {
  db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);
}
if (!userCols.includes('is_banned')) {
  db.exec(`ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0`);
}
if (!userCols.includes('email_verified')) {
  // 新字段 — 历史数据在邮箱验证功能上线之前就已注册，
  // 部署时将其视为已验证，避免用户被拒之门外。
  db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`);
  db.exec(`UPDATE users SET email_verified = 1`);
}

// 种入默认资讯（仅首次启动生效，使用 INSERT OR IGNORE 保证幂等）
const newsCount = db.prepare('SELECT COUNT(*) c FROM news').get().c;
if (newsCount === 0) {
  const now = Date.now();
  const insertNews = db.prepare(`INSERT INTO news
    (date, title_zh, title_en, summary_zh, summary_en, body_zh, body_en, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const seed = [
    ['2026-04-18', '黄金突破 2350 美元关口，避险情绪升温', 'Gold breaks above $2,350 as safe-haven demand surges',
     '受地缘局势与美元走弱影响，国际金价上破关键阻力位…', 'Driven by geopolitics and a softer dollar, gold pierces key resistance…'],
    ['2026-04-17', '铂金供需缺口持续扩大，机构上调年度目标价', 'Platinum deficit widens; institutions raise year-end price targets',
     '南非矿端供应趋紧叠加氢能需求增长，全球铂金连续第三年出现缺口…', 'Tight South African supply and rising hydrogen demand push platinum into a third-straight annual deficit…'],
    ['2026-04-15', 'Captail 平台上线合约与期权模块', 'Captail rolls out perpetual & options trading modules',
     '新增最高 100 倍杠杆的永续合约与欧式期权产品线…', 'Now supporting up to 100x leveraged perpetuals and European-style options…'],
    ['2026-04-12', '白银工业需求强劲，太阳能板耗银量再创新高', 'Silver industrial demand strong; solar-panel consumption hits a new record',
     '光伏新装机与电动车需求推升白银工业占比至 55%…', 'Solar installations and EV demand lift silver industrial share to 55%…'],
  ];
  const tx = db.transaction(() => {
    for (const r of seed) insertNews.run(r[0], r[1], r[2], r[3], r[4], '', '', now, now);
  });
  tx();
}

// 初始化默认设置项（仅在 key 不存在时写入）
const defaultSettings = {
  service_url: '',
  feature_finance: '1',
  feature_loan: '1',
};
const setDefault = db.prepare(
  `INSERT OR IGNORE INTO settings(key, value, updated_at) VALUES(?, ?, ?)`);
const now0 = Date.now();
for (const [k, v] of Object.entries(defaultSettings)) setDefault.run(k, v, now0);

module.exports = db;
