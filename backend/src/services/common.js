'use strict';
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const { RefreshToken, AuditLog, Notification } = require('../models');
const { sha256, logger } = require('../utils');
const email = require('./email');

/* ------------------------------------------------------------------ tokens */
const signAccess = (user) => jwt.sign({ sub: user.id, sa: !!user.isSuperAdmin }, config.jwt.secret, { expiresIn: config.jwt.accessExpiresIn });
const signMfa = (user, purpose) => jwt.sign({ sub: user.id, purpose }, config.jwt.mfaSecret, { expiresIn: config.jwt.mfaExpiresIn });
const verifyMfa = (token, purpose) => {
  const p = jwt.verify(token, config.jwt.mfaSecret);
  if (p.purpose !== purpose) throw new Error('wrong purpose');
  return p;
};

async function issueSession(req, user) {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  await RefreshToken.create({
    userId: user.id, tokenHash: sha256(refreshToken), userAgent: String(req.headers['user-agent'] || '').slice(0, 300),
    expiresAt: new Date(Date.now() + 7 * 24 * 3600e3),
  });
  user.lastLoginAt = new Date();
  await user.save();
  return { accessToken: signAccess(user), refreshToken };
}

/* ------------------------------------------------------------------ audit + notify */
async function audit(req, action, { tenantId, entityType, entityId, meta } = {}) {
  try {
    await AuditLog.create({
      tenantId: tenantId || req?.tenant?.id || null, actorId: req?.user?.id || null, action,
      entityType, entityId: entityId ? String(entityId) : null, meta: meta || {}, ip: req?.ip,
    });
  } catch (e) { logger.warn('audit failed', { action, err: e.message }); }
}

async function notify(userId, { tenantId, type = 'info', title, body, link, emailTo }) {
  try {
    await Notification.create({ userId, tenantId, type, title, body, link });
    if (emailTo) {
      email.sendQuiet({
        to: emailTo, subject: title, text: `${body || ''}\n\n${link ? config.frontendUrl + link : ''}`,
        html: email.layout({ title, bodyHtml: `<h2 style="font-family:Georgia,serif;color:#0E0637;margin:0 0 12px">${email.esc(title)}</h2><p style="line-height:1.6">${email.esc(body || '')}</p>${link ? email.button('Open GenWise', config.frontendUrl + link) : ''}` }),
      });
    }
  } catch (e) { logger.warn('notify failed', { err: e.message }); }
}

module.exports = { signAccess, signMfa, verifyMfa, issueSession, audit, notify };
