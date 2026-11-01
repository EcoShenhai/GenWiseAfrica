'use strict';
const bcrypt = require('bcryptjs');
const { DataTypes: T } = require('sequelize');
const { sequelize } = require('../db');
const config = require('../config');

const pk = () => ({ type: T.UUID, defaultValue: T.UUIDV4, primaryKey: true });
const tid = () => ({ type: T.UUID, allowNull: false });
const fk = (allowNull = false) => ({ type: T.UUID, allowNull });
const str = (len = 255, allowNull = true, defaultValue) => ({ type: T.STRING(len), allowNull, ...(defaultValue !== undefined ? { defaultValue } : {}) });
const text = () => ({ type: T.TEXT });
const bool = (d = false) => ({ type: T.BOOLEAN, allowNull: false, defaultValue: d });
const int = (d = 0) => ({ type: T.INTEGER, allowNull: false, defaultValue: d });
const date = () => ({ type: T.DATE });
const json = (d = {}) => ({ type: T.JSONB, allowNull: false, defaultValue: d });
const tIdx = (...extra) => [{ fields: ['tenant_id'] }, ...extra];

/* ------------------------------------------------------------------ identity */
const User = sequelize.define('User', {
  id: pk(),
  fullName: str(160, false),
  email: { type: T.STRING(190), allowNull: false, unique: true, set(v) { this.setDataValue('email', String(v || '').trim().toLowerCase()); } },
  phone: str(40),
  passwordHash: str(100, false),
  avatarUrl: str(500),
  bio: text(),
  country: str(80),
  emailVerifiedAt: date(),
  isSuperAdmin: bool(false),
  status: str(20, false, 'active'),
  lastLoginAt: date(),
}, {
  tableName: 'users',
  defaultScope: { attributes: { exclude: ['passwordHash'] } },
  scopes: { withSecret: { attributes: { include: ['passwordHash'] } } },
});
User.prototype.setPassword = async function setPassword(pw) {
  this.passwordHash = await bcrypt.hash(String(pw), config.security.bcryptRounds);
};
User.prototype.validatePassword = function validatePassword(pw) {
  return this.passwordHash ? bcrypt.compare(String(pw || ''), this.passwordHash) : false;
};
User.prototype.toSafeJSON = function toSafeJSON() {
  const { passwordHash, ...rest } = this.get({ plain: true });
  return { ...rest, emailVerified: !!rest.emailVerifiedAt };
};

const AuthCode = sequelize.define('AuthCode', {
  id: pk(), userId: fk(), purpose: str(30, false), codeHash: str(128, false),
  expiresAt: { type: T.DATE, allowNull: false }, attempts: int(0), consumedAt: date(), ip: str(64),
}, { tableName: 'auth_codes', updatedAt: false, indexes: [{ fields: ['user_id', 'purpose'] }] });

const RefreshToken = sequelize.define('RefreshToken', {
  id: pk(), userId: fk(), tokenHash: str(128, false), expiresAt: { type: T.DATE, allowNull: false }, revokedAt: date(), userAgent: str(300),
}, { tableName: 'refresh_tokens', indexes: [{ fields: ['token_hash'] }, { fields: ['user_id'] }] });

/* ------------------------------------------------------------------ tenancy */
const Tenant = sequelize.define('Tenant', {
  id: pk(),
  name: str(160, false),
  slug: { type: T.STRING(80), allowNull: false, unique: true },
  type: str(30, false, 'church'), // church | ministry | mentor | organisation
  status: str(20, false, 'pending'), // pending | active | suspended | rejected
  tagline: str(200), about: text(),
  logoUrl: str(500), coverUrl: str(500), primaryColor: str(9, true, '#0B6E4F'),
  welcomeVerse: str(400), country: str(80, true, 'Kenya'), city: str(80), denomination: str(120),
  website: str(300), contactEmail: str(190), contactPhone: str(40),
  joinPolicy: str(20, false, 'open'), // open | approval
  ownerId: fk(),
  planCode: str(30, false, 'free'),
  planRenewsAt: date(),
  settings: json({}),
  approvedAt: date(), approvedBy: fk(true), statusNote: str(400),
}, { tableName: 'tenants' });

