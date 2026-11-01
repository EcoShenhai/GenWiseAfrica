'use strict';
/**
 * Migration runner (umzug). Never uses sync({ alter }) in production.
 *   node src/db/migrate.js up | down | status
 */
const path = require('path');
const { Umzug, SequelizeStorage } = require('umzug');
const { sequelize, Sequelize } = require('./index');

const umzug = new Umzug({
  migrations: {
    glob: path.join(__dirname, 'migrations/*.js'),
    resolve: ({ name, path: p, context }) => {
      const m = require(p); // eslint-disable-line global-require, import/no-dynamic-require
      return { name, up: () => m.up(context, Sequelize), down: () => (m.down ? m.down(context, Sequelize) : undefined) };
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, tableName: 'schema_migrations' }),
  logger: { info: (e) => e.event && console.log(`  ${e.event} ${e.name || ''}`), warn: console.warn, error: console.error, debug: () => {} },
});

async function main() {
  const cmd = process.argv[2] || 'up';
  try {
    if (cmd === 'up') {
      const done = await umzug.up();
      console.log(`Migrations applied: ${done.length}`);
    } else if (cmd === 'down') {
      await umzug.down();
    } else if (cmd === 'status') {
      console.log('executed:', (await umzug.executed()).map((m) => m.name));
      console.log('pending :', (await umzug.pending()).map((m) => m.name));
    }
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) main();
module.exports = { umzug };
