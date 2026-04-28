/**
 * 管理员可配置实体 — CRUD 集成测试。
 *  覆盖 option_periods / finance_products / loan_products / faqs 的 GET/POST/PUT/DELETE
 *  及贷款申请审核流程（loan_applications）。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP_DB = path.join(os.tmpdir(), `admin-cfg-test-${Date.now()}-${process.pid}.db`);
process.env.DB_FILE = TMP_DB;
process.env.JWT_SECRET = 'test-secret';
process.env.DEV_AUTO_VERIFY = '1';

const request = require('supertest');
const { app } = require('../server');
const db = require('../db');

const ADMIN = { username: 'admin', password: 'admin123' };
let adminToken, userToken, userId;

beforeAll(async () => {
  const a = await request(app).post('/api/login').send(ADMIN);
  adminToken = a.body.token;

  const uname = 'cfg_' + Date.now();
  const r = await request(app).post('/api/register')
    .send({ username: uname, password: 'abcdef', email: `${uname}@x.io` });
  userId = r.body.user.id;
  userToken = r.body.token;
  // 通过 KYC 初级以放行 /api/loan/apply
  db.prepare('UPDATE users SET kyc_level = 1 WHERE id = ?').run(userId);
});

afterAll(() => {
  try { fs.unlinkSync(TMP_DB); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-wal'); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-shm'); } catch (_) {}
});

const auth = (t) => ({ Authorization: 'Bearer ' + t });

// ---------- 通用 CRUD：option-periods / finance / loans / faqs ----------
const ENTITIES = [
  { name: 'option-periods', endpoint: '/api/admin/option-periods',
    create: { duration_sec: 9999, payout_rate: 1.5, min_amount: 5,
              max_amount: 1000, label_zh: '测试', label_en: 'test',
              sort_order: 99, enabled: 1 },
    update: { payout_rate: 2.0, enabled: 0 } },
  { name: 'finance products', endpoint: '/api/admin/finance/products',
    create: { name_zh: 'X 测试理财', name_en: 'X Test', vip_tag: 'VIP3',
              daily_rate: 0.01, min_amount: 100, max_amount: 1000, lock_days: 7,
              total_quota: 0, sort_order: 99, enabled: 1 },
    update: { daily_rate: 0.02, enabled: 0 } },
  { name: 'loan products', endpoint: '/api/admin/loan/products',
    create: { name_zh: 'X 测试贷款', name_en: 'X Test Loan',
              daily_rate: 0.001, min_amount: 100, max_amount: 5000,
              term_days: 14, sort_order: 99, enabled: 1 },
    update: { daily_rate: 0.002, term_days: 21 } },
  { name: 'faqs', endpoint: '/api/admin/faqs',
    create: { question_zh: '测试问题？', question_en: 'Test?',
              answer_zh: '答案', answer_en: 'A', sort_order: 99, enabled: 1 },
    update: { answer_zh: '更新答案', enabled: 0 } },
];

describe.each(ENTITIES)('$name CRUD', ({ endpoint, create, update }) => {
  let createdId;

  test('non-admin GET 403', async () => {
    const r = await request(app).get(endpoint).set(auth(userToken));
    expect(r.status).toBe(403);
  });

  test('admin GET returns array (含种子)', async () => {
    const r = await request(app).get(endpoint).set(auth(adminToken));
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(r.body.length).toBeGreaterThan(0);
  });

  test('admin POST creates row', async () => {
    const r = await request(app).post(endpoint).set(auth(adminToken)).send(create);
    expect(r.status).toBe(200);
    expect(typeof r.body.id).toBe('number');
    createdId = r.body.id;
  });

  test('admin PUT updates row', async () => {
    const r = await request(app).put(`${endpoint}/${createdId}`)
      .set(auth(adminToken)).send(update);
    expect(r.status).toBe(200);
    const list = await request(app).get(endpoint).set(auth(adminToken));
    const row = list.body.find(x => x.id === createdId);
    expect(row).toBeTruthy();
    for (const [k, v] of Object.entries(update)) expect(row[k]).toBe(v);
  });

  test('non-admin PUT 403', async () => {
    const r = await request(app).put(`${endpoint}/${createdId}`)
      .set(auth(userToken)).send(update);
    expect(r.status).toBe(403);
  });

  test('admin DELETE removes row', async () => {
    const r = await request(app).delete(`${endpoint}/${createdId}`).set(auth(adminToken));
    expect(r.status).toBe(200);
    expect(r.body.deleted).toBe(1);
    const list = await request(app).get(endpoint).set(auth(adminToken));
    expect(list.body.find(x => x.id === createdId)).toBeUndefined();
  });

  test('PUT on missing id 404', async () => {
    const r = await request(app).put(`${endpoint}/9999999`)
      .set(auth(adminToken)).send(update);
    expect(r.status).toBe(404);
  });
});

// ---------- option-periods 必填校验 ----------
describe('option-periods validation', () => {
  test('缺时长或赔率 400', async () => {
    const r = await request(app).post('/api/admin/option-periods')
      .set(auth(adminToken)).send({ payout_rate: 0.5 });
    expect(r.status).toBe(400);
  });
});

// ---------- 贷款申请审核 ----------
describe('loan applications review', () => {
  let appId;
  const APPLY_AMOUNT = 800;

  test('user 申请贷款 (KYC1)', async () => {
    const list = await request(app).get('/api/loan/products');
    expect(list.status).toBe(200);
    const p = list.body[0];
    expect(p).toBeTruthy();
    const amt = Math.max(p.min_amount, Math.min(APPLY_AMOUNT, p.max_amount));
    const r = await request(app).post('/api/loan/apply').set(auth(userToken))
      .send({ product_id: p.id, amount: amt, term_days: p.term_days });
    expect(r.status).toBe(200);
    appId = r.body.id;
  });

  test('non-admin GET 申请列表 403', async () => {
    const r = await request(app).get('/api/admin/loan/applications').set(auth(userToken));
    expect(r.status).toBe(403);
  });

  test('admin GET 列出 pending 申请', async () => {
    const r = await request(app).get('/api/admin/loan/applications').set(auth(adminToken));
    expect(r.status).toBe(200);
    const row = r.body.find(x => x.id === appId);
    expect(row).toBeTruthy();
    expect(row.status).toBe('pending');
    expect(row.username).toBeDefined();
  });

  test('admin 通过 → spot_cash 入账 + status=approved', async () => {
    const before = await request(app).get('/api/admin/users/' + userId).set(auth(adminToken));
    const spotBefore = before.body.account.spot_cash;
    const row = (await request(app).get('/api/admin/loan/applications')
      .set(auth(adminToken))).body.find(x => x.id === appId);

    const r = await request(app).post(`/api/admin/loan/applications/${appId}`)
      .set(auth(adminToken)).send({ action: 'approve' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('approved');
    expect(typeof r.body.due_at).toBe('number');

    const after = await request(app).get('/api/admin/users/' + userId).set(auth(adminToken));
    expect(after.body.account.spot_cash).toBeCloseTo(spotBefore + row.amount, 6);
  });

  test('已处理的申请不可再次审批 400', async () => {
    const r = await request(app).post(`/api/admin/loan/applications/${appId}`)
      .set(auth(adminToken)).send({ action: 'approve' });
    expect(r.status).toBe(400);
  });

  test('admin 驳回另一笔申请', async () => {
    const list = await request(app).get('/api/loan/products');
    const p = list.body[0];
    const apply = await request(app).post('/api/loan/apply').set(auth(userToken))
      .send({ product_id: p.id, amount: p.min_amount, term_days: p.term_days });
    expect(apply.status).toBe(200);
    const id = apply.body.id;

    const before = await request(app).get('/api/admin/users/' + userId).set(auth(adminToken));
    const spotBefore = before.body.account.spot_cash;

    const r = await request(app).post(`/api/admin/loan/applications/${id}`)
      .set(auth(adminToken)).send({ action: 'reject' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('rejected');

    const after = await request(app).get('/api/admin/users/' + userId).set(auth(adminToken));
    // 驳回不放款，余额不变
    expect(after.body.account.spot_cash).toBe(spotBefore);
  });

  test('action 非法 400', async () => {
    const list = await request(app).get('/api/loan/products');
    const p = list.body[0];
    const apply = await request(app).post('/api/loan/apply').set(auth(userToken))
      .send({ product_id: p.id, amount: p.min_amount, term_days: p.term_days });
    const r = await request(app).post(`/api/admin/loan/applications/${apply.body.id}`)
      .set(auth(adminToken)).send({ action: 'wat' });
    expect(r.status).toBe(400);
  });

  test('不存在的申请 404', async () => {
    const r = await request(app).post('/api/admin/loan/applications/9999999')
      .set(auth(adminToken)).send({ action: 'approve' });
    expect(r.status).toBe(404);
  });
});
