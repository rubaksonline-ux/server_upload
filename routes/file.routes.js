const express = require('express');
const path = require('path');
const router = express.Router();
const FileService = require('../services/file.service');
const logger = require('../utils/logger');
const { authMiddleware } = require('../models/User.model');

// API: JSON с метаданными + инкремент скачиваний
router.get('/api/files/:slug', async (req, res) => {
  try {
    const file = await FileService.findBySlug(req.params.slug);
    if (!file) return res.status(404).json({ error: 'Файл не найден' });
    
    // Увеличиваем счётчик скачиваний асинхронно (не блокируем ответ)
    FileService.incrementDownloads(file.id).catch(err => 
      logger.warn(`Не удалось обновить счётчик: ${err.message}`)
    );
    
    res.json(file.toJSON());
  } catch (err) {
    logger.error(`Ошибка получения файла: ${err.message}`);
    res.status(500).json({ error: 'Internal error' });
  }
});

// HTML: Страница просмотра
router.get('/view/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/file.html'));
});

// API: Список всех файлов (для админа)
router.get('/api/files', authMiddleware, async (req, res) => {
  try {
    const File = require('../models/File.model');
    
    let files;
    if (req.user?.role === 'admin') {
      // Админ видит все файлы
      files = await File.findAll({
        order: [['uploaded_at', 'DESC']],
        limit: 100
      });
    } else if (req.user) {
      // Пользователь видит только свои файлы
      files = await File.findAll({
        where: { owner: req.user.username },
        order: [['uploaded_at', 'DESC']],
        limit: 100
      });
    } else {
      // Аноним - пустой список или ошибка
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    res.json(files);
  } catch (err) {
    logger.error(`Ошибка получения списка файлов: ${err.message}`);
    res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;