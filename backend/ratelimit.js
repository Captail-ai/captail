/**
 * 基于内存的轻量级滑动窗口限流器，用于登录失败计数。
 *
 * 环境变量配置：
 *   LOGIN_FAIL_LIMIT   (默认 5)   — 窗口内允许的失败次数
 *   LOGIN_FAIL_WINDOW  (默认 600) — 窗口大小，秒（10 分钟）
 *   LOGIN_LOCK_SECONDS (默认 60)  — 触发后锁定时长，秒（1 分钟）
 *
 * key 由调用方决定；实际对「用户名」和「IP」同时计数，
 * 防止攻击者仅切换单一维度即可绕过限流。
 */

const cfg = () => ({
  limit:   Number(process.env.LOGIN_FAIL_LIMIT)   || 5,
  window:  (Number(process.env.LOGIN_FAIL_WINDOW)  || 600) * 1000,
  lock:    (Number(process.env.LOGIN_LOCK_SECONDS) || 60)  * 1000,
});

const buckets = new Map(); // key -> { fails: number[], lockedUntil: number }  失败时间戳列表 + 锁定到期时刻

function prune(b, now, windowMs) {
  const cutoff = now - windowMs;
  while (b.fails.length && b.fails[0] < cutoff) b.fails.shift();
}

function getBucket(key) {
  let b = buckets.get(key);
  if (!b) { b = { fails: [], lockedUntil: 0 }; buckets.set(key, b); }
  return b;
}

/**
 * 允许尝试则返回 { locked: false }；
 * 处于锁定期则返回 { locked: true, retryAfter: 秒 }。
 */
function check(key, now = Date.now()) {
  const b = buckets.get(key);
  if (!b) return { locked: false };
  if (b.lockedUntil > now) {
    return { locked: true, retryAfter: Math.ceil((b.lockedUntil - now) / 1000) };
  }
  return { locked: false };
}

/**
 * 为 `key` 记录一次失败；窗口内失败次数超阈值时写入锁定时间戳。
 * 返回值即为当前最新的锁定状态。
 */
function recordFailure(key, now = Date.now()) {
  const { limit, window, lock } = cfg();
  const b = getBucket(key);
  prune(b, now, window);
  b.fails.push(now);
  if (b.fails.length >= limit) {
    b.lockedUntil = Math.max(b.lockedUntil, now + lock);
    return { locked: true, retryAfter: Math.ceil((b.lockedUntil - now) / 1000) };
  }
  return { locked: false, remaining: limit - b.fails.length };
}

/** 认证成功时清零该 key 的失败计数 */
function clear(key) {
  buckets.delete(key);
}

/** 仅测试用：清空全部限流状态 */
function _reset() {
  buckets.clear();
}

module.exports = { check, recordFailure, clear, _reset };
