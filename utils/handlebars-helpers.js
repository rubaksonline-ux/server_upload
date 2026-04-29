const express = require('express');
const handlebars = require('hbs');
const path = require('path');

// Helper для иконок файлов
handlebars.registerHelper('fileIcon', (fileType) => {
  const icons = {
    video: '🎬',
    image: '🖼️',
    audio: '🎵',
    document: '📄',
    archive: '📦',
    program: '⚙️',
    other: '📋'
  };
  return icons[fileType] || '📄';
});

// Helper для форматирования размера
handlebars.registerHelper('formatBytes', (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

// Helper для форматирования даты
handlebars.registerHelper('formatDate', (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

// Helper для JSON
handlebars.registerHelper('json', (context) => {
  return JSON.stringify(context).replace(/'/g, '&apos;').replace(/"/g, '&quot;');
});

// Helper для проверки на админа
handlebars.registerHelper('isAdmin', (role) => {
  return role === 'admin';
});

module.exports = handlebars;
