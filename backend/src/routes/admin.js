'use strict';
const router = require('express').Router();
const { Op, fn, col } = require('sequelize');
const m = require('../models');
const { ApiError, asyncHandler, paginate, pick } = require('../utils');
const { authenticate, requireSuperAdmin } = require('../middleware');
const { audit, notify } = require('../services/common');

router.use(authenticate, requireSuperAdmin);

router.get('/stats', asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 3600e3);
  const [users, newUsers, tenants, pendingTenants, courses, enrollments, meetings, pendingPayments, approvedKes, aiTokens] = await Promise.all([
    m.User.count(), m.User.count({ where: { createdAt: { [Op.gte]: since } } }),
    m.Tenant.count({ where: { status: 'active' } }), m.Tenant.count({ where: { status: 'pending' } }),
    m.Course.count(), m.Enrollment.count(), m.Meeting.count({ where: { startsAt: { [Op.gte]: new Date() } } }),
    m.Payment.count({ where: { status: 'pending' } }), m.Payment.sum('amountKes', { where: { status: 'approved' } }),
    m.AiInteraction.findOne({ attributes: [[fn('COALESCE', fn('SUM', col('completion_tokens')), 0), 't']], where: { createdAt: { [Op.gte]: since } }, raw: true }),
  ]);
  res.json({ success: true, data: { users, newUsers30d: newUsers, activeAcademies: tenants, pendingAcademies: pendingTenants, courses, enrollments, upcomingMeetings: meetings, pendingPayments, approvedKes: approvedKes || 0, aiTokens30d: Number(aiTokens?.t || 0) } });
}));

router.get('/tenants', asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.q) where.name = { [Op.iLike]: `%${req.query.q}%` };
  const rows = await m.Tenant.findAll({ where, include: [{ model: m.User, as: 'owner', attributes: ['fullName', 'email', 'phone'] }], order: [['createdAt', 'DESC']], limit: 200 });
  res.json({ success: true, data: rows });
}));

router.patch('/tenants/:id', asyncHandler(async (req, res) => {
  const t = await m.Tenant.findByPk(req.params.id, { include: [{ model: m.User, as: 'owner' }] });
  if (!t) throw ApiError.notFound('Academy not found');
  const { status, statusNote, planCode, planRenewsAt } = req.body;
  if (status && !['pending', 'active', 'suspended', 'rejected'].includes(status)) throw ApiError.badRequest('Invalid status');
  const before = t.status;
  await t.update({ ...pick({ status, statusNote, planCode, planRenewsAt }, ['status', 'statusNote', 'planCode', 'planRenewsAt']), ...(status === 'active' && !t.approvedAt ? { approvedAt: new Date(), approvedBy: req.user.id } : {}) });
  if (status && status !== before && t.owner) {
    const msg = { active: ['Your academy is live!', `${t.name} has been approved. Start adding courses, podcasts and live classes.`], suspended: ['Your academy was suspended', statusNote || 'Please contact support@genwiseafrica.org.'], rejected: ['Your academy application', statusNote || 'Unfortunately we could not approve your application at this time.'] }[status];
    if (msg) await notify(t.owner.id, { tenantId: t.id, type: 'academy', title: msg[0], body: msg[1], link: `/app/a/${t.slug}`, emailTo: t.owner.email });
  }
  await audit(req, 'admin.tenant.updated', { tenantId: t.id, entityType: 'tenant', entityId: t.id, meta: { status, planCode } });
  res.json({ success: true, data: t });
}));

router.get('/payments', asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  const rows = await m.Payment.findAll({ where, include: [{ model: m.Tenant, attributes: ['name', 'slug'] }, { model: m.User, attributes: ['fullName', 'email'] }], order: [['createdAt', 'DESC']], limit: 200 });
  res.json({ success: true, data: rows });
}));

router.patch('/payments/:id', asyncHandler(async (req, res) => {
  const p = await m.Payment.findByPk(req.params.id, { include: [m.Tenant, m.User] });
  if (!p) throw ApiError.notFound('Payment not found');
  const { status, notes } = req.body;
  if (!['approved', 'rejected'].includes(status)) throw ApiError.badRequest('Status must be approved or rejected');
  if (p.status !== 'pending') throw ApiError.badRequest('This payment was already reviewed');
  await p.update({ status, notes: notes || p.notes, reviewedBy: req.user.id, reviewedAt: new Date() });
  if (status === 'approved' && p.Tenant && p.kind === 'subscription' && p.planCode) {
    const base = p.Tenant.planRenewsAt && p.Tenant.planRenewsAt > new Date() ? new Date(p.Tenant.planRenewsAt) : new Date();
    base.setMonth(base.getMonth() + 1);
    await p.Tenant.update({ planCode: p.planCode, planRenewsAt: base });
  }
  await notify(p.userId, {
    tenantId: p.tenantId, type: 'payment',
    title: status === 'approved' ? 'Thank you — payment received' : 'Payment could not be confirmed',
    body: status === 'approved' ? `We confirmed your M-Pesa payment of KES ${p.amountKes.toLocaleString()} (${p.mpesaCode}). God bless you!` : `We could not match M-Pesa code ${p.mpesaCode}. ${notes || 'Please check the code and resubmit.'}`,
    link: p.Tenant ? `/app/a/${p.Tenant.slug}/manage` : '/app', emailTo: p.User?.email,
  });
  await audit(req, `admin.payment.${status}`, { tenantId: p.tenantId, entityType: 'payment', entityId: p.id, meta: { amountKes: p.amountKes } });
  res.json({ success: true, data: p });
}));

router.get('/users', asyncHandler(async (req, res) => {
  const { limit, offset } = paginate(req, 50, 200);
  const where = {};
  if (req.query.q) where[Op.or] = [{ fullName: { [Op.iLike]: `%${req.query.q}%` } }, { email: { [Op.iLike]: `%${req.query.q}%` } }];
  const { rows, count } = await m.User.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit, offset });
  res.json({ success: true, data: { items: rows.map((u) => u.toSafeJSON()), total: count } });
}));

router.patch('/users/:id', asyncHandler(async (req, res) => {
  const u = await m.User.findByPk(req.params.id);
  if (!u) throw ApiError.notFound('User not found');
  if (u.id === req.user.id && (req.body.status === 'suspended' || req.body.isSuperAdmin === false)) throw ApiError.badRequest('You cannot suspend or demote yourself');
  await u.update(pick(req.body, ['status', 'isSuperAdmin']));
  await audit(req, 'admin.user.updated', { entityType: 'user', entityId: u.id, meta: pick(req.body, ['status', 'isSuperAdmin']) });
  res.json({ success: true, data: u.toSafeJSON() });
}));

router.get('/plans', asyncHandler(async (req, res) => res.json({ success: true, data: await m.Plan.findAll({ order: [['position', 'ASC']] }) })));
router.patch('/plans/:id', asyncHandler(async (req, res) => {
  const p = await m.Plan.findByPk(req.params.id);
  if (!p) throw ApiError.notFound('Plan not found');
  await p.update(pick(req.body, ['name', 'tagline', 'priceKes', 'features', 'isActive', 'position']));
  res.json({ success: true, data: p });
}));

router.get('/audit', asyncHandler(async (req, res) => {
  const rows = await m.AuditLog.findAll({ include: [{ model: m.User, as: 'actor', attributes: ['fullName', 'email'] }], order: [['createdAt', 'DESC']], limit: 200 });
  res.json({ success: true, data: rows });
}));

module.exports = router;
