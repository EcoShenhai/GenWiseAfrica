'use strict';
/**
 * Initial schema: creates every table from the model definitions (create-only,
 * never alters). Later schema changes go in new numbered migration files that use
 * queryInterface.addColumn / changeColumn etc.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto').catch(() => {});
    const models = require('../../models'); // eslint-disable-line global-require
    await models.sequelize.sync();
  },
  async down(queryInterface) {
    const tables = [
      'announcements', 'audit_logs', 'ai_interactions', 'notifications', 'payments', 'plans',
      'prayer_prayed', 'prayer_requests', 'prayer_group_members', 'prayer_groups',
      'mentorship_notes', 'mentorships', 'mentor_profiles', 'meeting_attendees', 'meetings',
      'podcast_episodes', 'podcast_shows', 'certificates', 'submissions', 'questions', 'assessments',
      'lesson_progress', 'enrollments', 'lessons', 'course_modules', 'courses',
      'memberships', 'tenants', 'refresh_tokens', 'auth_codes', 'users',
    ];
    for (const t of tables) await queryInterface.dropTable(t, { cascade: true }); // eslint-disable-line no-await-in-loop
  },
};
