const express = require('express');
const path = require('path');
const router = express.Router();
const File = require('../models/File.model');
const logger = require('../utils/logger');

// Страница со списком файлов пользователя
router.get('/', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    let files = [];
    
    if (token) {
      const jwt = require('jsonwebtoken');
      const secret = process.env.SESSION_SECRET || 'default-secret-change-me';
      const decoded = jwt.verify(token, secret);
      
      if (decoded) {
        const User = require('../models/User.model');
        const user = await User.User.findByPk(decoded.id);
        
        if (user) {
          if (user.role === 'admin') {
            // Админ видит все файлы
            files = await File.findAll({ order: [['uploaded_at', 'DESC']], limit: 100 });
          } else {
            // Пользователь видит только свои файлы
            files = await File.findAll({ 
              where: { owner: user.username }, 
              order: [['uploaded_at', 'DESC']], 
              limit: 100 
            });
          }
        }
      }
    }
    
    res.render('files', {
      title: 'Мои файлы',
      files
    });
  } catch (err) {
    logger.error(`Ошибка получения списка файлов: ${err.message}`);
    res.render('files', {
      title: 'Мои файлы',
      files: [],
      error: 'Не удалось загрузить список файлов'
    });
  }
});

module.exports = router;
