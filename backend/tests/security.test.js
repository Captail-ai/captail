/**
 * security_events — integration tests.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP_DB = path.join(os.tmpdir(), `metals-sec-${Date.now()}-${process.pid}.db`);
process.env.DB_FILE = TMP_DB;
process.env.JWT_SECRET = 'test-secret';
process.env.DEV_AUTO_VERIFY = '1';

const request = require('supertest');
const { app } = require('../server');

let adminToken;
let userToken;

beforeAll(async () => {
  const r = await request(app).post('/api/login').send({ username: 'admin', password: 'admin123' });
  adminToken = r.body.token;
  const reg = await request(app).post('/api/register')
    .send({ username: 'sec_' + Date.now(), password: 'abcdef',
            email: `sec_${Date.now()}@example.com` });
  userToken = reg.body.token;
});

afterAll(() => {
  try { fs.unlinkSync(TMP_DB); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-wal'); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-shm'); } catch (_) {}
});

const auth = (tok) => ({ Authorization: 'Bearer ' + tok });

describe('security_events logging', () => {
  test('successful admin login is logged', async () => {
    const r = await request(app).get('/api/admin/security?kind=auth.login.success').set(auth(adminToken));
    expect(r.status).toBe(200);
    const adminLogin = r.body.find(e => e.username === 'admin');
    expect(adminLogin).toBeTruthy();
    expect(adminLogin.details.is_admin).toBe(true);
  });

  test('failed login is logged with attempted username and reason', async () => {
    await request(app).post('/api/login').send({ username: 'admin', password: 'wrong' });
    const r = await request(app).get('/api/admin/security?kind=auth.login.failure').set(auth(adminToken));
    expect(r.status).toBe(200);
    const evt = r.body.find(e => e.username === 'admin');
    expect(evt).toBeTruthy();
    expect(evt.details.reason).toMatch(/用户名或密码错误/);
  });

  test('duplicate register failure is logged', async () => {
    await request(app).post('/api/register')
      .send({ username: 'admin', password: 'abcdef', email: 'dup@example.com' });
    const r = await request(app).get('/api/admin/security?kind=auth.register.failure').set(auth(adminToken));
    const evt = r.body.find(e => e.username === 'admin');
    expect(evt).toBeTruthy();
    expect(evt.details.reason).toMatch(/占用/);
  });

  test('non-admin hitting admin endpoint produces admin.denied event', async () => {
    await request(app).get('/api/admin/ops').set(auth(userToken));
    const r = await request(app).get('/api/admin/security?kind=admin.denied').set(auth(adminToken));
    const evt = r.body.find(e => e.details && e.details.path === '/api/admin/ops');
    expect(evt).toBeTruthy();
    expect(evt.user_id).toBeDefined();
    expect(evt.user_id).not.toBeNull();
  });

  test('invalid token produces auth.token_invalid event', async () => {
    await request(app).get('/api/auth/me').set({ Authorization: 'Bearer not.a.real.jwt' });
    const r = await request(app).get('/api/admin/security?kind=auth.token_invalid').set(auth(adminToken));
    expect(r.body.length).toBeGreaterThanOrEqual(1);
  });

  test('user_id filter works', async () => {
    const all = await request(app).get('/api/admin/security?kind=auth.login.success').set(auth(adminToken));
    const withUid = all.body.find(e => e.user_id);
    expect(withUid).toBeTruthy();
    const r = await request(app).get('/api/admin/security?user_id=' + withUid.user_id).set(auth(adminToken));
    expect(r.status).toBe(200);
    expect(r.body.every(e => e.user_id === withUid.user_id)).toBe(true);
  });

  test('non-admin blocked from /api/admin/security', async () => {
    const r = await request(app).get('/api/admin/security').set(auth(userToken));
    expect(r.status).toBe(403);
  });
});

describe('ops endpoint action filter', () => {
  test('?action=cash returns only cash ops', async () => {
    // generate a cash op via a fresh user
    const reg = await request(app).post('/api/register')
      .send({ username: 'f_' + Date.now(), password: 'abcdef',
              email: `f_${Date.now()}@example.com` });
    await request(app).post(`/api/admin/users/${reg.body.user.id}/cash`).set(auth(adminToken))
      .send({ mode: 'adjust', amount: 100 });

    const r = await request(app).get('/api/admin/ops?action=cash').set(auth(adminToken));
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThanOrEqual(1);
    expect(r.body.every(o => /cash/.test(o.action))).toBe(true);
  });
});
