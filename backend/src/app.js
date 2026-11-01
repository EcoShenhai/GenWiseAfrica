'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const config = require('./config');
const { sequelize } = require('./models');
const { apiLimiter, errorHandler } = require('./middleware');
const pkg = require('../package.json');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(cors({ origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)), credentials: true }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

const started = Date.now();
app.get(['/health', '/api/v1/health'], async (req, res) => {
  let db = 'ok';
  try { await sequelize.query('SELECT 1'); } catch { db = 'down'; }
  res.status(db === 'ok' ? 200 : 503).json({ status: db === 'ok' ? 'ok' : 'degraded', app: 'genwise-backend', version: pkg.version, db, uptimeSec: Math.round((Date.now() - started) / 1000) });
});

// Uploaded media (random filenames). Served behind nginx /uploads/ proxy.
app.use('/uploads', express.static(config.storage.dir, { maxAge: '7d', fallthrough: false, dotfiles: 'deny', index: false }));

const api = express.Router();
api.use(apiLimiter);
api.use('/auth', require('./routes/auth'));
api.use('/public', require('./routes/public'));
api.use('/me', require('./routes/me'));
api.use('/admin', require('./routes/admin'));
api.use('/t/:slug', require('./routes/tenant'));
api.use((req, res) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }));
app.use('/api/v1', api);

app.use(errorHandler);
module.exports = app;
