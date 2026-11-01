'use strict';
const express = require('express');
const path = require('path');
const { Op } = require('sequelize');
const config = require('../../config');
const m = require('../../models');
const { ApiError, asyncHandler, pick } = require('../../utils');
const { optionalAuth, authenticate, loadTenant, requireCap, can, uploader } = require('../../middleware');
const { audit, notify } = require('../../services/common');

const router = express.Router({ mergeParams: true });
router.use(optionalAuth, loadTenant);

const ROLES = ['owner', 'admin', 'instructor', 'mentor', 'prayer_leader', 'learner'];

/* ------------------------------------------------------------------ overview */
router.get('/', asyncHandler(async (req, res) => {
  const t = req.tenant;
  const caps = Object.fromEntries(['manage', 'teach', 'mentor', 'lead_prayer', 'host', 'member'].map((c) => [c, can(req, c)]));
  res.json({ success: true, data: { academy: t, membership: req.membership, caps } });
}));

router.post('/join', authenticate, asyncHandler(async (req, res) => {
  const t = req.tenant;
  if (t.status !== 'active') throw ApiError.badRequest('This academy is not accepting members yet');
  let mem = req.membership;
  if (mem && mem.status === 'active') return res.json({ success: true, data: mem });
  const status = t.joinPolicy === 'open' ? 'active' : 'pending';
  if (mem) await mem.update({ status, role: mem.role || 'learner' });
  else mem = await m.Membership.create({ tenantId: t.id, userId: req.user.id, role: 'learner', status });
  if (status === 'pending') {
    const admins = await m.Membership.findAll({ where: { tenantId: t.id, role: ['owner', 'admin'], status: 'active' }, include: [m.User] });
    for (const a of admins) await notify(a.userId, { tenantId: t.id, title: 'New member request', body: `${req.user.fullName} asked to join ${t.name}.`, link: `/app/a/${t.slug}/manage` });
  }
  await audit(req, 'member.joined', { entityType: 'membership', entityId: mem.id, meta: { status } });
  res.status(201).json({ success: true, data: mem });
}));

router.post('/leave', authenticate, asyncHandler(async (req, res) => {
  if (!req.membership) throw ApiError.badRequest('You are not a member');
  if (req.membership.role === 'owner') throw ApiError.badRequest('The owner cannot leave the academy');
  await req.membership.update({ status: 'removed' });
  res.json({ success: true, data: { ok: true } });
}));

/* ------------------------------------------------------------------ members */
router.get('/members', authenticate, requireCap('member'), asyncHandler(async (req, res) => {
  const where = { tenantId: req.tenant.id };
  if (req.query.status) where.status = req.query.status; else where.status = { [Op.ne]: 'removed' };
  if (req.query.role) where.role = req.query.role;
  const manage = can(req, 'manage');
  if (!manage) where.role = { [Op.ne]: 'learner' }; // learners see staff directory only
  const rows = await m.Membership.findAll({ where, include: [{ model: m.User, attributes: ['id', 'fullName', 'email', 'avatarUrl', 'phone', 'country'] }], order: [['createdAt', 'DESC']], limit: 500 });
  res.json({ success: true, data: rows.map((r) => { const j = r.toJSON(); if (!manage) { delete j.User.email; delete j.User.phone; } return j; }) });
}));

router.patch('/members/:id', authenticate, requireCap('manage'), asyncHandler(async (req, res) => {
  const mem = await m.Membership.findOne({ where: { id: req.params.id, tenantId: req.tenant.id }, include: [m.User] });
  if (!mem) throw ApiError.notFound('Member not found');
  const { role, status } = req.body;
  if (role && !ROLES.includes(role)) throw ApiError.badRequest('Invalid role');
  const actorIsOwner = req.membership?.role === 'owner' || req.user.isSuperAdmin;
  if ((mem.role === 'owner' || role === 'owner') && !actorIsOwner) throw ApiError.forbidden('Only the owner can change ownership');
  if (mem.role === 'owner' && role && role !== 'owner') {
    const owners = await m.Membership.count({ where: { tenantId: req.tenant.id, role: 'owner', status: 'active' } });
    if (owners <= 1) throw ApiError.badRequest('An academy must keep at least one owner');
  }
  const wasPending = mem.status === 'pending';
  await mem.update(pick({ role, status }, ['role', 'status']));
  if (wasPending && mem.status === 'active') await notify(mem.userId, { tenantId: req.tenant.id, title: `Welcome to ${req.tenant.name}`, body: 'Your membership has been approved.', link: `/app/a/${req.tenant.slug}`, emailTo: mem.User.email });
  await audit(req, 'member.updated', { entityType: 'membership', entityId: mem.id, meta: { role, status } });
  res.json({ success: true, data: mem });
}));

