'use strict';
const config = require('./config');
const app = require('./app');
const { sequelize } = require('./models');
const scheduler = require('./jobs/scheduler');
const { logger } = require('./utils');

async function main() {
  await sequelize.authenticate();
  const server = app.listen(config.port, config.bindHost, () => {
    logger.info(`GenWise Africa API listening on ${config.bindHost}:${config.port}`, { env: config.env, email: config.email.devLog ? 'dev-log' : 'smtp', ai: !!config.ai.apiKey, livekit: !!config.media.livekitApiKey });
  });
  if (process.env.DISABLE_JOBS !== 'true') scheduler.start();
  const stop = (sig) => {
    logger.info(`${sig} received, shutting down`);
    server.close(() => sequelize.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

main().catch((e) => {
  logger.error('startup failed', { err: e.message });
  process.exit(1);
});
