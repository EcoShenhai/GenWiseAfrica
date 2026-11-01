'use strict';
const { Sequelize } = require('sequelize');
const config = require('../config');

const sequelize = new Sequelize(config.db.name, config.db.user, config.db.password, {
  host: config.db.host,
  port: config.db.port,
  dialect: 'postgres',
  logging: config.db.logging ? (m) => console.log(m) : false,
  dialectOptions: config.db.ssl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  pool: { max: config.db.poolMax, min: 0, idle: 10000, acquire: 30000 },
  define: { underscored: true, timestamps: true },
});

module.exports = { sequelize, Sequelize };
