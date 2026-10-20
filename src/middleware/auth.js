import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../modules/auth/auth.tokens.js';
import AppError from '../utils/AppError.js';

/** Requires a valid `Authorization: Bearer <access token>` header and sets `req.user = { id }`. */
export default function requireAuth(req, _res, next) {
  const [scheme, token] = (req.get('authorization') ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return next(AppError.unauthorized('Missing bearer token.'));
  }

  try {
    const claims = verifyAccessToken(token);
    req.user = { id: claims.sub };
    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(AppError.unauthorized('Access token has expired.', 'TOKEN_EXPIRED'));
    }
    return next(AppError.unauthorized('Access token is invalid.', 'INVALID_TOKEN'));
  }
}
