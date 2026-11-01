'use strict';
/**
 * Idempotent seeder: plans, super admins (from env), flagship academy with sample content.
 *   node src/db/seed.js
 */
const config = require('../config');
const m = require('../models');

const PLANS = [
  { code: 'free', name: 'Free', tagline: 'Everything you need to launch your academy', priceKes: 0, position: 1,
    features: ['Unlimited courses & learners', 'Podcasts & live classes', 'Mentorship & prayer groups', 'AI Study Guide', 'Certificates'] },
  { code: 'seed', name: 'Seed', tagline: 'For growing churches and ministries', priceKes: 0, position: 2,
    features: ['Everything in Free', 'Custom academy branding', 'Priority email support'] },
  { code: 'growth', name: 'Growth', tagline: 'For multi-campus ministries', priceKes: 0, position: 3,
    features: ['Everything in Seed', 'Larger live classes', 'Higher AI limits', 'Advanced analytics'] },
  { code: 'kingdom', name: 'Kingdom', tagline: 'For networks and denominations', priceKes: 0, position: 4,
    features: ['Everything in Growth', 'Dedicated onboarding', 'Custom domain (coming soon)'] },
];

async function seedPlans() {
  for (const p of PLANS) {
    const [plan, created] = await m.Plan.findOrCreate({ where: { code: p.code }, defaults: p });
    if (!created) await plan.update({ name: p.name, tagline: p.tagline, features: p.features, position: p.position });
  }
  console.log(`  plans: ${PLANS.length}`);
}

async function seedSuperAdmins() {
  const users = [];
  for (const a of config.superAdmins) {
    let u = await m.User.scope('withSecret').findOne({ where: { email: a.email.toLowerCase() } });
    if (!u) {
      u = m.User.build({ fullName: a.name || a.email.split('@')[0], email: a.email, isSuperAdmin: true, emailVerifiedAt: new Date(), status: 'active', country: 'Kenya' });
      await u.setPassword(a.password);
      await u.save();
      console.log(`  super admin created: ${a.email}`);
    } else {
      if (!u.isSuperAdmin || !u.emailVerifiedAt) await u.update({ isSuperAdmin: true, emailVerifiedAt: u.emailVerifiedAt || new Date() });
      console.log(`  super admin exists: ${a.email}`);
    }
    users.push(u);
  }
  if (!config.superAdmins.length) console.warn('  ! no SUPER_ADMIN_n_EMAIL/PASSWORD in env');
  return users;
}

