const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { 
  createUser, 
  authenticateUser, 
  generateToken, 
  findByShareCode 
} = require('../models/User.model');
const File = require('../models/File.model');
const logger = require('../utils/logger');

// Регистрация нового пользователя
router.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    
    const user = await createUser(username, password, email);
    const token = generateToken(user);
    
    logger.success(`👤 Пользователь зарегистрирован: ${username}`);
    res.json({ 
      success: true, 
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        share_code: user.share_code
      },
      token 
    });
  } catch (err) {
    logger.error(`❌ Ошибка регистрации: ${err.message}`);
    res.status(500).json({ error: 'Ошибка при регистрации' });
  }
});

// Логин
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }
    
    const user = await authenticateUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    
    const token = generateToken(user);
    logger.info(`🔐 Пользователь вошёл: ${username}`);
    
    res.json({ 
      success: true, 
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        share_code: user.share_code
      },
      token 
    });
  } catch (err) {
    logger.error(`❌ Ошибка входа: ${err.message}`);
    res.status(500).json({ error: 'Ошибка при входе' });
  }
});

// Поиск пользователя по share_code (для получения файлов)
router.get('/share/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const user = await findByShareCode(code);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Получаем файлы пользователя
    const files = await File.findAll({
      where: { owner: user.username },
      order: [['uploaded_at', 'DESC']],
      limit: 50
    });
    
    res.json({
      success: true,
      user: {
        username: user.username,
        share_code: user.share_code
      },
      files
    });
  } catch (err) {
    logger.error(`❌ Ошибка поиска по share_code: ${err.message}`);
    res.status(500).json({ error: 'Ошибка при поиске' });
  }
});

// Получить свой share_code (требуется авторизация)
router.get('/my-share-code', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    const jwt = require('jsonwebtoken');
    const secret = process.env.SESSION_SECRET || 'default-secret-change-me';
    const decoded = jwt.verify(token, secret);
    
    const User = require('../models/User.model');
    const user = await User.User.findByPk(decoded.id);
    
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    res.json({
      success: true,
      share_code: user.share_code,
      qr_data: `${process.env.APP_URL || 'http://localhost:' + (process.env.APP_PORT || 3000)}/share/${user.share_code}`
    });
  } catch (err) {
    logger.error(`❌ Ошибка получения share_code: ${err.message}`);
    res.status(500).json({ error: 'Ошибка' });
  }
});

module.exports = router;
