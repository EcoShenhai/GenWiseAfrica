'use strict';
const express = require('express');
const { Op } = require('sequelize');
const m = require('../../models');
const config = require('../../config');
const { ApiError, asyncHandler, pick, uniqueSlug } = require('../../utils');
const { authenticate, requireCap, can } = require('../../middleware');
const { audit, notify } = require('../../services/common');
const media = require('../../services/media');

const router = express.Router({ mergeParams: true });
const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(String(s));
async function row(Model, req, id, label, opts = {}) {
  const r = isUuid(id) && await Model.findOne({ where: { id, tenantId: req.tenant.id }, ...opts });
  if (!r) throw ApiError.notFound(`${label} not found`);
  return r;
}
const USER_MIN = ['id', 'fullName', 'avatarUrl'];

/* ================================================================== PODCASTS */
router.get('/podcasts', asyncHandler(async (req, res) => {
  const member = can(req, 'member');
  const staff = can(req, 'host');
  const vis = staff ? ['public', 'members', 'draft'] : member ? ['public', 'members'] : ['public'];
  const shows = await m.PodcastShow.findAll({ where: { tenantId: req.tenant.id, visibility: vis }, include: [{ model: m.User, as: 'host', attributes: USER_MIN }], order: [['createdAt', 'DESC']] });
  const counts = await m.PodcastEpisode.count({ where: { tenantId: req.tenant.id, status: 'published' }, group: ['show_id'] });
  const cm = Object.fromEntries(counts.map((c) => [c.show_id, Number(c.count)]));
  res.json({ success: true, data: shows.map((s) => ({ ...s.toJSON(), episodeCount: cm[s.id] || 0 })) });
}));

router.post('/podcasts', authenticate, requireCap('host'), asyncHandler(async (req, res) => {
  if (!req.body.title) throw ApiError.badRequest('Show title is required');
  const s = await m.PodcastShow.create({ ...pick(req.body, ['description', 'coverUrl', 'category', 'visibility']), title: req.body.title, tenantId: req.tenant.id, hostId: req.user.id, slug: await uniqueSlug(m.PodcastShow, req.body.title, { tenantId: req.tenant.id }) });
  res.status(201).json({ success: true, data: s });
}));

router.get('/podcasts/:id', asyncHandler(async (req, res) => {
  const where = { tenantId: req.tenant.id, ...(isUuid(req.params.id) ? { id: req.params.id } : { slug: req.params.id }) };
  const s = await m.PodcastShow.findOne({ where, include: [{ model: m.User, as: 'host', attributes: USER_MIN }] });
  if (!s) throw ApiError.notFound('Podcast not found');
  const staff = can(req, 'manage') || s.hostId === req.user?.id;
  if (s.visibility === 'draft' && !staff) throw ApiError.notFound('Podcast not found');
  if (s.visibility === 'members' && !can(req, 'member')) throw ApiError.forbidden('Join this academy to listen');
  const episodes = await m.PodcastEpisode.findAll({ where: { showId: s.id, ...(staff ? {} : { status: 'published' }) }, order: [['publishedAt', 'DESC']] });
  res.json({ success: true, data: { show: s, episodes, canEdit: staff, rssUrl: `${config.baseUrl}/api/v1/public/rss/${req.tenant.slug}/${s.slug}` } });
}));

