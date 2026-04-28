/**
 * Telegram 通知模块：
 *  - 配置了 TELEGRAM_BOT_TOKEN 和 TELEGRAM_CHAT_ID 时，通过 Bot API 推送到群组
 *  - 否则退回日志输出，便于本地开发与单元测试
 *  - 所有调用为「fire-and-forget」，发送异常不会抛出（业务流程不受影响）
 *
 * 群组接入流程（仅供运维参考）：
 *  1. 在 BotFather 创建机器人，拿到 BOT_TOKEN
 *  2. 让超级管理员 @ergouzi_888 把机器人拉入目标群组并赋管理员权限
 *  3. 在群里发一条消息，访问
 *     https://api.telegram.org/bot<TOKEN>/getUpdates 取出 chat.id（负数）
 *  4. 把 BOT_TOKEN / CHAT_ID 写入 .env 重启后端
 */

const https = require('https');

let _override = null;     // 测试钩子：覆盖底层发送函数

function isEnabled() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

function send(text) {
  if (_override) return Promise.resolve(_override({ text }));
  if (!isEnabled()) {
    // eslint-disable-next-line no-console
    console.log(`[telegram] (log mode) ${text.split('\n')[0]}`);
    return Promise.resolve({ ok: true, transport: 'log' });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ ok: true, transport: 'tg' });
        } else {
          // eslint-disable-next-line no-console
          console.error(`[telegram] send failed status=${res.statusCode} body=${data.slice(0, 200)}`);
          resolve({ ok: false, status: res.statusCode });
        }
      });
    });
    req.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error(`[telegram] send error: ${err.message}`);
      resolve({ ok: false, error: err.message });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

function fmtDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function notifyDeposit({ id, username, user_id, amount, method, ref_info, created_at }) {
  const lines = [
    '🟢 *新充值申请待审核*',
    `用户: ${username || '-'} (UID ${user_id})`,
    `金额: ${Number(amount).toFixed(2)} USD`,
    `通道: ${method || '-'}`,
  ];
  if (ref_info) lines.push(`TX: ${ref_info}`);
  lines.push(`申请时间: ${fmtDate(created_at)}`);
  lines.push(`申请ID: #${id}`);
  lines.push('', '— Captail');
  return send(lines.join('\n'));
}

function notifyWithdraw({ id, username, user_id, amount, method, address,
                         account_name, bank_name, created_at }) {
  const target = address || account_name || bank_name || '-';
  const lines = [
    '🟡 *新提现申请*',
    `用户: ${username || '-'} (UID ${user_id})`,
    `金额: ${Number(amount).toFixed(2)} USDT`,
    `通道: ${method || '-'}`,
    `地址: ${target}`,
    `申请时间: ${fmtDate(created_at)}`,
    `申请ID: #${id}`,
    '',
    '— Captail',
  ];
  return send(lines.join('\n'));
}

/** 仅测试用：替换底层发送通道 */
function _setSender(fn) { _override = fn; }
function _reset() { _override = null; }

module.exports = {
  send, notifyDeposit, notifyWithdraw, isEnabled,
  _setSender, _reset,
};