const Membership = sequelize.define('Membership', {
  id: pk(), tenantId: tid(), userId: fk(),
  role: str(30, false, 'learner'), // owner | admin | instructor | mentor | prayer_leader | learner
  status: str(20, false, 'active'), // active | pending | removed
}, { tableName: 'memberships', indexes: [{ unique: true, fields: ['tenant_id', 'user_id'] }, { fields: ['user_id'] }] });

/* ------------------------------------------------------------------ LMS */
const Course = sequelize.define('Course', {
  id: pk(), tenantId: tid(), instructorId: fk(),
  title: str(200, false), slug: str(120, false), summary: str(400), description: text(),
  coverUrl: str(500), level: str(20, true, 'beginner'), category: str(80, true, 'Discipleship'),
  status: str(20, false, 'draft'), // draft | published | archived
  isFree: bool(true), priceKes: int(0),
  certificateEnabled: bool(true), passMark: int(70), estimatedHours: { type: T.DECIMAL(5, 1), defaultValue: 1 },
}, { tableName: 'courses', indexes: tIdx({ unique: true, fields: ['tenant_id', 'slug'] }) });

const CourseModule = sequelize.define('CourseModule', {
  id: pk(), tenantId: tid(), courseId: fk(), title: str(200, false), summary: str(400), position: int(0),
}, { tableName: 'course_modules', indexes: tIdx({ fields: ['course_id'] }) });

const Lesson = sequelize.define('Lesson', {
  id: pk(), tenantId: tid(), courseId: fk(), moduleId: fk(),
  title: str(200, false),
  type: str(20, false, 'text'), // video | audio | text | pdf | live | quiz
  content: text(), mediaUrl: str(600), durationMin: int(10), position: int(0), isPreview: bool(false),
  meetingId: fk(true), assessmentId: fk(true), scriptureRefs: str(300),
}, { tableName: 'lessons', indexes: tIdx({ fields: ['module_id'] }, { fields: ['course_id'] }) });

const Enrollment = sequelize.define('Enrollment', {
  id: pk(), tenantId: tid(), courseId: fk(), userId: fk(),
  status: str(20, false, 'active'), progressPct: int(0), lastLessonId: fk(true), completedAt: date(),
}, { tableName: 'enrollments', indexes: tIdx({ unique: true, fields: ['course_id', 'user_id'] }, { fields: ['user_id'] }) });

const LessonProgress = sequelize.define('LessonProgress', {
  id: pk(), tenantId: tid(), enrollmentId: fk(), lessonId: fk(), userId: fk(), completedAt: date(), positionSec: int(0),
}, { tableName: 'lesson_progress', indexes: tIdx({ unique: true, fields: ['enrollment_id', 'lesson_id'] }) });

const Assessment = sequelize.define('Assessment', {
  id: pk(), tenantId: tid(), courseId: fk(), title: str(200, false), description: text(),
  passMark: int(70), maxAttempts: int(3), timeLimitMin: int(0), isFinal: bool(false),
}, { tableName: 'assessments', indexes: tIdx({ fields: ['course_id'] }) });

const Question = sequelize.define('Question', {
  id: pk(), tenantId: tid(), assessmentId: fk(),
  type: str(20, false, 'single'), // single | multi | truefalse | short | essay
  prompt: { type: T.TEXT, allowNull: false }, options: json([]), answer: json(null), points: int(1), position: int(0), explanation: text(),
}, { tableName: 'questions', indexes: tIdx({ fields: ['assessment_id'] }) });

const Submission = sequelize.define('Submission', {
  id: pk(), tenantId: tid(), assessmentId: fk(), userId: fk(), attempt: int(1), answers: json({}),
  score: int(0), passed: bool(false), status: str(20, false, 'graded'), feedback: text(), gradedBy: fk(true),
}, { tableName: 'submissions', indexes: tIdx({ fields: ['assessment_id', 'user_id'] }) });

