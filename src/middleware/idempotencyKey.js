import AppError from '../utils/AppError.js';

// Wide enough for UUIDs, ULIDs and similar client-generated keys.
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

/** Requires an `Idempotency-Key` header and exposes it as `req.idempotencyKey`. */
export default function requireIdempotencyKey(req, _res, next) {
  const key = req.get('idempotency-key');

  if (!key) {
    return next(AppError.badRequest('IDEMPOTENCY_KEY_REQUIRED', 'An Idempotency-Key header is required (e.g. a UUID).'));
  }
  if (!KEY_PATTERN.test(key)) {
    return next(
      AppError.badRequest('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 8–128 characters of letters, digits, ".", "_", ":" or "-".'),
    );
  }

  req.idempotencyKey = key;
  return next();
}
