/**
 * market.js — unit tests (no real HTTP, no start()).
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP_DB = path.join(os.tmpdir(), `metals-market-${Date.now()}-${process.pid}.db`);
process.env.DB_FILE = TMP_DB;

const db = require('../db');
const market = require('../market');

afterAll(() => {
  try { fs.unlinkSync(TMP_DB); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-wal'); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-shm'); } catch (_) {}
});

describe('SYMBOLS', () => {
  test('exposes the expected precious-metals set', () => {
    expect(Object.keys(market.SYMBOLS).sort()).toEqual(['XAG', 'XAU', 'XPD', 'XPT']);
    for (const cfg of Object.values(market.SYMBOLS)) {
      expect(typeof cfg.name).toBe('string');
      expect(typeof cfg.yahoo).toBe('string');
      expect(cfg.base).toBeGreaterThan(0);
    }
  });
});

describe('getPrice', () => {
  test('returns the seeded base price before any poll', () => {
    expect(market.getPrice('XAU')).toBe(market.SYMBOLS.XAU.base);
    expect(market.getPrice('XAG')).toBe(market.SYMBOLS.XAG.base);
  });
  test('returns null for unknown symbol', () => {
    expect(market.getPrice('BTC')).toBeNull();
  });
});

describe('getDataSource', () => {
  test('starts in sim mode before start() is called', () => {
    expect(market.getDataSource()).toBe('sim');
  });
});

describe('getDepth', () => {
  test('returns 15 levels per side by default, sorted correctly', () => {
    const d = market.getDepth('XAU');
    expect(d.mid).toBe(market.SYMBOLS.XAU.base);
    expect(d.bids).toHaveLength(15);
    expect(d.asks).toHaveLength(15);
    // bids descending in price; all below mid; cum strictly increasing
    for (let i = 1; i < d.bids.length; i++) {
      expect(d.bids[i].price).toBeLessThan(d.bids[i - 1].price);
      expect(d.bids[i].cum).toBeGreaterThanOrEqual(d.bids[i - 1].cum);
    }
    for (const b of d.bids) expect(b.price).toBeLessThan(d.mid);
    // asks ascending in price; all above mid
    for (let i = 1; i < d.asks.length; i++) {
      expect(d.asks[i].price).toBeGreaterThan(d.asks[i - 1].price);
      expect(d.asks[i].cum).toBeGreaterThanOrEqual(d.asks[i - 1].cum);
    }
    for (const a of d.asks) expect(a.price).toBeGreaterThan(d.mid);
  });

  test('honours custom level count', () => {
    const d = market.getDepth('XAG', 5);
    expect(d.bids).toHaveLength(5);
    expect(d.asks).toHaveLength(5);
  });

  test('unknown symbol returns empty book', () => {
    const d = market.getDepth('BTC');
    expect(d).toEqual({ bids: [], asks: [], mid: 0 });
  });
});

describe('getSnapshot', () => {
  test('includes the expected extended fields per symbol', () => {
    const snap = market.getSnapshot();
    const keys = Object.keys(snap).sort();
    expect(keys).toEqual(['XAG', 'XAU', 'XPD', 'XPT']);
    const row = snap.XAU;
    for (const k of ['price', 'mark', 'index', 'funding', 'fundingCountdown',
                     'vol24Base', 'vol24Quote', 'openInterest']) {
      expect(row[k]).toBeDefined();
    }
  });
});

describe('getCandles + bumpVolume', () => {
  const SYM = 'XAU';
  const IV = '1m';
  const TS = Math.floor(Date.now() / 60000) * 60000;

  beforeAll(() => {
    // Seed one candle for every tracked interval (bumpVolume touches them all).
    const intervals = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3,
                        '1h': 3600e3, '4h': 4 * 3600e3, '1D': 86400e3 };
    const ins = db.prepare(`INSERT OR IGNORE INTO candles
      (symbol, interval, ts, open, high, low, close, volume)
      VALUES(?,?,?,?,?,?,?,?)`);
    const now = Date.now();
    for (const [iv, ms] of Object.entries(intervals)) {
      const bucket = Math.floor(now / ms) * ms;
      ins.run(SYM, iv, bucket, 2300, 2310, 2290, 2305, 0);
    }
  });

  test('getCandles returns the seeded row', () => {
    const rows = market.getCandles(SYM, IV, 10);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const last = rows[rows.length - 1];
    expect(last.ts).toBe(TS);
    expect(last.open).toBe(2300);
    expect(last.close).toBe(2305);
    expect(last.volume).toBe(0);
  });

  test('bumpVolume increments volume across every interval', () => {
    market.bumpVolume(SYM, 1.25);
    const after = market.getCandles(SYM, IV, 5);
    const last = after[after.length - 1];
    expect(last.volume).toBeCloseTo(1.25, 8);

    market.bumpVolume(SYM, 0.75);
    const after2 = market.getCandles(SYM, IV, 5);
    expect(after2[after2.length - 1].volume).toBeCloseTo(2.0, 8);

    // verify another interval also got updated
    const hour = market.getCandles(SYM, '1h', 3);
    expect(hour[hour.length - 1].volume).toBeCloseTo(2.0, 8);
  });
});
