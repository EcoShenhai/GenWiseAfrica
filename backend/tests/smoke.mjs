// End-to-end smoke test against a running API (dev mode exposes devCode for emailed codes).
//   API=http://127.0.0.1:4022 SA_EMAIL=... SA_PASSWORD=... node tests/smoke.mjs
const API = (process.env.API || 'http://127.0.0.1:4022') + '/api/v1';
let pass = 0; let fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('  ✔', msg); } else { fail++; console.log('  ✘', msg); } };

async function call(method, path, body, token) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j, headers: r.headers };
}

async function login(email, password) {
  const l = await call('POST', '/auth/login', { email, password });
  const v = await call('POST', '/auth/verify-mfa', { mfaToken: l.data.mfaToken, code: l.data.devCode });
  return v.data;
}

const stamp = Date.now().toString(36);
console.log('Auth');
const email = `learner.${stamp}@example.com`;
const reg = await call('POST', '/auth/register', { fullName: 'Grace Wanjiru', email, password: 'Faith2026x', academySlug: 'genwise-academy' });
ok(reg.status === 201 && reg.data.mfaToken && reg.data.devCode, 'register returns mfaToken + emailed code');
ok((await call('POST', '/auth/register', { fullName: 'X', email, password: 'Faith2026x' })).status === 409, 'duplicate email rejected');
ok((await call('POST', '/auth/register', { fullName: 'X', email: `w${stamp}@ex.com`, password: 'short' })).status === 400, 'weak password rejected');
const bad = await call('POST', '/auth/verify-email', { mfaToken: reg.data.mfaToken, code: '000000' });
ok(bad.status === 400, 'wrong verify code rejected');
await new Promise((r) => setTimeout(r, 1100));
const rs = await call('POST', '/auth/resend-code', { mfaToken: reg.data.mfaToken });
ok(rs.status === 200 && rs.data.devCode, 'resend code works');
const ver = await call('POST', '/auth/verify-email', { mfaToken: rs.data.mfaToken, code: rs.data.devCode });
ok(ver.status === 200 && ver.data.accessToken && ver.data.user.emailVerified, 'verify email issues session');
ok(ver.data.memberships.some((m) => m.tenant.slug === 'genwise-academy'), 'registered into academy via academySlug');
const l1 = await call('POST', '/auth/login', { email, password: 'wrongpass1' });
ok(l1.status === 401, 'wrong password rejected');
await new Promise((r) => setTimeout(r, 1100));
const learner = await login(email, 'Faith2026x');
ok(!!learner?.accessToken, 'login + emailed MFA code → session');
const L = learner.accessToken;
ok((await call('GET', '/auth/me', null, L)).data.user.email === email, '/auth/me');

await new Promise((r) => setTimeout(r, 1100));
const fp = await call('POST', '/auth/forgot-password', { email });
ok(fp.status === 200 && fp.data.devCode, 'forgot password emails code');
ok((await call('POST', '/auth/forgot-password', { email: 'nobody@nowhere.io' })).status === 200, 'forgot password does not reveal accounts');
const rp = await call('POST', '/auth/reset-password', { email, code: fp.data.devCode, newPassword: 'NewFaith2026' });
ok(rp.status === 200, 'reset password with code');
await new Promise((r) => setTimeout(r, 1100));
ok(!!(await login(email, 'NewFaith2026'))?.accessToken, 'login with new password');

console.log('Super admin + academy lifecycle');
const sa = await login(process.env.SA_EMAIL, process.env.SA_PASSWORD);
ok(sa?.user?.isSuperAdmin, 'super admin login');
const S = sa.accessToken;
const owner = await (async () => {
  const e = `pastor.${stamp}@example.com`;
  const r = await call('POST', '/auth/register', { fullName: 'Pastor John Otieno', email: e, password: 'Church2026a' });
  return (await call('POST', '/auth/verify-email', { mfaToken: r.data.mfaToken, code: r.data.devCode })).data;
})();
const O = owner.accessToken;
const app = await call('POST', '/me/academies', { name: `Hope Chapel ${stamp}`, type: 'church', city: 'Kisumu', tagline: 'Growing together' }, O);
ok(app.status === 201 && app.data.status === 'pending', 'academy application pending');
const slug = app.data.slug;
ok((await call('GET', `/public/academies/${slug}`)).status === 404, 'pending academy hidden publicly');
ok((await call('GET', '/admin/stats', null, L)).status === 403, 'learner blocked from admin');
const appr = await call('PATCH', `/admin/tenants/${app.data.id}`, { status: 'active' }, S);
ok(appr.data.status === 'active', 'super admin approves academy');
ok((await call('GET', `/public/academies/${slug}`)).status === 200, 'approved academy public');

