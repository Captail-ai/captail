/**
 * 秒级合约（固定时长涨跌）模块。
 *  - 下注时按本金扣除可用资金；
 *  - 到期时按市场价或用户的 force_outcome 强制结果判定胜负；
 *  - 赢：返还本金 + 本金*payout_rate；输：扣除本金（不返还）；
 *  - 强制结果优先级：always_* > next_*（next_* 命中后立刻清空）。
 */
const db = require('./db');
const market = require('./market');

// 时长档位由 option_periods 表动态配置（管理员可增删改）
// 兼容字段：保留 MIN_AMOUNT/MAX_AMOUNT 作为全局兜底，但每条 period 自带 min/max
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 1_000_000;
const FORCE_MODES = new Set(['none', 'next_win', 'next_lose', 'always_win', 'always_lose']);

function listPeriods() {
  return db.prepare(`SELECT id, duration_sec AS duration, payout_rate, min_amount, max_amount,
    label_zh, label_en, sort_order, enabled FROM option_periods
    WHERE enabled = 1 ORDER BY sort_order, duration_sec`).all();
}
// 旧调用兼容
function listDurations() { return listPeriods(); }

function findPeriod(durationSec) {
  return db.prepare(`SELECT * FROM option_periods
    WHERE duration_sec = ? AND enabled = 1`).get(Number(durationSec));
}

function readForceOutcome(uid) {
  const row = db.prepare('SELECT force_outcome FROM users WHERE id=?').get(uid);
  return (row && row.force_outcome) || null;
}

// 解析强制结果：返回 'win' / 'lose' / null（按真实价格）
function resolveForcedOutcome(uid) {
  const mode = readForceOutcome(uid);
  if (!mode || mode === 'none') return null;
  if (mode === 'always_win')  return 'win';
  if (mode === 'always_lose') return 'lose';
  if (mode === 'next_win')    return 'win';
  if (mode === 'next_lose')   return 'lose';
  return null;
}

// 创建合约：扣款并写入一条 open 记录。
function placeContract(uid, { symbol, direction, amount, duration }) {
  if (!market.SYMBOLS[symbol]) throw new Error('不支持的品种');
  if (!['up', 'down'].includes(direction)) throw new Error('方向非法');
  const amt = Number(amount);
  const dur = Number(duration);
  const period = findPeriod(dur);
  if (!period) throw new Error('时长非法或已停用');
  if (!(amt >= period.min_amount) || !(amt <= period.max_amount)) {
    throw new Error(`下注金额范围 ${period.min_amount}-${period.max_amount}`);
  }

  const price = market.getPrice(symbol);
  if (!(price > 0)) throw new Error('行情未就绪');
  const payout = period.payout_rate;
  const now = Date.now();

  let id;
  db.transaction(() => {
    const acc = db.prepare('SELECT option_cash FROM accounts WHERE user_id=?').get(uid)
      || { option_cash: 0 };
    if (acc.option_cash < amt - 1e-9) throw new Error('期权钱包资金不足');
    db.prepare('UPDATE accounts SET option_cash = option_cash - ? WHERE user_id=?').run(amt, uid);
    const info = db.prepare(`
      INSERT INTO second_contracts(user_id, symbol, direction, amount, duration, payout_rate,
        open_price, opened_at, settle_at, status, forced, created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        uid, symbol, direction, amt, dur, payout, price,
        now, now + dur * 1000, 'open', 0, now);
    id = info.lastInsertRowid;
  })();

  return db.prepare('SELECT * FROM second_contracts WHERE id=?').get(id);
}

// 单条合约结算逻辑（在事务内调用）：根据 outcome 修正余额、写状态。
function settleOne(c, settlePrice, outcome, forced) {
  const isWin = outcome === 'win';
  const pnl = isWin ? c.amount * c.payout_rate : -c.amount;
  // 赢：返还本金 + 收益（仍入期权钱包）；输：本金已在下注时扣除，无需再动
  if (isWin) {
    db.prepare('UPDATE accounts SET option_cash = option_cash + ? WHERE user_id=?')
      .run(c.amount + c.amount * c.payout_rate, c.user_id);
  }
  db.prepare(`UPDATE second_contracts
    SET settle_price=?, status=?, forced=?, pnl=? WHERE id=?`)
    .run(settlePrice, isWin ? 'won' : 'lost', forced ? 1 : 0, pnl, c.id);
}

// 扫描所有到期 open 合约并结算。返回结算条数。
function settleDue(now = Date.now()) {
  const due = db.prepare(`SELECT * FROM second_contracts
    WHERE status='open' AND settle_at <= ? ORDER BY id`).all(now);
  let settled = 0;
  for (const c of due) {
    const price = market.getPrice(c.symbol);
    if (!(price > 0)) continue;
    const forcedRes = resolveForcedOutcome(c.user_id);
    let outcome;
    if (forcedRes) {
      outcome = forcedRes;
    } else {
      // 平价时按 down 处理（保护用户：不亏不赢的话定为输方风险更小，
      // 但行业惯例是平价用户输，此处选择平价 = 用户输）
      if (price > c.open_price) outcome = c.direction === 'up' ? 'win' : 'lose';
      else                      outcome = c.direction === 'down' ? 'win' : 'lose';
    }
    db.transaction(() => {
      settleOne(c, price, outcome, !!forcedRes);
      // next_* 是一次性的，命中后清空
      if (forcedRes) {
        const mode = readForceOutcome(c.user_id);
        if (mode === 'next_win' || mode === 'next_lose') {
          db.prepare('UPDATE users SET force_outcome=NULL WHERE id=?').run(c.user_id);
        }
      }
    })();
    settled++;
  }
  return settled;
}

function listOrders(uid, limit = 100) {
  return db.prepare(`SELECT * FROM second_contracts
    WHERE user_id=? ORDER BY id DESC LIMIT ?`).all(uid, Math.min(Math.max(limit, 1), 500));
}

function listActive(uid) {
  return db.prepare(`SELECT * FROM second_contracts
    WHERE user_id=? AND status='open' ORDER BY settle_at ASC`).all(uid);
}

function setForceOutcome(uid, mode) {
  const m = (mode || 'none').toLowerCase();
  if (!FORCE_MODES.has(m)) throw new Error('mode 非法');
  const value = m === 'none' ? null : m;
  const info = db.prepare('UPDATE users SET force_outcome=? WHERE id=?').run(value, uid);
  if (!info.changes) throw new Error('用户不存在');
  return value;
}

module.exports = {
  FORCE_MODES, MIN_AMOUNT, MAX_AMOUNT,
  listDurations, listPeriods, findPeriod,
  placeContract, settleDue,
  listOrders, listActive, setForceOutcome, readForceOutcome,
};
