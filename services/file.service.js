const File = require('../models/File.model');
const { randomBytes } = require('crypto');
const logger = require('../utils/logger');
const { getMimeType, getUploadPathByType } = require('../utils/file.utils'); // ✅ Импорт добавлен

class FileService {
  /**
   * Генерация уникального слага: дружелюбное-имя-8hex
   */
  static generateSlug(friendlyName) {
    const hash = randomBytes(4).toString('hex');
    const base = friendlyName.replace(/\.[^/.]+$/, '');
    return `${base}-${hash}`.replace(/[^a-z0-9-]/g, '').substring(0, 64);
  }

  /**
   * Проверяет уникальность имени и добавляет -1, -2 при коллизии
   */
  static async ensureUniqueFriendlyName(friendlyName) {
    let uniqueName = friendlyName;
    let counter = 1;
    const lastDot = friendlyName.lastIndexOf('.');
    const baseName = lastDot !== -1 ? friendlyName.slice(0, lastDot) : friendlyName;
    const ext = lastDot !== -1 ? friendlyName.slice(lastDot) : '';

    while (await File.findOne({ where: { friendly_name: uniqueName } })) {
      uniqueName = `${baseName}-${counter}${ext}`;
      counter++;
    }
    return uniqueName;
  }

  /**
   * Переименовывает файл на диске
   */
  static async renameFileOnDisk(oldPath, newPath) {
    const fs = require('fs').promises;
    try {
      await fs.rename(oldPath, newPath);
      logger.debug(`📦 Файл переименован: ${oldPath} → ${newPath}`);
      return true;
    } catch (err) {
      logger.error(`❌ Не удалось переименовать файл: ${err.message}`);
      return false;
    }
  }

  /**
   * Сохранение метаданных в БД
   */
  static async saveOnComplete(fileData) {
    try {
      // 1. Уникальное имя (если нужно)
      const finalFriendlyName = await this.ensureUniqueFriendlyName(fileData.friendlyName);

      // 2. Переименование на диске, если имя изменилось
      if (finalFriendlyName !== fileData.friendlyName) {
        const oldPath = getUploadPathByType(fileData.friendlyName);
        const newPath = getUploadPathByType(finalFriendlyName);
        await this.renameFileOnDisk(oldPath, newPath);
      }

      // 3. Слаг и MIME-тип
      const slug = this.generateSlug(finalFriendlyName);
      const mimeType = getMimeType(finalFriendlyName); // ✅ Теперь определено

      // 4. Запись в БД
      const record = await File.create({
        original_name: fileData.originalName || fileData.friendlyName,
        friendly_name: finalFriendlyName,
        slug,
        size: fileData.size,
        mime_type: mimeType,
        file_type: fileData.fileType || 'other',
        file_path: fileData.filePath || '',
        owner: fileData.owner || 'anonymous'
      });

      logger.success(`💾 Файл сохранён в БД: ${record.friendly_name} → /${record.slug}`);
      return record;
    } catch (err) {
      logger.error(`❌ Ошибка сохранения в БД: ${err.message}`);
      throw err;
    }
  }

  static async findBySlug(slug) {
    return await File.findOne({ where: { slug } });
  }

  static async incrementDownloads(id) {
    await File.increment('download_count', { where: { id } });
  }
}

module.exports = FileService;