const fs = require('fs').promises;
const fsCallback = require('fs');
const path = require('path');

// Безопасная загрузка конфига
let config;
try {
  config = require('../config/server.config');
} catch {
  config = {
    tmpDir: path.resolve('./tmp'),
    uploadRoot: path.resolve('./upload'),
    uploadFolders: {
      video: 'video', image: 'images', audio: 'audio',
      document: 'documents', archive: 'archives', program: 'programs', other: 'other'
    }
  };
}

const logger = require('./logger');

const ensureDirectory = async (dir) => {
  if (!dir || typeof dir !== 'string') return;
  try {
    const resolvedPath = path.resolve(dir);
    await fs.access(resolvedPath);
  } catch {
    try {
      const resolvedPath = path.resolve(dir);
      await fs.mkdir(resolvedPath, { recursive: true });
      logger.success(`📁 Создана директория: ${resolvedPath}`);
    } catch (err) {
      logger.error(`❌ Не удалось создать директорию: ${dir}`, { error: err.message });
      throw err;
    }
  }
};

const getTempPath = (filename) => filename ? path.join(config.tmpDir || './tmp', filename) : null;
const getVideoPath = (filename) => filename ? path.join(config.uploadRoot || './Video', filename) : null;

// 🔍 Определение типа файла по расширению
const getFileType = (filename) => {
  if (!filename) return 'other';
  const ext = path.extname(filename).toLowerCase().slice(1);
  const EXTENSIONS = {
    video: ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v'],
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'],
    audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'm4a'],
    document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt'],
    archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
    program: ['exe', 'msi', 'deb', 'rpm', 'app', 'dmg', 'sh', 'bat', 'cmd']
  };
  for (const [type, exts] of Object.entries(EXTENSIONS)) {
    if (exts.includes(ext)) return type;
  }
  return 'other';
};

// 📂 Получение пути сохранения по типу файла
const getUploadPathByType = (filename) => {
  if (!filename) return null;
  const fileType = getFileType(filename);
  const folder = config.uploadFolders?.[fileType] || config.uploadFolders?.other || 'other';
  return path.join(config.uploadRoot || './upload', folder, filename);
};

// 🌐 ✅ ДОБАВЛЕНО: Определение MIME-типа
const getMimeType = (filename) => {
  if (!filename) return 'application/octet-stream';
  const ext = path.extname(filename).toLowerCase().slice(1);
  const mimeMap = {
    mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    zip: 'application/zip', rar: 'application/x-rar-compressed', '7z': 'application/x-7z-compressed',
    exe: 'application/x-msdownload', txt: 'text/plain'
  };
  return mimeMap[ext] || 'application/octet-stream';
};

const getFileStats = async (filepath) => {
  try {
    if (!filepath) return null;
    const stats = await fs.stat(filepath);
    return stats.isFile() ? stats : null;
  } catch { return null; }
};

const openFileHandler = async (filepath, flags = 'w', mode = 0o755) => {
  if (!filepath) throw new Error('Filepath is required');
  return await fs.open(filepath, flags, mode);
};

const writeToFile = async (fileHandle, data, encoding = 'latin1') => {
  if (!fileHandle || typeof fileHandle.write !== 'function') throw new Error('Invalid file handle');
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, encoding === 'binary' ? 'latin1' : encoding);
  return await fileHandle.write(buffer, 0, buffer.length, null);
};

const closeFileHandler = async (fileHandle) => {
  if (fileHandle && typeof fileHandle.close === 'function') {
    try { await fileHandle.close(); } catch (err) { logger.warn(`⚠️ Не удалось закрыть дескриптор: ${err.message}`); }
  }
};

const pipeFile = async (src, dest) => {
  if (!src || !dest) throw new Error('Source and destination paths are required');
  await ensureDirectory(path.dirname(dest));
  return new Promise((resolve, reject) => {
    const readStream = fsCallback.createReadStream(src);
    const writeStream = fsCallback.createWriteStream(dest);
    readStream.pipe(writeStream);
    readStream.on('end', () => resolve());
    readStream.on('error', reject);
    writeStream.on('error', reject);
  });
};

const deleteFile = async (filepath) => {
  try {
    if (!filepath) return;
    await fs.access(filepath);
    await fs.unlink(filepath);
    logger.debug(`🗑️ Удалён файл: ${filepath}`);
  } catch (err) {
    if (err.code !== 'ENOENT') logger.warn(`⚠️ Не удалось удалить файл ${filepath}:`, { error: err.message });
  }
};

const fileExtension = (filename) => filename ? path.extname(filename).toLowerCase().slice(1) : '';

const ensureUploadFolders = async () => {
  try {
    if (!config?.uploadRoot) config.uploadRoot = './upload';
    await ensureDirectory(config.uploadRoot);
    if (config.uploadFolders) {
      for (const folder of Object.values(config.uploadFolders)) {
        if (folder) await ensureDirectory(path.join(config.uploadRoot, folder));
      }
      logger.success(`📁 Папки загрузок готовы: ${Object.values(config.uploadFolders).join(', ')}`);
    }
  } catch (err) {
    logger.error('❌ Ошибка при создании папок загрузок:', { error: err.message });
  }
};

const getRelativeUploadPath = (absolutePath) => {
  if (!absolutePath || !config?.uploadRoot) return absolutePath;
  return path.relative(config.uploadRoot, absolutePath).replace(/\\/g, '/');
};

// ✅ ЭКСПОРТ: все функции, включая getMimeType
module.exports = {
  ensureDirectory,
  getTempPath,
  getVideoPath,
  getUploadPathByType,
  getFileType,
  getMimeType,           // ✅ Теперь экспортируется
  getFileStats,
  openFileHandler,
  writeToFile,
  closeFileHandler,
  pipeFile,
  deleteFile,
  fileExtension,
  ensureUploadFolders,
  getRelativeUploadPath,
  config
};