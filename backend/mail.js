/**
 * 邮件发送占位模块。目前没有对接真实 SMTP — 仅把邮件写到日志；
 * 当 MAIL_DEV_ECHO=1 时，路由会把验证码一并返回给调用方便于本地联调。
 * 上线时请替换为 nodemailer / SES / Resend 等真实集成。
 */

let _override = null; // 测试钩子：覆盖底层发送函数

function sendMail({ to, subject, body }) {
  if (_override) return _override({ to, subject, body });
  // eslint-disable-next-line no-console
  console.log(`[mail] to=${to} subject=${subject}\n${body}`);
  return { ok: true };
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
function _reset()          { _override = null; }

module.exports = { sendMail, sendVerificationCode, devEcho, _setTransport, _reset };