router.post('/members/add', authenticate, requireCap('manage'), asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = ROLES.includes(req.body.role) && req.body.role !== 'owner' ? req.body.role : 'learner';
  const user = await m.User.findOne({ where: { email } });
  if (!user) throw ApiError.notFound('No GenWise account uses that email yet. Ask them to register first, then add them.');
  const [mem, created] = await m.Membership.findOrCreate({ where: { tenantId: req.tenant.id, userId: user.id }, defaults: { role, status: 'active' } });
  if (!created) await mem.update({ role, status: 'active' });
  await notify(user.id, { tenantId: req.tenant.id, title: `You were added to ${req.tenant.name}`, body: `You now have the ${role.replace('_', ' ')} role.`, link: `/app/a/${req.tenant.slug}`, emailTo: user.email });
  res.status(201).json({ success: true, data: mem });
}));

/* ------------------------------------------------------------------ settings */
router.patch('/settings', authenticate, requireCap('manage'), asyncHandler(async (req, res) => {
  const fields = ['name', 'tagline', 'about', 'logoUrl', 'coverUrl', 'primaryColor', 'welcomeVerse', 'country', 'city', 'denomination', 'website', 'contactEmail', 'contactPhone', 'joinPolicy', 'type'];
  const data = pick(req.body, fields);
  if (data.joinPolicy && !['open', 'approval'].includes(data.joinPolicy)) throw ApiError.badRequest('Invalid join policy');
  if (data.primaryColor && !/^#[0-9a-fA-F]{6}$/.test(data.primaryColor)) throw ApiError.badRequest('Colour must be like #0B6E4F');
  await req.tenant.update(data);
  await audit(req, 'tenant.settings', { entityType: 'tenant', entityId: req.tenant.id });
  res.json({ success: true, data: req.tenant });
}));

/* ------------------------------------------------------------------ uploads */
router.post('/uploads/:kind', authenticate, requireCap('host'), (req, res, next) => {
  if (!['image', 'audio', 'video', 'document'].includes(req.params.kind)) return next(ApiError.badRequest('Unknown upload kind'));
  return uploader(req.params.kind)(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return next(ApiError.badRequest('No file received'));
    const rel = path.relative(config.storage.dir, req.file.path).split(path.sep).join('/');
    return res.status(201).json({ success: true, data: { url: `/uploads/${rel}`, size: req.file.size, mime: req.file.mimetype, name: req.file.originalname } });
  });
});

/* ------------------------------------------------------------------ dashboard */
router.get('/dashboard', authenticate, requireCap('manage'), asyncHandler(async (req, res) => {
  const tid = req.tenant.id;
  const [members, pending, courses, enrollments, completions, meetings, shows, groups, mentorships, certificates] = await Promise.all([
    m.Membership.count({ where: { tenantId: tid, status: 'active' } }),
    m.Membership.count({ where: { tenantId: tid, status: 'pending' } }),
    m.Course.count({ where: { tenantId: tid } }),
    m.Enrollment.count({ where: { tenantId: tid } }),
    m.Enrollment.count({ where: { tenantId: tid, completedAt: { [Op.ne]: null } } }),
    m.Meeting.count({ where: { tenantId: tid, startsAt: { [Op.gte]: new Date() } } }),
    m.PodcastShow.count({ where: { tenantId: tid } }),
    m.PrayerGroup.count({ where: { tenantId: tid } }),
    m.Mentorship.count({ where: { tenantId: tid, status: 'active' } }),
    m.Certificate.count({ where: { tenantId: tid } }),
  ]);
  res.json({ success: true, data: { members, pending, courses, enrollments, completions, upcomingMeetings: meetings, podcasts: shows, prayerGroups: groups, activeMentorships: mentorships, certificates } });
}));

