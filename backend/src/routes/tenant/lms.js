'use strict';
const express = require('express');
const { Op } = require('sequelize');
const m = require('../../models');
const { ApiError, asyncHandler, pick, uniqueSlug } = require('../../utils');
const { authenticate, requireCap, can, aiLimiter } = require('../../middleware');
const { audit, notify } = require('../../services/common');
const aiSvc = require('../../services/ai');
const certSvc = require('../../services/certificate');

const router = express.Router({ mergeParams: true });
const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(String(s));

/* ------------------------------------------------------------------ helpers */
async function findCourse(req, idOrSlug) {
  const where = { tenantId: req.tenant.id, ...(isUuid(idOrSlug) ? { id: idOrSlug } : { slug: idOrSlug }) };
  const c = await m.Course.findOne({ where });
  if (!c) throw ApiError.notFound('Course not found');
  return c;
}
const canEditCourse = (req, course) => can(req, 'manage') || (can(req, 'teach') && course.instructorId === req.user?.id);
function assertEdit(req, course) { if (!canEditCourse(req, course)) throw ApiError.forbidden('Only the course instructor or academy admins can edit this course'); }
async function tenantRow(Model, req, id, label) {
  const row = isUuid(id) && await Model.findOne({ where: { id, tenantId: req.tenant.id } });
  if (!row) throw ApiError.notFound(`${label} not found`);
  return row;
}

/** Recalculate progress; issue certificate when all lessons done and final assessment (if any) passed. */
async function refreshProgress(req, enrollment) {
  const course = await m.Course.findByPk(enrollment.courseId);
  const total = await m.Lesson.count({ where: { courseId: course.id } });
  const done = await m.LessonProgress.count({ where: { enrollmentId: enrollment.id, completedAt: { [Op.ne]: null } } });
  const pct = total ? Math.round((done / total) * 100) : 0;
  const finals = await m.Assessment.findAll({ where: { courseId: course.id, isFinal: true }, attributes: ['id'] });
  let finalsPassed = true;
  for (const f of finals) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await m.Submission.findOne({ where: { assessmentId: f.id, userId: enrollment.userId, passed: true } }))) finalsPassed = false;
  }
  const complete = total > 0 && done >= total && finalsPassed;
  await enrollment.update({ progressPct: pct, completedAt: complete ? (enrollment.completedAt || new Date()) : null, status: complete ? 'completed' : 'active' });
  let certificate = null;
  if (complete && course.certificateEnabled) {
    let created;
    [certificate, created] = await m.Certificate.findOrCreate({
      where: { userId: enrollment.userId, courseId: course.id },
      defaults: { tenantId: course.tenantId, serial: certSvc.newSerial() },
    });
    if (created) {
      const u = await m.User.findByPk(enrollment.userId);
      await notify(u.id, { tenantId: course.tenantId, type: 'certificate', title: `Certificate earned: ${course.title}`, body: 'Congratulations! Your certificate is ready to download and share.', link: '/app/certificates', emailTo: u.email });
    }
  }
  return { progressPct: pct, completed: complete, certificate };
}

/* ------------------------------------------------------------------ courses */
router.get('/courses', asyncHandler(async (req, res) => {
  const staff = can(req, 'teach');
  const where = { tenantId: req.tenant.id };
  if (!(staff && req.query.all)) where.status = 'published';
  const rows = await m.Course.findAll({
    where, include: [{ model: m.User, as: 'instructor', attributes: ['id', 'fullName', 'avatarUrl'] }], order: [['createdAt', 'DESC']],
  });
  const lessonCounts = await m.Lesson.count({ where: { tenantId: req.tenant.id }, group: ['course_id'] });
  const lc = Object.fromEntries(lessonCounts.map((r) => [r.course_id, Number(r.count)]));
  let mine = {};
  if (req.user) {
    const ens = await m.Enrollment.findAll({ where: { tenantId: req.tenant.id, userId: req.user.id } });
    mine = Object.fromEntries(ens.map((e) => [e.courseId, e]));
  }
  res.json({ success: true, data: rows.map((c) => ({ ...c.toJSON(), lessonCount: lc[c.id] || 0, enrollment: mine[c.id] || null })) });
}));

