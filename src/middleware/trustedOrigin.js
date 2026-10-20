import env from '../config/env.js';
import AppError from '../utils/AppError.js';

/**
 * CSRF guard for cookie-authenticated routes. Browsers always send `Origin` on cross-site POSTs, so a
 * request from an origin outside the CORS allow-list is refused before the cookie is used. This matters
 * when COOKIE_SAMESITE=none (client and API on different sites), where the browser would otherwise
 * attach the refresh cookie to a forged request. Requests without `Origin` (curl, server-to-server) carry
 * no ambient browser cookies and are allowed.
 */
export default function requireTrustedOrigin(req, _res, next) {
  const origin = req.get('origin');
  if (origin && !env.CORS_ORIGIN.includes(origin)) {
    return next(AppError.forbidden('Requests from this origin are not allowed.'));
  }
  return next();
}