const showEditable = async (req, id) => {
  const s = await row(m.PodcastShow, req, id, 'Podcast');
  if (!(can(req, 'manage') || s.hostId === req.user.id)) throw ApiError.forbidden();
  return s;
};
router.patch('/podcasts/:id', authenticate, asyncHandler(async (req, res) => {
  const s = await showEditable(req, req.params.id);
  await s.update(pick(req.body, ['title', 'description', 'coverUrl', 'category', 'visibility']));
  res.json({ success: true, data: s });
}));
router.delete('/podcasts/:id', authenticate, asyncHandler(async (req, res) => {
  const s = await showEditable(req, req.params.id);
  await m.PodcastEpisode.destroy({ where: { showId: s.id } });
  await s.destroy();
  res.json({ success: true, data: { ok: true } });
}));
router.post('/podcasts/:id/episodes', authenticate, asyncHandler(async (req, res) => {
  const s = await showEditable(req, req.params.id);
  if (!req.body.title) throw ApiError.badRequest('Episode title is required');
  const e = await m.PodcastEpisode.create({ ...pick(req.body, ['audioUrl', 'durationMin', 'notes', 'scriptureRefs', 'status', 'publishedAt']), title: req.body.title, tenantId: req.tenant.id, showId: s.id, slug: await uniqueSlug(m.PodcastEpisode, req.body.title, { showId: s.id }) });
  res.status(201).json({ success: true, data: e });
}));
router.patch('/episodes/:id', authenticate, asyncHandler(async (req, res) => {
  const e = await row(m.PodcastEpisode, req, req.params.id, 'Episode');
  await showEditable(req, e.showId);
  await e.update(pick(req.body, ['title', 'audioUrl', 'durationMin', 'notes', 'scriptureRefs', 'status', 'publishedAt']));
  res.json({ success: true, data: e });
}));
router.delete('/episodes/:id', authenticate, asyncHandler(async (req, res) => {
  const e = await row(m.PodcastEpisode, req, req.params.id, 'Episode');
  await showEditable(req, e.showId);
  await e.destroy();
  res.json({ success: true, data: { ok: true } });
}));
router.post('/episodes/:id/play', asyncHandler(async (req, res) => {
  const e = await row(m.PodcastEpisode, req, req.params.id, 'Episode');
  await e.increment('plays');
  res.json({ success: true, data: { ok: true } });
}));

/* ================================================================== MEETINGS */
const MEETING_TYPES = ['live_class', 'mentorship_session', 'prayer_meeting', 'webinar', 'fellowship'];

async function canSeeMeeting(req, mt) {
  if (can(req, 'manage') || mt.hostId === req.user?.id) return true;
  if (mt.visibility === 'public') return true;
  if (mt.visibility === 'members') return can(req, 'member');
  if (mt.visibility === 'private' && req.user) {
    if (mt.mentorshipId) {
      const ms = await m.Mentorship.findByPk(mt.mentorshipId);
      return !!ms && [ms.mentorId, ms.menteeId].includes(req.user.id);
    }
    return !!(await m.MeetingAttendee.findOne({ where: { meetingId: mt.id, userId: req.user.id } }));
  }
  return false;
}

router.get('/meetings', asyncHandler(async (req, res) => {
  const past = req.query.range === 'past';
  const where = { tenantId: req.tenant.id, ...(past ? { startsAt: { [Op.lt]: new Date() } } : { [Op.or]: [{ endsAt: { [Op.gte]: new Date() } }, { endsAt: null, startsAt: { [Op.gte]: new Date(Date.now() - 3 * 3600e3) } }] }) };
  if (req.query.type) where.type = req.query.type;
  const all = await m.Meeting.findAll({ where, include: [{ model: m.User, as: 'host', attributes: USER_MIN }], order: [['startsAt', past ? 'DESC' : 'ASC']], limit: 100 });
  const visible = [];
  for (const mt of all) if (await canSeeMeeting(req, mt)) visible.push(mt); // eslint-disable-line no-await-in-loop
  let mine = {};
  if (req.user) mine = Object.fromEntries((await m.MeetingAttendee.findAll({ where: { userId: req.user.id, meetingId: visible.map((v) => v.id) } })).map((a) => [a.meetingId, a.rsvp]));
  res.json({ success: true, data: visible.map((v) => ({ ...v.toJSON(), myRsvp: mine[v.id] || null })) });
}));