router.post('/courses', authenticate, requireCap('teach'), asyncHandler(async (req, res) => {
  const { title } = req.body;
  if (!title) throw ApiError.badRequest('Course title is required');
  const c = await m.Course.create({
    ...pick(req.body, ['summary', 'description', 'coverUrl', 'level', 'category', 'estimatedHours', 'passMark', 'certificateEnabled']),
    title, tenantId: req.tenant.id, instructorId: req.body.instructorId && can(req, 'manage') ? req.body.instructorId : req.user.id,
    slug: await uniqueSlug(m.Course, title, { tenantId: req.tenant.id }), status: 'draft',
  });
  await audit(req, 'course.created', { entityType: 'course', entityId: c.id });
  res.status(201).json({ success: true, data: c });
}));

router.get('/courses/:courseId', asyncHandler(async (req, res) => {
  const course = await findCourse(req, req.params.courseId);
  const staff = canEditCourse(req, course);
  if (course.status !== 'published' && !staff) throw ApiError.notFound('Course not found');
  const full = await m.Course.findByPk(course.id, {
    include: [
      { model: m.User, as: 'instructor', attributes: ['id', 'fullName', 'avatarUrl', 'bio'] },
      { model: m.CourseModule, as: 'modules', include: [{ model: m.Lesson, as: 'lessons', attributes: ['id', 'title', 'type', 'durationMin', 'position', 'isPreview', 'meetingId', 'assessmentId'] }] },
      { model: m.Assessment, as: 'assessments', attributes: ['id', 'title', 'passMark', 'maxAttempts', 'timeLimitMin', 'isFinal'] },
    ],
    order: [[{ model: m.CourseModule, as: 'modules' }, 'position', 'ASC'], [{ model: m.CourseModule, as: 'modules' }, { model: m.Lesson, as: 'lessons' }, 'position', 'ASC']],
  });
  let enrollment = null; let completed = []; let certificate = null;
  if (req.user) {
    enrollment = await m.Enrollment.findOne({ where: { courseId: course.id, userId: req.user.id } });
    if (enrollment) completed = (await m.LessonProgress.findAll({ where: { enrollmentId: enrollment.id, completedAt: { [Op.ne]: null } }, attributes: ['lessonId'] })).map((p) => p.lessonId);
    certificate = await m.Certificate.findOne({ where: { courseId: course.id, userId: req.user.id } });
  }
  const enrolledCount = await m.Enrollment.count({ where: { courseId: course.id } });
  res.json({ success: true, data: { course: full, enrollment, completedLessonIds: completed, certificate, enrolledCount, canEdit: staff } });
}));

router.patch('/courses/:courseId', authenticate, asyncHandler(async (req, res) => {
  const course = await findCourse(req, req.params.courseId);
  assertEdit(req, course);
  const data = pick(req.body, ['title', 'summary', 'description', 'coverUrl', 'level', 'category', 'estimatedHours', 'passMark', 'certificateEnabled', 'status']);
  if (data.status && !['draft', 'published', 'archived'].includes(data.status)) throw ApiError.badRequest('Invalid status');
  if (data.status === 'published' && !(await m.Lesson.count({ where: { courseId: course.id } }))) throw ApiError.badRequest('Add at least one lesson before publishing');
  await course.update(data);
  await audit(req, 'course.updated', { entityType: 'course', entityId: course.id, meta: { status: data.status } });
  res.json({ success: true, data: course });
}));

router.delete('/courses/:courseId', authenticate, asyncHandler(async (req, res) => {
  const course = await findCourse(req, req.params.courseId);
  assertEdit(req, course);
  if (await m.Enrollment.count({ where: { courseId: course.id } })) { await course.update({ status: 'archived' }); return res.json({ success: true, data: { archived: true } }); }
  await m.Lesson.destroy({ where: { courseId: course.id } });
  await course.destroy();
  res.json({ success: true, data: { deleted: true } });
}));

