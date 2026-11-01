'use strict';
/** Lightweight in-process jobs: meeting reminders (24h + 1h) and expired-token cleanup. */
const cron = require('node-cron');
const { Op } = require('sequelize');
const m = require('../models');
const config = require('../config');
const email = require('../services/email');
const { logger } = require('../utils');

function fmt(d) {
  return new Date(d).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' EAT';
}

async function sendReminders(windowMs, flag, label) {
  const now = Date.now();
  const due = await m.Meeting.findAll({ where: { status: 'scheduled', [flag]: false, startsAt: { [Op.between]: [new Date(now), new Date(now + windowMs)] } } });
  for (const mt of due) {
    await mt.update({ [flag]: true });
    const t = await m.Tenant.findByPk(mt.tenantId, { attributes: ['slug', 'name'] });
    const att = await m.MeetingAttendee.findAll({ where: { meetingId: mt.id, rsvp: { [Op.in]: ['going', 'host'] } }, include: [{ model: m.User, attributes: ['id', 'email', 'fullName'] }] });
    const link = `${config.frontendUrl}/app/a/${t.slug}/meetings/${mt.id}`;
    for (const a of att) {
      if (!a.User) continue;
      await m.Notification.create({ userId: a.User.id, tenantId: mt.tenantId, type: 'meeting', title: `Starting ${label}: ${mt.title}`, body: fmt(mt.startsAt), link: `/app/a/${t.slug}/meetings/${mt.id}` });
      email.sendQuiet({
        to: a.User.email, subject: `Reminder: ${mt.title} starts ${label}`,
        text: `${mt.title}\n${fmt(mt.startsAt)}\n${t.name}\n\nJoin: ${link}`,
        html: email.layout({ title: mt.title, bodyHtml: `<p style="color:#0B6E4F;font-weight:600;margin:0">Starting ${label}</p><h2 style="font-family:Georgia,serif;color:#0E0637;margin:6px 0 10px">${email.esc(mt.title)}</h2><p style="margin:0 0 4px">${email.esc(fmt(mt.startsAt))}</p><p style="color:#5B5770;margin:0">${email.esc(t.name)}</p>${email.button('Join the meeting', link)}` }),
      });
    }
  }
  if (due.length) logger.info('meeting reminders sent', { label, meetings: due.length });
}

function start() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      await sendReminders(24 * 3600e3, 'reminded24', 'tomorrow');
      await sendReminders(60 * 60e3, 'reminded1', 'in 1 hour');
    } catch (e) { logger.error('reminder job failed', { err: e.message }); }
  });
  cron.schedule('17 3 * * *', async () => {
    try {
      const old = new Date(Date.now() - 7 * 24 * 3600e3);
      await m.AuthCode.destroy({ where: { createdAt: { [Op.lt]: old } } });
      await m.RefreshToken.destroy({ where: { [Op.or]: [{ expiresAt: { [Op.lt]: new Date() } }, { revokedAt: { [Op.lt]: old } }] } });
    } catch (e) { logger.error('cleanup job failed', { err: e.message }); }
  });
  logger.info('scheduler started');
}

module.exports = { start, sendReminders };
