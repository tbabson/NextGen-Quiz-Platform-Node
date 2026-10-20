import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import env from './config/env.js';
import logger from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRateLimiters } from './middleware/rateLimit.js';
import authRoutes from './modules/auth/auth.routes.js';
import healthRoutes from './modules/health/health.routes.js';

const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;

/**
 * Builds the Express app. Middleware order matters:
 * request id + logging → security headers → CORS → body/cookie parsing → routes → 404 → error handler.
 */
export function createApp({ rateLimits = {} } = {}) {
  const app = express();
  const limiters = createRateLimiters({
    authPerMinute: rateLimits.authPerMinute ?? env.RATE_LIMIT_AUTH_PER_MIN,
    submitPerMinute: rateLimits.submitPerMinute ?? env.RATE_LIMIT_SUBMIT_PER_MIN,
  });

  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      // Reuse a well-formed upstream request id (e.g. from Nginx) so logs correlate across hops.
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true, // the refresh token travels in a cookie
      exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed', 'RateLimit', 'RateLimit-Policy'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/health', healthRoutes());
  app.use('/api/auth', authRoutes(limiters));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
