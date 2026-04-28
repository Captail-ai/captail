/**
 * 邮件发送模块：
 *  - 配置了 SMTP_HOST 时使用 nodemailer 真实发送
 *  - 否则退回到日志输出，便于本地开发与单元测试
 *  - MAIL_DEV_ECHO=1 时，路由会把验证码一并返回给调用方便于联调
 */

const nodemailer = require('nodemailer');

let _override = null;     // 测试钩子：覆盖底层发送函数
let _transporter = null;  // 复用的 SMTP 连接池

function getTransporter() {
  if (_transporter || !process.env.SMTP_HOST) return _transporter;
  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === '1',  // 465 端口设为 1，587 保持 0（STARTTLS）
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    pool: true,
  });
  return _transporter;
}

const FROM = process.env.MAIL_FROM || 'Captail <captailcn@outlook.com>';

async function sendMail({ to, subject, body }) {
  if (_override) return _override({ to, subject, body });

  const tx = getTransporter();
  if (!tx) {
    // 未配置 SMTP，退回日志模式
    // eslint-disable-next-line no-console
    console.log(`[mail] to=${to} subject=${subject}\n${body}`);
    return { ok: true, transport: 'log' };
  }

  try {
    const info = await tx.sendMail({ from: FROM, to, subject, text: body });
    // eslint-disable-next-line no-console
    console.log(`[mail] sent to=${to} id=${info.messageId}`);
    return { ok: true, transport: 'smtp', id: info.messageId };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[mail] send failed to=${to} err=${err.message}`);
    return { ok: false, error: err.message };
  }
}

function sendVerificationCode(email, code) {
  return sendMail({
    to: email,
    subject: 'Captail 邮箱验证码 / Verification code',
    body: `您的验证码 / Your verification code: ${code}\n\n` +
          `该验证码 10 分钟内有效。\nThis code expires in 10 minutes.`,
  });
}

function devEcho() {
  return process.env.MAIL_DEV_ECHO === '1';
}

/** 仅测试用：替换底层发送通道 */
function _setTransport(fn) { _override = fn; }
function _reset()          { _override = null; _transporter = null; }

module.exports = { sendMail, sendVerificationCode, devEcho, _setTransport, _reset };