const Certificate = sequelize.define('Certificate', {
  id: pk(), tenantId: tid(), userId: fk(), courseId: fk(), serial: { type: T.STRING(40), allowNull: false, unique: true },
  issuedAt: { type: T.DATE, allowNull: false, defaultValue: T.NOW }, revokedAt: date(),
}, { tableName: 'certificates', indexes: tIdx({ unique: true, fields: ['user_id', 'course_id'] }) });

/* ------------------------------------------------------------------ podcasts */
const PodcastShow = sequelize.define('PodcastShow', {
  id: pk(), tenantId: tid(), hostId: fk(), title: str(200, false), slug: str(120, false), description: text(),
  coverUrl: str(500), category: str(80, true, 'Christianity'), visibility: str(20, false, 'public'), // public | members | draft
}, { tableName: 'podcast_shows', indexes: tIdx({ unique: true, fields: ['tenant_id', 'slug'] }) });

const PodcastEpisode = sequelize.define('PodcastEpisode', {
  id: pk(), tenantId: tid(), showId: fk(), title: str(200, false), slug: str(120, false), audioUrl: str(600),
  durationMin: int(0), notes: text(), scriptureRefs: str(300), status: str(20, false, 'published'),
  publishedAt: { type: T.DATE, defaultValue: T.NOW }, plays: int(0),
}, { tableName: 'podcast_episodes', indexes: tIdx({ fields: ['show_id'] }) });

/* ------------------------------------------------------------------ meetings */
const Meeting = sequelize.define('Meeting', {
  id: pk(), tenantId: tid(), hostId: fk(),
  type: str(30, false, 'live_class'), // live_class | mentorship_session | prayer_meeting | webinar | fellowship
  title: str(200, false), description: text(),
  provider: str(20, false, 'livekit'), // livekit | jitsi | external
  roomName: str(160), joinUrl: str(600),
  startsAt: { type: T.DATE, allowNull: false }, endsAt: date(),
  capacity: int(100), visibility: str(20, false, 'members'),
  recordingUrl: str(600), status: str(20, false, 'scheduled'),
  courseId: fk(true), prayerGroupId: fk(true), mentorshipId: fk(true),
  reminded24: bool(false), reminded1: bool(false),
}, { tableName: 'meetings', indexes: tIdx({ fields: ['starts_at'] }) });

const MeetingAttendee = sequelize.define('MeetingAttendee', {
  id: pk(), tenantId: tid(), meetingId: fk(), userId: fk(), rsvp: str(20, false, 'going'), joinedAt: date(),
}, { tableName: 'meeting_attendees', indexes: tIdx({ unique: true, fields: ['meeting_id', 'user_id'] }) });

/* ------------------------------------------------------------------ mentorship */
const MentorProfile = sequelize.define('MentorProfile', {
  id: pk(), tenantId: tid(), userId: fk(), headline: str(200), bio: text(),
  expertise: { type: T.ARRAY(T.STRING(60)), allowNull: false, defaultValue: [] },
  languages: str(200, true, 'English'), capacity: int(5), accepting: bool(true), availability: text(),
}, { tableName: 'mentor_profiles', indexes: tIdx({ unique: true, fields: ['tenant_id', 'user_id'] }) });

const Mentorship = sequelize.define('Mentorship', {
  id: pk(), tenantId: tid(), mentorId: fk(), menteeId: fk(),
  status: str(20, false, 'requested'), // requested | active | declined | completed
  message: text(), goals: text(), startedAt: date(), endedAt: date(),
}, { tableName: 'mentorships', indexes: tIdx({ fields: ['mentor_id'] }, { fields: ['mentee_id'] }) });

const MentorshipNote = sequelize.define('MentorshipNote', {
  id: pk(), tenantId: tid(), mentorshipId: fk(), authorId: fk(), body: { type: T.TEXT, allowNull: false },
  visibility: str(20, false, 'shared'), // shared | private
}, { tableName: 'mentorship_notes', indexes: tIdx({ fields: ['mentorship_id'] }) });

/* ------------------------------------------------------------------ prayer */
const PrayerGroup = sequelize.define('PrayerGroup', {
  id: pk(), tenantId: tid(), leaderId: fk(), name: str(160, false), slug: str(120, false), description: text(),
  visibility: str(20, false, 'open'), schedule: str(200),
}, { tableName: 'prayer_groups', indexes: tIdx({ unique: true, fields: ['tenant_id', 'slug'] }) });

