const logger = require('../utils/logger');
const path = require('path'); // ✅ ИСПРАВЛЕНИЕ: добавлен недостающий импорт!
const {
  getTempPath,
  getFileStats,
  openFileHandler,
  closeFileHandler,
  pipeFile,
  deleteFile,
  ensureUploadFolders,
  getUploadPathByType,  // ✅ Должно быть здесь!
  getFileType,           // ✅ И это, если используете отдельно
  getMimeType  // ✅ Обязательно добавьте эту строку!  
} = require('../utils/file.utils');
//const { getFileType, getUploadPathByType, getMimeType } = require('../utils/file-type.utils');
const { processVideoUpload } = require('../utils/video.utils');
const FileService = require('../services/file.service');
const config = require('../config/server.config');






const uploadSessions = new Map();

const handleStart = async (socket, data) => {
  const { Name, Size } = data;
  
  try {
    logger.info(`📥 Начата загрузка: ${Name}`, { size: Size, socketId: socket.id });

    if (!Name || !Size || Size <= 0) {
      throw new Error('Invalid upload parameters');
    }

    const tempPath = getTempPath(Name);
    const stats = await getFileStats(tempPath);
    
    const session = {
      filename: Name,
      fileSize: Size,
      downloaded: stats?.size || 0,
      buffer: '',
      handler: null,
      originalName: Name, // сохраняем для БД
      fileType: getFileType(Name) // определяем тип сразу
    };

    const sessionKey = `${socket.id}:${Name}`;
    uploadSessions.set(sessionKey, session);

    let place = 0;
    if (stats?.isFile()) {
      session.downloaded = stats.size;
      place = Math.floor(stats.size / config.chunkSize);
      logger.debug(`♻️ Возобновление: ${Name}, загружено ${stats.size} байт`);
    }

    session.handler = await openFileHandler(tempPath);
    
    socket.emit('MoreData', { 
      Place: place, 
      Percent: session.downloaded > 0 ? (session.downloaded / Size) * 100 : 0 
    });
    
    logger.success(`✅ Готов к приёму: ${Name} [${session.fileType}]`);
    
  } catch (err) {
    logger.error(`❌ Ошибка инициализации: ${Name}`, { error: err.message });
    socket.emit('Error', { message: 'Failed to initialize upload' });
  }
};

const handleUpload = async (socket, data) => {
  const { Name, Data, IsBase64 } = data;
  const sessionKey = `${socket.id}:${Name}`;
  const session = uploadSessions.get(sessionKey);
  
  if (!session) {
    return socket.emit('Error', { message: 'Upload session not found' });
  }

  try {
    const chunkBuffer = IsBase64 ? Buffer.from(Data, 'base64') : Buffer.from(Data, 'latin1');
    session.downloaded += chunkBuffer.length;
    await session.handler.write(chunkBuffer, 0, chunkBuffer.length, null);
    
    logger.debug(`💾 Записано: ${Name}, прогресс: ${session.downloaded}/${session.fileSize}`);

    // Завершение с допуском 1 байт
    if (session.downloaded >= session.fileSize - 1) {
      logger.success(`🎉 Файл загружен: ${Name}`);
      await closeFileHandler(session.handler);

      // 🔄 Обработка по типу файла (SWITCH)
      const result = await processFileByType(session);
      
      // 📤 Ответ клиенту
      socket.emit('Done', {
        Image: result.preview,
        success: result.success,
        warning: result.warning,
        filename: session.filename,
        fileType: session.fileType,
        filePath: result.filePath
      });

      // 💾 Сохранение в БД
      global.uploadBus?.emit('file:completed', {
        friendlyName: session.filename,
        size: session.fileSize,
        originalName: session.originalName,
        fileType: session.fileType,
        mimeType: getMimeType(session.filename),
        filePath: result.filePath
      });

      uploadSessions.delete(sessionKey);
      await deleteFile(getTempPath(Name));
      logger.success(`✨ Завершено: ${Name} → /${result.filePath}`);
      
    } else {
      const place = Math.floor(session.downloaded / config.chunkSize);
      const percent = Math.min(100, (session.downloaded / session.fileSize) * 100);
      socket.emit('MoreData', { Place: place, Percent: percent });
    }
    
  } catch (err) {
    logger.error(`❌ Ошибка загрузки: ${Name}`, { error: err.message });
    if (session?.handler) await closeFileHandler(session.handler).catch(() => {});
    socket.emit('Error', { message: 'Upload failed' });
  }
};