const MEETING_FIELDS = ['title', 'description', 'type', 'provider', 'joinUrl', 'startsAt', 'endsAt', 'capacity', 'visibility', 'recordingUrl', 'courseId', 'prayerGroupId', 'status'];
function validateMeeting(d) {
  if (d.type && !MEETING_TYPES.includes(d.type)) throw ApiError.badRequest('Invalid meeting type');
  if (d.provider && !['livekit', 'jitsi', 'external'].includes(d.provider)) throw ApiError.badRequest('Invalid provider');
  if (d.provider === 'external' && !/^https:\/\//.test(d.joinUrl || '')) throw ApiError.badRequest('External meetings need an https:// join link');
  if (d.visibility && !['public', 'members', 'private'].includes(d.visibility)) throw ApiError.badRequest('Invalid visibility');
  if (d.startsAt && Number.isNaN(new Date(d.startsAt).getTime())) throw ApiError.badRequest('Invalid start time');
}

router.post('/meetings', authenticate, requireCap('host'), asyncHandler(async (req, res) => {
  const d = pick(req.body, MEETING_FIELDS);
  if (!d.title || !d.startsAt) throw ApiError.badRequest('Title and start time are required');
  validateMeeting(d);
  if (!d.endsAt) d.endsAt = new Date(new Date(d.startsAt).getTime() + 60 * 60e3);
  const mt = await m.Meeting.create({ provider: 'livekit', ...d, tenantId: req.tenant.id, hostId: req.user.id });
  if (mt.provider !== 'external') await mt.update({ roomName: media.roomNameFor(mt) });
  await m.MeetingAttendee.create({ tenantId: req.tenant.id, meetingId: mt.id, userId: req.user.id, rsvp: 'host' });
  await audit(req, 'meeting.created', { entityType: 'meeting', entityId: mt.id });
  res.status(201).json({ success: true, data: mt });
}));

router.get('/meetings/:id', asyncHandler(async (req, res) => {
  const mt = await row(m.Meeting, req, req.params.id, 'Meeting', { include: [{ model: m.User, as: 'host', attributes: USER_MIN }] });
  if (!(await canSeeMeeting(req, mt))) throw ApiError.forbidden('You do not have access to this meeting');
  const attendees = await m.MeetingAttendee.count({ where: { meetingId: mt.id, rsvp: { [Op.in]: ['going', 'host'] } } });
  const myRsvp = req.user ? (await m.MeetingAttendee.findOne({ where: { meetingId: mt.id, userId: req.user.id } }))?.rsvp : null;
  const data = mt.toJSON(); if (data.provider !== 'external') delete data.joinUrl;
  res.json({ success: true, data: { meeting: data, attendees, myRsvp: myRsvp || null, canEdit: can(req, 'manage') || mt.hostId === req.user?.id } });
}));

const meetingEditable = async (req, id) => {
  const mt = await row(m.Meeting, req, id, 'Meeting');
  if (!(can(req, 'manage') || mt.hostId === req.user.id)) throw ApiError.forbidden();
  return mt;
};
router.patch('/meetings/:id', authenticate, asyncHandler(async (req, res) => {
  const mt = await meetingEditable(req, req.params.id);
  const d = pick(req.body, MEETING_FIELDS); validateMeeting(d);
  if (d.startsAt && String(d.startsAt) !== String(mt.startsAt)) Object.assign(d, { reminded24: false, reminded1: false });
  await mt.update(d);
  res.json({ success: true, data: mt });
}));
router.delete('/meetings/:id', authenticate, asyncHandler(async (req, res) => {
  const mt = await meetingEditable(req, req.params.id);
  await mt.update({ status: 'cancelled' });
  const att = await m.MeetingAttendee.findAll({ where: { meetingId: mt.id, rsvp: 'going' }, include: [m.User] });
  for (const a of att) await notify(a.userId, { tenantId: req.tenant.id, title: `Cancelled: ${mt.title}`, body: `The meeting scheduled for ${new Date(mt.startsAt).toUTCString()} was cancelled.`, link: `/app/a/${req.tenant.slug}/meetings` });
  res.json({ success: true, data: { ok: true } });
}));

router.post('/meetings/:id/rsvp', authenticate, asyncHandler(async (req, res) => {
  const mt = await row(m.Meeting, req, req.params.id, 'Meeting');
  if (!(await canSeeMeeting(req, mt))) throw ApiError.forbidden();
  const rsvp = ['going', 'maybe', 'not_going'].includes(req.body.rsvp) ? req.body.rsvp : 'going';
  const [a, created] = await m.MeetingAttendee.findOrCreate({ where: { meetingId: mt.id, userId: req.user.id }, defaults: { tenantId: req.tenant.id, rsvp } });
  if (!created && a.rsvp !== 'host') await a.update({ rsvp });
  res.json({ success: true, data: a });
}));

router.post('/meetings/:id/join', authenticate, asyncHandler(async (req, res) => {
  const mt = await row(m.Meeting, req, req.params.id, 'Meeting');
  if (!(await canSeeMeeting(req, mt))) throw ApiError.forbidden('You do not have access to this meeting');
  if (mt.status === 'cancelled') throw ApiError.badRequest('This meeting was cancelled');
  const isHost = mt.hostId === req.user.id || can(req, 'manage');
  const opensAt = new Date(mt.startsAt).getTime() - 15 * 60e3;
  if (!isHost && Date.now() < opensAt) throw ApiError.badRequest('The room opens 15 minutes before the start time');
  const [a] = await m.MeetingAttendee.findOrCreate({ where: { meetingId: mt.id, userId: req.user.id }, defaults: { tenantId: req.tenant.id, rsvp: 'going' } });
  await a.update({ joinedAt: new Date() });
  if (isHost && mt.status === 'scheduled') await mt.update({ status: 'live' });
  res.json({ success: true, data: { ...(await media.joinInfo(mt, req.user, isHost)), meeting: { id: mt.id, title: mt.title }, isHost } });
}));

router.post('/meetings/:id/end', authenticate, asyncHandler(async (req, res) => {
  const mt = await meetingEditable(req, req.params.id);
  await mt.update({ status: 'ended', endsAt: mt.endsAt && mt.endsAt < new Date() ? mt.endsAt : new Date(), recordingUrl: req.body.recordingUrl || mt.recordingUrl });
  res.json({ success: true, data: mt });
}));

router.get('/meetings/:id/ics', asyncHandler(async (req, res) => {
  const mt = await row(m.Meeting, req, req.params.id, 'Meeting');
  if (!(await canSeeMeeting(req, mt))) throw ApiError.forbidden();
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s || '').replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const url = `${config.frontendUrl}/app/a/${req.tenant.slug}/meetings/${mt.id}`;
  res.type('text/calendar').setHeader('Content-Disposition', `attachment; filename="genwise-${mt.id.slice(0, 8)}.ics"`);
  res.send(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GenWise Africa//EN', 'BEGIN:VEVENT', `UID:${mt.id}@genwiseafrica.org`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(mt.startsAt)}`, `DTEND:${f(mt.endsAt || new Date(new Date(mt.startsAt).getTime() + 3600e3))}`, `SUMMARY:${esc(mt.title)}`, `DESCRIPTION:${esc(`${mt.description || ''}\n\nJoin: ${url}`)}`, `URL:${url}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'));
}));

/* ================================================================== MENTORSHIP */
router.get('/mentors', authenticate, requireCap('member'), asyncHandler(async (req, res) => {
  const rows = await m.MentorProfile.findAll({ where: { tenantId: req.tenant.id }, include: [{ model: m.User, attributes: [...USER_MIN, 'bio', 'country'] }], order: [['createdAt', 'ASC']] });
  const active = await m.Mentorship.count({ where: { tenantId: req.tenant.id, status: 'active' }, group: ['mentor_id'] });
  const am = Object.fromEntries(active.map((x) => [x.mentor_id, Number(x.count)]));
  res.json({ success: true, data: rows.map((r) => ({ ...r.toJSON(), activeMentees: am[r.userId] || 0 })) });
}));

router.put('/mentors/me', authenticate, requireCap('mentor'), asyncHandler(async (req, res) => {
  const d = pick(req.body, ['headline', 'bio', 'expertise', 'languages', 'capacity', 'accepting', 'availability']);
  if (typeof d.expertise === 'string') d.expertise = d.expertise.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12);
  const [p] = await m.MentorProfile.findOrCreate({ where: { tenantId: req.tenant.id, userId: req.user.id }, defaults: d });
  await p.update(d);
  res.json({ success: true, data: p });
}));

