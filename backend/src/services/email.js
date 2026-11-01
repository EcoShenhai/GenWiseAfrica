'use strict';
const nodemailer = require('nodemailer');
const config = require('../config');
const { logger } = require('../utils');

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: config.email.user ? { user: config.email.user, pass: config.email.pass } : undefined,
  });
  return transporter;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Branded navy/gold HTML wrapper */
function layout({ title, preheader = '', bodyHtml }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#F6F1E4;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1F1B2E">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F1E4;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(14,6,55,.08)">
<tr><td style="background:#0E0637;padding:26px 32px;text-align:center">
  <div style="font-family:Georgia,serif;color:#C9A34E;font-size:24px;letter-spacing:4px;font-weight:bold">GENWISE AFRICA</div>
  <div style="color:#E6C97A;font-style:italic;font-size:13px;margin-top:4px">Generation of Wisdom</div>
</td></tr>
<tr><td style="padding:32px">${bodyHtml}</td></tr>
<tr><td style="border-top:1px solid #EEE7D3;padding:18px 32px;text-align:center;font-size:12px;color:#5B5770">
  Think Wise. Live Wise. Lead Generations.<br><a href="${esc(config.frontendUrl)}" style="color:#0B6E4F">${esc(config.appDomain)}</a>
</td></tr></table></td></tr></table></body></html>`;
}

function button(label, href) {
  return `<p style="text-align:center;margin:28px 0"><a href="${esc(href)}" style="background:#0B6E4F;color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:600;display:inline-block">${esc(label)}</a></p>`;
}

async function send({ to, subject, text, html }) {
  if (config.email.devLog) {
    logger.info('[email:dev] not sent (no SMTP configured)', { to, subject, text });
    return { messageId: 'dev', dev: true };
  }
  const info = await getTransporter().sendMail({
    from: `"${config.email.fromName}" <${config.email.fromEmail}>`,
    to, subject, text, html,
  });
  logger.info('email sent', { to, subject, messageId: info.messageId });
  return { messageId: info.messageId };
}

/** Fire-and-forget variant for non-critical notices */
function sendQuiet(msg) {
  send(msg).catch((e) => logger.error('email failed', { to: msg.to, subject: msg.subject, err: e.message }));
}

module.exports = { send, sendQuiet, layout, button, esc, verify: () => getTransporter().verify() };
