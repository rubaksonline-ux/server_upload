const config = require('../config/server.config');

// Валидация размера файла в зависимости от роли пользователя
const validateFileSize = (size, role = 'anonymous') => {
  const limits = {
    anonymous: parseInt(process.env.ANONYMOUS_MAX_FILE_SIZE) || 104857600, // 100MB
    user: parseInt(process.env.USER_MAX_FILE_SIZE) || 524288000, // 500MB
    admin: parseInt(process.env.ADMIN_MAX_FILE_SIZE) || 1073741824 // 1GB
  };
  
  const limit = limits[role] || limits.anonymous;
  return size <= limit;
};

// Валидация типа файла
const allowedTypes = {
  anonymous: ['video', 'image', 'audio', 'document'],
  user: ['video', 'image', 'audio', 'document', 'archive'],
  admin: ['video', 'image', 'audio', 'document', 'archive', 'program', 'other']
};

const validateFileType = (fileType, role = 'anonymous') => {
  const allowed = allowedTypes[role] || allowedTypes.anonymous;
  return allowed.includes(fileType);
};

// Получение разрешённых расширений для типа
const getExtensionsForType = (fileType) => {
  const extensions = {
    video: ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v'],
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'],
    audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'm4a'],
    document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt'],
    archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
    program: ['exe', 'msi', 'deb', 'rpm', 'app', 'dmg', 'sh', 'bat', 'cmd']
  };
  return extensions[fileType] || [];
};

// Middleware для валидации загружаемых файлов
const fileValidationMiddleware = (req, res, next) => {
  const role = req.user?.role || 'anonymous';
  const fileInfo = req.body;
  
  if (fileInfo.Size) {
    if (!validateFileSize(fileInfo.Size, role)) {
      const limits = {
        anonymous: '100MB',
        user: '500MB',
        admin: '1GB'
      };
      return res.status(413).json({ 
        error: 'Файл слишком большой', 
        limit: limits[role] || limits.anonymous 
      });
    }
  }
  
  if (fileInfo.Name) {
    const { getFileType } = require('../utils/file.utils');
    const fileType = getFileType(fileInfo.Name);
    
    if (!validateFileType(fileType, role)) {
      return res.status(400).json({ 
        error: 'Тип файла не разрешён для вашей роли',
        allowedTypes: allowedTypes[role] || allowedTypes.anonymous
      });
    }
  }
  
  next();
};

module.exports = {
  validateFileSize,
  validateFileType,
  getExtensionsForType,
  fileValidationMiddleware,
  allowedTypes
};
