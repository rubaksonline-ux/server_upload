class FolderUploader {
  constructor(socket, options = {}) {
    this.socket = socket;
    this.chunkSize = options.chunkSize || 2 * 1024 * 1024;
    this.onProgress = options.onProgress || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onError = options.onError || (() => {});
    this.uploads = new Map();
    this.ui = options.ui || {}; // 🔥 Ссылка на элементы UI
    
    this.setupListeners();
  }

  setupListeners() {
    this.socket.on('upload:accepted', (data) => {
      console.log('✅ Загрузка принята:', data.uploadId);
    });

    this.socket.on('upload:progress', (data) => {
      const upload = this.uploads.get(data.uploadId);
      if (!upload) return;
      
      // 🔥 Обновляем состояние
      upload.progress = data.progress;
      upload.status = data.status;
      
      // Вызываем callback с дополнительными данными
      this.onProgress({
        ...data,
        uploadId: data.uploadId,
        isFinal: data.isFinal || false
      });
      
      // 🔥 Авто-анимация при достижении 100%
      if (data.progress >= 100 && data.status === 'completed' && !upload.animated) {
        upload.animated = true;
        this.animateCompletion(data.uploadId);
      }
    });

    this.socket.on('upload:complete', (data) => {
      const upload = this.uploads.get(data.uploadId);
      if (!upload) return;
      
      console.log('🎉 Загрузка завершена:', data.uploadId);
      
      // 🔥 Помечаем как завершённую
      upload.completed = true;
      upload.result = data;
      
      // Если анимация ещё не запущена — запускаем
      if (!upload.animated) {
        this.animateCompletion(data.uploadId);
      }
      
      // Вызываем callback с небольшой задержкой после анимации
      setTimeout(() => {
        this.onComplete({
          uploadId: data.uploadId,
          duration: data.duration,
          filesCount: data.filesCount,
          destination: data.destination,
          files: data.files
        });
        
        // 🔥 Очищаем через 2 секунды после завершения
        setTimeout(() => {
          this.removeUpload(data.uploadId);
        }, 2000);
      }, 600); // Ждём окончания CSS-анимации
    });

    this.socket.on('upload:error', (data) => {
      const upload = this.uploads.get(data.uploadId);
      if (upload) {
        upload.status = 'error';
        upload.error = data.error;
      }
      this.onError(data);
      this.removeUpload(data.uploadId);
    });

    this.socket.on('upload:cancelled', (data) => {
      this.onCancel?.(data);
      this.removeUpload(data.uploadId);
    });
  }

  // 🔥 Плавная анимация завершения
  animateCompletion(uploadId) {
    const upload = this.uploads.get(uploadId);
    if (!upload?.progressEl) return;
    
    const bar = upload.progressEl.querySelector('.progress-bar');
    const text = upload.progressEl.querySelector('.progress-text');
    
    if (!bar) return;
    
    // 🔥 Добавляем классы для анимации
    bar.classList.add('progress-bar-success');
    bar.style.transition = 'width 0.3s ease, opacity 0.3s ease';
    
    // Гарантируем 100%
    bar.style.width = '100%';
    
    if (text) {
      text.textContent = '✅ Завершено!';
      text.classList.add('text-success');
    }
    
    // 🔥 Эффект "пульсации" при завершении
    bar.animate([
      { boxShadow: '0 0 0 0 rgba(25, 135, 84, 0.7)' },
      { boxShadow: '0 0 0 10px rgba(25, 135, 84, 0)' }
    ], {
      duration: 600,
      iterations: 2
    });
  }

  // 🔥 Плавное удаление элемента загрузки
  removeUpload(uploadId) {
    const upload = this.uploads.get(uploadId);
    if (!upload?.progressEl) {
      this.uploads.delete(uploadId);
      return;
    }
    
    const el = upload.progressEl;
    
    // 🔥 Анимация исчезновения
    el.style.transition = 'opacity 0.3s ease, transform 0.3s ease, max-height 0.3s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-10px)';
    el.style.maxHeight = '0';
    el.style.margin = '0';
    el.style.padding = '0';
    el.style.overflow = 'hidden';
    
    // Удаляем из DOM после анимации
    setTimeout(() => {
      el.remove();
      this.uploads.delete(uploadId);
      console.log(`🗑️ Удалена загрузка: ${uploadId}`);
    }, 300);
  }

  async uploadFolder(input) {
    const files = await this.readDirectory(input);
    if (files.length === 0) {
      this.onError({ error: 'Папка пуста' });
      return;
    }
    
    const uploadId = crypto.randomUUID();
    const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);
    
    // 🔥 Создаём запись о загрузке
    const upload = {
      id: uploadId,
      files,
      totalSize,
      progress: 0,
      status: 'starting',
      startTime: Date.now(),
      animated: false,
      completed: false
    };
    this.uploads.set(uploadId, upload);
    
    // 🔥 Создаём UI элемент прогресса
    const progressEl = this.createProgressUI(uploadId, {
      folderName: input.name || 'Папка',
      filesCount: files.length,
      totalSize
    });
    upload.progressEl = progressEl;
    
    // Отправляем метаданные
    this.socket.emit('upload:start', {
      uploadId,
      folderName: input.name || 'upload',
      files: files.map(f => ({
        name: f.name,
        path: f.relativePath || f.webkitRelativePath || '',
        size: f.size,
        type: f.type,
        lastModified: f.lastModified
      })),
      totalSize
    });
    
    // 🔥 Кнопка отмены
    if (progressEl.querySelector('.btn-cancel')) {
      progressEl.querySelector('.btn-cancel').onclick = () => {
        this.cancel(uploadId);
      };
    }
    
    // Загружаем файлы параллельно
    const concurrency = 4;
    let active = 0;
    let index = 0;
    let cancelled = false;

    return new Promise((resolve, reject) => {
      const sendNext = async () => {
        if (cancelled) return;
        
        while (active < concurrency && index < files.length) {
          const file = files[index++];
          active++;
          
          this.uploadFile(file, uploadId)
            .catch(err => {
              console.error(`❌ Ошибка файла ${file.name}:`, err);
              if (!upload.completed) reject(err);
            })
            .finally(() => {
              active--;
              if (!cancelled && index >= files.length && active === 0) {
                this.socket.emit('upload:complete', { uploadId });
                resolve({ uploadId });
              } else if (!cancelled) {
                sendNext();
              }
            });
        }
      };
      
      sendNext();
      
      // Обработчик внешней отмены
      this.uploads.get(uploadId).cancel = () => {
        cancelled = true;
        this.cancel(uploadId);
        reject(new Error('Upload cancelled'));
      };
    });
  }

  // 🔥 Создание красивого UI элемента прогресса
  createProgressUI(uploadId, meta) {
    const container = document.getElementById('uploads-container') 
      || document.querySelector('.container') 
      || document.body;
    
    const el = document.createElement('div');
    el.className = 'upload-card card mb-3 shadow-sm';
    el.dataset.uploadId = uploadId;
    el.style.cssText = `
      transition: all 0.3s ease;
      opacity: 1;
      transform: translateY(0);
      max-height: 200px;
      overflow: hidden;
    `;
    
    el.innerHTML = `
      <div class="card-body py-3">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <small class="text-muted text-truncate" style="max-width: 60%">
            📁 ${meta.folderName}
          </small>
          <small class="text-muted" id="progress-${uploadId}-meta">
            0 / ${meta.filesCount} файлов
          </small>
          <button class="btn btn-sm btn-outline-danger btn-cancel ms-2">✕</button>
        </div>
        <div class="progress" style="height: 8px;">
          <div id="progress-${uploadId}-bar" 
               class="progress-bar progress-bar-striped progress-bar-animated" 
               role="progressbar" 
               style="width: 0%">
          </div>
        </div>
        <div class="d-flex justify-content-between mt-1">
          <small class="progress-text text-muted" id="progress-${uploadId}-text">
            Подготовка...
          </small>
          <small class="text-muted" id="progress-${uploadId}-speed"></small>
        </div>
      </div>
    `;
    
    // Вставляем в начало контейнера
    container.insertBefore(el, container.firstChild);
    
    // 🔥 Сохраняем ссылки на элементы для быстрого доступа
    return {
      element: el,
      bar: el.querySelector(`#progress-${uploadId}-bar`),
      text: el.querySelector(`#progress-${uploadId}-text`),
      meta: el.querySelector(`#progress-${uploadId}-meta`),
      speed: el.querySelector(`#progress-${uploadId}-speed`)
    };
  }

  // 🔥 Обновление прогресса с анимацией
  updateProgressUI(uploadId, data) {
    const upload = this.uploads.get(uploadId);
    if (!upload?.progressEl) return;
    
    const { bar, text, meta, speed } = upload.progressEl;
    
    // 🔥 Плавное изменение ширины
    if (bar) {
      bar.style.transition = 'width 0.2s ease';
      bar.style.width = `${data.progress}%`;
      
      // Цвет в зависимости от статуса
      if (data.status === 'error') {
        bar.classList.remove('progress-bar-animated', 'progress-bar-striped');
        bar.classList.add('bg-danger');
      } else if (data.status === 'completed') {
        bar.classList.remove('progress-bar-animated', 'progress-bar-striped', 'bg-danger');
        bar.classList.add('bg-success');
      }
    }
    
    // Текст прогресса
    if (text) {
      if (data.status === 'completed') {
        text.innerHTML = '✅ <strong>Завершено!</strong>';
        text.classList.add('text-success');
      } else if (data.status === 'error') {
        text.innerHTML = `❌ ${data.error || 'Ошибка'}`;
        text.classList.add('text-danger');
      } else {
        const current = data.currentFile ? `📄 ${data.currentFile}` : '';
        text.textContent = `${data.progress}% ${current}`.trim();
        text.classList.remove('text-success', 'text-danger');
      }
    }
    
    // Мета-информация
    if (meta && data.filesProcessed !== undefined) {
      meta.textContent = `${data.filesProcessed} / ${data.filesTotal} файлов`;
    }
    
    // Скорость и ETA
    if (speed) {
      const speedText = data.speed ? this.formatBytes(data.speed) + '/с' : '';
      const etaText = data.eta ? `• ${this.formatETA(data.eta)}` : '';
      speed.textContent = `${speedText} ${etaText}`.trim();
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatETA(seconds) {
    if (!seconds || seconds < 0) return '';
    if (seconds < 60) return `${Math.round(seconds)}с`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}м`;
    return `${Math.round(seconds / 3600)}ч`;
  }

  async uploadFile(file, uploadId) {
    const chunks = this.chunkFile(file);
    
    for (const [index, chunk] of chunks.entries()) {
      await new Promise((resolve) => {
        this.socket.emit('upload:chunk', {
          uploadId,
          fileInfo: {
            name: file.name,
            path: file.relativePath || file.webkitRelativePath || '',
            size: file.size,
            index,
            total: chunks.length
          },
          chunk: Array.from(new Uint8Array(chunk)),
          isLast: index === chunks.length - 1
        });
        
        // 🔥 Таймаут вместо ожидания ack для скорости
        const timeout = setTimeout(resolve, 50);
        
        // Опционально: ждать подтверждения для надёжности
        // this.socket.once('upload:chunk-received', () => {
        //   clearTimeout(timeout);
        //   resolve();
        // });
      });
    }
  }

  chunkFile(file) {
    const chunks = [];
    let start = 0;
    while (start < file.size) {
      const end = Math.min(start + this.chunkSize, file.size);
      chunks.push(file.slice(start, end));
      start = end;
    }
    return chunks;
  }

  cancel(uploadId) {
    const upload = this.uploads.get(uploadId);
    if (upload) {
      upload.cancelled = true;
      this.socket.emit('upload:cancel', { uploadId });
    }
  }

  // 🔥 Публичный метод для обновления UI извне
  setUIHandlers({ onProgress, onComplete, onError }) {
    if (onProgress) {
      const original = this.onProgress;
      this.onProgress = (data) => {
        original(data);
        this.updateProgressUI(data.uploadId, data);
        onProgress(data);
      };
    }
    if (onComplete) this.onComplete = onComplete;
    if (onError) this.onError = onError;
  }
}