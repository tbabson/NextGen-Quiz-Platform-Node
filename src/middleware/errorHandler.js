import { ZodError } from 'zod';
import AppError from '../utils/AppError.js';
import { toFieldErrors } from './validate.js';

export function notFoundHandler(req, _res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.path} does not exist.`));
}

/**
 * Turns every error into {"error": {"code", "message", "details"}}. Unknown errors are logged with
 * their stack but answered with a generic 500 so internals never leak to clients.
 */
export function errorHandler(err, req, res, next) {
  // A response is already streaming; only Express's default handler can abort it safely.
  if (res.headersSent) return next(err);

  const error = normalise(err);

  if (error.status >= 500) {
    req.log?.error({ err }, 'unhandled error');
  }

  res.status(error.status).json({
    error: { code: error.code, message: error.message, details: error.details },
  });
}

function normalise(err) {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) return AppError.validation(toFieldErrors(err));

  // Errors raised by express.json() (body-parser).
  if (err?.type === 'entity.parse.failed') {
    return AppError.badRequest('INVALID_JSON', 'Request body is not valid JSON.');
  }
  if (err?.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 100 KB limit.');
  }
  if (err?.type === 'encoding.unsupported' || err?.type === 'charset.unsupported') {
    return new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported request encoding.');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again later.');
}
