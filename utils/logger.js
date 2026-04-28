const chalk = require('chalk');

const levels = {
  info: chalk.blue,
  success: chalk.green,
  warn: chalk.yellow,
  error: chalk.red,
  debug: chalk.magenta
};

const log = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const prefix = levels[level] ? levels[level](level.toUpperCase()) : level;
  console.log(`${timestamp} [${prefix}] ${message}`, Object.keys(meta).length ? meta : '');
};

module.exports = {
  info: (msg, meta) => log('info', msg, meta),
  success: (msg, meta) => log('success', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta)
};