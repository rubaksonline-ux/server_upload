const express = require('express');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config/server.config');

const router = express.Router();

router.get('/', (req, res) => {
  logger.info(`Запрос главной страницы`, { ip: req.ip, ua: req.get('user-agent') });
  
  // Получаем данные пользователя из токена если есть
  let user = null;
  const token = req.headers.authorization?.split(' ')[1] || req.cookies?.token;
  
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      const secret = process.env.SESSION_SECRET || 'default-secret-change-me';
      const decoded = jwt.verify(token, secret);
      
      if (decoded) {
        const User = require('../models/User.model');
        user = {
          id: decoded.id,
          username: decoded.username,
          role: decoded.role
        };
      }
    } catch (err) {
      // Токен невалиден, продолжаем без пользователя
    }
  }
  
  res.render('index', {
    title: 'Загрузка файлов',
    user
  });
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;