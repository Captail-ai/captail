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
});