console.log('LMS');
const c = await call('POST', `/t/${slug}/courses`, { title: 'Leadership Basics', summary: 'Lead like Jesus', passMark: 60 }, O);
ok(c.status === 201, 'owner creates course');
ok((await call('POST', `/t/${slug}/courses`, { title: 'X' }, L)).status === 403, 'non-member cannot create course');
const mod = await call('POST', `/t/${slug}/courses/${c.data.id}/modules`, { title: 'Module 1' }, O);
const l1x = await call('POST', `/t/${slug}/modules/${mod.data.id}/lessons`, { title: 'Servant leadership', type: 'text', content: 'Mark 10:45', isPreview: true }, O);
const l2x = await call('POST', `/t/${slug}/modules/${mod.data.id}/lessons`, { title: 'Vision', type: 'text', content: 'Habakkuk 2:2' }, O);
ok(l1x.status === 201 && l2x.status === 201, 'modules + lessons');
const qz = await call('POST', `/t/${slug}/courses/${c.data.id}/assessments`, { title: 'Final', isFinal: true, passMark: 60 }, O);
await call('POST', `/t/${slug}/assessments/${qz.data.id}/questions`, { questions: [{ type: 'single', prompt: 'Who came to serve?', options: ['Jesus', 'Pharaoh'], answer: 0 }, { type: 'truefalse', prompt: 'Vision should be written', answer: 0 }] }, O);
ok((await call('PATCH', `/t/${slug}/courses/${c.data.id}`, { status: 'published' }, O)).data.status === 'published', 'publish course');
ok((await call('GET', `/t/${slug}/lessons/${l2x.data.id}`, null, L)).status === 403, 'non-enrolled cannot open lesson');
ok((await call('POST', `/t/${slug}/courses/${c.data.id}/enroll`, null, L)).status === 403, 'non-member cannot enrol');
ok((await call('POST', `/t/${slug}/join`, null, L)).status === 201, 'learner joins academy');
ok((await call('POST', `/t/${slug}/courses/${c.data.id}/enroll`, null, L)).status === 201, 'learner enrols');
const les = await call('GET', `/t/${slug}/lessons/${l1x.data.id}`, null, L);
ok(les.data.nextId === l2x.data.id, 'lesson navigation');
await call('POST', `/t/${slug}/lessons/${l1x.data.id}/complete`, null, L);
const p2 = await call('POST', `/t/${slug}/lessons/${l2x.data.id}/complete`, null, L);
ok(p2.data.progressPct === 100 && !p2.data.completed, '100% lessons but final quiz pending');
const aq = await call('GET', `/t/${slug}/assessments/${qz.data.id}`, null, L);
ok(aq.data.questions.every((q) => q.answer === undefined), 'answers hidden from learners');
const [q1, q2] = aq.data.questions;
const fail1 = await call('POST', `/t/${slug}/assessments/${qz.data.id}/submit`, { answers: { [q1.id]: 1, [q2.id]: 1 } }, L);
ok(fail1.data.submission.passed === false, 'failed attempt graded');
const pass1 = await call('POST', `/t/${slug}/assessments/${qz.data.id}/submit`, { answers: { [q1.id]: 0, [q2.id]: 0 } }, L);
ok(pass1.data.submission.passed && pass1.data.progress.completed && pass1.data.progress.certificate?.serial, 'pass → course complete → certificate');
const serial = pass1.data.progress.certificate.serial;
ok((await call('GET', `/public/verify/${serial}`)).data.valid, 'public certificate verification');
const certs = await call('GET', '/me/certificates', null, L);
const pdf = await fetch(`${API}/me/certificates/${certs.data[0].id}/pdf`, { headers: { Authorization: `Bearer ${L}` } });
ok(pdf.headers.get('content-type') === 'application/pdf' && (await pdf.arrayBuffer()).byteLength > 5000, 'certificate PDF renders');

console.log('Cross-tenant isolation');
const flagship = await call('GET', '/t/genwise-academy/courses', null, O);
const fc = flagship.data[0];
ok((await call('PATCH', `/t/genwise-academy/courses/${fc.id}`, { title: 'hacked' }, O)).status === 403, 'other academy owner cannot edit flagship course');
ok((await call('GET', `/t/${slug}/lessons/${(await call('GET', `/t/genwise-academy/courses/${fc.id}`, null, S)).data.course.modules[0].lessons[0].id}`, null, O)).status === 404, 'lesson id from another tenant not found');

