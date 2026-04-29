const rateLimit = require('express-rate-limit');
const config = require('../config/server.config');

// Rate limiting для разных типов пользователей
const createRateLimiter = (windowMs, max) => {
  return rateLimit({
    windowMs: windowMs * 60 * 1000, // минуты в мс
    max: max, // максимальное количество запросов
    message: { error: 'Слишком много запросов, попробуйте позже' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      return req.user?.id || req.session?.id || req.ip || 'anonymous';
    }
  });
};

// Лимиты из .env или дефолтные значения
const anonymousLimit = parseInt(process.env.RATE_LIMIT_ANONYMOUS) || 10;
const userLimit = parseInt(process.env.RATE_LIMIT_USER) || 30;
const adminLimit = parseInt(process.env.RATE_LIMIT_ADMIN) || 100;

const rateLimiters = {
  anonymous: createRateLimiter(1, anonymousLimit),
  user: createRateLimiter(1, userLimit),
  admin: createRateLimiter(1, adminLimit)
};

// Middleware для выбора лимитера по роли пользователя
const rateLimitMiddleware = (req, res, next) => {
  const role = req.user?.role || 'anonymous';
  
  let limiter;
  switch (role) {
    case 'admin':
      limiter = rateLimiters.admin;
      break;
    case 'user':
      limiter = rateLimiters.user;
      break;
    default:
      limiter = rateLimiters.anonymous;
  }
  
  limiter(req, res, next);
};

module.exports = {
  rateLimitMiddleware,
  createRateLimiter,
  rateLimiters
};