/* ------------------------------------------------------------------ announcements */
router.get('/announcements', authenticate, requireCap('member'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await m.Announcement.findAll({ where: { tenantId: req.tenant.id }, include: [{ model: m.User, as: 'author', attributes: ['fullName'] }], order: [['publishedAt', 'DESC']], limit: 20 }) });
}));
router.post('/announcements', authenticate, requireCap('manage'), asyncHandler(async (req, res) => {
  if (!req.body.title) throw ApiError.badRequest('Title is required');
  const a = await m.Announcement.create({ tenantId: req.tenant.id, authorId: req.user.id, title: req.body.title, body: req.body.body });
  const mems = await m.Membership.findAll({ where: { tenantId: req.tenant.id, status: 'active' }, attributes: ['userId'] });
  await m.Notification.bulkCreate(mems.filter((x) => x.userId !== req.user.id).map((x) => ({ userId: x.userId, tenantId: req.tenant.id, type: 'announcement', title: a.title, body: String(a.body || '').slice(0, 300), link: `/app/a/${req.tenant.slug}` })));
  res.status(201).json({ success: true, data: a });
}));
router.delete('/announcements/:id', authenticate, requireCap('manage'), asyncHandler(async (req, res) => {
  await m.Announcement.destroy({ where: { id: req.params.id, tenantId: req.tenant.id } });
  res.json({ success: true, data: { ok: true } });
}));

/* ------------------------------------------------------------------ billing (M-Pesa, manual approval) */
router.get('/billing', authenticate, requireCap('manage'), asyncHandler(async (req, res) => {
  const [plans, payments] = await Promise.all([
    m.Plan.findAll({ where: { isActive: true }, order: [['position', 'ASC']] }),
    m.Payment.findAll({ where: { tenantId: req.tenant.id }, order: [['createdAt', 'DESC']], limit: 50 }),
  ]);
  res.json({ success: true, data: { currentPlan: req.tenant.planCode, renewsAt: req.tenant.planRenewsAt, plans, payments, mpesa: config.mpesa } });
}));

router.post('/payments', authenticate, requireCap('manage'), asyncHandler(async (req, res) => {
  const mpesaCode = String(req.body.mpesaCode || '').trim().toUpperCase();
  const amountKes = parseInt(req.body.amountKes, 10);
  if (!/^[A-Z0-9]{8,12}$/.test(mpesaCode)) throw ApiError.badRequest('Enter the M-Pesa transaction code from your confirmation SMS (e.g. SJK3ABC12X)');
  if (!amountKes || amountKes < 1) throw ApiError.badRequest('Enter the amount you sent');
  if (await m.Payment.findOne({ where: { mpesaCode } })) throw ApiError.conflict('That M-Pesa code has already been submitted');
  const planCode = req.body.planCode && await m.Plan.findOne({ where: { code: req.body.planCode } }) ? req.body.planCode : null;
  const p = await m.Payment.create({
    tenantId: req.tenant.id, userId: req.user.id, planCode, kind: planCode && planCode !== 'free' ? 'subscription' : 'donation',
    amountKes, mpesaCode, payerPhone: req.body.payerPhone, payerName: req.body.payerName || req.user.fullName, notes: req.body.notes,
  });
  const admins = await m.User.findAll({ where: { isSuperAdmin: true } });
  for (const a of admins) await notify(a.id, { type: 'payment', title: 'M-Pesa payment to review', body: `${req.tenant.name}: KES ${amountKes.toLocaleString()} (${mpesaCode}).`, link: '/admin/payments', emailTo: a.email });
  await audit(req, 'payment.submitted', { entityType: 'payment', entityId: p.id, meta: { amountKes, mpesaCode } });
  res.status(201).json({ success: true, data: p });
}));

router.use(require('./lms'));
router.use(require('./community'));

module.exports = router;
