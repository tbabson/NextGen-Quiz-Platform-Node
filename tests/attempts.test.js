import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import db from '../src/db/knex.js';
import { MAIN_QUIZ, SHORT_QUIZ, buildAnswers, quizIdFor, registerUser } from './helpers.js';

const app = createApp();
let owner;
let stranger;
let attemptId;

beforeAll(async () => {
  [owner, stranger] = [await registerUser(app), await registerUser(app)];
  for (const [slug, correct] of [[SHORT_QUIZ, 6], [MAIN_QUIZ, 7]]) {
    const res = await request(app)
      .post(`/api/quizzes/${await quizIdFor(slug)}/submit`)
      .set(owner.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ answers: await buildAnswers(slug, { correct }) })
      .expect(201);
    attemptId = res.body.id; // the MAIN_QUIZ attempt
  }
});

afterAll(() => db.destroy());

describe('GET /api/attempts', () => {
  it("lists only the caller's attempts, newest first", async () => {
    const res = await request(app).get('/api/attempts').set(owner.auth).expect(200);
    expect(res.body.attempts).toHaveLength(2);
    expect(res.body.attempts[0]).toMatchObject({ id: attemptId, quiz_title: 'Digital Literacy Basics', score: 7, total: 12, xp_awarded: 70 });
    expect(res.body.attempts[1]).toMatchObject({ score: 6, total: 6, xp_awarded: 80 });

    const strangers = await request(app).get('/api/attempts').set(stranger.auth).expect(200);
    expect(strangers.body.attempts).toEqual([]);
  });

  it('supports limit/offset and validates them', async () => {
    const res = await request(app).get('/api/attempts?limit=1&offset=1').set(owner.auth).expect(200);
    expect(res.body.attempts).toHaveLength(1);
    expect(res.body.attempts[0].score).toBe(6);

    const bad = await request(app).get('/api/attempts?limit=0').set(owner.auth).expect(422);
    expect(bad.body.error.details[0].field).toBe('query.limit');
  });

  it('returns 401 without a token', async () => {
    await request(app).get('/api/attempts').expect(401);
  });
});

describe('GET /api/attempts/:id', () => {
  it('returns the per-question breakdown to the owner', async () => {
    const res = await request(app).get(`/api/attempts/${attemptId}`).set(owner.auth).expect(200);
    expect(res.body).toMatchObject({ id: attemptId, score: 7, total: 12, percentage: 58, perfect: false, xp_awarded: 70 });
    expect(res.body.results).toHaveLength(12);
    expect(res.body.results.filter((r) => r.is_correct)).toHaveLength(7);
    for (const result of res.body.results) {
      expect(result).toEqual({
        question_id: expect.any(String),
        position: expect.any(Number),
        text: expect.any(String),
        selected_option: { id: expect.any(String), text: expect.any(String) },
        correct_option: { id: expect.any(String), text: expect.any(String) },
        is_correct: result.selected_option.id === result.correct_option.id,
      });
    }
  });

  it("returns 404 for another user's attempt (no existence leak)", async () => {
    const res = await request(app).get(`/api/attempts/${attemptId}`).set(stranger.auth).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for unknown and malformed ids, 401 without a token', async () => {
    await request(app).get(`/api/attempts/${randomUUID()}`).set(owner.auth).expect(404);
    await request(app).get('/api/attempts/123').set(owner.auth).expect(404);
    await request(app).get(`/api/attempts/${attemptId}`).expect(401);
  });
});
