/**
 * 秒级合约 — 集成测试。
 *  - 下注扣款 / 参数校验 / 权限校验
 *  - 自然结算（基于市场价 vs open_price）
 *  - 强制结果：always_* 持续生效；next_* 命中后清空
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP_DB = path.join(os.tmpdir(), `seconds-test-${Date.now()}-${process.pid}.db`);
process.env.DB_FILE = TMP_DB;
process.env.JWT_SECRET = 'test-secret';
process.env.DEV_AUTO_VERIFY = '1';
// 本测试套依赖期权钱包余额下单，保留旧 100000 USD 试玩金行为
process.env.SIGNUP_OPTION_BONUS = '100000';

const request = require('supertest');
const { app } = require('../server');
const db = require('../db');
const seconds = require('../seconds');

const ADMIN = { username: 'admin', password: 'admin123' };
let adminToken, userToken, userId, username;

beforeAll(async () => {
  const a = await request(app).post('/api/login').send(ADMIN);
  adminToken = a.body.token;
  username = 'sec_' + Date.now();
  const r = await request(app).post('/api/register')
    .send({ username, password: 'abcdef', email: `${username}@x.io` });
  userId = r.body.user.id;
  userToken = r.body.token;
  // 测试用户需 KYC 初级以通过交易准入闸门
  db.prepare('UPDATE users SET kyc_level = 1 WHERE id = ?').run(userId);
});

afterAll(() => {
  try { fs.unlinkSync(TMP_DB); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-wal'); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-shm'); } catch (_) {}
});

const auth = (t) => ({ Authorization: 'Bearer ' + t });

// 把指定合约的 settle_at 改到过去；可选地修改 open_price，从而控制自然结算结果
function expireNow(id, openPrice) {
  if (openPrice != null) {
    db.prepare('UPDATE second_contracts SET open_price=?, settle_at=? WHERE id=?')
      .run(openPrice, Date.now() - 1000, id);
  } else {
    db.prepare('UPDATE second_contracts SET settle_at=? WHERE id=?')
      .run(Date.now() - 1000, id);
  }
}
// 秒/期权下单从 option_cash 扣款，结算赢钱也回到 option_cash
function getCash(uid) {
  return db.prepare('SELECT option_cash FROM accounts WHERE user_id=?').get(uid).option_cash;
}

describe('config + 下单基础', () => {
  test('GET /api/seconds/config 返回时长与赔率', async () => {
    const r = await request(app).get('/api/seconds/config');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.durations)).toBe(true);
    expect(r.body.min_amount).toBeGreaterThan(0);
  });

  test('未登录禁止下单', async () => {
    const r = await request(app).post('/api/seconds/orders')
      .send({ symbol: 'XAU', direction: 'up', amount: 100, duration: 60 });
    expect(r.status).toBe(401);
  });

  test('参数校验：方向 / 时长 / 金额', async () => {
    const cases = [
      { symbol: 'XAU', direction: 'sideway', amount: 100, duration: 60 },
      { symbol: 'XAU', direction: 'up', amount: 100, duration: 7 },
      { symbol: 'XAU', direction: 'up', amount: 1, duration: 60 },
      { symbol: 'BTC', direction: 'up', amount: 100, duration: 60 },
    ];
    for (const body of cases) {
      const r = await request(app).post('/api/seconds/orders').set(auth(userToken)).send(body);
      expect(r.status).toBe(400);
    }
  });

  test('正常下单立即扣除本金', async () => {
    const before = getCash(userId);
    const r = await request(app).post('/api/seconds/orders').set(auth(userToken))
      .send({ symbol: 'XAU', direction: 'up', amount: 200, duration: 60 });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('open');
    expect(getCash(userId)).toBeCloseTo(before - 200, 6);
    // 清理（避免影响后续断言）
    expireNow(r.body.id, /*openPrice*/ 1e9); // 让其立刻输（open=1e9，up 永远输）
    seconds.settleDue();
  });
});