/* modules + lessons */
router.post('/courses/:courseId/modules', authenticate, asyncHandler(async (req, res) => {
  const course = await findCourse(req, req.params.courseId);
  assertEdit(req, course);
  if (!req.body.title) throw ApiError.badRequest('Module title is required');
  const position = await m.CourseModule.count({ where: { courseId: course.id } });
  res.status(201).json({ success: true, data: await m.CourseModule.create({ tenantId: req.tenant.id, courseId: course.id, title: req.body.title, summary: req.body.summary, position }) });
}));
router.patch('/modules/:id', authenticate, asyncHandler(async (req, res) => {
  const mod = await tenantRow(m.CourseModule, req, req.params.id, 'Module');
  assertEdit(req, await m.Course.findByPk(mod.courseId));
  await mod.update(pick(req.body, ['title', 'summary', 'position']));
  res.json({ success: true, data: mod });
}));
router.delete('/modules/:id', authenticate, asyncHandler(async (req, res) => {
  const mod = await tenantRow(m.CourseModule, req, req.params.id, 'Module');
  assertEdit(req, await m.Course.findByPk(mod.courseId));
  await m.Lesson.destroy({ where: { moduleId: mod.id } });
  await mod.destroy();
  res.json({ success: true, data: { ok: true } });
}));

const LESSON_FIELDS = ['title', 'type', 'content', 'mediaUrl', 'durationMin', 'position', 'isPreview', 'meetingId', 'assessmentId', 'scriptureRefs'];
router.post('/modules/:id/lessons', authenticate, asyncHandler(async (req, res) => {
  const mod = await tenantRow(m.CourseModule, req, req.params.id, 'Module');
  assertEdit(req, await m.Course.findByPk(mod.courseId));
  if (!req.body.title) throw ApiError.badRequest('Lesson title is required');
  const position = await m.Lesson.count({ where: { moduleId: mod.id } });
  const l = await m.Lesson.create({ position, ...pick(req.body, LESSON_FIELDS), tenantId: req.tenant.id, courseId: mod.courseId, moduleId: mod.id });
  res.status(201).json({ success: true, data: l });
}));
router.patch('/lessons/:id', authenticate, asyncHandler(async (req, res) => {
  const l = await tenantRow(m.Lesson, req, req.params.id, 'Lesson');
  assertEdit(req, await m.Course.findByPk(l.courseId));
  await l.update(pick(req.body, LESSON_FIELDS));
  res.json({ success: true, data: l });
}));
router.delete('/lessons/:id', authenticate, asyncHandler(async (req, res) => {
  const l = await tenantRow(m.Lesson, req, req.params.id, 'Lesson');
  assertEdit(req, await m.Course.findByPk(l.courseId));
  await m.LessonProgress.destroy({ where: { lessonId: l.id } });
  await l.destroy();
  res.json({ success: true, data: { ok: true } });
}));

/* enrolment + learning */
router.post('/courses/:courseId/enroll', authenticate, requireCap('member'), asyncHandler(async (req, res) => {
  const course = await findCourse(req, req.params.courseId);
  if (course.status !== 'published') throw ApiError.badRequest('This course is not open for enrolment');
  const [e, created] = await m.Enrollment.findOrCreate({ where: { courseId: course.id, userId: req.user.id }, defaults: { tenantId: req.tenant.id } });
  if (created) await audit(req, 'course.enrolled', { entityType: 'course', entityId: course.id });
  res.status(created ? 201 : 200).json({ success: true, data: e });
}));

