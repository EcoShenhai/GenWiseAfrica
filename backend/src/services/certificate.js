'use strict';
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const crypto = require('crypto');
const config = require('../config');

const NAVY = '#0E0637'; const GOLD = '#C9A34E'; const EMERALD = '#0B6E4F';

const newSerial = () => `GWA-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

/** Streams a landscape A4 certificate PDF into `res` */
async function renderPdf(res, { serial, learnerName, courseTitle, academyName, issuedAt, instructorName }) {
  const verifyUrl = `${config.frontendUrl}/verify/${serial}`;
  const qr = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 220, color: { dark: NAVY, light: '#FFFFFF' } });
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: `Certificate ${serial}`, Author: 'GenWise Africa' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="GenWise-Certificate-${serial}.pdf"`);
  doc.pipe(res);
  const W = doc.page.width; const H = doc.page.height;

  doc.rect(0, 0, W, H).fill('#FFFDF7');
  doc.rect(18, 18, W - 36, H - 36).lineWidth(6).stroke(NAVY);
  doc.rect(30, 30, W - 60, H - 60).lineWidth(1.5).stroke(GOLD);
  doc.rect(30, 30, W - 60, 84).fill(NAVY);
  doc.fillColor(GOLD).font('Times-Bold').fontSize(30).text('GENWISE AFRICA', 0, 44, { align: 'center', characterSpacing: 6 });
  doc.fillColor('#E6C97A').font('Times-Italic').fontSize(13).text('Generation of Wisdom', 0, 80, { align: 'center' });

  doc.fillColor(EMERALD).font('Helvetica-Bold').fontSize(13).text('CERTIFICATE OF COMPLETION', 0, 135, { align: 'center', characterSpacing: 4 });
  doc.fillColor('#5B5770').font('Helvetica').fontSize(13).text('This is to certify that', 0, 172, { align: 'center' });
  doc.fillColor(NAVY).font('Times-Bold').fontSize(40).text(learnerName, 60, 198, { align: 'center', width: W - 120 });
  doc.moveTo(W / 2 - 200, 252).lineTo(W / 2 + 200, 252).lineWidth(1).stroke(GOLD);
  doc.fillColor('#5B5770').font('Helvetica').fontSize(13).text('has faithfully completed the course', 0, 268, { align: 'center' });
  doc.fillColor(NAVY).font('Times-BoldItalic').fontSize(26).text(courseTitle, 80, 292, { align: 'center', width: W - 160 });
  doc.fillColor('#5B5770').font('Helvetica').fontSize(12).text(`offered by ${academyName}`, 0, 336, { align: 'center' });

  const d = new Date(issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const y = 420;
  doc.moveTo(110, y).lineTo(310, y).stroke(NAVY);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(instructorName || academyName, 110, y + 6, { width: 200, align: 'center' });
  doc.fillColor('#5B5770').font('Helvetica').fontSize(9).text('Instructor', 110, y + 22, { width: 200, align: 'center' });
  doc.moveTo(W - 310, y).lineTo(W - 110, y).stroke(NAVY);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(d, W - 310, y + 6, { width: 200, align: 'center' });
  doc.fillColor('#5B5770').font('Helvetica').fontSize(9).text('Date issued', W - 310, y + 22, { width: 200, align: 'center' });

  doc.image(qr, W / 2 - 40, 392, { width: 80 });
  doc.fillColor('#5B5770').fontSize(8).text(`Serial ${serial}  ·  Verify at ${verifyUrl}`, 0, 482, { align: 'center' });
  doc.fillColor(GOLD).font('Times-Italic').fontSize(12).text('"The fear of the LORD is the beginning of wisdom." — Proverbs 9:10', 0, 512, { align: 'center' });
  doc.fillColor(EMERALD).font('Helvetica-Bold').fontSize(9).text('Think Wise. Live Wise. Lead Generations.', 0, 536, { align: 'center', characterSpacing: 1 });
  doc.end();
}

module.exports = { renderPdf, newSerial };
