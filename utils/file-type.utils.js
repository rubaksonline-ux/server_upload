const path = require('path');

// Расширения по категориям
const EXTENSIONS = {
  video: ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'],
  audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'm4a'],
  document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
  program: ['exe', 'msi', 'deb', 'rpm', 'app', 'dmg', 'sh', 'bat', 'cmd']
};

/**
 * Определяет тип файла по расширению
 * @param {string} filename - Имя файла
 * @returns {string} Категория: 'video' | 'image' | 'audio' | 'document' | 'archive' | 'program' | 'other'
 */
const getFileType = (filename) => {
  const ext = path.extname(filename).toLowerCase().slice(1);
  
  for (const [type, exts] of Object.entries(EXTENSIONS)) {
    if (exts.includes(ext)) {
      return type;
    }
  }
  return 'other';
};

/**
 * Получает путь для сохранения файла по его типу
 * @param {string} filename - Имя файла
 * @param {object} config - Конфигурация сервера
 * @returns {string} Полный путь для сохранения
 */
const getUploadPath = (filename, config) => {
  const fileType = getFileType(filename);
  const folder = config.uploadFolders[fileType] || config.uploadFolders.other;
  return path.join(config.uploadRoot, folder, filename);
};

/**
 * Получает MIME-тип по расширению
 */
const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase().slice(1);
  const mimeMap = {
    mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    mp3: 'audio/mpeg', wav: 'audio/wav', pdf: 'application/pdf',
    zip: 'application/zip', rar: 'application/x-rar-compressed',
    exe: 'application/x-msdownload', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
  return mimeMap[ext] || 'application/octet-stream';
};

module.exports = {
  getFileType,
  getUploadPath,
  getMimeType,
  EXTENSIONS // экспортируем для возможного использования в других местах
};