router.get('/lessons/:id', asyncHandler(async (req, res) => {
  const l = await tenantRow(m.Lesson, req, req.params.id, 'Lesson');
  const course = await m.Course.findByPk(l.courseId);
  const staff = canEditCourse(req, course);
  const enrollment = req.user ? await m.Enrollment.findOne({ where: { courseId: course.id, userId: req.user.id } }) : null;
  if (!staff && !(l.isPreview && course.status === 'published') && !enrollment) throw ApiError.forbidden('Enrol in this course to open this lesson');
  const ordered = await m.Lesson.findAll({
    where: { courseId: course.id }, attributes: ['id', 'title', 'moduleId', 'position'],
    include: [{ model: m.CourseModule, as: 'module', attributes: ['position'] }],
  });
  ordered.sort((a, b) => (a.module.position - b.module.position) || (a.position - b.position));
  const idx = ordered.findIndex((x) => x.id === l.id);
  let progress = null;
  if (enrollment) {
    progress = await m.LessonProgress.findOne({ where: { enrollmentId: enrollment.id, lessonId: l.id } });
    await enrollment.update({ lastLessonId: l.id });
  }
  let meeting = null;
  if (l.meetingId) meeting = await m.Meeting.findOne({ where: { id: l.meetingId, tenantId: req.tenant.id }, attributes: ['id', 'title', 'startsAt', 'endsAt', 'status', 'recordingUrl'] });
  res.json({ success: true, data: { lesson: l, course: { id: course.id, title: course.title, slug: course.slug }, prevId: ordered[idx - 1]?.id || null, nextId: ordered[idx + 1]?.id || null, completed: !!progress?.completedAt, enrolled: !!enrollment, meeting } });
}));

router.post('/lessons/:id/complete', authenticate, asyncHandler(async (req, res) => {
  const l = await tenantRow(m.Lesson, req, req.params.id, 'Lesson');
  const enrollment = await m.Enrollment.findOne({ where: { courseId: l.courseId, userId: req.user.id } });
  if (!enrollment) throw ApiError.forbidden('Enrol in this course first');
  const [p] = await m.LessonProgress.findOrCreate({ where: { enrollmentId: enrollment.id, lessonId: l.id }, defaults: { tenantId: req.tenant.id, userId: req.user.id } });
  if (!p.completedAt) await p.update({ completedAt: new Date() });
  res.json({ success: true, data: await refreshProgress(req, enrollment) });
}));

/* ------------------------------------------------------------------ assessments */
router.post('/courses/:courseId/assessments', authenticate, asyncHandler(async (req, res) => {
  const course = await findCourse(req, req.params.courseId);
  assertEdit(req, course);
  if (!req.body.title) throw ApiError.badRequest('Title is required');
  const a = await m.Assessment.create({ ...pick(req.body, ['title', 'description', 'passMark', 'maxAttempts', 'timeLimitMin', 'isFinal']), tenantId: req.tenant.id, courseId: course.id });
  res.status(201).json({ success: true, data: a });
}));

router.get('/assessments/:id', authenticate, asyncHandler(async (req, res) => {
  const a = await tenantRow(m.Assessment, req, req.params.id, 'Assessment');
  const course = await m.Course.findByPk(a.courseId);
  const staff = canEditCourse(req, course);
  const enrolled = await m.Enrollment.findOne({ where: { courseId: course.id, userId: req.user.id } });
  if (!staff && !enrolled) throw ApiError.forbidden('Enrol in this course first');
  const questions = await m.Question.findAll({ where: { assessmentId: a.id }, order: [['position', 'ASC']] });
  const subs = await m.Submission.findAll({ where: { assessmentId: a.id, userId: req.user.id }, order: [['attempt', 'DESC']] });
  res.json({
    success: true,
    data: {
      assessment: a, course: { id: course.id, title: course.title, slug: course.slug }, canEdit: staff,
      questions: questions.map((q) => (staff ? q : { id: q.id, type: q.type, prompt: q.prompt, options: q.options, points: q.points, position: q.position })),
      attempts: subs, attemptsLeft: Math.max(0, a.maxAttempts - subs.length),
    },
  });
}));

