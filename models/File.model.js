const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.config');

const File = sequelize.define('File', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  original_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  friendly_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  slug: {
    type: DataTypes.STRING(255),
    unique: true,
    allowNull: false
  },
  size: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  mime_type: {
    type: DataTypes.STRING(100),
    defaultValue: 'application/octet-stream'
  },
  owner: {
    type: DataTypes.STRING(100),
    defaultValue: 'anonymous'
  },
  // ✅ Новые поля: с defaultValue и allowNull: true для совместимости с существующими данными
  file_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'other'
  },
  file_path: {
    type: DataTypes.STRING(500),
    allowNull: true,
    defaultValue: ''
  },
  uploaded_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'uploaded_at'
  },
  download_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'files',
  createdAt: 'uploaded_at',
  updatedAt: false,
  indexes: [
    { fields: ['slug'] },
    { fields: ['friendly_name'] },
    { fields: ['file_type'] }
  ]
});

module.exports = File;