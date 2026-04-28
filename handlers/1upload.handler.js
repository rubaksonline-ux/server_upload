const logger = require('../utils/logger');
const {
  getTempPath,
  getVideoPath,
  getFileStats,
  openFileHandler,
  writeToFile,
  closeFileHandler,
  pipeFile,
  deleteFile,
  fileExtension
} = require('../utils/file.utils');
const { processVideoUpload } = require('../utils/video.utils');
const config = require('../config/server.config');

// Хранилище сессий загрузки (в памяти; для продакшена использовать Redis)
const uploadSessions = new Map();

/**
 * Обработчик события 'Start' - инициализация загрузки
 * @param {Socket} socket - Socket.io сокет
 * @param {Object} data - Данные от клиента { Name, Size }
 */
const handleStart = async (socket, data) => {
  const { Name, Size } = data;
  
  try {
    logger.info(`📥 Начата загрузка: ${Name}`, { 
      size: Size, 
      socketId: socket.id,
      ip: socket.handshake?.address 
    });

    // Валидация входных данных
    if (!Name || !Size || Size <= 0) {
      throw new Error('Invalid upload parameters');
    }

    const tempPath = getTempPath(Name);
    const stats = await getFileStats(tempPath);
    
    // Создаём сессию загрузки
    const session = {
      filename: Name,
      fileSize: Size,
      downloaded: stats?.size || 0,
      buffer: '',
      handler: null
    };

    const sessionKey = `${socket.id}:${Name}`;
    uploadSessions.set(sessionKey, session);

    let place = 0;
    
    // Проверка возможности возобновления загрузки
    if (stats?.isFile()) {
      session.downloaded = stats.size;
      place = Math.floor(stats.size / config.chunkSize);
      logger.debug(`♻️ Возобновление загрузки: ${Name}, уже загружено ${stats.size} байт`);
    }

    // Открываем файл для записи (получаем FileHandle)
    session.handler = await openFileHandler(tempPath);
    logger.debug(`🔓 Файловый дескриптор открыт: ${tempPath}`);
    
    // Отправляем клиенту позицию для продолжения
    socket.emit('MoreData', { 
      Place: place, 
      Percent: session.downloaded > 0 
        ? Math.min(100, (session.downloaded / Size) * 100) 
        : 0 
    });
    
    logger.success(`✅ Готов к приёму данных: ${Name}`);
    
  } catch (err) {
    logger.error(`❌ Ошибка инициализации загрузки: ${Name}`, { 
      error: err.message, 
      stack: err.stack 
    });
    socket.emit('Error', { 
      message: 'Failed to initialize upload', 
      details: err.message 
    });
  }
};

/**
 * Обработчик события 'Upload' - приём чанка данных
 * @param {Socket} socket - Socket.io сокет
 * @param {Object} data - Данные от клиента { Name, Data }
 */

const handleUpload = async (socket, data) => {
  const { Name, Data, IsBase64 } = data;
  const sessionKey = `${socket.id}:${Name}`;
  const session = uploadSessions.get(sessionKey);

  if (!session) {
    logger.warn(`⚠️ Сессия не найдена: ${Name}`, { socketId: socket.id });
    return socket.emit('Error', { message: 'Upload session not found' });
  }

  try {
    // ✅ Декодируем base64 → Buffer (или используем latin1 для обратной совместимости)
    const chunkBuffer = IsBase64 
      ? Buffer.from(Data, 'base64') 
      : Buffer.from(Data, 'latin1');
    
    session.downloaded += chunkBuffer.length;
    
    // ✅ Пишем сразу буфером, без строковых накоплений
    await session.handler.write(chunkBuffer, 0, chunkBuffer.length, null);
    logger.debug(`💾 Записано: ${Name}, прогресс: ${session.downloaded}/${session.fileSize}`);

    // ✅ Завершение с допуском 1 байт
    if (session.downloaded >= session.fileSize - 1) {
      logger.success(`🎉 Файл полностью загружен: ${Name}`);
      
      await closeFileHandler(session.handler);
      
      // Проверка целостности файла
      const tempPath = getTempPath(Name);
      const stats = await getFileStats(tempPath);
      if (stats && Math.abs(stats.size - session.fileSize) > 100) {
        logger.warn(`⚠️ Размер файла не совпадает: ожидалось ${session.fileSize}, получено ${stats.size}`);
      }

      const videoPath = getVideoPath(Name);
      await pipeFile(tempPath, videoPath);
      await deleteFile(tempPath);

      const ext = fileExtension(Name);
      let result = { image: null, success: true };

      if (ext === 'mp4') {
        result = await processVideoUpload(Name);
      } else {
        // ✅ Исправлен путь к заглушке
        const fallbackPath = path.join(__dirname, '../../public/file.png');
        result.image = await require('../utils/video.utils').encodeToBase64(fallbackPath);
        result.success = result.image !== null;
      }

      global.uploadBus?.emit('file:completed', {
        friendlyName: session.filename,
        size: session.fileSize,
        originalName: session.originalName || session.filename
      });

      socket.emit('Done', {
        Image: result.image,
        success: result.success,
        warning: result.warning,
        filename: Name
      });

      uploadSessions.delete(sessionKey);
      logger.success(`✨ Загрузка завершена: ${Name}`);

    } else {
      const place = Math.floor(session.downloaded / config.chunkSize);
      const percent = Math.min(100, (session.downloaded / session.fileSize) * 100);
      socket.emit('MoreData', { Place: place, Percent: percent });
    }
    
  } catch (err) {
    logger.error(`❌ Ошибка при загрузке: ${Name}`, { error: err.message });
    if (session?.handler) await closeFileHandler(session.handler).catch(() => {});
    socket.emit('Error', { message: 'Upload failed', details: err.message });
  }
};
/**
 * Обработчик отключения клиента - очистка ресурсов
 * @param {Socket} socket - Socket.io сокет
 */