router.get('/mentorships', authenticate, requireCap('member'), asyncHandler(async (req, res) => {
  const where = { tenantId: req.tenant.id };
  if (!(can(req, 'manage') && req.query.all)) where[Op.or] = [{ mentorId: req.user.id }, { menteeId: req.user.id }];
  const rows = await m.Mentorship.findAll({ where, include: [{ model: m.User, as: 'mentor', attributes: USER_MIN }, { model: m.User, as: 'mentee', attributes: USER_MIN }], order: [['updatedAt', 'DESC']] });
  res.json({ success: true, data: rows });
}));

router.post('/mentorships', authenticate, requireCap('member'), asyncHandler(async (req, res) => {
  const profile = await m.MentorProfile.findOne({ where: { tenantId: req.tenant.id, userId: req.body.mentorId } });
  if (!profile) throw ApiError.notFound('Mentor not found');
  if (req.body.mentorId === req.user.id) throw ApiError.badRequest('You cannot mentor yourself');
  if (!profile.accepting) throw ApiError.badRequest('This mentor is not accepting new mentees right now');
  const existing = await m.Mentorship.findOne({ where: { tenantId: req.tenant.id, mentorId: profile.userId, menteeId: req.user.id, status: ['requested', 'active'] } });
  if (existing) throw ApiError.conflict('You already have a request or mentorship with this mentor');
  const ms = await m.Mentorship.create({ tenantId: req.tenant.id, mentorId: profile.userId, menteeId: req.user.id, message: req.body.message, goals: req.body.goals });
  const mentor = await m.User.findByPk(profile.userId);
  await notify(mentor.id, { tenantId: req.tenant.id, type: 'mentorship', title: 'New mentorship request', body: `${req.user.fullName} would like you to mentor them. "${String(req.body.message || '').slice(0, 160)}"`, link: `/app/a/${req.tenant.slug}/mentorship`, emailTo: mentor.email });
  res.status(201).json({ success: true, data: ms });
}));

