'use strict';
const router = require('express').Router();
const { Op } = require('sequelize');
const m = require('../models');
const { ApiError, asyncHandler, uniqueSlug, slugify } = require('../utils');
const { authenticate } = require('../middleware');
const { audit, notify } = require('../services/common');
const certSvc = require('../services/certificate');

router.use(authenticate);

/* Apply to start an academy (tenant). Starts pending until a super admin approves. */
router.post('/academies', asyncHandler(async (req, res) => {
  const { name, type, tagline, about, country, city, denomination, contactPhone, website, slug: wanted } = req.body;
  if (!name || String(name).trim().length < 3) throw ApiError.badRequest('Academy name is required');
  const RESERVED = ['admin', 'api', 'app', 'www', 'genwise', 'login', 'register', 'support', 'help'];
  let slug = slugify(wanted || name);
  if (RESERVED.includes(slug)) slug = `${slug}-academy`;
  if (await m.Tenant.findOne({ where: { slug } })) slug = await uniqueSlug(m.Tenant, slug);
  const isSA = req.user.isSuperAdmin;
  const t = await m.Tenant.create({
    name: String(name).trim().slice(0, 160), slug, type: ['church', 'ministry', 'mentor', 'organisation'].includes(type) ? type : 'church',
    tagline, about, country: country || 'Kenya', city, denomination, contactPhone, website, contactEmail: req.user.email,
    ownerId: req.user.id, status: isSA ? 'active' : 'pending', approvedAt: isSA ? new Date() : null, approvedBy: isSA ? req.user.id : null,
  });
  await m.Membership.create({ tenantId: t.id, userId: req.user.id, role: 'owner', status: 'active' });
  await audit(req, 'tenant.applied', { tenantId: t.id, entityType: 'tenant', entityId: t.id });
  if (!isSA) {
    const admins = await m.User.findAll({ where: { isSuperAdmin: true } });
    for (const a of admins) await notify(a.id, { type: 'approval', title: 'New academy awaiting approval', body: `${t.name} (${t.type}) was submitted by ${req.user.fullName}.`, link: '/admin/academies', emailTo: a.email });
  }
  res.status(201).json({ success: true, data: t });
}));

router.get('/learning', asyncHandler(async (req, res) => {
  const rows = await m.Enrollment.findAll({
    where: { userId: req.user.id },
    include: [{ model: m.Course, attributes: ['id', 'title', 'slug', 'coverUrl', 'summary', 'tenantId'], include: [{ model: m.Tenant, attributes: ['name', 'slug'] }] }],
    order: [['updatedAt', 'DESC']],
  });
  res.json({ success: true, data: rows });
}));

router.get('/upcoming', asyncHandler(async (req, res) => {
  const tenantIds = (await m.Membership.findAll({ where: { userId: req.user.id, status: 'active' }, attributes: ['tenantId'] })).map((x) => x.tenantId);
  const meetings = await m.Meeting.findAll({
    where: { tenantId: tenantIds, startsAt: { [Op.gte]: new Date(Date.now() - 2 * 3600e3) }, status: { [Op.in]: ['scheduled', 'live'] } },
    order: [['startsAt', 'ASC']], limit: 10,
  });
  const tenants = await m.Tenant.findAll({ where: { id: tenantIds }, attributes: ['id', 'slug', 'name'] });
  const tm = Object.fromEntries(tenants.map((t) => [t.id, t]));
  res.json({ success: true, data: meetings.map((x) => ({ ...x.toJSON(), academy: tm[x.tenantId] })) });
}));

router.get('/certificates', asyncHandler(async (req, res) => {
  const rows = await m.Certificate.findAll({ where: { userId: req.user.id }, include: [{ model: m.Course, attributes: ['title'] }, { model: m.Tenant, attributes: ['name', 'slug'] }], order: [['issuedAt', 'DESC']] });
  res.json({ success: true, data: rows });
}));

router.get('/certificates/:id/pdf', asyncHandler(async (req, res) => {
  const c = await m.Certificate.findOne({
    where: { id: req.params.id, ...(req.user.isSuperAdmin ? {} : { userId: req.user.id }) },
    include: [{ model: m.User, attributes: ['fullName'] }, { model: m.Course, include: [{ model: m.User, as: 'instructor', attributes: ['fullName'] }] }, { model: m.Tenant, attributes: ['name'] }],
  });
  if (!c) throw ApiError.notFound('Certificate not found');
  await certSvc.renderPdf(res, { serial: c.serial, learnerName: c.User.fullName, courseTitle: c.Course.title, academyName: c.Tenant.name, issuedAt: c.issuedAt, instructorName: c.Course.instructor?.fullName });
}));

router.get('/notifications', asyncHandler(async (req, res) => {
  const rows = await m.Notification.findAll({ where: { userId: req.user.id }, order: [['createdAt', 'DESC']], limit: 30 });
  const unread = await m.Notification.count({ where: { userId: req.user.id, readAt: null } });
  res.json({ success: true, data: { items: rows, unread } });
}));

router.post('/notifications/read-all', asyncHandler(async (req, res) => {
  await m.Notification.update({ readAt: new Date() }, { where: { userId: req.user.id, readAt: null } });
  res.json({ success: true, data: { ok: true } });
}));

module.exports = router;
