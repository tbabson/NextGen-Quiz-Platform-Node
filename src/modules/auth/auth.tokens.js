import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import env from '../../config/env.js';

const ISSUER = 'punch-nextgen-quiz-api';
const ALGORITHM = 'HS256';

export function signAccessToken(userId) {
  return jwt.sign({}, env.JWT_ACCESS_SECRET, {
    algorithm: ALGORITHM,
    subject: userId,
    issuer: ISSUER,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

/** Returns the token's claims, or throws a jsonwebtoken error (TokenExpiredError, JsonWebTokenError). */
export function verifyAccessToken(token) {
  // Pinning the algorithm blocks "alg: none" and algorithm-confusion attacks.
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [ALGORITHM], issuer: ISSUER });
}

export function generateRefreshToken() {
  return randomBytes(32).toString('base64url');
}

/** Refresh tokens carry 256 bits of entropy, so a fast unsalted hash is sufficient (unlike passwords). */
export function hashRefreshToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(from = new Date()) {
  return new Date(from.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
