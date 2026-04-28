const express = require('express');
const path = require('path');
const router = express.Router();
const FileService = require('../services/file.service');
const logger = require('../utils/logger');

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

module.exports = router;