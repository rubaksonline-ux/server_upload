const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const logger = require('./logger');

const execAsync = promisify(exec);

/**
 * ✅ Нормализует путь: если уже абсолютный — возвращает как есть, иначе делает абсолютным
 * Предотвращает дублирование путей на Windows
 */
const normalizePath = (filepath) => {
  if (!filepath) return null;
  return path.isAbsolute(filepath) ? filepath : path.resolve(filepath);
};

/**
 * Генерация превью для видео через FFmpeg
 * @param {string} videoPath - Путь к видео (абсолютный или относительный)
 * @param {string} outputPath - Путь для сохранения превью
 */
const generateThumbnail = async (videoPath, outputPath) => {
  const videoAbs = normalizePath(videoPath);
  const thumbAbs = normalizePath(outputPath);
  
  // Экранирование обратных слэшей для Windows-команд
  const safeVideo = videoAbs.replace(/"/g, '\\"');
  const safeThumb = thumbAbs.replace(/"/g, '\\"');
  
  const command = `ffmpeg -i "${safeVideo}" -ss 00:01 -r 1 -an -vframes 1 -f mjpeg "${safeThumb}"`;
  logger.debug(`🎬 FFmpeg: ${command}`);
  
  try {
    await execAsync(command);
    logger.success(`✅ Превью создано: ${thumbAbs}`);
    return true;
  } catch (err) {
    logger.error(`❌ Ошибка FFmpeg: ${err.message}`);
    return false;
  }
};

/**
 * Кодирование файла в base64
 */
const encodeToBase64 = async (filepath) => {
  try {
    const absPath = normalizePath(filepath);
    await fs.access(absPath);
    const data = await fs.readFile(absPath);
    return data.toString('base64');
  } catch (err) {
    logger.error(`❌ Не удалось закодировать в base64: ${filepath}`, { error: err.message });
    return null;
  }
};

/**
 * Основная функция обработки видео после загрузки
 * @param {string} videoPath - Путь к загруженному видео
 */
const processVideoUpload = async (videoPath) => {
  try {
    const videoAbs = normalizePath(videoPath);
    const thumbPath = `${videoAbs}.jpg`;
    
    logger.debug(`🎬 Обработка видео: ${videoAbs}`);
    
    const success = await generateThumbnail(videoAbs, thumbPath);
    
    if (success) {
      const base64 = await encodeToBase64(thumbPath);
      return { success: true, image: base64 };
    } else {
      return { success: false, warning: 'FFmpeg не смог создать превью' };
    }
  } catch (err) {
    logger.error(`❌ Ошибка обработки видео: ${videoPath}`, { error: err.message });
    
    // 🖼️ Fallback: заглушка
    try {
      const fallbackPath = path.resolve(__dirname, '../../public/file.png');
      const base64 = await encodeToBase64(fallbackPath);
      return { success: false, image: base64, warning: 'Использована заглушка' };
    } catch {
      return { success: false, image: null, error: 'Не удалось получить изображение' };
    }
  }
};

module.exports = {
  processVideoUpload,
  encodeToBase64,
  normalizePath // для отладки/тестов
};