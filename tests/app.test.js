import { spawnSync } from 'node:child_process';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import env from '../src/config/env.js';
import db from '../src/db/knex.js';
import requireAuth from '../src/middleware/auth.js';
import { signAccessToken } from '../src/modules/auth/auth.tokens.js';

const app = createApp();

afterAll(() => db.destroy());

describe('GET /api/health', () => {
  it('reports liveness and a successful DB ping', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });
});

describe('cross-cutting HTTP behaviour', () => {
  it('returns the shared error shape for unknown routes', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String), details: [] } });
  });

  it('returns 400 INVALID_JSON for a malformed body', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":').expect(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('rejects bodies over 100 KB with 413', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'x'.repeat(101 * 1024), email: 'big@test.dev', password: 'whatever1' })
      .expect(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers and a request id, and hides x-powered-by', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows CORS only for the configured client origin', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', env.CORS_ORIGIN[0]);
    expect(allowed.headers['access-control-allow-origin']).toBe(env.CORS_ORIGIN[0]);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const blocked = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('database safety limits', () => {
  it('applies statement and idle-in-transaction timeouts to pooled connections', async () => {
    const { rows } = await db.raw("SELECT current_setting('statement_timeout') AS st, current_setting('idle_in_transaction_session_timeout') AS idle");
    expect(rows[0]).toEqual({ st: '10s', idle: '10s' });
  });
});

describe('environment validation (fail fast at boot)', () => {
  const boot = (overrides) =>
    spawnSync(process.execPath, ['-e', "import('./src/config/env.js').then(() => console.log('BOOTED'))"], {
      env: { ...process.env, NODE_ENV: 'test', ...overrides },
      encoding: 'utf8',
    });

  it('boots with a valid configuration', () => {
    expect(boot({}).stdout).toContain('BOOTED');
  });

  it('refuses a short JWT secret', () => {
    const result = boot({ JWT_ACCESS_SECRET: 'too-short' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/JWT_ACCESS_SECRET/);
  });

  it('refuses the placeholder secret in production', () => {
    const result = boot({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'change-me-to-a-long-random-string-of-32-plus-chars' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Placeholder secret/);
  });

  it('refuses SameSite=None cookies without Secure', () => {
    const result = boot({ COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/COOKIE_SECURE=true/);
  });
});

describe('requireAuth middleware', () => {
  const run = (authorization) => {
    const req = { get: () => authorization };
    const next = vi.fn();
    requireAuth(req, {}, next);
    return { req, error: next.mock.calls[0][0] };
  };

  it('accepts a valid token and exposes the user id', () => {
    const { req, error } = run(`Bearer ${signAccessToken('3f1c7f1e-9a43-4a8e-8a4f-0d6f3b1d2a10')}`);
    expect(error).toBeUndefined();
    expect(req.user).toEqual({ id: '3f1c7f1e-9a43-4a8e-8a4f-0d6f3b1d2a10' });
  });

  it('rejects a missing token with 401', () => {
    expect(run(undefined).error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('rejects an expired token with TOKEN_EXPIRED', () => {
    const expired = jwt.sign({ sub: 'u1', iss: 'punch-nextgen-quiz-api', exp: Math.floor(Date.now() / 1000) - 10 }, env.JWT_ACCESS_SECRET);
    expect(run(`Bearer ${expired}`).error).toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
  });

  it('rejects tokens signed with another secret or with alg "none"', () => {
    const forged = jwt.sign({ sub: 'u1' }, 'some-other-secret-that-is-long-enough', { issuer: 'punch-nextgen-quiz-api' });
    const unsigned = jwt.sign({ sub: 'u1', iss: 'punch-nextgen-quiz-api' }, null, { algorithm: 'none' });
    expect(run(`Bearer ${forged}`).error).toMatchObject({ status: 401, code: 'INVALID_TOKEN' });
    expect(run(`Bearer ${unsigned}`).error).toMatchObject({ status: 401, code: 'INVALID_TOKEN' });
  });
});