router.patch('/assessments/:id', authenticate, asyncHandler(async (req, res) => {
  const a = await tenantRow(m.Assessment, req, req.params.id, 'Assessment');
  assertEdit(req, await m.Course.findByPk(a.courseId));
  await a.update(pick(req.body, ['title', 'description', 'passMark', 'maxAttempts', 'timeLimitMin', 'isFinal']));
  res.json({ success: true, data: a });
}));
router.delete('/assessments/:id', authenticate, asyncHandler(async (req, res) => {
  const a = await tenantRow(m.Assessment, req, req.params.id, 'Assessment');
  assertEdit(req, await m.Course.findByPk(a.courseId));
  await m.Question.destroy({ where: { assessmentId: a.id } });
  await m.Submission.destroy({ where: { assessmentId: a.id } });
  await a.destroy();
  res.json({ success: true, data: { ok: true } });
}));

const Q_TYPES = ['single', 'multi', 'truefalse', 'short', 'essay'];
function normQuestion(body) {
  const q = pick(body, ['type', 'prompt', 'options', 'answer', 'points', 'position', 'explanation']);
  if (q.type && !Q_TYPES.includes(q.type)) throw ApiError.badRequest('Invalid question type');
  if (q.type === 'truefalse') q.options = ['True', 'False'];
  return q;
}
router.post('/assessments/:id/questions', authenticate, asyncHandler(async (req, res) => {
  const a = await tenantRow(m.Assessment, req, req.params.id, 'Assessment');
  assertEdit(req, await m.Course.findByPk(a.courseId));
  const list = Array.isArray(req.body.questions) ? req.body.questions : [req.body];
  let position = await m.Question.count({ where: { assessmentId: a.id } });
  const out = [];
  for (const raw of list) {
    const q = normQuestion(raw);
    if (!q.prompt) throw ApiError.badRequest('Question prompt is required');
    // eslint-disable-next-line no-await-in-loop
    out.push(await m.Question.create({ type: 'single', position: position++, ...q, tenantId: req.tenant.id, assessmentId: a.id }));
  }
  res.status(201).json({ success: true, data: out });
}));
router.patch('/questions/:id', authenticate, asyncHandler(async (req, res) => {
  const q = await tenantRow(m.Question, req, req.params.id, 'Question');
  const a = await m.Assessment.findByPk(q.assessmentId);
  assertEdit(req, await m.Course.findByPk(a.courseId));
  await q.update(normQuestion(req.body));
  res.json({ success: true, data: q });
}));
router.delete('/questions/:id', authenticate, asyncHandler(async (req, res) => {
  const q = await tenantRow(m.Question, req, req.params.id, 'Question');
  const a = await m.Assessment.findByPk(q.assessmentId);
  assertEdit(req, await m.Course.findByPk(a.courseId));
  await q.destroy();
  res.json({ success: true, data: { ok: true } });
}));

function gradeOne(q, given) {
  if (q.type === 'essay' || q.type === 'short') {
    if (q.type === 'short' && q.answer != null && String(q.answer).trim()) {
      const accepted = String(q.answer).toLowerCase().split('|').map((s) => s.trim());
      return { auto: true, correct: accepted.includes(String(given || '').toLowerCase().trim()) };
    }
    return { auto: false, correct: false };
  }
  if (q.type === 'multi') {
    const want = [...(Array.isArray(q.answer) ? q.answer : [])].map(Number).sort().join(',');
    const got = [...(Array.isArray(given) ? given : [])].map(Number).sort().join(',');
    return { auto: true, correct: want === got };
  }
  return { auto: true, correct: Number(given) === Number(q.answer) };
}