async function mentorshipFor(req, id) {
  const ms = await row(m.Mentorship, req, id, 'Mentorship', { include: [{ model: m.User, as: 'mentor', attributes: [...USER_MIN, 'email'] }, { model: m.User, as: 'mentee', attributes: [...USER_MIN, 'email'] }] });
  const party = [ms.mentorId, ms.menteeId].includes(req.user.id);
  if (!party && !can(req, 'manage')) throw ApiError.forbidden();
  return { ms, party, isMentor: ms.mentorId === req.user.id };
}

router.get('/mentorships/:id', authenticate, asyncHandler(async (req, res) => {
  const { ms, isMentor } = await mentorshipFor(req, req.params.id);
  const notes = await m.MentorshipNote.findAll({ where: { mentorshipId: ms.id, [Op.or]: [{ visibility: 'shared' }, { authorId: req.user.id }] }, include: [{ model: m.User, as: 'author', attributes: USER_MIN }], order: [['createdAt', 'DESC']] });
  const sessions = await m.Meeting.findAll({ where: { mentorshipId: ms.id }, order: [['startsAt', 'DESC']] });
  const j = ms.toJSON(); delete j.mentor.email; delete j.mentee.email;
  res.json({ success: true, data: { mentorship: j, notes, sessions, isMentor } });
}));

router.patch('/mentorships/:id', authenticate, asyncHandler(async (req, res) => {
  const { ms, isMentor, party } = await mentorshipFor(req, req.params.id);
  const { status, goals } = req.body;
  if (status) {
    const allowed = isMentor || can(req, 'manage') ? ['active', 'declined', 'completed'] : ['completed'];
    if (!allowed.includes(status)) throw ApiError.forbidden('You cannot set that status');
    if (status === 'active' && ms.status !== 'requested') throw ApiError.badRequest('Only requests can be accepted');
    await ms.update({ status, startedAt: status === 'active' ? new Date() : ms.startedAt, endedAt: ['completed', 'declined'].includes(status) ? new Date() : null });
    const other = isMentor ? ms.mentee : ms.mentor;
    await notify(other.id, { tenantId: req.tenant.id, type: 'mentorship', title: `Mentorship ${status === 'active' ? 'accepted' : status}`, body: `${req.user.fullName} marked your mentorship as ${status}.`, link: `/app/a/${req.tenant.slug}/mentorship/${ms.id}`, emailTo: other.email });
  }
  if (goals !== undefined && party) await ms.update({ goals });
  res.json({ success: true, data: ms });
}));

router.post('/mentorships/:id/notes', authenticate, asyncHandler(async (req, res) => {
  const { ms, party } = await mentorshipFor(req, req.params.id);
  if (!party) throw ApiError.forbidden();
  if (!req.body.body) throw ApiError.badRequest('Write something first');
  const n = await m.MentorshipNote.create({ tenantId: req.tenant.id, mentorshipId: ms.id, authorId: req.user.id, body: req.body.body, visibility: req.body.visibility === 'private' ? 'private' : 'shared' });
  res.status(201).json({ success: true, data: n });
}));

