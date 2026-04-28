/**
 * News CRUD / settings / admin_ops audit log — integration tests.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP_DB = path.join(os.tmpdir(), `metals-test2-${Date.now()}-${process.pid}.db`);
process.env.DB_FILE = TMP_DB;
process.env.JWT_SECRET = 'test-secret';
process.env.DEV_AUTO_VERIFY = '1';

const request = require('supertest');
const { app } = require('../server');

let adminToken;
let userToken;
let userId;

beforeAll(async () => {
  const r = await request(app).post('/api/login').send({ username: 'admin', password: 'admin123' });
  adminToken = r.body.token;

  const tuname = 't_' + Date.now();
  const reg = await request(app).post('/api/register')
    .send({ username: tuname, password: 'abcdef', email: `${tuname}@example.com` });
  userId = reg.body.user.id;
  userToken = reg.body.token;
});

afterAll(() => {
  try { fs.unlinkSync(TMP_DB); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-wal'); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-shm'); } catch (_) {}
});

const auth = (tok) => ({ Authorization: 'Bearer ' + tok });

describe('news CRUD', () => {
  test('public /api/news returns seeded rows', async () => {
    const r = await request(app).get('/api/news');
    expect(r.status).toBe(200);
    expect(r.body.length).toBeGreaterThanOrEqual(4);
  });

  test('admin create + update + delete', async () => {
    const create = await request(app).post('/api/admin/news').set(auth(adminToken))
      .send({ date: '2026-04-22', title_zh: '标题', title_en: 'Title',
              summary_zh: '摘要', summary_en: 'sum' });
    expect(create.status).toBe(200);
    const id = create.body.id;
    expect(typeof id).toBe('number');

    const upd = await request(app).put('/api/admin/news/' + id).set(auth(adminToken))
      .send({ title_zh: '新标题' });
    expect(upd.status).toBe(200);

    const readOne = await request(app).get('/api/news/' + id);
    expect(readOne.body.title_zh).toBe('新标题');
    expect(readOne.body.title_en).toBe('Title'); // preserved via COALESCE

    const del = await request(app).delete('/api/admin/news/' + id).set(auth(adminToken));
    expect(del.body.deleted).toBe(1);

    const after = await request(app).get('/api/news/' + id);
    expect(after.status).toBe(404);
  });

  test('required fields validated', async () => {
    const r = await request(app).post('/api/admin/news').set(auth(adminToken))
      .send({ date: '2026-04-22' });
    expect(r.status).toBe(400);
  });

  test('non-admin blocked from news CRUD', async () => {
    const r = await request(app).post('/api/admin/news').set(auth(userToken))
      .send({ date: '2026-04-22', title_zh: 'x', title_en: 'y' });
    expect(r.status).toBe(403);
  });
});

describe('settings', () => {
  test('public /api/settings only exposes whitelisted keys', async () => {
    // write a non-whitelisted key
    await request(app).post('/api/admin/settings').set(auth(adminToken))
      .send({ key: 'secret_key', value: 'should-not-leak' });
    const pub = await request(app).get('/api/settings');
    expect(pub.status).toBe(200);
    expect(pub.body.secret_key).toBeUndefined();
    expect(pub.body.service_url).toBeDefined();
  });

  test('service_url round-trip', async () => {
    const url = 'https://chat.example.com/widget';
    const w = await request(app).post('/api/admin/settings').set(auth(adminToken))
      .send({ key: 'service_url', value: url });
    expect(w.status).toBe(200);
    const r = await request(app).get('/api/settings');
    expect(r.body.service_url).toBe(url);
  });

  test('admin settings view exposes all keys (internal)', async () => {
    const r = await request(app).get('/api/admin/settings').set(auth(adminToken));
    expect(r.status).toBe(200);
    expect(r.body.secret_key).toBeDefined();
    expect(r.body.service_url).toBeDefined();
  });

  test('missing key rejected', async () => {
    const r = await request(app).post('/api/admin/settings').set(auth(adminToken)).send({});
    expect(r.status).toBe(400);
  });

  test('feature flags default to enabled and round-trip via public endpoint', async () => {
    // 默认值：首次启动种入 '1'
    const first = await request(app).get('/api/settings');
    expect(first.body.feature_finance).toBe('1');
    expect(first.body.feature_loan).toBe('1');

    // 关闭 finance，loan 保持
    await request(app).post('/api/admin/settings').set(auth(adminToken))
      .send({ key: 'feature_finance', value: '0' });
    const after = await request(app).get('/api/settings');
    expect(after.body.feature_finance).toBe('0');
    expect(after.body.feature_loan).toBe('1');

    // 恢复默认
    await request(app).post('/api/admin/settings').set(auth(adminToken))
      .send({ key: 'feature_finance', value: '1' });
  });
});

describe('admin_ops audit log', () => {
  test('cash mutation writes an op record with before/after wallet snapshots', async () => {
    await request(app).post(`/api/admin/users/${userId}/cash`).set(auth(adminToken))
      .send({ wallet: 'spot', mode: 'adjust', amount: 1234 });
    const r = await request(app).get('/api/admin/ops?target=' + userId).set(auth(adminToken));
    expect(r.status).toBe(200);
    const op = r.body.find(o => o.action === 'cash.adjust');
    expect(op).toBeTruthy();
    expect(op.admin_username).toBe('admin');
    expect(op.target_user_id).toBe(userId);
    expect(op.details.amount).toBe(1234);
    expect(op.details.wallet).toBe('spot');
    expect(typeof op.details.before.spot_cash).toBe('number');
    expect(op.details.after.spot_cash).toBe(op.details.before.spot_cash + 1234);
  });

  test('profile edit is logged with changed fields', async () => {
    await request(app).post('/api/admin/users/' + userId).set(auth(adminToken))
      .send({ nickname: 'auditnick' });
    const r = await request(app).get('/api/admin/ops?target=' + userId).set(auth(adminToken));
    const op = r.body.find(o => o.action === 'user.update'
                                && o.details && o.details.nickname === 'auditnick');
    expect(op).toBeTruthy();
  });

  test('non-admin blocked from /api/admin/ops', async () => {
    const r = await request(app).get('/api/admin/ops').set(auth(userToken));
    expect(r.status).toBe(403);
  });

  test('limit query is clamped and defaulted', async () => {
    const r = await request(app).get('/api/admin/ops?limit=9999').set(auth(adminToken));
    expect(r.status).toBe(200);
    expect(r.body.length).toBeLessThanOrEqual(500);
  });
});
