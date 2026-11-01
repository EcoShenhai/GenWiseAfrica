'use strict';
const router = require('express').Router();
const { Op } = require('sequelize');
const config = require('../config');
const m = require('../models');
const { ApiError, asyncHandler } = require('../utils');
const aiSvc = require('../services/ai');

const TENANT_PUBLIC = ['id', 'name', 'slug', 'type', 'tagline', 'about', 'logoUrl', 'coverUrl', 'primaryColor', 'welcomeVerse', 'country', 'city', 'denomination', 'website', 'joinPolicy', 'createdAt'];

router.get('/stats', asyncHandler(async (req, res) => {
  const [academies, learners, courses, meetings] = await Promise.all([
    m.Tenant.count({ where: { status: 'active' } }),
    m.User.count({ where: { status: 'active' } }),
    m.Course.count({ where: { status: 'published' } }),
    m.Meeting.count(),
  ]);
  res.json({ success: true, data: { academies, learners, courses, meetings } });
}));

router.get('/config', (req, res) => {
  res.json({ success: true, data: { mpesa: config.mpesa, aiEnabled: aiSvc.enabled(), appName: config.appName } });
});

router.get('/plans', asyncHandler(async (req, res) => {
  res.json({ success: true, data: await m.Plan.findAll({ where: { isActive: true }, order: [['position', 'ASC']] }) });
}));

router.get('/academies', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  const where = { status: 'active' };
  if (q) where[Op.or] = [{ name: { [Op.iLike]: `%${q}%` } }, { city: { [Op.iLike]: `%${q}%` } }, { tagline: { [Op.iLike]: `%${q}%` } }];
  if (req.query.type) where.type = req.query.type;
  const rows = await m.Tenant.findAll({ where, attributes: TENANT_PUBLIC, order: [['createdAt', 'ASC']], limit: 60 });
  const ids = rows.map((r) => r.id);
  const [courseCounts, memberCounts] = await Promise.all([
    m.Course.count({ where: { tenantId: ids, status: 'published' }, group: ['tenant_id'] }),
    m.Membership.count({ where: { tenantId: ids, status: 'active' }, group: ['tenant_id'] }),
  ]);
  const cc = Object.fromEntries(courseCounts.map((r) => [r.tenant_id, Number(r.count)]));
  const mc = Object.fromEntries(memberCounts.map((r) => [r.tenant_id, Number(r.count)]));
  res.json({ success: true, data: rows.map((r) => ({ ...r.toJSON(), courseCount: cc[r.id] || 0, memberCount: mc[r.id] || 0 })) });
}));

router.get('/academies/:slug', asyncHandler(async (req, res) => {
  const t = await m.Tenant.findOne({ where: { slug: req.params.slug.toLowerCase(), status: 'active' }, attributes: TENANT_PUBLIC });
  if (!t) throw ApiError.notFound('Academy not found');
  const [courses, shows, meetings, mentors, members, groups] = await Promise.all([
    m.Course.findAll({ where: { tenantId: t.id, status: 'published' }, attributes: ['id', 'title', 'slug', 'summary', 'coverUrl', 'level', 'category', 'estimatedHours'], include: [{ model: m.User, as: 'instructor', attributes: ['fullName', 'avatarUrl'] }], order: [['createdAt', 'DESC']] }),
    m.PodcastShow.findAll({ where: { tenantId: t.id, visibility: 'public' }, attributes: ['id', 'title', 'slug', 'description', 'coverUrl'] }),
    m.Meeting.findAll({ where: { tenantId: t.id, visibility: 'public', startsAt: { [Op.gte]: new Date(Date.now() - 3600e3) }, status: { [Op.ne]: 'cancelled' } }, attributes: ['id', 'title', 'type', 'startsAt', 'endsAt'], order: [['startsAt', 'ASC']], limit: 6 }),
    m.MentorProfile.findAll({ where: { tenantId: t.id, accepting: true }, attributes: ['headline', 'expertise'], include: [{ model: m.User, attributes: ['fullName', 'avatarUrl'] }], limit: 8 }),
    m.Membership.count({ where: { tenantId: t.id, status: 'active' } }),
    m.PrayerGroup.findAll({ where: { tenantId: t.id, visibility: 'open' }, attributes: ['name', 'description', 'schedule'], limit: 6 }),
  ]);
  res.json({ success: true, data: { academy: t, courses, podcasts: shows, meetings, mentors, prayerGroups: groups, memberCount: members } });
}));

router.get('/verify/:serial', asyncHandler(async (req, res) => {
  const c = await m.Certificate.findOne({
    where: { serial: req.params.serial.toUpperCase() },
    include: [{ model: m.User, attributes: ['fullName'] }, { model: m.Course, attributes: ['title'] }, { model: m.Tenant, attributes: ['name', 'slug'] }],
  });
  if (!c) throw ApiError.notFound('No certificate found with that serial number');
  res.json({ success: true, data: { serial: c.serial, valid: !c.revokedAt, issuedAt: c.issuedAt, learner: c.User?.fullName, course: c.Course?.title, academy: c.Tenant?.name, academySlug: c.Tenant?.slug } });
}));

const xml = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
router.get('/rss/:slug/:show', asyncHandler(async (req, res) => {
  const t = await m.Tenant.findOne({ where: { slug: req.params.slug, status: 'active' } });
  const show = t && await m.PodcastShow.findOne({ where: { tenantId: t.id, slug: req.params.show, visibility: 'public' }, include: [{ model: m.PodcastEpisode, as: 'episodes', where: { status: 'published' }, required: false }], order: [[{ model: m.PodcastEpisode, as: 'episodes' }, 'publishedAt', 'DESC']] });
  if (!show) throw ApiError.notFound('Podcast not found');
  const abs = (u) => (u && u.startsWith('/') ? config.baseUrl + u : u);
  const items = show.episodes.filter((e) => e.audioUrl).map((e) => `<item><title>${xml(e.title)}</title><description>${xml(e.notes)}</description><guid isPermaLink="false">${e.id}</guid><pubDate>${new Date(e.publishedAt).toUTCString()}</pubDate><enclosure url="${xml(abs(e.audioUrl))}" type="audio/mpeg" length="0"/></item>`).join('');
  res.type('application/rss+xml').send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel><title>${xml(show.title)}</title><link>${config.frontendUrl}/a/${t.slug}</link><description>${xml(show.description)}</description><language>en</language><itunes:author>${xml(t.name)}</itunes:author>${show.coverUrl ? `<itunes:image href="${xml(abs(show.coverUrl))}"/>` : ''}${items}</channel></rss>`);
}));

module.exports = router;
