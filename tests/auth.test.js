import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import db from '../src/db/knex.js';
import { PASSWORD, refreshCookieFrom, registerUser, uniqueEmail } from './helpers.js';

const app = createApp();

afterAll(() => db.destroy());

describe('POST /api/auth/register', () => {
  it('creates a user, returns an access token and sets an httpOnly refresh cookie', async () => {
    const email = uniqueEmail('Mixed.Case').replace('mixed', 'MIXED');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: '  Chidi  ', email, password: PASSWORD })
      .expect(201);

    expect(res.body.user).toMatchObject({ name: 'Chidi', email: email.toLowerCase(), xp: 0 });
    expect(res.body.user).not.toHaveProperty('password_hash');
    expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 900 });
    expect(res.body.access_token).toEqual(expect.any(String));
    expect(res.headers['cache-control']).toBe('no-store');

    const cookie = [].concat(res.headers['set-cookie']).find((c) => c.startsWith('refresh_token='));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(cookie).toMatch(/SameSite=Strict/);
  });

  it('stores a bcrypt hash, never the plain password', async () => {
    const { user } = await registerUser(app);
    const row = await db('users').where({ id: user.id }).first('password_hash');
    expect(row.password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(row.password_hash).not.toContain(PASSWORD);
  });

  it('rejects a duplicate email regardless of case with 409', async () => {
    const email = uniqueEmail();
    await registerUser(app, { email });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Copy', email: email.toUpperCase(), password: PASSWORD })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('returns 422 with field errors for invalid input', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: '', email: 'not-an-email', password: 'short' })
      .expect(422);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(['email', 'name', 'password']);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials (email is case-insensitive)', async () => {
    const email = uniqueEmail();
    await registerUser(app, { email });
    const res = await request(app).post('/api/auth/login').send({ email: email.toUpperCase(), password: PASSWORD }).expect(200);
    expect(res.body.user.email).toBe(email);
    expect(refreshCookieFrom(res)).toBeDefined();
  });

  it('returns the same 401 for a wrong password and an unknown email', async () => {
    const email = uniqueEmail();
    await registerUser(app, { email });

    const wrongPassword = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' }).expect(401);
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: uniqueEmail(), password: PASSWORD }).expect(401);

    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('logs in the seeded demo account', async () => {
    await request(app).post('/api/auth/login').send({ email: 'ada@test.dev', password: 'Password123!' }).expect(200);
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const { cookie } = await registerUser(app);
    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(200);

    expect(res.body.access_token).toEqual(expect.any(String));
    const rotated = refreshCookieFrom(res);
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(cookie);
  });

  it('treats reuse of a rotated token as theft and revokes the whole session family', async () => {
    const { cookie: original } = await registerUser(app);
    const first = await request(app).post('/api/auth/refresh').set('Cookie', original).expect(200);
    const rotated = refreshCookieFrom(first);

    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', original).expect(401);
    expect(reuse.body.error.code).toBe('INVALID_REFRESH_TOKEN');

    // The legitimate, newer token was revoked too.
    await request(app).post('/api/auth/refresh').set('Cookie', rotated).expect(401);
  });

  it('lets exactly one of many concurrent refreshes with the same token succeed (row lock)', async () => {
    // Verified to fail (7 of 8 succeed) when the SELECT ... FOR UPDATE is removed.
    const { cookie } = await registerUser(app);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => request(app).post('/api/auth/refresh').set('Cookie', cookie)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('returns 401 without a cookie or with an unknown token', async () => {
    await request(app).post('/api/auth/refresh').expect(401);
    await request(app).post('/api/auth/refresh').set('Cookie', 'refresh_token=made-up').expect(401);
  });

  it('rejects an expired refresh token', async () => {
    const { cookie, user } = await registerUser(app);
    await db('refresh_tokens').where({ user_id: user.id }).update({ expires_at: db.raw("now() - interval '1 second'") });
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token and clears the cookie', async () => {
    const { cookie } = await registerUser(app);
    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(204);
    expect([].concat(res.headers['set-cookie']).join()).toMatch(/refresh_token=;/);

    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('is idempotent when called without a session', async () => {
    await request(app).post('/api/auth/logout').expect(204);
  });
});

describe('auth rate limiting', () => {
  it('returns 429 in the shared error shape once the per-IP limit is exceeded', async () => {
    const limitedApp = createApp({ rateLimits: { authPerMinute: 2 } });
    const attempt = () => request(limitedApp).post('/api/auth/login').send({ email: uniqueEmail(), password: PASSWORD });

    await attempt().expect(401);
    await attempt().expect(401);
    const res = await attempt().expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