router.post('/assessments/:id/submit', authenticate, asyncHandler(async (req, res) => {
  const a = await tenantRow(m.Assessment, req, req.params.id, 'Assessment');
  const enrollment = await m.Enrollment.findOne({ where: { courseId: a.courseId, userId: req.user.id } });
  if (!enrollment) throw ApiError.forbidden('Enrol in this course first');
  const prior = await m.Submission.count({ where: { assessmentId: a.id, userId: req.user.id } });
  if (prior >= a.maxAttempts) throw ApiError.badRequest('You have used all attempts for this assessment');
  const questions = await m.Question.findAll({ where: { assessmentId: a.id } });
  const answers = req.body.answers || {};
  let total = 0; let earned = 0; let needsManual = false;
  const review = {};
  for (const q of questions) {
    total += q.points;
    const g = gradeOne(q, answers[q.id]);
    if (!g.auto) needsManual = true;
    if (g.correct) earned += q.points;
    review[q.id] = { correct: g.auto ? g.correct : null, answer: g.auto ? q.answer : undefined, explanation: q.explanation };
  }
  const score = total ? Math.round((earned / total) * 100) : 0;
  const passed = !needsManual && score >= a.passMark;
  const sub = await m.Submission.create({ tenantId: req.tenant.id, assessmentId: a.id, userId: req.user.id, attempt: prior + 1, answers, score, passed, status: needsManual ? 'pending' : 'graded' });
  const progress = await refreshProgress(req, enrollment);
  res.status(201).json({ success: true, data: { submission: sub, review, progress } });
}));

router.get('/assessments/:id/submissions', authenticate, asyncHandler(async (req, res) => {
  const a = await tenantRow(m.Assessment, req, req.params.id, 'Assessment');
  assertEdit(req, await m.Course.findByPk(a.courseId));
  res.json({ success: true, data: await m.Submission.findAll({ where: { assessmentId: a.id }, include: [{ model: m.User, attributes: ['fullName', 'email'] }], order: [['createdAt', 'DESC']] }) });
}));

router.patch('/submissions/:id/grade', authenticate, asyncHandler(async (req, res) => {
  const s = await tenantRow(m.Submission, req, req.params.id, 'Submission');
  const a = await m.Assessment.findByPk(s.assessmentId);
  assertEdit(req, await m.Course.findByPk(a.courseId));
  const score = Math.max(0, Math.min(100, parseInt(req.body.score, 10) || 0));
  await s.update({ score, passed: score >= a.passMark, status: 'graded', feedback: req.body.feedback, gradedBy: req.user.id });
  const enrollment = await m.Enrollment.findOne({ where: { courseId: a.courseId, userId: s.userId } });
  if (enrollment) await refreshProgress(req, enrollment);
  const u = await m.User.findByPk(s.userId);
  await notify(u.id, { tenantId: req.tenant.id, title: `Graded: ${a.title}`, body: `You scored ${score}%. ${s.passed ? 'Well done!' : ''}`, link: `/app/a/${req.tenant.slug}/assessments/${a.id}`, emailTo: u.email });
  res.json({ success: true, data: s });
}));

/* ------------------------------------------------------------------ AI */
router.post('/ai/lesson/:lessonId', authenticate, aiLimiter, asyncHandler(async (req, res) => {
  const l = await tenantRow(m.Lesson, req, req.params.lessonId, 'Lesson');
  const course = await m.Course.findByPk(l.courseId);
  const ok = canEditCourse(req, course) || await m.Enrollment.findOne({ where: { courseId: course.id, userId: req.user.id } }) || l.isPreview;
  if (!ok) throw ApiError.forbidden('Enrol in this course to use the AI Study Guide');
  res.json({ success: true, data: await aiSvc.lessonGuide({ tenant: req.tenant, user: req.user, lesson: l, course, mode: req.body.mode || 'summarize', question: req.body.question }) });
}));

router.post('/ai/quiz-draft', authenticate, requireCap('teach'), aiLimiter, asyncHandler(async (req, res) => {
  let topic = req.body.topic;
  if (req.body.lessonId) topic = (await tenantRow(m.Lesson, req, req.body.lessonId, 'Lesson')).content;
  if (!topic) throw ApiError.badRequest('Provide lesson content or a topic');
  res.json({ success: true, data: await aiSvc.draftQuiz({ tenant: req.tenant, user: req.user, topic, count: req.body.count || 5 }) });
}));

module.exports = router;
