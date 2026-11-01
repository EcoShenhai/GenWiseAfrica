'use strict';
/**
 * Emailed one-time codes (verify_email | login | reset_password).
 * Pattern follows Shenhai Worker/EcoMeet: 6 digits, stored hashed, single use,
 * prior unused codes invalidated, 10-minute expiry, plus attempt limits and resend cooldown.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const { AuthCode } = require('../models');
const config = require('../config');
const email = require('./email');
const { ApiError, logger } = require('../utils');

const PURPOSES = {
  verify_email: { subject: 'Verify your GenWise Africa account', line: 'Use this code to verify your email address and activate your account' },
  login: { subject: 'Your GenWise Africa sign-in code', line: 'Use this code to complete your sign-in' },
  reset_password: { subject: 'Reset your GenWise Africa password', line: 'Use this code to reset your password' },
};

const hash = (code) => crypto.createHmac('sha256', config.codes.pepper).update(String(code)).digest('hex');
const generate = () => String(crypto.randomInt(0, 10 ** config.codes.length)).padStart(config.codes.length, '0');

async function issueCode({ user, purpose, ip, enforceCooldown = true }) {
  const p = PURPOSES[purpose];
  if (!p) throw new Error(`Unknown code purpose ${purpose}`);

  if (enforceCooldown) {
    const last = await AuthCode.findOne({ where: { userId: user.id, purpose }, order: [['createdAt', 'DESC']] });
    if (last && Date.now() - new Date(last.createdAt).getTime() < config.codes.resendCooldownSec * 1000) {
      const wait = Math.ceil((config.codes.resendCooldownSec * 1000 - (Date.now() - new Date(last.createdAt).getTime())) / 1000);
      throw new ApiError(429, `Please wait ${wait}s before requesting another code`, 'COOLDOWN', { retryAfter: wait });
    }
    const hourCount = await AuthCode.count({ where: { userId: user.id, purpose, createdAt: { [Op.gt]: new Date(Date.now() - 3600e3) } } });
    if (hourCount >= config.codes.maxPerHour) throw ApiError.tooMany('Too many codes requested. Please try again in an hour.');
  }

  await AuthCode.update({ consumedAt: new Date() }, { where: { userId: user.id, purpose, consumedAt: null } });
  const code = generate();
  const expiresAt = new Date(Date.now() + config.codes.ttlMin * 60e3);
  await AuthCode.create({ userId: user.id, purpose, codeHash: hash(code), expiresAt, ip });

  const name = (user.fullName || '').split(' ')[0];
  const spaced = code.split('').join(' ');
  const text = `Hello ${name || 'there'},\n\n${p.line}:\n\n    ${code}\n\nThis code expires in ${config.codes.ttlMin} minutes. If you did not request it, you can ignore this email.\n\n— GenWise Africa\nThink Wise. Live Wise. Lead Generations.`;
  const html = email.layout({
    title: p.subject,
    preheader: `Your code is ${code}`,
    bodyHtml: `<p style="font-size:16px;margin:0 0 12px">Hello ${email.esc(name || 'there')},</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 20px">${email.esc(p.line)}:</p>
      <div style="text-align:center;margin:24px 0"><span style="display:inline-block;font-family:Consolas,monospace;font-size:34px;letter-spacing:8px;font-weight:bold;color:#0E0637;background:#F6F1E4;border:2px solid #C9A34E;border-radius:12px;padding:14px 22px">${spaced}</span></div>
      <p style="font-size:13px;color:#5B5770;line-height:1.6">This code expires in <b>${config.codes.ttlMin} minutes</b>. If you did not request it, you can safely ignore this email.</p>`,
  });
  await email.send({ to: user.email, subject: p.subject, text, html });
  logger.info('auth code issued', { purpose, userId: user.id });
  return { expiresAt, devCode: config.email.devLog && !config.isProd ? code : undefined };
}

/** Returns true and consumes the code on success. Burns the code after too many attempts. */
async function verifyCode({ userId, purpose, code }) {
  const row = await AuthCode.findOne({
    where: { userId, purpose, consumedAt: null, expiresAt: { [Op.gt]: new Date() } },
    order: [['createdAt', 'DESC']],
  });
  if (!row) return false;
  if (row.attempts >= config.codes.maxAttempts) {
    await row.update({ consumedAt: new Date() });
    return false;
  }
  const ok = crypto.timingSafeEqual(Buffer.from(hash(String(code || '').trim())), Buffer.from(row.codeHash));
  if (!ok) {
    await row.increment('attempts');
    if (row.attempts + 1 >= config.codes.maxAttempts) await row.update({ consumedAt: new Date() });
    return false;
  }
  await row.update({ consumedAt: new Date() });
  return true;
}

module.exports = { issueCode, verifyCode, PURPOSES };
