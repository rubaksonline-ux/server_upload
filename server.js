require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { EventEmitter } = require('events');
const cookieParser = require('cookie-parser');

// ✅ Импортируем sequelize ПЕРЕД использованием
const sequelize = require('./config/db.config');
const FileService = require('./services/file.service');

const logger = require('./utils/logger');
const config = require('./config/server.config');
const { ensureDirectory } = require('./utils/file.utils');
const routes = require('./routes');
const { handleStart, handleUpload, handleDisconnect } = require('./handlers/upload.handler');

// Импорт моделей и middleware
const { authMiddleware, User: UserModel } = require('./models/User.model');
const hbs = require('./utils/handlebars-helpers');

const init = async () => {
  try {
    // 1. Инициализация директорий
    await ensureDirectory(config.tmpDir);
    await ensureDirectory(config.videoDir);
    await ensureDirectory(config.publicDir);

    // 2. Express app
    const app = express();
    
    // Настройка Handlebars
    app.set('view engine', 'hbs');
    app.set('views', path.join(__dirname, 'views'));
    hbs.registerPartials(path.join(__dirname, 'views/partials'));
    
    // Middleware
    app.use(express.static(config.publicDir));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    
    // CORS настройки (безопасные)
    const corsOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://127.0.0.1:3000'];
    
    // 3. Подключаем роуты для файлов
    const fileRoutes = require('./routes/file.routes');
    const authRoutes = require('./routes/auth.routes');
    const filesRoutes = require('./routes/files.routes');
    
    app.use('/', routes);
    app.use('/api/files', fileRoutes);
    app.use('/auth', authRoutes);
    app.use('/files', authMiddleware, filesRoutes);

    // 4. HTTP server
    const server = http.createServer(app);
    
    const io = new Server(server, {
      cors: { 
        origin: corsOrigins, 
        methods: ['GET', 'POST'],
        credentials: true
      },
      maxHttpBufferSize: 1.5e8, 
      pingTimeout: 60000,
      pingInterval: 25000
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
          owner: data.owner || 'anonymous',
          fileType: data.fileType,
          mimeType: data.mimeType,
          filePath: data.filePath
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