describe('自然结算', () => {
  test('open_price 远低于市场价 → up 必赢', async () => {
    const before = getCash(userId);
    const r = await request(app).post('/api/seconds/orders').set(auth(userToken))
      .send({ symbol: 'XAU', direction: 'up', amount: 100, duration: 30 });
    const id = r.body.id;
    expireNow(id, 1.0);
    expect(seconds.settleDue()).toBeGreaterThanOrEqual(1);
    const row = db.prepare('SELECT * FROM second_contracts WHERE id=?').get(id);
    expect(row.status).toBe('won');
    // 赢：返还本金 + 100 * payout_rate(30s=0.20) = 100 + 20 = 120
    expect(getCash(userId)).toBeCloseTo(before + 100 * 0.20, 4);
  });

  test('open_price 远高于市场价 → up 必输', async () => {
    const before = getCash(userId);
    const r = await request(app).post('/api/seconds/orders').set(auth(userToken))
      .send({ symbol: 'XAU', direction: 'up', amount: 100, duration: 30 });
    expireNow(r.body.id, 1e9);
    seconds.settleDue();
    const row = db.prepare('SELECT * FROM second_contracts WHERE id=?').get(r.body.id);
    expect(row.status).toBe('lost');
    expect(getCash(userId)).toBeCloseTo(before - 100, 4);
  });
});

describe('管理员强制结果', () => {
  test('非管理员禁止设置 force_outcome', async () => {
    const r = await request(app).post(`/api/admin/users/${userId}/force-outcome`)
      .set(auth(userToken)).send({ mode: 'always_win' });
    expect(r.status).toBe(403);
  });

  test('always_win：连续两笔都强制赢', async () => {
    await request(app).post(`/api/admin/users/${userId}/force-outcome`)
      .set(auth(adminToken)).send({ mode: 'always_win' });
    for (let i = 0; i < 2; i++) {
      const before = getCash(userId);
      const r = await request(app).post('/api/seconds/orders').set(auth(userToken))
        .send({ symbol: 'XAU', direction: 'up', amount: 100, duration: 30 });
      expireNow(r.body.id, 1e9); // 真实市场上必输的开仓价
      seconds.settleDue();
      const row = db.prepare('SELECT * FROM second_contracts WHERE id=?').get(r.body.id);
      expect(row.status).toBe('won');
      expect(row.forced).toBe(1);
      expect(getCash(userId)).toBeCloseTo(before + 20, 4);
    }
  });

  test('next_lose：仅命中一次，第二笔回归市场价', async () => {
    await request(app).post(`/api/admin/users/${userId}/force-outcome`)
      .set(auth(adminToken)).send({ mode: 'next_lose' });
    // 第一笔：开仓价 1.0，市场价远高 → 自然 up 必赢；但 next_lose 强制输
    let r = await request(app).post('/api/seconds/orders').set(auth(userToken))
      .send({ symbol: 'XAU', direction: 'up', amount: 100, duration: 30 });
    expireNow(r.body.id, 1.0);
    seconds.settleDue();
    let row = db.prepare('SELECT * FROM second_contracts WHERE id=?').get(r.body.id);
    expect(row.status).toBe('lost');
    expect(row.forced).toBe(1);
    // 强制清空
    expect(db.prepare('SELECT force_outcome FROM users WHERE id=?').get(userId).force_outcome).toBeNull();
    // 第二笔：开仓价 1.0，市场价远高 → 自然 up 赢
    r = await request(app).post('/api/seconds/orders').set(auth(userToken))
      .send({ symbol: 'XAU', direction: 'up', amount: 100, duration: 30 });
    expireNow(r.body.id, 1.0);
    seconds.settleDue();
    row = db.prepare('SELECT * FROM second_contracts WHERE id=?').get(r.body.id);
    expect(row.status).toBe('won');
    expect(row.forced).toBe(0);
  });

  test('GET /api/admin/users/:id 返回 force_outcome 字段', async () => {
    await request(app).post(`/api/admin/users/${userId}/force-outcome`)
      .set(auth(adminToken)).send({ mode: 'always_lose' });
    const d = await request(app).get('/api/admin/users/' + userId).set(auth(adminToken));
    expect(d.body.user.force_outcome).toBe('always_lose');
    expect(Array.isArray(d.body.seconds_orders)).toBe(true);
  });
});
