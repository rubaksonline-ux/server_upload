require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { EventEmitter } = require('events');

// ✅ Импортируем sequelize ПЕРЕД использованием
const sequelize = require('./config/db.config');
const FileService = require('./services/file.service');

const logger = require('./utils/logger');
const config = require('./config/server.config');
const { ensureDirectory } = require('./utils/file.utils');
const routes = require('./routes');
const { handleStart, handleUpload, handleDisconnect } = require('./handlers/upload.handler');

const init = async () => {
  try {
    // 1. Инициализация директорий
    await ensureDirectory(config.tmpDir);
    await ensureDirectory(config.videoDir);
    await ensureDirectory(config.publicDir);

    // 2. Express app
    const app = express();
    app.use(express.static(config.publicDir));
    app.use('/', routes);

    // 3. Подключаем роуты для файлов
    const fileRoutes = require('./routes/file.routes');
    app.use('/', fileRoutes);

    // 4. HTTP server
    const server = http.createServer(app);
    
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1.5e8, 
  // 100 MB — увеличьте при необходимости
  pingTimeout: 60000,     // 60 сек таймаут пинга
  pingInterval: 25000     // 25 сек интервал
});	

    // 6. Глобальная шина событий для связи с БД (без модификации ядра)
    global.uploadBus = new EventEmitter();

    // 7. Слушаем событие завершения загрузки
    global.uploadBus.on('file:completed', async (data) => {
      try {
        await FileService.saveOnComplete({
          friendlyName: data.friendlyName,
          size: data.size,
          originalName: data.originalName || data.friendlyName,
          owner: 'anonymous'
        });
      } catch (err) {
        logger.error(`❌ Ошибка обработки события file:completed:`, { error: err.message });
      }
    });

    // 8. Socket events
    io.on('connection', (socket) => {
      logger.info(`🔌 Подключён клиент`, { socketId: socket.id, ip: socket.handshake?.address });

      socket.on('Start', (data) => handleStart(socket, data));
      socket.on('Upload', (data) => handleUpload(socket, data));
      
      socket.on('disconnect', () => {
        logger.info(`🔌 Клиент отключён`, { socketId: socket.id });
        handleDisconnect(socket);
      });

      socket.on('error', (err) => {
        logger.error(`⚡ Socket error`, { socketId: socket.id, error: err.message });
      });
    });

    // 9. Синхронизация БД (для продакшена используйте миграции)
    await sequelize.sync({ alter: true });
    logger.success('🗄 Схема БД проверена/обновлена через Sequelize');

    // 10. Global error handlers
    process.on('uncaughtException', (err) => {
      logger.error('💥 Uncaught Exception', { error: err.message, stack: err.stack });
    });
    
    process.on('unhandledRejection', (reason) => {
      logger.error('🚫 Unhandled Rejection', { reason });
    });

    // 11. Start server
    server.listen(config.port, config.host, () => {
      const addr = `http://${config.host || 'localhost'}:${config.port}`;
      logger.success(`🚀 Сервер запущен: ${addr}`);
      logger.info(`📁 Видео: ${config.videoDir}`);
      logger.info(`📦 Временные файлы: ${config.tmpDir}`);
    });

  } catch (err) {
    logger.error('❌ Критическая ошибка запуска', { error: err.message, stack: err.stack });
    process.exit(1);
  }
};

init();