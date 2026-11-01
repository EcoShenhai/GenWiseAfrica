'use strict';
const path = require('path');
require('dotenv').config({ path: process.env.ENV_FILE || path.join(__dirname, '../../.env') });

const int = (v, d) => (v === undefined || v === '' ? d : parseInt(v, 10));
const bool = (v, d = false) => (v === undefined || v === '' ? d : String(v).toLowerCase() === 'true');
const env = process.env;

const config = {
  env: env.NODE_ENV || 'development',
  isProd: env.NODE_ENV === 'production',
  port: int(env.PORT, 4022),
  bindHost: env.BIND_HOST || '127.0.0.1',
  appName: env.APP_NAME || 'GenWise Africa',
  appDomain: env.APP_DOMAIN || 'genwiseafrica.org',
  baseUrl: env.APP_BASE_URL || 'http://localhost:5173',
  frontendUrl: env.FRONTEND_URL || 'http://localhost:5173',
  corsOrigins: (env.CORS_ORIGINS || env.FRONTEND_URL || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),

  db: {
    host: env.DB_HOST || '127.0.0.1',
    port: int(env.DB_PORT, 5432),
    name: env.DB_NAME || 'genwise_db',
    user: env.DB_USER || 'genwise_user',
    password: env.DB_PASSWORD || '',
    ssl: bool(env.DB_SSL, false),
    poolMax: int(env.DB_POOL_MAX, 2),
    logging: bool(env.DB_LOGGING, false),
  },

  jwt: {
    secret: env.JWT_SECRET || 'dev-access-secret',
    refreshSecret: env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    mfaSecret: env.JWT_MFA_SECRET || 'dev-mfa-secret',
    accessExpiresIn: env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN || '7d',
    mfaExpiresIn: env.MFA_TOKEN_EXPIRES_IN || '10m',
  },
  security: { bcryptRounds: int(env.BCRYPT_ROUNDS, 12) },
  codes: {
    length: int(env.AUTH_CODE_LENGTH, 6),
    ttlMin: int(env.AUTH_CODE_TTL_MIN, 10),
    maxAttempts: int(env.AUTH_CODE_MAX_ATTEMPTS, 5),
    resendCooldownSec: int(env.AUTH_CODE_RESEND_COOLDOWN_SEC, 60),
    maxPerHour: 5,
    pepper: env.AUTH_CODE_PEPPER || 'dev-pepper',
  },

  email: {
    host: env.SMTP_HOST || '',
    port: int(env.SMTP_PORT, 2525),
    secure: bool(env.SMTP_SECURE, false),
    user: env.SMTP_USER || env.SMTP_USERNAME || '',
    pass: env.SMTP_PASSWORD || '',
    fromName: env.SMTP_FROM_NAME || 'GenWise Africa',
    fromEmail: env.SMTP_FROM_EMAIL || 'noreply@genwiseafrica.org',
    devLog: bool(env.EMAIL_DEV_LOG, !env.SMTP_HOST),
  },

  superAdmins: [1, 2]
    .map((i) => ({ email: env[`SUPER_ADMIN_${i}_EMAIL`], name: env[`SUPER_ADMIN_${i}_NAME`], password: env[`SUPER_ADMIN_${i}_PASSWORD`] }))
    .filter((a) => a.email && a.password),

  ai: {
    apiKey: env.DEEPSEEK_API_KEY || '',
    baseUrl: env.DEEPSEEK_API_BASE || 'https://api.deepseek.com',
    model: env.DEEPSEEK_MODEL || 'deepseek-chat',
    temperature: parseFloat(env.AI_TEMPERATURE || '0.4'),
    maxTokens: int(env.AI_MAX_TOKENS, 1500),
    dailyBudgetPerTenant: int(env.AI_DAILY_TOKEN_BUDGET_PER_TENANT, 200000),
    timeoutMs: 60000,
  },

  media: {
    provider: env.SFU_PROVIDER || 'livekit',
    livekitUrl: env.LIVEKIT_URL || '',
    livekitApiKey: env.LIVEKIT_API_KEY || '',
    livekitApiSecret: env.LIVEKIT_API_SECRET || '',
    roomPrefix: env.LIVEKIT_ROOM_PREFIX || 'genwise-',
    turnUrl: env.TURN_URL || '',
    turnSecret: env.TURN_SECRET || '',
    jitsiDomain: env.JITSI_DOMAIN || 'meet.jit.si',
  },

  mpesa: { receiver: env.MPESA_RECEIVER || '254702122874', display: env.MPESA_DISPLAY || '0702 122 874' },

  storage: {
    dir: path.resolve(env.STORAGE_DIR || path.join(__dirname, '../../uploads')),
    maxUploadMb: int(env.MAX_UPLOAD_MB, 200),
  },
  rateLimit: {
    windowMs: int(env.RATE_LIMIT_WINDOW_MS, 900000),
    max: int(env.RATE_LIMIT_MAX, 300),
    authMax: int(env.AUTH_RATE_LIMIT_MAX, 20),
  },
};

module.exports = config;
