'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { User, Tenant, Membership } = require('../models');
const { ApiError, logger } = require('../utils');

/* ------------------------------------------------------------------ auth */
async function loadUserFromToken(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  let payload;
  try { payload = jwt.verify(token, config.jwt.secret); } catch { throw ApiError.unauthorized('Session expired'); }
  const user = await User.findByPk(payload.sub);
  if (!user || user.status !== 'active') throw ApiError.unauthorized('Account not available');
  return user;
}

const authenticate = async (req, res, next) => {
  try {
    const user = await loadUserFromToken(req);
    if (!user) throw ApiError.unauthorized();
    req.user = user;
    next();
  } catch (e) { next(e); }
};

const optionalAuth = async (req, res, next) => {
  try { req.user = await loadUserFromToken(req); } catch { req.user = null; }
  next();
};

const requireSuperAdmin = (req, res, next) => (req.user?.isSuperAdmin ? next() : next(ApiError.forbidden('Super admin only')));

/* ------------------------------------------------------------------ tenancy */
// Role capability sets. Super admins pass every check.
const CAN = {
  manage: ['owner', 'admin'],
  teach: ['owner', 'admin', 'instructor'],
  mentor: ['owner', 'admin', 'mentor', 'instructor'],
  lead_prayer: ['owner', 'admin', 'prayer_leader'],
  host: ['owner', 'admin', 'instructor', 'mentor', 'prayer_leader'],
  member: ['owner', 'admin', 'instructor', 'mentor', 'prayer_leader', 'learner'],
};
const can = (req, cap) => !!req.user?.isSuperAdmin || (req.membership?.status === 'active' && CAN[cap].includes(req.membership.role));

/** Resolves :slug → req.tenant (+ req.membership when signed in). Active tenants only, unless member-admin/super. */
const loadTenant = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || req.headers['x-tenant'] || '').toLowerCase();
    const tenant = slug && await Tenant.findOne({ where: { slug } });
    if (!tenant) throw ApiError.notFound('Academy not found');
    req.tenant = tenant;
    req.membership = req.user ? await Membership.findOne({ where: { tenantId: tenant.id, userId: req.user.id } }) : null;
    if (tenant.status !== 'active' && !req.user?.isSuperAdmin && !(req.membership && ['owner', 'admin'].includes(req.membership.role))) {
      throw ApiError.notFound('This academy is not available');
    }
    next();
  } catch (e) { next(e); }
};

const requireCap = (cap) => (req, res, next) => (can(req, cap) ? next() : next(ApiError.forbidden(
  cap === 'member' ? 'Join this academy to continue' : 'You do not have permission for this action',
)));

/* ------------------------------------------------------------------ rate limits */
const limiter = (max, windowMs = config.rateLimit.windowMs) => rateLimit({
  windowMs, max, standardHeaders: true, legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ success: false, error: { code: 'TOO_MANY', message: 'Too many requests, please wait and try again' } }),
});
const apiLimiter = limiter(config.rateLimit.max);
const authLimiter = limiter(config.rateLimit.authMax);
const aiLimiter = limiter(30, 10 * 60e3);

/* ------------------------------------------------------------------ uploads */
const KINDS = {
  image: { mimes: /^image\/(png|jpe?g|webp|gif)$/, maxMb: 8 },
  audio: { mimes: /^audio\/(mpeg|mp3|mp4|x-m4a|aac|ogg|wav|webm)$/, maxMb: 150 },
  video: { mimes: /^video\/(mp4|webm|quicktime)$/, maxMb: config.storage.maxUploadMb },
  document: { mimes: /^application\/pdf$/, maxMb: 30 },
};
function uploader(kind) {
  const k = KINDS[kind] || KINDS.image;
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(config.storage.dir, req.tenant ? req.tenant.id : 'platform', kind);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6)}`),
  });
  return multer({
    storage,
    limits: { fileSize: k.maxMb * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => (k.mimes.test(file.mimetype) ? cb(null, true) : cb(ApiError.badRequest(`Unsupported ${kind} file type (${file.mimetype})`))),
  }).single('file');
}

/* ------------------------------------------------------------------ errors */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong';
  let code = err.code || 'INTERNAL';
  if (err.name === 'SequelizeUniqueConstraintError') { status = 409; code = 'CONFLICT'; message = 'That record already exists'; }
  if (err.name === 'SequelizeValidationError') { status = 400; code = 'VALIDATION'; message = err.errors.map((e) => e.message).join('; '); }
  if (err.code === 'LIMIT_FILE_SIZE') { status = 413; code = 'FILE_TOO_LARGE'; message = 'File is too large'; }
  if (status >= 500) { logger.error('request failed', { path: req.originalUrl, err: err.message, stack: err.stack?.split('\n').slice(0, 4).join(' | ') }); if (config.isProd) message = 'Something went wrong. Please try again.'; }
  res.status(status).json({ success: false, error: { code, message, details: err.details } });
}

module.exports = { authenticate, optionalAuth, requireSuperAdmin, loadTenant, requireCap, can, CAN, apiLimiter, authLimiter, aiLimiter, uploader, errorHandler };
