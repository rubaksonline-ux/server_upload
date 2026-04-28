const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'uploader_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASS || 'password',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' 
      ? (msg) => require('../utils/logger').debug(`[SQL] ${msg}`) 
      : false,
    pool: {
      max: 20,
      min: 2,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true // snake_case для полей
    }
  }
);

// Проверка соединения
sequelize.authenticate()
  .then(() => require('../utils/logger').success('🟢 PostgreSQL подключен через Sequelize'))
  .catch(err => require('../utils/logger').error('🔴 Ошибка подключения к БД:', { error: err.message }));

module.exports = sequelize;