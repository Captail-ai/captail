const db = require('./db');

let yf = null;
try {
  const Y = require('yahoo-finance2').default;
  yf = new Y({ suppressNotices: ['yahooSurvey'] });
} catch (_) { yf = null; }

// 内部 symbol -> Yahoo Finance 合约代码 + 展示信息
const SYMBOLS = {
  XAU: { name: 'Gold',      yahoo: 'GC=F', base: 2350.0, vol: 0.0006 },
  XAG: { name: 'Silver',    yahoo: 'SI=F', base: 28.5,   vol: 0.0012 },
  XPT: { name: 'Platinum',  yahoo: 'PL=F', base: 950.0,  vol: 0.0010 },
  XPD: { name: 'Palladium', yahoo: 'PA=F', base: 1020.0, vol: 0.0014 },
};
const yahooToSym = Object.fromEntries(
  Object.entries(SYMBOLS).map(([k, v]) => [v.yahoo, k])
);

const state = {};
for (const s of Object.keys(SYMBOLS)) {
  state[s] = { price: SYMBOLS[s].base, prev: SYMBOLS[s].base, ts: Date.now(),
               high24: SYMBOLS[s].base, low24: SYMBOLS[s].base };
}
let dataSource = 'sim'; // 'live' | 'sim'
let failStreak = 0;
const MAX_FAIL = 5;