const PrayerGroupMember = sequelize.define('PrayerGroupMember', {
  id: pk(), tenantId: tid(), groupId: fk(), userId: fk(), role: str(20, false, 'member'),
}, { tableName: 'prayer_group_members', indexes: tIdx({ unique: true, fields: ['group_id', 'user_id'] }) });

const PrayerRequest = sequelize.define('PrayerRequest', {
  id: pk(), tenantId: tid(), groupId: fk(true), userId: fk(), title: str(200, false), body: text(),
  isAnonymous: bool(false), visibility: str(20, false, 'academy'), // academy | group | leaders
  status: str(20, false, 'open'), praiseReport: text(), prayedCount: int(0),
}, { tableName: 'prayer_requests', indexes: tIdx({ fields: ['group_id'] }) });

const PrayerPrayed = sequelize.define('PrayerPrayed', {
  id: pk(), tenantId: tid(), requestId: fk(), userId: fk(),
}, { tableName: 'prayer_prayed', updatedAt: false, indexes: [{ unique: true, fields: ['request_id', 'user_id'] }] });

/* ------------------------------------------------------------------ billing + system */
const Plan = sequelize.define('Plan', {
  id: pk(), code: { type: T.STRING(30), allowNull: false, unique: true }, name: str(80, false), tagline: str(200),
  priceKes: int(0), interval: str(20, false, 'month'), features: json([]), position: int(0), isActive: bool(true),
}, { tableName: 'plans' });

const Payment = sequelize.define('Payment', {
  id: pk(), tenantId: fk(true), userId: fk(), planCode: str(30), kind: str(20, false, 'donation'), // subscription | donation
  amountKes: int(0), mpesaCode: { type: T.STRING(20), allowNull: false, unique: true },
  payerPhone: str(30), payerName: str(160), status: str(20, false, 'pending'), // pending | approved | rejected
  reviewedBy: fk(true), reviewedAt: date(), notes: str(500),
}, { tableName: 'payments', indexes: [{ fields: ['tenant_id'] }, { fields: ['status'] }] });

const Notification = sequelize.define('Notification', {
  id: pk(), userId: fk(), tenantId: fk(true), type: str(40, false, 'info'), title: str(200, false), body: str(600), link: str(400), readAt: date(),
}, { tableName: 'notifications', indexes: [{ fields: ['user_id', 'read_at'] }] });

const AiInteraction = sequelize.define('AiInteraction', {
  id: pk(), tenantId: fk(true), userId: fk(), lessonId: fk(true), mode: str(30, false), promptTokens: int(0), completionTokens: int(0),
}, { tableName: 'ai_interactions', updatedAt: false, indexes: [{ fields: ['tenant_id', 'created_at'] }] });

const AuditLog = sequelize.define('AuditLog', {
  id: pk(), tenantId: fk(true), actorId: fk(true), action: str(80, false), entityType: str(40), entityId: str(64), meta: json({}), ip: str(64),
}, { tableName: 'audit_logs', updatedAt: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['created_at'] }] });

const Announcement = sequelize.define('Announcement', {
  id: pk(), tenantId: fk(true), authorId: fk(), title: str(200, false), body: text(), publishedAt: { type: T.DATE, defaultValue: T.NOW },
}, { tableName: 'announcements', indexes: [{ fields: ['tenant_id'] }] });

/* ------------------------------------------------------------------ associations */
const o = { constraints: true };
User.hasMany(Membership, { foreignKey: 'userId' }); Membership.belongsTo(User, { foreignKey: 'userId' });
Tenant.hasMany(Membership, { foreignKey: 'tenantId' }); Membership.belongsTo(Tenant, { foreignKey: 'tenantId' });
Tenant.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' });