/**
 * 🔄 Обработчик файлов по типу (SWITCH-паттерн)
 */
const processFileByType = async (session) => {
  const fileType = session.fileType;
  const finalPath = getUploadPathByType(session.filename);
  
  // Перемещаем файл в целевую папку
  await pipeFile(getTempPath(session.filename), finalPath);
  
  let preview = null;
  let warning = null;
  
  // 🎯 SWITCH по типам файлов
  switch (fileType) {
    
    case 'video': {
      logger.debug(`🎬 Обработка видео: ${session.filename}`);
      try {
        const videoResult = await processVideoUpload(finalPath);
        preview = videoResult.image;
        if (!videoResult.success) {
          warning = videoResult.warning || 'Превью не создано';
        }
      } catch (err) {
        logger.warn(`⚠️ Не удалось создать превью видео: ${err.message}`);
        warning = 'Превью видео не создано';
      }
      break;
    }
    
    case 'image': {
      logger.debug(`🖼️ Обработка изображения: ${session.filename}`);
      // Для изображений можно использовать сам файл как превью
      // Пока возвращаем null, позже добавим генерацию миниатюр
      preview = null; // TODO: реализовать resize для превью
      break;
    }
    
    case 'audio': {
      logger.debug(`🎵 Обработка аудио: ${session.filename}`);
      // TODO: извлечь обложку альбома или использовать заглушку
      preview = null;
      break;
    }
    
    case 'document': {
      logger.debug(`📄 Обработка документа: ${session.filename}`);
      // TODO: генерация превью первой страницы для PDF/DOCX
      preview = null;
      break;
    }
    
    case 'archive': {
      logger.debug(`📦 Обработка архива: ${session.filename}`);
      // TODO: показать список файлов внутри (позже)
      preview = null;
      break;
    }
    
    case 'program': {
      logger.debug(`⚙️ Обработка программы: ${session.filename}`);
      preview = null;
      break;
    }
    
    case 'other':
    default: {
      logger.debug(`📋 Файл другого типа: ${session.filename}`);
      preview = null;
      break;
    }
  }
  
  // 🖼️ Если превью не создано — используем заглушку по типу
  if (!preview) {
    preview = await getPlaceholderByType(fileType);
  }
  
  return {
    success: true,
    preview,
    warning,
    filePath: path.relative(config.uploadRoot, finalPath).replace(/\\/g, '/')
  };
};

/**
 * Возвращает base64-заглушку по типу файла
 */
const getPlaceholderByType = async (fileType) => {
  const placeholders = {
    video: '🎬',
    image: '🖼️',
    audio: '🎵',
    document: '📄',
    archive: '📦',
    program: '⚙️',
    other: '📋'
  };
  
  // Пока возвращаем простой placeholder
  // В будущем можно добавить реальные SVG/изображения в base64
  const icon = placeholders[fileType] || '📄';
  
  // Создаём минимальный PNG с иконкой (упрощённо)
  // Для продакшена лучше хранить реальные файлы-заглушки
  return null; // пока без превью, клиент покажет иконку по типу
};

const handleDisconnect = async (socket) => {
  for (const [key, session] of uploadSessions) {
    if (key.startsWith(`${socket.id}:`)) {
      try {
        if (session.handler) await closeFileHandler(session.handler);
        await deleteFile(getTempPath(session.filename));
        logger.warn(`🗑️ Очищена сессия: ${session.filename}`);
      } catch (err) {
        logger.error(`❌ Ошибка очистки: ${err.message}`);
      }
      uploadSessions.delete(key);
    }
  }
};

// Инициализация папок при загрузке модуля
ensureUploadFolders().catch(err => 
  logger.error(`❌ Не удалось создать папки загрузок: ${err.message}`)
);

module.exports = {
  handleStart,
  handleUpload,
  handleDisconnect,
  getFileType, // экспортируем для использования в других местах
  uploadSessions
};