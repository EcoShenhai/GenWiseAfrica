'use strict';
const crypto = require('crypto');

class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code || 'ERROR';
    this.details = details;
  }
  static badRequest(m, d) { return new ApiError(400, m, 'BAD_REQUEST', d); }
  static unauthorized(m = 'Authentication required') { return new ApiError(401, m, 'UNAUTHORIZED'); }
  static forbidden(m = 'You do not have permission for this action') { return new ApiError(403, m, 'FORBIDDEN'); }
  static notFound(m = 'Not found') { return new ApiError(404, m, 'NOT_FOUND'); }
  static conflict(m) { return new ApiError(409, m, 'CONFLICT'); }
  static tooMany(m = 'Too many requests, please wait and try again') { return new ApiError(429, m, 'TOO_MANY'); }
  static internal(m = 'Something went wrong') { return new ApiError(500, m, 'INTERNAL'); }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const log = (level, msg, meta) => {
  const line = { t: new Date().toISOString(), level, msg, ...(meta || {}) };
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
};
const logger = { info: (m, x) => log('info', m, x), warn: (m, x) => log('warn', m, x), error: (m, x) => log('error', m, x) };

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || crypto.randomBytes(3).toString('hex');
}

async function uniqueSlug(Model, base, where = {}) {
  let slug = slugify(base);
  let i = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Model.findOne({ where: { ...where, slug }, paranoid: false })) slug = `${slugify(base)}-${++i}`;
  return slug;
}

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function paginate(req, def = 20, max = 100) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || def, 1), max);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  return { limit, offset: (page - 1) * limit, page };
}

module.exports = { ApiError, asyncHandler, logger, slugify, uniqueSlug, sha256, pick, paginate };
