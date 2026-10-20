import env from '../../config/env.js';
import * as authService from './auth.service.js';

export const REFRESH_COOKIE = 'refresh_token';

// Scoped to /api/auth so the refresh token is only ever sent to refresh/logout, never to other routes.
const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  path: '/api/auth',
};

export async function register(req, res) {
  const session = await authService.register(req.valid.body);
  sendSession(res.status(201), session);
}

export async function login(req, res) {
  const session = await authService.login(req.valid.body);
  sendSession(res.status(200), session);
}

export async function refresh(req, res) {
  const session = await authService.refresh(req.cookies?.[REFRESH_COOKIE]);
  sendSession(res.status(200), session);
}

/** Other devices are signed out; this one gets a new session (fresh cookie and access token). */
export async function changePassword(req, res) {
  const { current_password: currentPassword, new_password: newPassword } = req.valid.body;
  const session = await authService.changePassword(req.user.id, { currentPassword, newPassword });
  sendSession(res.status(200), session);
}

export async function logout(req, res) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
}

function sendSession(res, session) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, { ...cookieOptions, expires: session.refreshTokenExpiresAt });
  // Tokens must never be cached by browsers or proxies.
  res.set('Cache-Control', 'no-store');
  res.json({
    user: session.user,
    access_token: session.accessToken,
    token_type: 'Bearer',
    expires_in: session.accessTokenExpiresIn,
  });
}
