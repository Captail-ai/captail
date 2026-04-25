const db = require('./db');
const market = require('./market');

const FEE_RATE = 0.0005; // 0.05%

const tradeListeners = new Set();
function onTrade(fn) { tradeListeners.add(fn); return () => tradeListeners.delete(fn); }
function emitTrade(t) { for (const fn of tradeListeners) { try { fn(t); } catch (_) {} } }

function getAccount(uid) {
  return db.prepare('SELECT cash FROM accounts WHERE user_id=?').get(uid);
}

function getPosition(uid, symbol) {
  return db.prepare('SELECT qty, avg_price FROM positions WHERE user_id=? AND symbol=?').get(uid, symbol)
    || { qty: 0, avg_price: 0 };
}

function applyFill(order, price, qty) {
  const now = Date.now();
  const notional = price * qty;
  const fee = notional * FEE_RATE;

  const tx = db.transaction(() => {
    if (order.side === 'buy') {
      const acc = getAccount(order.user_id);
      const cost = notional + fee;
      if (acc.cash < cost - 1e-9) throw new Error('资金不足');
      db.prepare('UPDATE accounts SET cash = cash - ? WHERE user_id=?').run(cost, order.user_id);
      const pos = getPosition(order.user_id, order.symbol);
      const newQty = pos.qty + qty;
      const newAvg = newQty > 0 ? (pos.qty * pos.avg_price + notional) / newQty : 0;
      db.prepare(`
        INSERT INTO positions(user_id, symbol, qty, avg_price) VALUES(?,?,?,?)
        ON CONFLICT(user_id, symbol) DO UPDATE SET qty=excluded.qty, avg_price=excluded.avg_price
      `).run(order.user_id, order.symbol, newQty, newAvg);
    } else {
      const pos = getPosition(order.user_id, order.symbol);
      if (pos.qty < qty - 1e-9) throw new Error('持仓不足');
      db.prepare('UPDATE accounts SET cash = cash + ? WHERE user_id=?').run(notional - fee, order.user_id);
      const newQty = pos.qty - qty;
      const newAvg = newQty > 1e-9 ? pos.avg_price : 0;
      db.prepare('UPDATE positions SET qty=?, avg_price=? WHERE user_id=? AND symbol=?')
        .run(newQty, newAvg, order.user_id, order.symbol);
    }

    const newFilled = order.filled_qty + qty;
    const newAvgFill = (order.avg_fill * order.filled_qty + price * qty) / newFilled;
    const status = newFilled >= order.qty - 1e-9 ? 'filled' : 'open';
    db.prepare(`UPDATE orders SET filled_qty=?, avg_fill=?, status=?, updated_at=? WHERE id=?`)
      .run(newFilled, newAvgFill, status, now, order.id);
    order.filled_qty = newFilled; order.avg_fill = newAvgFill; order.status = status;

    const info = db.prepare(`
      INSERT INTO trades(order_id, user_id, symbol, side, price, qty, fee, created_at)
      VALUES(?,?,?,?,?,?,?,?)
    `).run(order.id, order.user_id, order.symbol, order.side, price, qty, fee, now);

    market.bumpVolume(order.symbol, qty, now);
    return info.lastInsertRowid;
  });

  const tradeId = tx();
  emitTrade({ id: tradeId, order_id: order.id, user_id: order.user_id, symbol: order.symbol,
              side: order.side, price, qty, fee, created_at: now });
}

function placeOrder(uid, { symbol, side, type, price, qty }) {
  if (!market.SYMBOLS[symbol]) throw new Error('不支持的品种');
  if (!['buy', 'sell'].includes(side)) throw new Error('买卖方向非法');
  if (!['market', 'limit'].includes(type)) throw new Error('订单类型非法');
  qty = Number(qty);
  if (!(qty > 0)) throw new Error('数量必须大于 0');
  if (type === 'limit') {
    price = Number(price);
    if (!(price > 0)) throw new Error('限价必须大于 0');
  } else price = null;

  const now = Date.now();
  const ref = market.getPrice(symbol);

  // 买入前置校验：预估冻结资金是否充足
  if (side === 'buy') {
    const estPrice = type === 'market' ? ref : price;
    const need = estPrice * qty * (1 + FEE_RATE);
    const acc = getAccount(uid);
    if (acc.cash < need - 1e-9) throw new Error('资金不足');
  } else {
    const pos = getPosition(uid, symbol);
    if (pos.qty < qty - 1e-9) throw new Error('持仓不足');
  }

  const info = db.prepare(`
    INSERT INTO orders(user_id, symbol, side, type, price, qty, status, created_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?)
  `).run(uid, symbol, side, type, price, qty, 'open', now, now);
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(info.lastInsertRowid);

  if (type === 'market') {
    applyFill(order, ref, qty);
  } else {
    // 限价单：下单后立即尝试与参考价撮合
    tryMatchLimit(order, ref);
  }
  return db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
}

function tryMatchLimit(order, refPrice) {
  if (order.status !== 'open') return;
  const remain = order.qty - order.filled_qty;
  if (remain <= 1e-9) return;
  const cross = (order.side === 'buy' && refPrice <= order.price) ||
                (order.side === 'sell' && refPrice >= order.price);
  if (cross) {
    try { applyFill(order, refPrice, remain); } catch (_) {
      const now = Date.now();
      db.prepare('UPDATE orders SET status=?, updated_at=? WHERE id=?').run('rejected', now, order.id);
    }
  }
}

function cancelOrder(uid, orderId) {
  const o = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(orderId, uid);
  if (!o) throw new Error('订单不存在');
  if (o.status !== 'open') throw new Error('订单已完结');
  const now = Date.now();
  db.prepare('UPDATE orders SET status=?, updated_at=? WHERE id=?').run('cancelled', now, orderId);
  return db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
}

function scanOpenOrders(ticks) {
  for (const t of ticks) {
    const opens = db.prepare(`SELECT * FROM orders WHERE status='open' AND symbol=? AND type='limit'`).all(t.symbol);
    for (const o of opens) tryMatchLimit(o, t.price);
  }
}

module.exports = { placeOrder, cancelOrder, scanOpenOrders, onTrade, getAccount, getPosition };