async function seedFlagship(owner) {
  if (!owner) return;
  const [t, created] = await m.Tenant.findOrCreate({
    where: { slug: 'genwise-academy' },
    defaults: {
      name: 'GenWise Academy', type: 'ministry', status: 'active', ownerId: owner.id, approvedAt: new Date(), approvedBy: owner.id,
      tagline: 'Raising wise, Christ-centred leaders across Africa',
      about: 'The flagship academy of GenWise Africa. Foundations of faith, leadership and life wisdom, taught by mentors and guided by AI.',
      welcomeVerse: 'The fear of the LORD is the beginning of wisdom. — Proverbs 9:10',
      country: 'Kenya', city: 'Nairobi', joinPolicy: 'open', contactEmail: 'hello@genwiseafrica.org',
    },
  });
  for (const u of await m.User.findAll({ where: { isSuperAdmin: true } })) {
    await m.Membership.findOrCreate({ where: { tenantId: t.id, userId: u.id }, defaults: { role: u.id === owner.id ? 'owner' : 'admin' } });
  }
  if (!created) { console.log('  flagship academy exists'); return; }

  const course = await m.Course.create({
    tenantId: t.id, instructorId: owner.id, title: 'Foundations of Wisdom', slug: 'foundations-of-wisdom', status: 'published',
    summary: 'A 3-part journey through Proverbs: what wisdom is, how it shapes character, and how to pass it on.',
    description: 'In this course you will discover the biblical meaning of wisdom, practise daily habits that grow it, and learn to mentor others. Each lesson includes reflection questions and an AI Study Guide.',
    level: 'beginner', category: 'Discipleship', estimatedHours: 2, passMark: 70,
  });
  const mods = [
    { title: 'What is Wisdom?', lessons: [
      { title: 'Wisdom begins with God', type: 'text', content: '## The beginning of wisdom\n\nProverbs 9:10 tells us that *the fear of the LORD is the beginning of wisdom*. Biblical wisdom is not merely intelligence — it is skill in living rightly before God and people.\n\n### Reflect\n- Where do you most need wisdom this week?\n- What does "fear of the LORD" mean in everyday decisions?', scriptureRefs: 'Proverbs 9:10; James 1:5', isPreview: true },
      { title: 'Knowledge, understanding and wisdom', type: 'text', content: '## Three gifts\n\n**Knowledge** is knowing facts. **Understanding** is seeing how they connect. **Wisdom** is applying them well.\n\nProverbs 2:6 — "For the LORD gives wisdom; from his mouth come knowledge and understanding."', scriptureRefs: 'Proverbs 2:1-11' },
    ] },
    { title: 'Living Wisely', lessons: [
      { title: 'Words that build', type: 'text', content: '## The power of the tongue\n\nProverbs 18:21 — "Death and life are in the power of the tongue." Wise people speak slowly, truthfully and graciously.\n\n### Practice\nFor seven days, before you reply in a hard conversation, pause and pray one sentence.', scriptureRefs: 'Proverbs 18:21; Ephesians 4:29' },
      { title: 'Diligence and stewardship', type: 'text', content: '## Faithful in little\n\nProverbs 6:6-8 points us to the ant: no overseer, yet faithful. Wisdom shows up in how we handle time, money and opportunities.', scriptureRefs: 'Proverbs 6:6-8; Luke 16:10' },
    ] },
    { title: 'Leading Generations', lessons: [
      { title: 'Mentoring the next generation', type: 'text', content: '## Passing it on\n\n2 Timothy 2:2 — "What you have heard from me... entrust to reliable people who will also be qualified to teach others." Wisdom multiplies when it is shared.\n\n### Your step\nName one younger person you can encourage this month.', scriptureRefs: '2 Timothy 2:2; Psalm 78:4' },
    ] },
  ];
  let mp = 0;
  for (const md of mods) {
    const mod = await m.CourseModule.create({ tenantId: t.id, courseId: course.id, title: md.title, position: mp++ });
    let lp = 0;
    for (const l of md.lessons) await m.Lesson.create({ tenantId: t.id, courseId: course.id, moduleId: mod.id, position: lp++, durationMin: 10, ...l });
  }
  const quiz = await m.Assessment.create({ tenantId: t.id, courseId: course.id, title: 'Foundations of Wisdom — Final Check', passMark: 70, maxAttempts: 3, isFinal: true });
  const qs = [
    { type: 'single', prompt: 'According to Proverbs 9:10, what is the beginning of wisdom?', options: ['Education', 'The fear of the LORD', 'Experience', 'Wealth'], answer: 1, explanation: 'Proverbs 9:10' },
    { type: 'truefalse', prompt: 'Biblical wisdom is mainly about being intelligent.', options: ['True', 'False'], answer: 1, explanation: 'Wisdom is skill in living rightly before God.' },
    { type: 'single', prompt: 'Which verse speaks of entrusting teaching to reliable people?', options: ['2 Timothy 2:2', 'John 3:16', 'Genesis 1:1', 'Psalm 23:1'], answer: 0 },
  ];
  let qp = 0;
  for (const q of qs) await m.Question.create({ tenantId: t.id, assessmentId: quiz.id, position: qp++, points: 1, ...q });

  const show = await m.PodcastShow.create({ tenantId: t.id, hostId: owner.id, title: 'Wisdom for the Week', slug: 'wisdom-for-the-week', description: 'Short devotional conversations on wisdom, leadership and faith for everyday life.', visibility: 'public' });
  await m.PodcastEpisode.create({ tenantId: t.id, showId: show.id, title: 'Ep 1 — Why wisdom matters today', slug: 'why-wisdom-matters', notes: 'We open the series by asking why wisdom is the principal thing (Proverbs 4:7).', scriptureRefs: 'Proverbs 4:7', durationMin: 18 });

  const g = await m.PrayerGroup.create({ tenantId: t.id, leaderId: owner.id, name: 'Morning Intercessors', slug: 'morning-intercessors', description: 'We pray for families, leaders and the next generation every weekday morning.', schedule: 'Weekdays 6:00 AM EAT' });
  await m.PrayerGroupMember.create({ tenantId: t.id, groupId: g.id, userId: owner.id, role: 'leader' });

  const start = new Date(); start.setDate(start.getDate() + 7); start.setHours(18, 0, 0, 0);
  await m.Meeting.create({ tenantId: t.id, hostId: owner.id, type: 'live_class', title: 'Live Class: Walking in Wisdom', description: 'An interactive session with Q&A on the Foundations of Wisdom course.', startsAt: start, endsAt: new Date(start.getTime() + 3600e3), provider: 'livekit', visibility: 'public', courseId: course.id });
  await m.MentorProfile.create({ tenantId: t.id, userId: owner.id, headline: 'Leadership & discipleship mentor', bio: 'Passionate about raising wise leaders.', expertise: ['Leadership', 'Discipleship', 'Career'], capacity: 5 });
  console.log('  flagship academy seeded with sample course, podcast, prayer group and live class');
}

async function main() {
  try {
    await m.sequelize.authenticate();
    await seedPlans();
    const admins = await seedSuperAdmins();
    await seedFlagship(admins[0]);
    console.log('Seed complete');
  } catch (e) {
    console.error('Seed failed:', e);
    process.exitCode = 1;
  } finally {
    await m.sequelize.close();
  }
}
if (require.main === module) main();