const handleDisconnect = async (socket) => {
  logger.info(`🔌 Клиент отключён, очистка сессий: ${socket.id}`);
  
  let cleanedCount = 0;
  
  for (const [key, session] of uploadSessions) {
    // Обрабатываем только сессии этого сокета
    if (key.startsWith(`${socket.id}:`)) {
      try {
        // Закрываем файловый дескриптор если открыт
        if (session.handler) {
          await closeFileHandler(session.handler);
          logger.debug(`🔒 Закрыт дескриптор: ${session.filename}`);
        }
        
        // Удаляем неполный временный файл
        const tempPath = getTempPath(session.filename);
        const stats = await getFileStats(tempPath);
        if (stats?.isFile() && stats.size < session.fileSize) {
          await deleteFile(tempPath);
          logger.warn(`🗑️ Удалён неполный файл: ${session.filename}`);
        }
        
        cleanedCount++;
        logger.debug(`🧹 Очищена сессия: ${session.filename}`);
        
      } catch (err) {
        logger.error(`❌ Ошибка очистки сессии: ${session.filename}`, { 
          error: err.message 
        });
      }
      
      // Удаляем запись из Map
      uploadSessions.delete(key);
    }
  }
  
  if (cleanedCount > 0) {
    logger.info(`✅ Очищено сессий при отключении: ${cleanedCount}`);
  }
};

/**
 * Получение статистики активных загрузок (для мониторинга)
 * @returns {Object} Статистика сессий
 */
const getUploadStats = () => {
  const stats = {
    total: uploadSessions.size,
    sessions: []
  };
  
  for (const [key, session] of uploadSessions) {
    stats.sessions.push({
      key,
      filename: session.filename,
      downloaded: session.downloaded,
      fileSize: session.fileSize,
      percent: session.fileSize > 0 
        ? Math.round((session.downloaded / session.fileSize) * 100) 
        : 0,
      bufferLength: session.buffer?.length || 0
    });
  }
  
  return stats;
};

/**
 * Принудительная очистка всех сессий (для админ-панели или перезагрузки)
 */
const cleanupAllSessions = async () => {
  logger.warn('🧹 Запущена принудительная очистка всех сессий...');
  
  let cleaned = 0;
  let errors = 0;
  
  for (const [key, session] of uploadSessions) {
    try {
      if (session.handler) {
        await closeFileHandler(session.handler);
      }
      await deleteFile(getTempPath(session.filename));
      cleaned++;
    } catch (err) {
      errors++;
      logger.error(`❌ Ошибка при очистке сессии ${key}:`, { error: err.message });
    }
  }
  
  uploadSessions.clear();
  logger.success(`✨ Очистка завершена: ${cleaned} сессий, ${errors} ошибок`);
  
  return { cleaned, errors };
};

module.exports = {
  handleStart,
  handleUpload,
  handleDisconnect,
  getUploadStats,      // для мониторинга
  cleanupAllSessions,  // для админ-задач
  uploadSessions       // экспорт для тестов/отладки (опционально)
};