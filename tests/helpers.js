import { randomUUID } from 'node:crypto';
import request from 'supertest';

export const PASSWORD = 'correct-horse-battery';

export function uniqueEmail(prefix = 'student') {
  return `${prefix}-${randomUUID()}@test.dev`;
}

/** Extracts the raw `refresh_token=...` pair from a response so it can be replayed as a Cookie header. */
export function refreshCookieFrom(res) {
  const header = [].concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('refresh_token='));
  return header?.split(';')[0];
}

/** Registers a fresh user and returns everything a test needs to act as them. */
export async function registerUser(app, overrides = {}) {
  const body = { name: 'Test Student', email: uniqueEmail(), password: PASSWORD, ...overrides };
  const res = await request(app).post('/api/auth/register').send(body).expect(201);
  return {
    user: res.body.user,
    accessToken: res.body.access_token,
    cookie: refreshCookieFrom(res),
    auth: { Authorization: `Bearer ${res.body.access_token}` },
  };
}