router.post('/mentorships/:id/sessions', authenticate, asyncHandler(async (req, res) => {
  const { ms, party } = await mentorshipFor(req, req.params.id);
  if (!party) throw ApiError.forbidden();
  if (ms.status !== 'active') throw ApiError.badRequest('Sessions can be booked once the mentorship is active');
  if (!req.body.startsAt) throw ApiError.badRequest('Choose a date and time');
  const start = new Date(req.body.startsAt);
  const mt = await m.Meeting.create({
    tenantId: req.tenant.id, hostId: ms.mentorId, type: 'mentorship_session', title: req.body.title || `Mentorship: ${ms.mentor.fullName} & ${ms.mentee.fullName}`,
    description: req.body.description, startsAt: start, endsAt: new Date(start.getTime() + (parseInt(req.body.durationMin, 10) || 45) * 60e3),
    visibility: 'private', mentorshipId: ms.id, capacity: 2, provider: 'livekit',
  });
  await mt.update({ roomName: media.roomNameFor(mt) });
  await m.MeetingAttendee.bulkCreate([{ tenantId: req.tenant.id, meetingId: mt.id, userId: ms.mentorId, rsvp: 'host' }, { tenantId: req.tenant.id, meetingId: mt.id, userId: ms.menteeId, rsvp: 'going' }]);
  const other = ms.mentorId === req.user.id ? ms.mentee : ms.mentor;
  await notify(other.id, { tenantId: req.tenant.id, type: 'meeting', title: 'Mentorship session booked', body: `${req.user.fullName} booked a session for ${start.toUTCString()}.`, link: `/app/a/${req.tenant.slug}/meetings/${mt.id}`, emailTo: other.email });
  res.status(201).json({ success: true, data: mt });
}));

/* ================================================================== PRAYER */
router.get('/prayer/groups', authenticate, requireCap('member'), asyncHandler(async (req, res) => {
  const groups = await m.PrayerGroup.findAll({ where: { tenantId: req.tenant.id }, include: [{ model: m.User, as: 'leader', attributes: USER_MIN }], order: [['createdAt', 'ASC']] });
  const counts = await m.PrayerGroupMember.count({ where: { tenantId: req.tenant.id }, group: ['group_id'] });
  const cm = Object.fromEntries(counts.map((c) => [c.group_id, Number(c.count)]));
  const mine = new Set((await m.PrayerGroupMember.findAll({ where: { tenantId: req.tenant.id, userId: req.user.id } })).map((x) => x.groupId));
  res.json({ success: true, data: groups.map((g) => ({ ...g.toJSON(), memberCount: cm[g.id] || 0, joined: mine.has(g.id) })) });
}));

router.post('/prayer/groups', authenticate, requireCap('lead_prayer'), asyncHandler(async (req, res) => {
  if (!req.body.name) throw ApiError.badRequest('Group name is required');
  const g = await m.PrayerGroup.create({ ...pick(req.body, ['description', 'visibility', 'schedule']), name: req.body.name, tenantId: req.tenant.id, leaderId: req.user.id, slug: await uniqueSlug(m.PrayerGroup, req.body.name, { tenantId: req.tenant.id }) });
  await m.PrayerGroupMember.create({ tenantId: req.tenant.id, groupId: g.id, userId: req.user.id, role: 'leader' });
  res.status(201).json({ success: true, data: g });
}));

router.patch('/prayer/groups/:id', authenticate, asyncHandler(async (req, res) => {
  const g = await row(m.PrayerGroup, req, req.params.id, 'Group');
  if (!(can(req, 'manage') || g.leaderId === req.user.id)) throw ApiError.forbidden();
  await g.update(pick(req.body, ['name', 'description', 'visibility', 'schedule']));
  res.json({ success: true, data: g });
}));

router.post('/prayer/groups/:id/join', authenticate, requireCap('member'), asyncHandler(async (req, res) => {
  const g = await row(m.PrayerGroup, req, req.params.id, 'Group');
  if (g.visibility === 'closed' && !can(req, 'lead_prayer')) throw ApiError.forbidden('This group is closed. Ask the leader to add you.');
  await m.PrayerGroupMember.findOrCreate({ where: { groupId: g.id, userId: req.user.id }, defaults: { tenantId: req.tenant.id } });
  res.json({ success: true, data: { ok: true } });
}));
router.post('/prayer/groups/:id/leave', authenticate, asyncHandler(async (req, res) => {
  await m.PrayerGroupMember.destroy({ where: { groupId: req.params.id, userId: req.user.id, tenantId: req.tenant.id, role: 'member' } });
  res.json({ success: true, data: { ok: true } });
}));

