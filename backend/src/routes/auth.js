'use strict';
const router = require('express').Router();
const config = require('../config');
const { User, RefreshToken, Membership, Tenant } = require('../models');
const { ApiError, asyncHandler, sha256 } = require('../utils');
const { authenticate, authLimiter } = require('../middleware');
const codes = require('../services/codeService');
const { signAccess, signMfa, verifyMfa, issueSession, audit } = require('../services/common');

const COOKIE = 'gw_rt';
const cookieOpts = { httpOnly: true, secure: config.isProd, sameSite: 'lax', path: '/api/v1/auth', maxAge: 7 * 24 * 3600e3 };
const readCookie = (req, name) => {
  const m = String(req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name}=`));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function checkPassword(pw) {
  const s = String(pw || '');
  if (s.length < 8 || !/[A-Za-z]/.test(s) || !/\d/.test(s)) throw ApiError.badRequest('Password must be at least 8 characters and include a letter and a number');
  return s;
}

async function memberships(userId) {
  const rows = await Membership.findAll({
    where: { userId, status: ['active', 'pending'] },
    include: [{ model: Tenant, attributes: ['id', 'name', 'slug', 'logoUrl', 'status', 'primaryColor', 'type'] }],
    order: [['createdAt', 'ASC']],
  });
  return rows.map((m) => ({ role: m.role, status: m.status, tenant: m.Tenant }));
}

async function sessionResponse(req, res, user) {
  const { accessToken, refreshToken } = await issueSession(req, user);
  res.cookie(COOKIE, refreshToken, cookieOpts);
  await audit(req, 'auth.login', { entityType: 'user', entityId: user.id });
  res.json({ success: true, data: { accessToken, user: user.toSafeJSON(), memberships: await memberships(user.id) } });
}

function tokenFrom(req, purpose) {
  try { return verifyMfa(String(req.body.mfaToken || ''), purpose); } catch { throw ApiError.badRequest('Your verification session expired. Please start again.'); }
}

router.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const { fullName, email, phone, password, country, academySlug } = req.body;
  if (!fullName || !email || !password) throw ApiError.badRequest('Full name, email and password are required');
  if (!EMAIL_RE.test(String(email).trim())) throw ApiError.badRequest('Please enter a valid email address');
  checkPassword(password);
  const norm = String(email).trim().toLowerCase();
  if (await User.findOne({ where: { email: norm } })) throw ApiError.conflict('An account with this email already exists. Please sign in.');
  const user = User.build({ fullName: String(fullName).trim().slice(0, 160), email: norm, phone, country: country || 'Kenya' });
  await user.setPassword(password);
  await user.save();
  if (academySlug) {
    const t = await Tenant.findOne({ where: { slug: String(academySlug).toLowerCase(), status: 'active' } });
    if (t) await Membership.findOrCreate({ where: { tenantId: t.id, userId: user.id }, defaults: { role: 'learner', status: t.joinPolicy === 'open' ? 'active' : 'pending' } });
  }
  const sent = await codes.issueCode({ user, purpose: 'verify_email', ip: req.ip, enforceCooldown: false });
  await audit(req, 'auth.register', { entityType: 'user', entityId: user.id });
  res.status(201).json({ success: true, data: { next: 'verify_email', email: user.email, mfaToken: signMfa(user, 'verify_email'), devCode: sent.devCode } });
}));

router.post('/verify-email', authLimiter, asyncHandler(async (req, res) => {
  const p = tokenFrom(req, 'verify_email');
  const user = await User.scope('withSecret').findByPk(p.sub);
  if (!user) throw ApiError.badRequest('Invalid or expired code');
  if (!(await codes.verifyCode({ userId: user.id, purpose: 'verify_email', code: req.body.code }))) throw ApiError.badRequest('Invalid or expired code');
  user.emailVerifiedAt = new Date();
  await user.save();
  await audit(req, 'auth.email_verified', { entityType: 'user', entityId: user.id });
  await sessionResponse(req, res, user);
}));

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw ApiError.badRequest('Email and password are required');
  const user = await User.scope('withSecret').findOne({ where: { email: String(email).trim().toLowerCase() } });
  if (!user || !(await user.validatePassword(password))) {
    if (user) await audit(req, 'auth.login.failed', { entityType: 'user', entityId: user.id });
    throw ApiError.unauthorized('Incorrect email or password');
  }
  if (user.status !== 'active') throw ApiError.forbidden('This account is suspended. Contact support@genwiseafrica.org');
  const purpose = user.emailVerifiedAt ? 'login' : 'verify_email';
  let sent = {};
  try { sent = await codes.issueCode({ user, purpose, ip: req.ip }); } catch (e) { if (e.code !== 'COOLDOWN') throw e; }
  res.json({
    success: true,
    data: {
      next: purpose === 'login' ? 'mfa' : 'verify_email', email: user.email, mfaToken: signMfa(user, purpose), devCode: sent.devCode,
      message: purpose === 'login' ? 'We sent a sign-in code to your email.' : 'Please verify your email. We sent you a code.',
    },
  });
}));

router.post('/verify-mfa', authLimiter, asyncHandler(async (req, res) => {
  const p = tokenFrom(req, 'login');
  const user = await User.scope('withSecret').findByPk(p.sub);
  if (!user || user.status !== 'active') throw ApiError.unauthorized('Account not available');
  if (!(await codes.verifyCode({ userId: user.id, purpose: 'login', code: req.body.code }))) throw ApiError.unauthorized('Invalid or expired code');
  await sessionResponse(req, res, user);
}));

router.post('/resend-code', authLimiter, asyncHandler(async (req, res) => {
  let p; let purpose;
  for (const pur of ['login', 'verify_email']) {
    try { p = verifyMfa(String(req.body.mfaToken || ''), pur); purpose = pur; break; } catch { /* try next */ }
  }
  if (!p) throw ApiError.badRequest('Your verification session expired. Please start again.');
  const user = await User.findByPk(p.sub);
  if (!user || user.status !== 'active') throw ApiError.badRequest('Unable to resend code');
  const sent = await codes.issueCode({ user, purpose, ip: req.ip });
  res.json({ success: true, data: { ok: true, mfaToken: signMfa(user, purpose), devCode: sent.devCode, message: 'A new code is on its way.' } });
}));

router.post('/forgot-password', authLimiter, asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) throw ApiError.badRequest('Email is required');
  const user = await User.findOne({ where: { email } });
  let devCode;
  if (user && user.status === 'active') {
    try { devCode = (await codes.issueCode({ user, purpose: 'reset_password', ip: req.ip })).devCode; } catch (e) { if (e.status !== 429) throw e; }
    await audit(req, 'auth.forgot_password', { entityType: 'user', entityId: user.id });
  }
  res.json({ success: true, data: { ok: true, devCode, message: 'If an account exists for that email, a reset code has been sent.' } });
}));

router.post('/reset-password', authLimiter, asyncHandler(async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) throw ApiError.badRequest('Email, code and new password are required');
  checkPassword(newPassword);
  const user = await User.scope('withSecret').findOne({ where: { email: String(email).trim().toLowerCase() } });
  const ok = user ? await codes.verifyCode({ userId: user.id, purpose: 'reset_password', code }) : false;
  if (!ok) throw ApiError.badRequest('Invalid or expired code');
  await user.setPassword(newPassword);
  if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date();
  await user.save();
  await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: user.id, revokedAt: null } });
  await audit(req, 'auth.password_reset', { entityType: 'user', entityId: user.id });
  res.json({ success: true, data: { ok: true, next: 'login', message: 'Your password has been reset. Please sign in.' } });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const token = readCookie(req, COOKIE) || req.body.refreshToken;
  if (!token) throw ApiError.unauthorized('No session');
  const stored = await RefreshToken.findOne({ where: { tokenHash: sha256(token), revokedAt: null } });
  if (!stored || stored.expiresAt < new Date()) throw ApiError.unauthorized('Session expired');
  const user = await User.findByPk(stored.userId);
  if (!user || user.status !== 'active') throw ApiError.unauthorized('Account not available');
  res.json({ success: true, data: { accessToken: signAccess(user), user: user.toSafeJSON(), memberships: await memberships(user.id) } });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const token = readCookie(req, COOKIE) || req.body.refreshToken;
  if (token) await RefreshToken.update({ revokedAt: new Date() }, { where: { tokenHash: sha256(token) } });
  res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined });
  res.json({ success: true, data: { ok: true } });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user.toSafeJSON(), memberships: await memberships(req.user.id) } });
}));

router.patch('/me', authenticate, asyncHandler(async (req, res) => {
  const { fullName, phone, bio, country, avatarUrl } = req.body;
  await req.user.update({ ...(fullName ? { fullName: String(fullName).slice(0, 160) } : {}), phone, bio, country, avatarUrl });
  res.json({ success: true, data: { user: req.user.toSafeJSON() } });
}));

router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const user = await User.scope('withSecret').findByPk(req.user.id);
  if (!(await user.validatePassword(req.body.currentPassword))) throw ApiError.unauthorized('Current password is incorrect');
  await user.setPassword(checkPassword(req.body.newPassword));
  await user.save();
  await RefreshToken.update({ revokedAt: new Date() }, { where: { userId: user.id, revokedAt: null } });
  await audit(req, 'auth.password_changed', { entityType: 'user', entityId: user.id });
  res.json({ success: true, data: { ok: true } });
}));

module.exports = router;
module.exports.memberships = memberships;
