import pino from 'pino';
import env from './env.js';

// Development: human-readable, coloured one-liners via pino-pretty (a dev dependency).
// Production: structured JSON on stdout for the host's log tooling.
const transport =
  env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          // The request line already says method, URL, status and duration.
          ignore: 'pid,hostname,service,req,res,responseTime',
        },
      }
    : undefined;

const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'punch-nextgen-quiz-api' },
  transport,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', '*.password', '*.password_hash'],
    censor: '[REDACTED]',
  },
});

export default logger;
