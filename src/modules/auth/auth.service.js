import { randomUUID } from 'node:crypto';
import env from '../../config/env.js';
import db from '../../db/knex.js';
import AppError from '../../utils/AppError.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { isUniqueViolation } from '../../utils/pgErrors.js';
import { generateRefreshToken, hashRefreshToken, refreshTokenExpiry, signAccessToken } from './auth.tokens.js';

const PUBLIC_USER_COLUMNS = ['id', 'name', 'email', 'xp', 'created_at'];

// Compared against when the email is unknown, so a login takes the same time whether or not the
// account exists (prevents user enumeration by timing).
const DUMMY_PASSWORD_HASH = await hashPassword('timing-equaliser-not-a-real-password');

const invalidCredentials = () => AppError.unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');
const invalidRefreshToken = () =>
  AppError.unauthorized('Session is invalid or has expired. Please log in again.', 'INVALID_REFRESH_TOKEN');

export async function register({ name, email, password }) {
  const passwordHash = await hashPassword(password);

  let user;
  try {
    [user] = await db('users').insert({ name, email, password_hash: passwordHash }).returning(PUBLIC_USER_COLUMNS);
  } catch (error) {
    if (isUniqueViolation(error, 'users_email_key')) {
      throw AppError.conflict('EMAIL_TAKEN', 'An account with this email already exists.');
    }
    throw error;
  }

  return issueSession(db, user);
}

export async function login({ email, password }) {
  const user = await db('users').where({ email }).first([...PUBLIC_USER_COLUMNS, 'password_hash']);

  const passwordMatches = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!user || !passwordMatches) throw invalidCredentials();

  const { password_hash, ...publicUser } = user;
  return issueSession(db, publicUser);
}

/**
 * Rotates a refresh token: the presented token is revoked and replaced by a new one in the same family.
 * The row is locked FOR UPDATE so two concurrent refreshes with the same token cannot both succeed.
 */
export async function refresh(rawToken) {
  if (!rawToken) throw invalidRefreshToken();
  const tokenHash = hashRefreshToken(rawToken);

  const outcome = await db.transaction(async (trx) => {
    const stored = await trx('refresh_tokens').where({ token_hash: tokenHash }).forUpdate().first();
    if (!stored) return { error: invalidRefreshToken() };

    if (stored.revoked_at) {
      // A rotated token came back: it was stolen or replayed. Kill every live token in its family.
      // Committed (not thrown) so the revocation persists.
      await trx('refresh_tokens')
        .where({ family_id: stored.family_id })
        .whereNull('revoked_at')
        .update({ revoked_at: trx.fn.now() });
      return { error: invalidRefreshToken() };
    }

    if (stored.expires_at <= new Date()) return { error: invalidRefreshToken() };

    const user = await trx('users').where({ id: stored.user_id }).first(PUBLIC_USER_COLUMNS);
    if (!user) return { error: invalidRefreshToken() };

    const session = await issueSession(trx, user, stored.family_id);
    await trx('refresh_tokens')
      .where({ id: stored.id })
      .update({ revoked_at: trx.fn.now(), replaced_by: session.refreshTokenId });
    return { session };
  });

  if (outcome.error) throw outcome.error;
  return outcome.session;
}

/**
 * Changes the password after re-checking the current one, then revokes every refresh token the user
 * holds, signing out all other devices, and returns a fresh session for the device that asked.
 */
export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await db('users').where({ id: userId }).first([...PUBLIC_USER_COLUMNS, 'password_hash']);
  if (!user) throw AppError.unauthorized('User no longer exists.');

  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    throw AppError.validation([{ field: 'current_password', message: 'Current password is incorrect.' }], 'Current password is incorrect.');
  }

  const passwordHash = await hashPassword(newPassword);
  const { password_hash, ...publicUser } = user;

  return db.transaction(async (trx) => {
    await trx('users').where({ id: userId }).update({ password_hash: passwordHash });
    await trx('refresh_tokens').where({ user_id: userId }).whereNull('revoked_at').update({ revoked_at: trx.fn.now() });
    return issueSession(trx, publicUser);
  });
}

/** Idempotent: logging out with an unknown or already-revoked token still succeeds. */
export async function logout(rawToken) {
  if (!rawToken) return;
  await db('refresh_tokens')
    .where({ token_hash: hashRefreshToken(rawToken) })
    .whereNull('revoked_at')
    .update({ revoked_at: db.fn.now() });
}

async function issueSession(queryable, user, familyId = randomUUID()) {
  const refreshToken = generateRefreshToken();
  const refreshTokenExpiresAt = refreshTokenExpiry();

  const [{ id: refreshTokenId }] = await queryable('refresh_tokens')
    .insert({
      user_id: user.id,
      token_hash: hashRefreshToken(refreshToken),
      family_id: familyId,
      expires_at: refreshTokenExpiresAt,
    })
    .returning('id');

  return {
    user,
    accessToken: signAccessToken(user.id),
    accessTokenExpiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshToken,
    refreshTokenId,
    refreshTokenExpiresAt,
  };
}