router.get('/prayer/requests', authenticate, requireCap('member'), asyncHandler(async (req, res) => {
  const leader = can(req, 'lead_prayer');
  const myGroups = (await m.PrayerGroupMember.findAll({ where: { tenantId: req.tenant.id, userId: req.user.id } })).map((x) => x.groupId);
  const or = [{ visibility: 'academy' }, { userId: req.user.id }, { visibility: 'group', groupId: myGroups }];
  if (leader) or.push({ visibility: 'leaders' }, { visibility: 'group' });
  const where = { tenantId: req.tenant.id, [Op.or]: or };
  if (req.query.groupId) where.groupId = req.query.groupId;
  if (req.query.status) where.status = req.query.status;
  const rows = await m.PrayerRequest.findAll({ where, include: [{ model: m.User, attributes: USER_MIN }, { model: m.PrayerGroup, as: 'group', attributes: ['id', 'name'] }], order: [['createdAt', 'DESC']], limit: 100 });
  const prayed = new Set((await m.PrayerPrayed.findAll({ where: { userId: req.user.id, requestId: rows.map((r) => r.id) } })).map((p) => p.requestId));
  res.json({
    success: true,
    data: rows.map((r) => {
      const j = r.toJSON();
      j.mine = r.userId === req.user.id; j.iPrayed = prayed.has(r.id);
      if (r.isAnonymous && !j.mine) { j.User = { fullName: 'Anonymous' }; j.userId = null; }
      return j;
    }),
  });
}));

router.post('/prayer/requests', authenticate, requireCap('member'), asyncHandler(async (req, res) => {
  const { title, body, groupId, isAnonymous, visibility } = req.body;
  if (!title) throw ApiError.badRequest('Please give your request a short title');
  if (groupId && !(await m.PrayerGroup.findOne({ where: { id: groupId, tenantId: req.tenant.id } }))) throw ApiError.badRequest('Unknown group');
  const vis = ['academy', 'group', 'leaders'].includes(visibility) ? visibility : (groupId ? 'group' : 'academy');
  const r = await m.PrayerRequest.create({ tenantId: req.tenant.id, userId: req.user.id, title: String(title).slice(0, 200), body, groupId: groupId || null, isAnonymous: !!isAnonymous, visibility: vis });
  res.status(201).json({ success: true, data: r });
}));

router.post('/prayer/requests/:id/pray', authenticate, requireCap('member'), asyncHandler(async (req, res) => {
  const r = await row(m.PrayerRequest, req, req.params.id, 'Prayer request');
  const [, created] = await m.PrayerPrayed.findOrCreate({ where: { requestId: r.id, userId: req.user.id }, defaults: { tenantId: req.tenant.id } });
  if (created) {
    await r.increment('prayedCount');
    if (r.userId !== req.user.id && [1, 5, 10, 25, 50].includes(r.prayedCount + 1)) await notify(r.userId, { tenantId: req.tenant.id, type: 'prayer', title: 'People are praying for you', body: `${r.prayedCount + 1} ${r.prayedCount ? 'people have' : 'person has'} prayed for "${r.title}".`, link: `/app/a/${req.tenant.slug}/prayer` });
  }
  res.json({ success: true, data: { prayedCount: r.prayedCount + (created ? 1 : 0) } });
}));

router.patch('/prayer/requests/:id', authenticate, asyncHandler(async (req, res) => {
  const r = await row(m.PrayerRequest, req, req.params.id, 'Prayer request');
  if (!(r.userId === req.user.id || can(req, 'lead_prayer'))) throw ApiError.forbidden();
  await r.update(pick(req.body, ['title', 'body', 'status', 'praiseReport']));
  res.json({ success: true, data: r });
}));
router.delete('/prayer/requests/:id', authenticate, asyncHandler(async (req, res) => {
  const r = await row(m.PrayerRequest, req, req.params.id, 'Prayer request');
  if (!(r.userId === req.user.id || can(req, 'lead_prayer'))) throw ApiError.forbidden();
  await m.PrayerPrayed.destroy({ where: { requestId: r.id } });
  await r.destroy();
  res.json({ success: true, data: { ok: true } });
}));

module.exports = router;
