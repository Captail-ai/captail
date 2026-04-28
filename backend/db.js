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
  spot_cash    REAL NOT NULL DEFAULT 0,   -- 现货钱包：充值/提现/理财/贷款
  option_cash  REAL NOT NULL DEFAULT 0,   -- 期权钱包：现货撮合 + 秒/期权下单
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

CREATE TABLE IF NOT EXISTS second_contracts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  symbol        TEXT NOT NULL,
  direction     TEXT NOT NULL,        -- up | down
  amount        REAL NOT NULL,        -- 投注本金（USD）
  duration      INTEGER NOT NULL,     -- 时长（秒）
  payout_rate   REAL NOT NULL,        -- 赔率（如 0.85 表示赢则 +85%）
  open_price    REAL NOT NULL,
  settle_price  REAL,
  opened_at     INTEGER NOT NULL,
  settle_at     INTEGER NOT NULL,     -- 到期时间戳（毫秒）
  status        TEXT NOT NULL DEFAULT 'open',  -- open | won | lost
  forced        INTEGER NOT NULL DEFAULT 0,    -- 是否由强制干预产生
  pnl           REAL,                          -- 结算盈亏（赢=+amount*rate，输=-amount）
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_secc_user   ON second_contracts(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_secc_open   ON second_contracts(status, settle_at);

-- 期权时长档位（替代硬编码 DURATIONS）：管理员可增删改
CREATE TABLE IF NOT EXISTS option_periods (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  duration_sec  INTEGER UNIQUE NOT NULL,
  payout_rate   REAL NOT NULL,                  -- 赔率（0.20 = 赢 +20%）
  min_amount    REAL NOT NULL DEFAULT 10,
  max_amount    REAL NOT NULL DEFAULT 50000,
  label_zh      TEXT,
  label_en      TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- 理财产品（管理员配置）
CREATE TABLE IF NOT EXISTS finance_products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name_zh       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  vip_tag       TEXT,                            -- VIP1 / VIP2 / 空
  daily_rate    REAL NOT NULL,                   -- 日化收益率（0.005 = 0.5%/天）
  min_amount    REAL NOT NULL DEFAULT 100,
  max_amount    REAL NOT NULL DEFAULT 1000000,
  lock_days     INTEGER NOT NULL DEFAULT 30,
  total_quota   REAL NOT NULL DEFAULT 0,         -- 0 = 不限额
  sold_quota    REAL NOT NULL DEFAULT 0,
  description_zh TEXT,
  description_en TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- 理财申购记录（active / redeemed）
CREATE TABLE IF NOT EXISTS finance_subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  product_id      INTEGER NOT NULL,
  amount          REAL NOT NULL,
  daily_rate      REAL NOT NULL,                 -- 申购时锁定的日化
  lock_days       INTEGER NOT NULL,
  accrued         REAL NOT NULL DEFAULT 0,       -- 累计已计利息
  last_settle_at  INTEGER NOT NULL,
  start_at        INTEGER NOT NULL,
  end_at          INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active', -- active | redeemed
  redeemed_at     INTEGER,
  created_at      INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_fin_sub_user ON finance_subscriptions(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_fin_sub_act  ON finance_subscriptions(status, end_at);

-- 贷款产品（管理员配置）
CREATE TABLE IF NOT EXISTS loan_products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name_zh       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  daily_rate    REAL NOT NULL,
  min_amount    REAL NOT NULL DEFAULT 100,
  max_amount    REAL NOT NULL DEFAULT 100000,
  term_days     INTEGER NOT NULL DEFAULT 30,
  description_zh TEXT,
  description_en TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- 贷款申请（pending / approved / rejected / repaid）
CREATE TABLE IF NOT EXISTS loan_applications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  product_id    INTEGER NOT NULL,
  amount        REAL NOT NULL,
  term_days     INTEGER NOT NULL,
  daily_rate    REAL NOT NULL,
  total_repay   REAL NOT NULL,                  -- 应还本息总额（申请时计算）
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | repaid
  applied_at    INTEGER NOT NULL,
  approved_at   INTEGER,
  due_at        INTEGER,                        -- 到期时间戳
  repaid_at     INTEGER,
  remark        TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_loan_user ON loan_applications(user_id, id DESC);

-- 常见问题（管理员配置）
CREATE TABLE IF NOT EXISTS faqs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  question_zh   TEXT NOT NULL,
  question_en   TEXT NOT NULL,
  answer_zh     TEXT NOT NULL,
  answer_en     TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
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
if (!userCols.includes('force_outcome')) {
  // 秒级合约强制结果：null/none=按行情结算；
  // next_win/next_lose=下一笔强制赢/输（结算后清空）；
  // always_win/always_lose=持续强制赢/输。
  db.exec(`ALTER TABLE users ADD COLUMN force_outcome TEXT`);
}
if (!userCols.includes('kyc_level')) {
  // KYC 准入等级：0=未认证；1=初级（姓名+证件号）；2=高级（三图通过）。
  db.exec(`ALTER TABLE users ADD COLUMN kyc_level INTEGER NOT NULL DEFAULT 0`);
}

// kyc 表新增高级认证字段
const kycCols = db.prepare(`PRAGMA table_info(kyc)`).all().map(c => c.name);
if (!kycCols.includes('id_front_path'))   db.exec(`ALTER TABLE kyc ADD COLUMN id_front_path   TEXT`);
if (!kycCols.includes('id_back_path'))    db.exec(`ALTER TABLE kyc ADD COLUMN id_back_path    TEXT`);
if (!kycCols.includes('holding_path'))    db.exec(`ALTER TABLE kyc ADD COLUMN holding_path    TEXT`);
if (!kycCols.includes('advanced_at'))     db.exec(`ALTER TABLE kyc ADD COLUMN advanced_at     INTEGER`);
if (!kycCols.includes('advanced_status')) db.exec(`ALTER TABLE kyc ADD COLUMN advanced_status TEXT`);
if (!kycCols.includes('advanced_reward')) db.exec(`ALTER TABLE kyc ADD COLUMN advanced_reward INTEGER NOT NULL DEFAULT 0`);

// withdraw_requests 增字段：四通道提现 + 1% 手续费
const wrCols = db.prepare(`PRAGMA table_info(withdraw_requests)`).all().map(c => c.name);
if (!wrCols.includes('account_name')) db.exec(`ALTER TABLE withdraw_requests ADD COLUMN account_name TEXT`);
if (!wrCols.includes('qr_code_path')) db.exec(`ALTER TABLE withdraw_requests ADD COLUMN qr_code_path TEXT`);
if (!wrCols.includes('address'))      db.exec(`ALTER TABLE withdraw_requests ADD COLUMN address      TEXT`);
if (!wrCols.includes('fee'))          db.exec(`ALTER TABLE withdraw_requests ADD COLUMN fee          REAL NOT NULL DEFAULT 0`);
if (!wrCols.includes('net_amount'))   db.exec(`ALTER TABLE withdraw_requests ADD COLUMN net_amount   REAL NOT NULL DEFAULT 0`);
if (!wrCols.includes('bank_name'))    db.exec(`ALTER TABLE withdraw_requests ADD COLUMN bank_name    TEXT`);

// accounts 钱包迁移：把旧的 cash 单字段拆成 spot_cash + option_cash
const accCols = db.prepare(`PRAGMA table_info(accounts)`).all().map(c => c.name);
if (!accCols.includes('spot_cash')) {
  db.exec(`ALTER TABLE accounts ADD COLUMN spot_cash REAL NOT NULL DEFAULT 0`);
}
if (!accCols.includes('option_cash')) {
  db.exec(`ALTER TABLE accounts ADD COLUMN option_cash REAL NOT NULL DEFAULT 0`);
}
if (accCols.includes('cash')) {
  // 旧库：把 cash 全部迁移到 spot_cash（用户从安全钱包开始，自行划转）
  db.exec(`UPDATE accounts SET spot_cash = spot_cash + cash WHERE cash > 0`);
  db.exec(`UPDATE accounts SET cash = 0`);
  // SQLite 3.35+ 支持 DROP COLUMN；老版本忽略错误，cash 列保留也无害（不再有代码读写）
  try { db.exec(`ALTER TABLE accounts DROP COLUMN cash`); } catch (_) { /* legacy sqlite */ }
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

// 种入默认期权时长（仅首次启动）
const opCount = db.prepare('SELECT COUNT(*) c FROM option_periods').get().c;
if (opCount === 0) {
  const t0 = Date.now();
  const ins = db.prepare(`INSERT INTO option_periods
    (duration_sec, payout_rate, min_amount, max_amount, label_zh, label_en, sort_order, enabled, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const seed = [
    [30,  0.20, 10, 50000, '30秒', '30s', 1],
    [60,  0.30, 10, 50000, '60秒', '60s', 2],
    [180, 0.50, 10, 50000, '3分钟', '3m', 3],
    [300, 0.80, 10, 50000, '5分钟', '5m', 4],
  ];
  const tx = db.transaction(() => {
    for (const r of seed) ins.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], 1, t0, t0);
  });
  tx();
}

// 种入默认理财产品（仅首次启动）
const finCount = db.prepare('SELECT COUNT(*) c FROM finance_products').get().c;
if (finCount === 0) {
  const t1 = Date.now();
  const ins = db.prepare(`INSERT INTO finance_products
    (name_zh, name_en, vip_tag, daily_rate, min_amount, max_amount, lock_days,
     total_quota, sold_quota, description_zh, description_en, sort_order, enabled,
     created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,0,?,?,?,1,?,?)`);
  const seed = [
    ['7 天稳健', '7-day Stable', null, 0.005,  100, 50000,  7, 0,
     '7 天锁定，日化 0.5%，到期赎回本息', '7-day lock, 0.5% daily, principal+interest at maturity', 1],
    ['30 天进取', '30-day Growth', 'VIP1', 0.008, 500, 200000, 30, 0,
     '30 天锁定，日化 0.8%，VIP 用户专享', '30-day lock, 0.8% daily, VIP1 only', 2],
    ['90 天尊享', '90-day Premium', 'VIP2', 0.012, 2000, 1000000, 90, 0,
     '90 天锁定，日化 1.2%，VIP2 用户专享', '90-day lock, 1.2% daily, VIP2 only', 3],
  ];
  const tx = db.transaction(() => {
    for (const r of seed) ins.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7],
      r[8], r[9], r[10], t1, t1);
  });
  tx();
}

// 种入默认贷款产品（仅首次启动）
const loanCount = db.prepare('SELECT COUNT(*) c FROM loan_products').get().c;
if (loanCount === 0) {
  const t1 = Date.now();
  const ins = db.prepare(`INSERT INTO loan_products
    (name_zh, name_en, daily_rate, min_amount, max_amount, term_days,
     description_zh, description_en, sort_order, enabled, created_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,1,?,?)`);
  const seed = [
    ['短期周转',  'Short-term',  0.0008,  500,  20000,  7,
     '7 天短期资金周转，日息 0.08%',  '7-day short-term, 0.08% daily', 1],
    ['中期借款',  'Medium-term', 0.0006, 2000, 100000, 30,
     '30 天中期借款，日息 0.06%',     '30-day medium-term, 0.06% daily', 2],
    ['长期低息',  'Long-term',   0.0004, 5000, 500000, 90,
     '90 天长期低息，日息 0.04%',     '90-day long-term, 0.04% daily', 3],
  ];
  const tx = db.transaction(() => {
    for (const r of seed) ins.run(r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], t1, t1);
  });
  tx();
}

// 种入默认 FAQ（仅首次启动）
const faqCount = db.prepare('SELECT COUNT(*) c FROM faqs').get().c;
if (faqCount === 0) {
  const t1 = Date.now();
  const ins = db.prepare(`INSERT INTO faqs
    (question_zh, question_en, answer_zh, answer_en, sort_order, enabled, created_at, updated_at)
    VALUES(?,?,?,?,?,1,?,?)`);
  const seed = [
    ['如何开立 Captail 账户？', 'How do I open an account?',
     '点击右上角「注册」，填写用户名和密码即可创建账户。',
     'Click "Sign Up" at the top-right, enter a username and password to create your account.', 1],
    ['支持哪些交易品种？', 'Which instruments are supported?',
     '目前支持 XAU（黄金）、XAG（白银）、XPT（铂金）、XPD（钯金）与美元的交易对。',
     'XAU (Gold), XAG (Silver), XPT (Platinum) and XPD (Palladium) against USD.', 2],
    ['出入金需要多长时间？', 'How long do deposits and withdrawals take?',
     '充值请联系在线客服办理；提现审核通过后通常在 1 个工作日内到账。',
     'For deposits please contact customer service; withdrawals settle within 1 business day after approval.', 3],
    ['是否需要完成 KYC 身份认证？', 'Do I need to complete KYC?',
     '除充值外，所有交易、提现、理财、借贷等功能均需先完成 KYC 初级认证。',
     'KYC level-1 is required for all functions except deposits, including trading, withdrawals, finance and loans.', 4],
    ['平台手续费是多少？', 'What are the fees?',
     '交易免手续费；提现统一收取 1% 手续费，每日最多提现 3 次。',
     'Trading is free; withdrawals carry a 1% fee with a 3-per-day limit.', 5],
    ['资金安全如何保障？', 'How are my funds secured?',
     '全流程 JWT 鉴权 + 操作分级 + 冷热钱包分离 + 独立审计。',
     'JWT auth, role-based controls, cold/hot wallet segregation and third-party audits.', 6],
  ];
  const tx = db.transaction(() => {
    for (const r of seed) ins.run(r[0], r[1], r[2], r[3], r[4], t1, t1);
  });
  tx();
}

// 初始化默认设置项（仅在 key 不存在时写入）
const defaultSettings = {
  service_url: '',
  feature_finance: '1',
  feature_loan: '1',
  withdraw_fee_rate: '0.01',     // 提现手续费 1%
  withdraw_daily_limit: '3',     // 每日最多提现次数
  trade_fee_rate: '0',           // 交易手续费 0
  signup_bonus: '100000',        // 注册赠送（期权钱包）
};
const setDefault = db.prepare(
  `INSERT OR IGNORE INTO settings(key, value, updated_at) VALUES(?, ?, ?)`);
const now0 = Date.now();
for (const [k, v] of Object.entries(defaultSettings)) setDefault.run(k, v, now0);

module.exports = db;