console.log('Podcasts, meetings, mentorship, prayer, billing');
const show = await call('POST', `/t/${slug}/podcasts`, { title: 'Hope Talks', visibility: 'public' }, O);
const ep = await call('POST', `/t/${slug}/podcasts/${show.data.id}/episodes`, { title: 'Episode 1', audioUrl: 'https://example.com/a.mp3' }, O);
ok(show.status === 201 && ep.status === 201, 'podcast show + episode');
const rss = await fetch(`${API}/public/rss/${slug}/${show.data.slug}`);
ok((await rss.text()).includes('<enclosure'), 'podcast RSS');
const mt = await call('POST', `/t/${slug}/meetings`, { title: 'Sunday Bible Class', type: 'live_class', startsAt: new Date(Date.now() + 5 * 60e3).toISOString() }, O);
ok(mt.status === 201 && mt.data.roomName?.startsWith('genwise-'), 'meeting created with room name');
ok((await call('POST', `/t/${slug}/meetings/${mt.data.id}/rsvp`, { rsvp: 'going' }, L)).status === 200, 'RSVP');
const j = await call('POST', `/t/${slug}/meetings/${mt.data.id}/join`, null, L);
ok(j.status === 200 && ['livekit', 'jitsi'].includes(j.data.provider), `join info (${j.data.provider})`);
ok((await fetch(`${API}/t/${slug}/meetings/${mt.data.id}/ics`, { headers: { Authorization: `Bearer ${L}` } })).headers.get('content-type').includes('text/calendar'), 'ICS download');
ok((await call('PUT', `/t/${slug}/mentors/me`, { headline: 'Youth mentor', expertise: 'Leadership, Marriage' }, O)).status === 200, 'mentor profile');
const req = await call('POST', `/t/${slug}/mentorships`, { mentorId: owner.user.id, message: 'Please mentor me' }, L);
ok(req.status === 201, 'mentorship request');
ok((await call('PATCH', `/t/${slug}/mentorships/${req.data.id}`, { status: 'active' }, L)).status === 403, 'mentee cannot accept own request');
ok((await call('PATCH', `/t/${slug}/mentorships/${req.data.id}`, { status: 'active' }, O)).data.status === 'active', 'mentor accepts');
await call('POST', `/t/${slug}/mentorships/${req.data.id}/notes`, { body: 'Private mentor note', visibility: 'private' }, O);
const sess = await call('POST', `/t/${slug}/mentorships/${req.data.id}/sessions`, { startsAt: new Date(Date.now() + 86400e3).toISOString() }, L);
ok(sess.status === 201 && sess.data.visibility === 'private', 'mentorship session booked (private meeting)');
const md = await call('GET', `/t/${slug}/mentorships/${req.data.id}`, null, L);
ok(md.data.notes.length === 0, 'private mentor notes hidden from mentee');
const g = await call('POST', `/t/${slug}/prayer/groups`, { name: 'Evening Prayer' }, O);
ok(g.status === 201, 'prayer group');
await call('POST', `/t/${slug}/prayer/groups/${g.data.id}/join`, null, L);
const pr = await call('POST', `/t/${slug}/prayer/requests`, { title: 'Exams next week', isAnonymous: true }, L);
await call('POST', `/t/${slug}/prayer/requests/${pr.data.id}/pray`, null, O);
const prl = await call('GET', `/t/${slug}/prayer/requests`, null, O);
ok(prl.data[0].prayedCount === 1 && prl.data[0].User.fullName === 'Anonymous', 'pray count + anonymity');
const pay = await call('POST', `/t/${slug}/payments`, { mpesaCode: `SJ${stamp.toUpperCase().slice(0, 8)}`.padEnd(10, 'X'), amountKes: 500, planCode: 'seed', payerPhone: '0712345678' }, O);
ok(pay.status === 201 && pay.data.status === 'pending', 'M-Pesa payment submitted');
const ap = await call('PATCH', `/admin/payments/${pay.data.id}`, { status: 'approved' }, S);
ok(ap.data.status === 'approved', 'super admin approves payment');
const bill = await call('GET', `/t/${slug}/billing`, null, O);
ok(bill.data.currentPlan === 'seed' && bill.data.mpesa.receiver === '254702122874', 'plan activated, M-Pesa line shown');
const ai = await call('POST', `/t/${slug}/ai/lesson/${l1x.data.id}`, { mode: 'summarize' }, L);
ok([200, 503].includes(ai.status), `AI guide responds (${ai.status}${ai.status === 503 ? ' — no key locally' : ''})`);
const notes = await call('GET', '/me/notifications', null, L);
ok(notes.data.items.length > 0, 'notifications delivered');
ok((await call('GET', '/public/stats')).data.academies >= 2, 'public stats');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
