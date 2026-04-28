require('dotenv').config();
const path = require('path');

module.exports = {
  port: parseInt(process.env.APP_PORT) || 3000,
  host: process.env.APP_IP || '',
  publicDir: path.join(__dirname, '../public'),
  tmpDir: path.resolve(process.env.UPLOAD_TMP_DIR || './tmp'),
  
  // ✅ Новая структура: одна корневая папка с подпапками по типам
  uploadRoot: path.resolve(process.env.UPLOAD_ROOT_DIR || './upload'),
  
  // Подпапки по типам файлов
  uploadFolders: {
    video: 'video',
    image: 'images',
    audio: 'audio',
    document: 'documents',
    archive: 'archives',
    program: 'programs',
    other: 'other'
  },  
  
  //videoDir: path.resolve(process.env.UPLOAD_VIDEO_DIR || './Video'),
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 524288000,
  bufferFlushSize: parseInt(process.env.BUFFER_FLUSH_SIZE) || 10485760,
  chunkSize: 524288 // 512KB
};