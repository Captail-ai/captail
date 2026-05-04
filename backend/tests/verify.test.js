/**
 * Email verification HTTP flow.
 *
 * Here we do NOT set DEV_AUTO_VERIFY so we can exercise the real code path:
 * register -> needs_verification -> /api/auth/verify-email -> login succeeds.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const TMP_DB = path.join(os.tmpdir(), `metals-verify-${Date.now()}-${process.pid}.db`);
process.env.DB_FILE = TMP_DB;
process.env.JWT_SECRET = 'test-secret';
process.env.MAIL_DEV_ECHO = '1'; // so the server hands back the code in register/resend
// 禁用未验证账号 60s 冷却，便于在单测中连续重注册
process.env.REGISTER_REUSE_COOLDOWN_MS = '0';

const request = require('supertest');
const mail = require('../mail');
const { app } = require('../server');

// Swap out the mail transport so we don't spam console output during tests.
const mailbox = [];
beforeAll(() => mail._setTransport((m) => { mailbox.push(m); return { ok: true }; }));
afterAll(() => {
  mail._reset();
  try { fs.unlinkSync(TMP_DB); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-wal'); } catch (_) {}
  try { fs.unlinkSync(TMP_DB + '-shm'); } catch (_) {}
});

const uname = 'v_' + Date.now();
const email = `${uname}@example.com`;

describe('email verification flow', () => {
  test('register without email is rejected', async () => {
    const r = await request(app).post('/api/register')
      .send({ username: 'xx_' + Date.now(), password: 'abcdef' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/邮箱/);
  });

  test('register with email returns needs_verification and no token', async () => {
    const r = await request(app).post('/api/register')
      .send({ username: uname, password: 'abcdef', email });
    expect(r.status).toBe(200);
    expect(r.body.needs_verification).toBe(true);
    expect(r.body.user.email_verified).toBe(false);
    expect(r.body.dev_code).toMatch(/^\d{6}$/);
    expect(mailbox[mailbox.length - 1].to).toBe(email);
  });

  test('login before verification is blocked with 403 needs_verification', async () => {
    const r = await request(app).post('/api/login')
      .send({ username: uname, password: 'abcdef' });
    expect(r.status).toBe(403);
    expect(r.body.needs_verification).toBe(true);
  });

  test('wrong code is rejected', async () => {
    const r = await request(app).post('/api/auth/verify-email')
      .send({ username: uname, code: '000000' });
    expect(r.status).toBe(400);
  });

  test('correct code verifies and lets the user log in', async () => {
    // grab the most recent code from the mailbox
    const lastMail = mailbox.filter(m => m.to === email).pop();
    const code = (lastMail.body.match(/\b\d{6}\b/) || [])[0];
    expect(code).toBeTruthy();

    const v = await request(app).post('/api/auth/verify-email')
      .send({ username: uname, code });
    expect(v.status).toBe(200);
    expect(v.body.ok).toBe(true);

    const li = await request(app).post('/api/login')
      .send({ username: uname, password: 'abcdef' });
    expect(li.status).toBe(200);
    expect(li.body.token).toBeTruthy();
  });

  test('resend is throttled to at most one code per 30s', async () => {
    const uname2 = 'r_' + Date.now();
    const reg = await request(app).post('/api/register')
      .send({ username: uname2, password: 'abcdef', email: `${uname2}@example.com` });
    expect(reg.status).toBe(200);
    const r = await request(app).post('/api/auth/resend-code').send({ username: uname2 });
    expect(r.status).toBe(429);
    expect(r.body.retryAfter).toBeGreaterThan(0);
  });

  test('mail send failure rolls back the user so the username is reusable', async () => {
    // 让下一次发邮件返回失败
    mail._setTransport(() => ({ ok: false, error: 'smtp down' }));
    const uname3 = 'm_' + Date.now();
    const fail = await request(app).post('/api/register')
      .send({ username: uname3, password: 'abcdef', email: `${uname3}@example.com` });
    expect(fail.status).toBe(503);
    // 恢复成功的发送通道并立即重试 —— 应该通过（说明上一次的僵尸记录已清除）
    mail._setTransport((m) => { mailbox.push(m); return { ok: true }; });
    const ok = await request(app).post('/api/register')
      .send({ username: uname3, password: 'abcdef', email: `${uname3}@example.com` });
    expect(ok.status).toBe(200);
    expect(ok.body.needs_verification).toBe(true);
  });

  test('re-register over an unverified record succeeds (zombie cleanup)', async () => {
    const uname4 = 'z_' + Date.now();
    const eml = `${uname4}@example.com`;
    const r1 = await request(app).post('/api/register')
      .send({ username: uname4, password: 'abcdef', email: eml });
    expect(r1.status).toBe(200);
    // 不去验证，直接再次注册同 username/email：应允许覆盖
    const r2 = await request(app).post('/api/register')
      .send({ username: uname4, password: 'newpass', email: eml });
    expect(r2.status).toBe(200);
    expect(r2.body.needs_verification).toBe(true);
  });

  test('cooldown blocks accidental double-submit from wiping the first code', async () => {
    // 临时启用冷却（默认 60s，本测试用 5s 够了）
    const prev = process.env.REGISTER_REUSE_COOLDOWN_MS;
    process.env.REGISTER_REUSE_COOLDOWN_MS = '5000';
    const uname6 = 'd_' + Date.now();
    const eml = `${uname6}@example.com`;
    const r1 = await request(app).post('/api/register')
      .send({ username: uname6, password: 'abcdef', email: eml });
    expect(r1.status).toBe(200);
    const codeBefore = r1.body.dev_code;
    // 立即重注册：应被冷却拒绝，且 r1 的 code 仍然有效
    const r2 = await request(app).post('/api/register')
      .send({ username: uname6, password: 'abcdef', email: eml });
    expect(r2.status).toBe(400);
    expect(r2.body.error).toMatch(/刚刚注册/);
    const v = await request(app).post('/api/auth/verify-email')
      .send({ username: uname6, code: codeBefore });
    expect(v.status).toBe(200);
    process.env.REGISTER_REUSE_COOLDOWN_MS = prev;
  });

  test('default signup option_cash is 0 (no welcome bonus)', async () => {
    const db = require('../db');
    const uname5 = 'b_' + Date.now();
    const r = await request(app).post('/api/register')
      .send({ username: uname5, password: 'abcdef', email: `${uname5}@example.com` });
    expect(r.status).toBe(200);
    const acc = db.prepare(
      `SELECT a.spot_cash, a.option_cash FROM accounts a
       JOIN users u ON u.id=a.user_id WHERE u.username=?`).get(uname5);
    expect(acc.spot_cash).toBe(0);
    expect(acc.option_cash).toBe(0);
  });
});