const listeners = new Set();
function onTick(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const INTERVALS = {
  '1m':  60_000,      '5m':  300_000,     '15m': 900_000,
  '30m': 1_800_000,   '1h':  3_600_000,   '4h':  14_400_000,
  '1D':  86_400_000,
};

function bucketStart(ts, ms) { return Math.floor(ts / ms) * ms; }

const upsertCandle = db.prepare(`
  INSERT INTO candles (symbol, interval, ts, open, high, low, close, volume)
  VALUES (@symbol, @interval, @ts, @open, @high, @low, @close, @volume)
  ON CONFLICT(symbol, interval, ts) DO UPDATE SET
    high = MAX(high, excluded.high),
    low  = MIN(low,  excluded.low),
    close = excluded.close,
    volume = volume + excluded.volume
`);

function aggregate(symbol, price, volume, ts) {
  for (const [iv, ms] of Object.entries(INTERVALS)) {
    const bucket = bucketStart(ts, ms);
    upsertCandle.run({
      symbol, interval: iv, ts: bucket,
      open: price, high: price, low: price, close: price, volume,
    });
  }
}

function emit(ticks) {
  for (const fn of listeners) { try { fn(ticks); } catch (_) {} }
}

// 模拟 tick — 冷启动（首次真实拉取前）以及真实行情不可用时的兜底
function simStep() {
  const now = Date.now();
  const ticks = [];
  for (const [sym, cfg] of Object.entries(SYMBOLS)) {
    const st = state[sym];
    const drift = (cfg.base - st.price) * 0.0005;
    const shock = (Math.random() - 0.5) * 2 * cfg.vol * st.price;
    const next = Math.max(0.01, st.price + drift + shock);
    st.prev = st.price;
    st.price = Math.round(next * 100) / 100;
    st.ts = now;
    st.high24 = Math.max(st.high24, st.price);
    st.low24 = Math.min(st.low24, st.price);
    aggregate(sym, st.price, 0, now);
    ticks.push({ symbol: sym, price: st.price, prev: st.prev, ts: now,
                 high24: st.high24, low24: st.low24, prevClose: st.prevClose ?? st.prev });
  }
  emit(ticks);
}

// 两次真实拉取之间，围绕最新真实价格发送小幅抖动（约 5 个基点），
// 保证图表/界面看起来是"活"的。
// 注意：抖动不写入 K 线 DB — pollReal（每 5 秒）才是权威来源；
// 跳过秒级 upsert 可以避免约 28 次/秒的写入压力。
function jitterStep() {
  const now = Date.now();
  const ticks = [];
  for (const [sym, cfg] of Object.entries(SYMBOLS)) {
    const st = state[sym];
    const jitter = (Math.random() - 0.5) * 2 * 0.0005 * st.price;
    const p = Math.max(0.01, st.price + jitter);
    st.prev = st.price;
    st.price = Math.round(p * 100) / 100;
    st.ts = now;
    st.high24 = Math.max(st.high24, st.price);
    st.low24 = Math.min(st.low24, st.price);
    ticks.push({ symbol: sym, price: st.price, prev: st.prev, ts: now,
                 high24: st.high24, low24: st.low24, prevClose: st.prevClose ?? st.prev });
  }
  emit(ticks);
}

async function pollReal() {
  if (!yf) return false;
  try {
    const codes = Object.values(SYMBOLS).map(s => s.yahoo);
    const res = await yf.quote(codes);
    const arr = Array.isArray(res) ? res : [res];
    const now = Date.now();
    const ticks = [];
    for (const q of arr) {
      const sym = yahooToSym[q.symbol];
      if (!sym) continue;
      const price = Number(q.regularMarketPrice);
      if (!(price > 0)) continue;
      const prevClose = Number(q.regularMarketPreviousClose) || price;
      const st = state[sym];
      st.prev = st.price;
      st.price = Math.round(price * 100) / 100;
      st.ts = (q.regularMarketTime && new Date(q.regularMarketTime).getTime()) || now;
      st.high24 = Number(q.regularMarketDayHigh) || st.price;
      st.low24  = Number(q.regularMarketDayLow)  || st.price;
      st.prevClose = prevClose;
      aggregate(sym, st.price, 0, now);
      ticks.push({ symbol: sym, price: st.price, prev: st.prev, ts: now,
                   high24: st.high24, low24: st.low24, prevClose: st.prevClose });
    }
    if (!ticks.length) throw new Error('empty quote');
    failStreak = 0;
    dataSource = 'live';
    emit(ticks);
    return true;
  } catch (e) {
    failStreak++;
    if (failStreak >= MAX_FAIL) dataSource = 'sim';
    return false;
  }
}

const vol24Stmt = db.prepare(
  `SELECT COALESCE(SUM(qty),0) vb, COALESCE(SUM(qty*price),0) vq
   FROM trades WHERE symbol=? AND created_at > ?`);
const oiStmt = db.prepare(
  `SELECT COALESCE(SUM(qty),0) oi FROM positions WHERE symbol=? AND qty > 0`);

// 资金费周期：4 小时；倒计时指向下一个 UTC 边界 00/04/08/12/16/20。
function fundingWindow(now) {
  const FOUR_H = 4 * 3_600_000;
  const nextBoundary = Math.ceil(now / FOUR_H) * FOUR_H;
  return { nextBoundary, remainMs: nextBoundary - now };
}

// 按品种缓存 vol24 / OI；24 小时聚合值秒级几乎不变，不必每 tick 重算。
const EXTRAS_TTL = 3000;
const extrasCache = { at: 0, data: {} };
function computeExtras(now) {
  const since = now - 86_400_000;
  const data = {};
  for (const sym of Object.keys(SYMBOLS)) {
    const v = vol24Stmt.get(sym, since);
    const o = oiStmt.get(sym);
    data[sym] = {
      vol24Base:    Math.round(v.vb * 1000) / 1000,
      vol24Quote:   Math.round(v.vq * 100)  / 100,
      openInterest: Math.round(o.oi * 1000) / 1000,
    };
  }
  return data;
}
function getExtras(now) {
  if (now - extrasCache.at > EXTRAS_TTL) {
    extrasCache.data = computeExtras(now);
    extrasCache.at = now;
  }
  return extrasCache.data;
}

function getSnapshot() {
  const out = {};
  const now = Date.now();
  const fw = fundingWindow(now);
  const extras = getExtras(now);
  for (const sym of Object.keys(SYMBOLS)) {
    const st = state[sym];
    const ex = extras[sym];
    const tick = Math.max(0.01, st.price * 0.00005);
    out[sym] = {
      symbol: sym,
      name: SYMBOLS[sym].name,
      price: st.price,
      prev: st.prev,
      prevClose: st.prevClose ?? st.prev,
      high24: st.high24,
      low24: st.low24,
      vol24Base: ex.vol24Base,
      vol24Quote: ex.vol24Quote,
      openInterest: ex.openInterest,
      mark: Math.round((st.price + tick) * 100) / 100,
      index: Math.round((st.price - tick) * 100) / 100,
      funding: 0.0001, // 0.01% simplified
      fundingCountdown: fw.remainMs,
      ts: st.ts,
      source: dataSource,
    };
  }
  return out;
}

function getDataSource() { return dataSource; }

function getPrice(symbol) {
  return state[symbol] ? state[symbol].price : null;
}

// 模拟 L2 盘口：每档 15 档，数量呈指数分布
function getDepth(symbol, levels = 15) {
  const st = state[symbol];
  if (!st) return { bids: [], asks: [], mid: 0 };
  const mid = st.price;
  const tick = Math.max(0.01, Math.round(mid * 0.00005 * 100) / 100); // 0.5 bps
  const bids = [], asks = [];
  let bidSum = 0, askSum = 0;
  for (let i = 1; i <= levels; i++) {
    const qty = Math.round((Math.random() * 80 + 20) * Math.exp(-i / 8) * 100) / 100;
    const bp = Math.round((mid - i * tick) * 100) / 100;
    const ap = Math.round((mid + i * tick) * 100) / 100;
    bidSum += qty; askSum += qty;
    bids.push({ price: bp, qty, cum: Math.round(bidSum * 100) / 100 });
    asks.push({ price: ap, qty, cum: Math.round(askSum * 100) / 100 });
  }
  return { bids, asks, mid, ts: Date.now() };
}

function getCandles(symbol, interval, limit = 200) {
  return db.prepare(
    `SELECT ts, open, high, low, close, volume FROM candles
     WHERE symbol = ? AND interval = ?
     ORDER BY ts DESC LIMIT ?`
  ).all(symbol, interval, limit).reverse();
}

const bumpVolStmt = db.prepare(
  `UPDATE candles SET volume = volume + ? WHERE symbol=? AND interval=? AND ts=?`);
const bumpVolumeTx = db.transaction((symbol, qty, ts) => {
  for (const [iv, ms] of Object.entries(INTERVALS)) {
    bumpVolStmt.run(qty, symbol, iv, bucketStart(ts, ms));
  }
});
function bumpVolume(symbol, qty, ts = Date.now()) {
  bumpVolumeTx(symbol, qty, ts);
}

// 各周期的种子拉取计划：能直接用 Yahoo 原生周期就用，4h 由 1h 聚合而来
// （Yahoo 没有原生 4h）。lookback 选择使每个周期至少填满 ≥1 个月的图表，
// 且在 Yahoo 对不同分辨率的配额范围内（1m ≤ 7d、5-30m ≤ 60d、1h ≤ 730d）。
const SEED_PLAN = [
  { iv: '1m',  yi: '1m',  days: 7  },
  { iv: '5m',  yi: '5m',  days: 30 },
  { iv: '15m', yi: '15m', days: 30 },
  { iv: '30m', yi: '30m', days: 30 },
  { iv: '1h',  yi: '1h',  days: 30 },
  { iv: '4h',  yi: '1h',  days: 30 },   // aggregated into 4h via UPSERT
  { iv: '1D',  yi: '1d',  days: 90 },
];

// 从 Yahoo 返回的一组 K 线，种入一个 (symbol, interval) 槽位。
// 小到大排序保证 UPSERT 的 OPEN（仅在 INSERT 时设置）锁定为第一根 bar 的
// 开盘价——这在把小分辨率聚合到更粗桶时至关重要。
const seedIntervalTx = db.transaction((sym, iv, ms, quotes) => {
  const sorted = quotes
    .filter(q => q && q.date && Number(q.close) > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  for (const bar of sorted) {
    const ts = new Date(bar.date).getTime();
    const c = Number(bar.close);
    upsertCandle.run({
      symbol: sym, interval: iv, ts: bucketStart(ts, ms),
      open:  Number(bar.open)  || c,
      high:  Number(bar.high)  || c,
      low:   Number(bar.low)   || c,
      close: c,
      volume: Number(bar.volume) || 0,
    });
  }
});

async function seedHistorical() {
  if (!yf) return;
  // 复用 (yahoo, interval, days) 相同的拉取结果：
  // 避免 '1h' 和 '4h' 两次请求同一份小时级数据。
  const cache = new Map();
  const fetchQuotes = (yahoo, yi, days) => {
    const key = `${yahoo}:${yi}:${days}`;
    if (!cache.has(key)) {
      const end = new Date();
      const start = new Date(end.getTime() - days * 86_400_000);
      cache.set(key, yf.chart(yahoo, { period1: start, period2: end, interval: yi })
        .then(r => (r && r.quotes) || [])
        .catch(() => []));
    }
    return cache.get(key);
  };
  for (const [sym, cfg] of Object.entries(SYMBOLS)) {
    for (const plan of SEED_PLAN) {
      try {
        const quotes = await fetchQuotes(cfg.yahoo, plan.yi, plan.days);
        if (quotes.length) seedIntervalTx(sym, plan.iv, INTERVALS[plan.iv], quotes);
      } catch (_) { /* 单个槽位失败时忽略，不影响整体种子流程 */ }
    }
  }
}

async function start() {
  // 先用 Yahoo 1 分钟历史填充，使每个桶的 'open' 都是真实数据；
  // 再拉当前真实价；只有两者都失败时才启用合成种子。
  await seedHistorical().catch(() => {});
  const ok = await pollReal().catch(() => false);
  if (!ok) simStep();
  setInterval(pollReal, 5000);
  setInterval(jitterStep, 1000);
}

module.exports = {
  SYMBOLS, start, onTick, getSnapshot, getPrice,
  getCandles, bumpVolume, getDataSource, getDepth,
};
