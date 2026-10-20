import { rateLimit } from 'express-rate-limit';
import AppError from '../utils/AppError.js';

const ONE_MINUTE = 60 * 1000;

function createLimiter({ limit, keyGenerator, message }) {
  return rateLimit({
    windowMs: ONE_MINUTE,
    limit,
    keyGenerator,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', message)),
  });
}

/**
 * Builds fresh limiter instances (each with its own in-memory store). Created per app so tests can
 * use their own limits. For several API instances, swap in a shared store such as rate-limit-redis.
 */
export function createRateLimiters({ authPerMinute, submitPerMinute }) {
  return {
    // Login/register: brute-force and credential-stuffing protection, keyed by client IP.
    credentialsLimiter: createLimiter({
      limit: authPerMinute,
      message: 'Too many attempts. Please wait a minute and try again.',
    }),
    // Refresh/logout run on every page load, so they get more headroom than credential endpoints.
    sessionLimiter: createLimiter({
      limit: authPerMinute * 6,
      message: 'Too many session requests. Please wait a minute and try again.',
    }),
    // Submit is keyed by user (it runs after requireAuth), so students behind one school NAT don't share a quota.
    submitLimiter: createLimiter({
      limit: submitPerMinute,
      keyGenerator: (req) => `user:${req.user.id}`,
      message: 'Too many submissions. Please wait a minute and try again.',
    }),
  };
}
