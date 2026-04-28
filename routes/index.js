const express = require('express');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config/server.config');

const router = express.Router();

router.get('/', (req, res) => {
  logger.info(`Запрос главной страницы`, { ip: req.ip, ua: req.get('user-agent') });
  res.sendFile(path.join(config.publicDir, 'up.html'));
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;