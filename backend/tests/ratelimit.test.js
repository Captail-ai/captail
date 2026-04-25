/**
 * Unit tests for the in-memory login rate limiter.
 */
process.env.LOGIN_FAIL_LIMIT = '3';
process.env.LOGIN_FAIL_WINDOW = '60';
process.env.LOGIN_LOCK_SECONDS = '30';

const rl = require('../ratelimit');

beforeEach(() => rl._reset());

describe('ratelimit', () => {
  test('fresh key is not locked', () => {
    expect(rl.check('k1').locked).toBe(false);
  });

  test('failures below limit do not lock', () => {
    const r1 = rl.recordFailure('k1');
    const r2 = rl.recordFailure('k1');
    expect(r1.locked).toBe(false);
    expect(r2.locked).toBe(false);
    expect(r2.remaining).toBe(1);
    expect(rl.check('k1').locked).toBe(false);
  });

  test('reaching the limit locks with retryAfter ~ lock seconds', () => {
    rl.recordFailure('k2');
    rl.recordFailure('k2');
    const r = rl.recordFailure('k2'); // 3rd hits limit (LOGIN_FAIL_LIMIT=3)
    expect(r.locked).toBe(true);
    expect(r.retryAfter).toBeGreaterThan(25);
    expect(r.retryAfter).toBeLessThanOrEqual(30);
    const chk = rl.check('k2');
    expect(chk.locked).toBe(true);
    expect(chk.retryAfter).toBeGreaterThan(0);
  });

  test('clear() removes the bucket', () => {
    rl.recordFailure('k3');
    rl.recordFailure('k3');
    rl.recordFailure('k3');
    expect(rl.check('k3').locked).toBe(true);
    rl.clear('k3');
    expect(rl.check('k3').locked).toBe(false);
  });

  test('failures outside the window are pruned', () => {
    const now = Date.now();
    // prime with two old failures and one fresh one
    rl.recordFailure('k4', now - 120_000);
    rl.recordFailure('k4', now - 120_000);
    const r = rl.recordFailure('k4', now);
    expect(r.locked).toBe(false);
    expect(r.remaining).toBe(2);
  });

  test('different keys do not interfere', () => {
    rl.recordFailure('a');
    rl.recordFailure('a');
    rl.recordFailure('a');
    expect(rl.check('a').locked).toBe(true);
    expect(rl.check('b').locked).toBe(false);
  });
});
