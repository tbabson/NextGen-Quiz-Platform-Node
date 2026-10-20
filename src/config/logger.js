import pino from 'pino';
import env from './env.js';

const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'punch-nextgen-quiz-api' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', '*.password', '*.password_hash'],
    censor: '[REDACTED]',
  },
});

export default logger;
