import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import db from '../src/db/knex.js';
import { PASSWORD, refreshCookieFrom, registerUser } from './helpers.js';

const app = createApp();

afterAll(() => db.destroy());

describe('GET /api/me', () => {
  it("returns the caller's profile without secrets", async () => {
    const student = await registerUser(app, { name: 'Ngozi Eze' });
    const res = await request(app).get('/api/me').set(student.auth).expect(200);

    expect(res.body).toEqual({ id: student.user.id, name: 'Ngozi Eze', email: student.user.email, xp: 0, created_at: expect.any(String) });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns 401 without a token', async () => {
    await request(app).get('/api/me').expect(401);
  });
});

describe('PATCH /api/me', () => {
  it('updates the display name (trimmed) and the dashboard reflects it', async () => {
    const student = await registerUser(app);
    const res = await request(app).patch('/api/me').set(student.auth).send({ name: '  Tunde Bakare  ' }).expect(200);
    expect(res.body.name).toBe('Tunde Bakare');

    const dashboard = await request(app).get('/api/me/dashboard').set(student.auth).expect(200);
    expect(dashboard.body.name).toBe('Tunde Bakare');
  });

  it('rejects an empty or over-long name with 422', async () => {
    const student = await registerUser(app);
    const empty = await request(app).patch('/api/me').set(student.auth).send({ name: '   ' }).expect(422);
    expect(empty.body.error.details[0].field).toBe('name');
    await request(app).patch('/api/me').set(student.auth).send({ name: 'x'.repeat(101) }).expect(422);
  });

  it('refuses to change anything but the name (email, xp)', async () => {
    const student = await registerUser(app);
    const res = await request(app).patch('/api/me').set(student.auth).send({ name: 'Ok', email: 'new@test.dev', xp: 9999 }).expect(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');

    const me = await request(app).get('/api/me').set(student.auth).expect(200);
    expect(me.body).toMatchObject({ email: student.user.email, xp: 0 });
  });

  it('returns 401 without a token', async () => {
    await request(app).patch('/api/me').send({ name: 'Nobody' }).expect(401);
  });
});

describe('POST /api/auth/change-password', () => {
  const NEW_PASSWORD = 'a-brand-new-passphrase';
  const change = (student, body) => request(app).post('/api/auth/change-password').set(student.auth).send(body);

  it('changes the password: old one stops working, new one works', async () => {
    const student = await registerUser(app);
    const res = await change(student, { current_password: PASSWORD, new_password: NEW_PASSWORD }).expect(200);

    expect(res.body).toMatchObject({ user: { id: student.user.id }, token_type: 'Bearer', access_token: expect.any(String) });
    expect(refreshCookieFrom(res)).toBeDefined();

    await request(app).post('/api/auth/login').send({ email: student.user.email, password: PASSWORD }).expect(401);
    await request(app).post('/api/auth/login').send({ email: student.user.email, password: NEW_PASSWORD }).expect(200);
  });

  it('signs out every other device but keeps this one signed in', async () => {
    const phone = await registerUser(app);
    const laptopLogin = await request(app).post('/api/auth/login').send({ email: phone.user.email, password: PASSWORD }).expect(200);
    const laptopCookie = refreshCookieFrom(laptopLogin);

    const res = await change(phone, { current_password: PASSWORD, new_password: NEW_PASSWORD }).expect(200);

    // The laptop's session is gone, and so is the phone's old refresh token...
    await request(app).post('/api/auth/refresh').set('Cookie', laptopCookie).expect(401);
    await request(app).post('/api/auth/refresh').set('Cookie', phone.cookie).expect(401);
    // ...but the session issued with the change keeps working.
    await request(app).post('/api/auth/refresh').set('Cookie', refreshCookieFrom(res)).expect(200);
  });

  it('rejects a wrong current password with a field error and changes nothing', async () => {
    const student = await registerUser(app);
    const res = await change(student, { current_password: 'not-my-password', new_password: NEW_PASSWORD }).expect(422);
    expect(res.body.error.details).toEqual([{ field: 'current_password', message: 'Current password is incorrect.' }]);

    await request(app).post('/api/auth/login').send({ email: student.user.email, password: PASSWORD }).expect(200);
    await request(app).post('/api/auth/refresh').set('Cookie', student.cookie).expect(200);
  });

  it('validates the new password', async () => {
    const student = await registerUser(app);
    const short = await change(student, { current_password: PASSWORD, new_password: 'short' }).expect(422);
    expect(short.body.error.details[0].field).toBe('new_password');

    const same = await change(student, { current_password: PASSWORD, new_password: PASSWORD }).expect(422);
    expect(same.body.error.details[0]).toEqual({ field: 'new_password', message: 'New password must be different from the current one.' });
  });

  it('requires a token and is rate-limited like login', async () => {
    await request(app).post('/api/auth/change-password').send({ current_password: PASSWORD, new_password: NEW_PASSWORD }).expect(401);

    const limitedApp = createApp({ rateLimits: { authPerMinute: 2 } });
    const student = await registerUser(app);
    const attempt = () =>
      request(limitedApp).post('/api/auth/change-password').set(student.auth).send({ current_password: 'guess', new_password: NEW_PASSWORD });
    await attempt().expect(422);
    await attempt().expect(422);
    expect((await attempt().expect(429)).body.error.code).toBe('RATE_LIMITED');
  });
});
