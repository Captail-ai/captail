/**
 * engine.js — unit tests. Isolated DB; no market polling.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP_DB = path.join(os.tmpdir(), `metals-engine-${Date.now()}-${process.pid}.db`);
process.env.DB_FILE = TMP_DB;

const db = require('../db');
const market = require('../market');
const engine = require('../engine');

// 双钱包改造后：交易免手续费
const FEE = 0;

function mkUser(cash = 100000) {
  const info = db.prepare(
    'INSERT INTO users(username, password, created_at) VALUES (?,?,?)'
  ).run('u_' + Math.random().toString(36).slice(2, 8), 'x', Date.now());
  const uid = info.lastInsertRowid;
  // 现货撮合从期权钱包扣款（产品规则），故初始资金注入 option_cash
  db.prepare('INSERT INTO accounts(user_id, spot_cash, option_cash) VALUES(?, 0, ?)').run(uid, cash);
  return uid;
}

afterAll(() => {
  try { fs.unlinkSync(TMP_DB); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-wal'); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-shm'); } catch (_) {}
});

describe('placeOrder validation', () => {
  test('rejects unsupported symbol', () => {
    const uid = mkUser();
    expect(() => engine.placeOrder(uid, { symbol: 'BTC', side: 'buy', type: 'market', qty: 1 }))
      .toThrow(/不支持的品种/);
  });
  test('rejects bad side', () => {
    const uid = mkUser();
    expect(() => engine.placeOrder(uid, { symbol: 'XAU', side: 'short', type: 'market', qty: 1 }))
      .toThrow(/买卖方向/);
  });
  test('rejects bad type', () => {
    const uid = mkUser();
    expect(() => engine.placeOrder(uid, { symbol: 'XAU', side: 'buy', type: 'iceberg', qty: 1 }))
      .toThrow(/订单类型/);
  });
  test('rejects non-positive qty', () => {
    const uid = mkUser();
    expect(() => engine.placeOrder(uid, { symbol: 'XAU', side: 'buy', type: 'market', qty: 0 }))
      .toThrow(/数量/);
  });
  test('rejects limit without valid price', () => {
    const uid = mkUser();
    expect(() => engine.placeOrder(uid, { symbol: 'XAU', side: 'buy', type: 'limit', qty: 1, price: 0 }))
      .toThrow(/限价/);
  });
});

describe('market buy / sell roundtrip', () => {
  test('market buy fills at reference price and updates cash + position', () => {
    const uid = mkUser(100000);
    const ref = market.getPrice('XAU');
    const qty = 1.0;
    const o = engine.placeOrder(uid, { symbol: 'XAU', side: 'buy', type: 'market', qty });
    expect(o.status).toBe('filled');
    expect(o.filled_qty).toBeCloseTo(qty, 8);
    expect(o.avg_fill).toBeCloseTo(ref, 8);

    const acc = engine.getAccount(uid);
    const expectedCost = ref * qty * (1 + FEE);
    expect(acc.cash).toBeCloseTo(100000 - expectedCost, 4);

    const pos = engine.getPosition(uid, 'XAU');
    expect(pos.qty).toBeCloseTo(qty, 8);
    expect(pos.avg_price).toBeCloseTo(ref, 8);
  });

  test('market sell returns cash minus fee and drains position', () => {
    const uid = mkUser(1_000_000);
    const ref = market.getPrice('XAU');
    engine.placeOrder(uid, { symbol: 'XAU', side: 'buy', type: 'market', qty: 2 });
    const cashAfterBuy = engine.getAccount(uid).cash;

    engine.placeOrder(uid, { symbol: 'XAU', side: 'sell', type: 'market', qty: 2 });
    const cashAfterSell = engine.getAccount(uid).cash;
    const proceeds = ref * 2 * (1 - FEE);
    expect(cashAfterSell - cashAfterBuy).toBeCloseTo(proceeds, 4);

    const pos = engine.getPosition(uid, 'XAU');
    expect(pos.qty).toBe(0);
  });

  test('insufficient cash is rejected before any write', () => {
    const uid = mkUser(50);
    expect(() => engine.placeOrder(uid, { symbol: 'XAU', side: 'buy', type: 'market', qty: 10 }))
      .toThrow(/资金不足/);
    expect(engine.getAccount(uid).cash).toBe(50);
  });

  test('insufficient position on sell is rejected', () => {
    const uid = mkUser(100000);
    expect(() => engine.placeOrder(uid, { symbol: 'XAU', side: 'sell', type: 'market', qty: 1 }))
      .toThrow(/持仓不足/);
  });
});

describe('limit orders + scanOpenOrders + cancel', () => {
  test('non-crossing limit buy stays open and fee is deferred', () => {
    const uid = mkUser(100000);
    const ref = market.getPrice('XAU');
    const o = engine.placeOrder(uid, {
      symbol: 'XAU', side: 'buy', type: 'limit', qty: 0.5, price: ref - 100,
    });
    expect(o.status).toBe('open');
    expect(o.filled_qty).toBe(0);
  });

  test('scanOpenOrders fills a crossed limit buy', () => {
    const uid = mkUser(100000);
    const ref = market.getPrice('XAU');
    const limitPrice = ref + 50; // buy limit above market — crosses immediately
    const o = engine.placeOrder(uid, {
      symbol: 'XAU', side: 'buy', type: 'limit', qty: 0.5, price: limitPrice,
    });
    // immediate-cross inside placeOrder already filled it
    expect(o.status).toBe('filled');

    // now place a truly non-crossing order and fill via scanOpenOrders tick
    const o2 = engine.placeOrder(uid, {
      symbol: 'XAU', side: 'buy', type: 'limit', qty: 0.25, price: ref - 500,
    });
    expect(o2.status).toBe('open');
    engine.scanOpenOrders([{ symbol: 'XAU', price: ref - 600 }]);
    const row = db.prepare('SELECT * FROM orders WHERE id=?').get(o2.id);
    expect(row.status).toBe('filled');
    expect(row.filled_qty).toBeCloseTo(0.25, 8);
  });

  test('cancelOrder transitions open -> cancelled and blocks double-cancel', () => {
    const uid = mkUser(100000);
    const ref = market.getPrice('XAU');
    const o = engine.placeOrder(uid, {
      symbol: 'XAU', side: 'buy', type: 'limit', qty: 0.5, price: ref - 500,
    });
    expect(o.status).toBe('open');
    const c = engine.cancelOrder(uid, o.id);
    expect(c.status).toBe('cancelled');
    expect(() => engine.cancelOrder(uid, o.id)).toThrow(/已完结/);
  });

  test('cancelOrder rejects unknown id', () => {
    const uid = mkUser();
    expect(() => engine.cancelOrder(uid, 999999)).toThrow(/订单不存在/);
  });
});