Course.belongsTo(Tenant, { foreignKey: 'tenantId' });
Course.belongsTo(User, { as: 'instructor', foreignKey: 'instructorId' });
Course.hasMany(CourseModule, { as: 'modules', foreignKey: 'courseId', onDelete: 'CASCADE', ...o });
CourseModule.belongsTo(Course, { foreignKey: 'courseId' });
CourseModule.hasMany(Lesson, { as: 'lessons', foreignKey: 'moduleId', onDelete: 'CASCADE', ...o });
Lesson.belongsTo(CourseModule, { as: 'module', foreignKey: 'moduleId' });
Lesson.belongsTo(Course, { foreignKey: 'courseId' });
Course.hasMany(Enrollment, { foreignKey: 'courseId', onDelete: 'CASCADE' }); Enrollment.belongsTo(Course, { foreignKey: 'courseId' });
Enrollment.belongsTo(User, { foreignKey: 'userId' });
Enrollment.hasMany(LessonProgress, { as: 'progress', foreignKey: 'enrollmentId', onDelete: 'CASCADE' });
Course.hasMany(Assessment, { as: 'assessments', foreignKey: 'courseId', onDelete: 'CASCADE' }); Assessment.belongsTo(Course, { foreignKey: 'courseId' });
Assessment.hasMany(Question, { as: 'questions', foreignKey: 'assessmentId', onDelete: 'CASCADE' });
Assessment.hasMany(Submission, { foreignKey: 'assessmentId', onDelete: 'CASCADE' }); Submission.belongsTo(Assessment, { foreignKey: 'assessmentId' });
Submission.belongsTo(User, { foreignKey: 'userId' });
Certificate.belongsTo(User, { foreignKey: 'userId' }); Certificate.belongsTo(Course, { foreignKey: 'courseId' }); Certificate.belongsTo(Tenant, { foreignKey: 'tenantId' });

PodcastShow.belongsTo(User, { as: 'host', foreignKey: 'hostId' });
PodcastShow.hasMany(PodcastEpisode, { as: 'episodes', foreignKey: 'showId', onDelete: 'CASCADE' });
PodcastEpisode.belongsTo(PodcastShow, { as: 'show', foreignKey: 'showId' });

Meeting.belongsTo(User, { as: 'host', foreignKey: 'hostId' });
Meeting.hasMany(MeetingAttendee, { as: 'attendees', foreignKey: 'meetingId', onDelete: 'CASCADE' });
MeetingAttendee.belongsTo(User, { foreignKey: 'userId' });

MentorProfile.belongsTo(User, { foreignKey: 'userId' });
Mentorship.belongsTo(User, { as: 'mentor', foreignKey: 'mentorId' });
Mentorship.belongsTo(User, { as: 'mentee', foreignKey: 'menteeId' });
Mentorship.hasMany(MentorshipNote, { as: 'notes', foreignKey: 'mentorshipId', onDelete: 'CASCADE' });
MentorshipNote.belongsTo(User, { as: 'author', foreignKey: 'authorId' });

PrayerGroup.belongsTo(User, { as: 'leader', foreignKey: 'leaderId' });
PrayerGroup.hasMany(PrayerGroupMember, { as: 'members', foreignKey: 'groupId', onDelete: 'CASCADE' });
PrayerGroupMember.belongsTo(User, { foreignKey: 'userId' });
PrayerRequest.belongsTo(User, { foreignKey: 'userId' });
PrayerRequest.belongsTo(PrayerGroup, { as: 'group', foreignKey: 'groupId' });

Payment.belongsTo(Tenant, { foreignKey: 'tenantId' }); Payment.belongsTo(User, { foreignKey: 'userId' });
AuditLog.belongsTo(User, { as: 'actor', foreignKey: 'actorId' });
Announcement.belongsTo(User, { as: 'author', foreignKey: 'authorId' });

module.exports = {
  sequelize,
  User, AuthCode, RefreshToken, Tenant, Membership,
  Course, CourseModule, Lesson, Enrollment, LessonProgress, Assessment, Question, Submission, Certificate,
  PodcastShow, PodcastEpisode, Meeting, MeetingAttendee,
  MentorProfile, Mentorship, MentorshipNote,
  PrayerGroup, PrayerGroupMember, PrayerRequest, PrayerPrayed,
  Plan, Payment, Notification, AiInteraction, AuditLog, Announcement,
};
