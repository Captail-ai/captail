/**
 * Admin endpoints — integration tests.
 * Uses an isolated on-disk SQLite DB (DB_FILE env) and supertest against the
 * exported Express app (server.js does not call listen() when required).
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

// Point db.js at a fresh sqlite file BEFORE requiring the server.
const TMP_DB = path.join(os.tmpdir(), `metals-test-${Date.now()}-${process.pid}.db`);
process.env.DB_FILE = TMP_DB;
process.env.JWT_SECRET = 'test-secret';
process.env.DEV_AUTO_VERIFY = '1';

const request = require('supertest');
const { app } = require('../server');

const ADMIN_CREDS = { username: 'admin', password: 'admin123' };

let adminToken;
let userToken;
let userId;

beforeAll(async () => {
  // admin is created by ensureAdmin() on module load
  const r = await request(app).post('/api/login').send(ADMIN_CREDS);
  expect(r.status).toBe(200);
  adminToken = r.body.token;
  expect(r.body.user.is_admin).toBe(true);

  // create a fresh regular user we can poke at
  const uname = 't_' + Date.now();
  const reg = await request(app).post('/api/register')
    .send({ username: uname, password: 'abcdef', email: `${uname}@example.com` });
  expect(reg.status).toBe(200);
  userId = reg.body.user.id;
  userToken = reg.body.token;
});

afterAll(() => {
  // best-effort cleanup of the temp DB
  try { fs.unlinkSync(TMP_DB); } catch (_) { /* ignore */ }
  try { fs.unlinkSync(TMP_DB + '-wal'); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-shm'); } catch (_) {}
});

const auth = (tok) => ({ Authorization: 'Bearer ' + tok });

describe('admin gating', () => {
  test('non-admin cannot list ops', async () => {
    const r = await request(app).get('/api/admin/ops').set(auth(userToken));
    expect(r.status).toBe(403);
  });

  test('unauthenticated cannot hit admin endpoints', async () => {
    const r = await request(app).get('/api/admin/users/' + userId);
    expect(r.status).toBe(401);
  });
});

describe('user detail + edits', () => {
  test('GET /api/admin/users/:id returns rich detail', async () => {
    const r = await request(app).get('/api/admin/users/' + userId).set(auth(adminToken));
    expect(r.status).toBe(200);
    expect(r.body.user.id).toBe(userId);
    // 双钱包改造：注册赠金 100000 USD 进入期权钱包
    expect(r.body.account.spot_cash).toBe(0);
    expect(r.body.account.option_cash).toBe(100000);
    expect(r.body.account.cash).toBe(100000);
    expect(Array.isArray(r.body.positions)).toBe(true);
    expect(Array.isArray(r.body.orders)).toBe(true);
  });

  test('POST /api/admin/users/:id patches profile + ban flag', async () => {
    const r = await request(app).post('/api/admin/users/' + userId).set(auth(adminToken))
      .send({ email: 'x@y.z', phone: '12345', nickname: 'nick', is_banned: true });
    expect(r.status).toBe(200);
    const d = await request(app).get('/api/admin/users/' + userId).set(auth(adminToken));
    expect(d.body.user.email).toBe('x@y.z');
    expect(d.body.user.phone).toBe('12345');
    expect(d.body.user.nickname).toBe('nick');
    expect(d.body.user.is_banned).toBe(1);
  });

  test('password reset takes effect', async () => {
    const newPw = 'newpass123';
    const r = await request(app).post('/api/admin/users/' + userId).set(auth(adminToken))
      .send({ password: newPw });
    expect(r.status).toBe(200);
    const bad = await request(app).post('/api/login')
      .send({ username: (await detail()).user.username, password: 'abcdef' });
    expect(bad.status).toBe(400);
    const good = await request(app).post('/api/login')
      .send({ username: (await detail()).user.username, password: newPw });
    expect(good.status).toBe(200);
  });

  async function detail() {
    return (await request(app).get('/api/admin/users/' + userId).set(auth(adminToken))).body;
  }

  test('too-short password rejected', async () => {
    const r = await request(app).post('/api/admin/users/' + userId).set(auth(adminToken))
      .send({ password: '123' });
    expect(r.status).toBe(400);
  });
});

describe('cash + positions', () => {
  test('cash adjust on option wallet works (signed)', async () => {
    const a = await request(app).post(`/api/admin/users/${userId}/cash`).set(auth(adminToken))
      .send({ wallet: 'option', mode: 'adjust', amount: -5000 });
    expect(a.status).toBe(200);
    // 注册赠金 100000 在期权钱包，扣 5000 → 期权 95000；现货仍为 0
    expect(a.body.option_cash).toBe(95000);
    expect(a.body.spot_cash).toBe(0);
    expect(a.body.cash).toBe(95000);
  });

  test('cash set on spot wallet works', async () => {
    const b = await request(app).post(`/api/admin/users/${userId}/cash`).set(auth(adminToken))
      .send({ wallet: 'spot', mode: 'set', amount: 250000 });
    expect(b.body.spot_cash).toBe(250000);
    // 期权钱包不受影响
    expect(b.body.option_cash).toBe(95000);
    expect(b.body.cash).toBe(345000);
  });

  test('set with negative amount rejected', async () => {
    const r = await request(app).post(`/api/admin/users/${userId}/cash`).set(auth(adminToken))
      .send({ wallet: 'spot', mode: 'set', amount: -1 });
    expect(r.status).toBe(400);
  });

  test('non-numeric amount rejected', async () => {
    const r = await request(app).post(`/api/admin/users/${userId}/cash`).set(auth(adminToken))
      .send({ wallet: 'spot', mode: 'adjust', amount: 'abc' });
    expect(r.status).toBe(400);
  });

  test('invalid wallet rejected', async () => {
    const r = await request(app).post(`/api/admin/users/${userId}/cash`).set(auth(adminToken))
      .send({ wallet: 'savings', mode: 'set', amount: 100 });
    expect(r.status).toBe(400);
  });

  test('position upsert then delete (qty=0)', async () => {
    const up = await request(app).post(`/api/admin/users/${userId}/positions`).set(auth(adminToken))
      .send({ symbol: 'XAU', qty: 1.5, avg_price: 2300 });
    expect(up.status).toBe(200);
    let d = await request(app).get('/api/admin/users/' + userId).set(auth(adminToken));
    expect(d.body.positions).toEqual([{ symbol: 'XAU', qty: 1.5, avg_price: 2300 }]);

    const del = await request(app).post(`/api/admin/users/${userId}/positions`).set(auth(adminToken))
      .send({ symbol: 'XAU', qty: 0, avg_price: 0 });
    expect(del.status).toBe(200);
    d = await request(app).get('/api/admin/users/' + userId).set(auth(adminToken));
    expect(d.body.positions).toEqual([]);
  });

  test('invalid symbol rejected', async () => {
    const r = await request(app).post(`/api/admin/users/${userId}/positions`).set(auth(adminToken))
      .send({ symbol: 'BTC', qty: 1, avg_price: 100 });
    expect(r.status).toBe(400);
  });
});
