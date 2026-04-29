const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db.config');

// Модель пользователя
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true
  },
  role: {
    type: DataTypes.ENUM('user', 'admin'),
    defaultValue: 'user'
  },
  share_code: {
    type: DataTypes.STRING(8),
    unique: true,
    allowNull: false
  }
}, {
  tableName: 'users',
  timestamps: true
});

// Генерация уникального кода для шеринга
const generateShareCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без похожих символов
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// Проверка уникальности кода
const ensureUniqueShareCode = async () => {
  let code = generateShareCode();
  while (await User.findOne({ where: { share_code: code } })) {
    code = generateShareCode();
  }
  return code;
};

// Создание пользователя
const createUser = async (username, password, email = null, role = 'user') => {
  const hashedPassword = await bcrypt.hash(password, 10);
  const shareCode = await ensureUniqueShareCode();
  
  return await User.create({
    username,
    password: hashedPassword,
    email,
    role,
    share_code: shareCode
  });
};

// Аутентификация
const authenticateUser = async (username, password) => {
  const user = await User.findOne({ where: { username } });
  if (!user) return null;
  
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return null;
  
  return user;
};

// Генерация JWT токена
const generateToken = (user) => {
  const secret = process.env.SESSION_SECRET || 'default-secret-change-me';
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    secret,
    { expiresIn: '7d' }
  );
};

// Верификация токена
const verifyToken = (token) => {
  try {
    const secret = process.env.SESSION_SECRET || 'default-secret-change-me';
    return jwt.verify(token, secret);
  } catch (err) {
    return null;
  }
};

// Middleware для защиты роутов
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
  
  if (!token) {
    req.user = null;
    return next();
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    req.user = null;
    return next();
  }
  
  const user = await User.findByPk(decoded.id);
  req.user = user || null;
  next();
};

// Поиск пользователя по share_code
const findByShareCode = async (code) => {
  return await User.findOne({ where: { share_code: code } });
};

module.exports = {
  User,
  createUser,
  authenticateUser,
  generateToken,
  verifyToken,
  authMiddleware,
  findByShareCode,
  generateShareCode
};
