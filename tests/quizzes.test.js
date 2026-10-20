import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import db from '../src/db/knex.js';
import { MAIN_QUIZ, SHORT_QUIZ, buildAnswers, quizIdFor, registerUser } from './helpers.js';

const app = createApp();
let mainQuizId;
let shortQuizId;

beforeAll(async () => {
  mainQuizId = await quizIdFor(MAIN_QUIZ);
  shortQuizId = await quizIdFor(SHORT_QUIZ);
});

afterAll(() => db.destroy());

const submit = (student, quizId, answers, key = randomUUID()) =>
  request(app).post(`/api/quizzes/${quizId}/submit`).set(student.auth).set('Idempotency-Key', key).send({ answers });

const xpOf = async (userId) => (await db('users').where({ id: userId }).first('xp')).xp;

describe('authentication on quiz routes', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/quizzes').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    await request(app).get(`/api/quizzes/${mainQuizId}`).expect(401);
    await request(app).post(`/api/quizzes/${mainQuizId}/submit`).send({ answers: [] }).expect(401);
  });
});

describe('GET /api/quizzes', () => {
  it('lists quizzes with a per-user completed flag', async () => {
    const student = await registerUser(app);
    await submit(student, shortQuizId, await buildAnswers(SHORT_QUIZ, { correct: 3 })).expect(201);

    const res = await request(app).get('/api/quizzes').set(student.auth).expect(200);
    const byslug = Object.fromEntries(res.body.quizzes.map((q) => [q.slug, q]));

    expect(byslug[MAIN_QUIZ]).toMatchObject({ question_count: 12, max_xp: 140, completed: false, attempt: null });
    expect(byslug[SHORT_QUIZ]).toMatchObject({ completed: true, attempt: { score: 3, total: 6, xp_awarded: 30 } });
  });
});

describe('GET /api/quizzes/:id', () => {
  it('returns questions and options but never is_correct', async () => {
    const student = await registerUser(app);
    const res = await request(app).get(`/api/quizzes/${mainQuizId}`).set(student.auth).expect(200);

    expect(res.body.questions).toHaveLength(12);
    expect(res.body.questions[0]).toEqual({ id: expect.any(String), text: expect.any(String), position: 1, options: expect.any(Array) });
    expect(res.body.questions[0].options[0]).toEqual({ id: expect.any(String), text: expect.any(String) });
    expect(JSON.stringify(res.body)).not.toMatch(/is_correct|correct_option/);
  });

  it('returns 404 for an unknown id and for a malformed id', async () => {
    const student = await registerUser(app);
    await request(app).get(`/api/quizzes/${randomUUID()}`).set(student.auth).expect(404);
    await request(app).get('/api/quizzes/not-a-uuid').set(student.auth).expect(404);
  });
});

describe('POST /api/quizzes/:id/submit', () => {
  it('grades on the server, stores the attempt, awards XP and returns a breakdown', async () => {
    const student = await registerUser(app);
    const res = await submit(student, mainQuizId, await buildAnswers(MAIN_QUIZ, { correct: 9 })).expect(201);

    expect(res.headers['idempotent-replayed']).toBe('false');
    expect(res.body).toMatchObject({ score: 9, total: 12, percentage: 75, perfect: false, xp_awarded: 90 });
    expect(res.body.results).toHaveLength(12);
    expect(res.body.results[0]).toMatchObject({ position: 1, is_correct: true, selected_option: { id: expect.any(String) } });
    expect(res.body.results[11]).toMatchObject({ is_correct: false });
    expect(res.body.results[11].correct_option.id).not.toBe(res.body.results[11].selected_option.id);

    expect(await xpOf(student.user.id)).toBe(90);
    expect(await db('attempts').where({ user_id: student.user.id }).count('* as n').first()).toEqual({ n: 1 });
  });

  it('adds the +20 bonus for a perfect score', async () => {
    const student = await registerUser(app);
    const res = await submit(student, mainQuizId, await buildAnswers(MAIN_QUIZ, { correct: 12 })).expect(201);
    expect(res.body).toMatchObject({ score: 12, perfect: true, xp_awarded: 140 });
    expect(await xpOf(student.user.id)).toBe(140);
  });

  it('replays the stored result for the same Idempotency-Key: one attempt, XP added once', async () => {
    const student = await registerUser(app);
    const answers = await buildAnswers(MAIN_QUIZ, { correct: 5 });
    const key = randomUUID();

    const first = await submit(student, mainQuizId, answers, key).expect(201);
    const second = await submit(student, mainQuizId, answers, key).expect(200);

    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toEqual(first.body);
    expect(await xpOf(student.user.id)).toBe(50);
    expect(await db('attempts').where({ user_id: student.user.id }).count('* as n').first()).toEqual({ n: 1 });
  });

  it('rejects a second completion of the same quiz with 409 and no extra XP', async () => {
    const student = await registerUser(app);
    const first = await submit(student, mainQuizId, await buildAnswers(MAIN_QUIZ, { correct: 4 })).expect(201);
    const second = await submit(student, mainQuizId, await buildAnswers(MAIN_QUIZ, { correct: 12 })).expect(409);

    expect(second.body.error).toMatchObject({ code: 'QUIZ_ALREADY_COMPLETED', details: [{ attempt_id: first.body.id }] });
    expect(await xpOf(student.user.id)).toBe(40);
  });

  it('handles concurrent submissions with different keys: one attempt, XP awarded once', async () => {
    const student = await registerUser(app);
    const answers = await buildAnswers(SHORT_QUIZ, { correct: 6 });

    const results = await Promise.all(Array.from({ length: 6 }, () => submit(student, shortQuizId, answers)));
    const statuses = results.map((r) => r.status).sort();

    expect(statuses).toEqual([201, 409, 409, 409, 409, 409]);
    expect(await xpOf(student.user.id)).toBe(80);
  });

  it('handles concurrent retries with the same key: one attempt, every response is the same result', async () => {
    const student = await registerUser(app);
    const answers = await buildAnswers(SHORT_QUIZ, { correct: 2 });
    const key = randomUUID();

    const results = await Promise.all(Array.from({ length: 6 }, () => submit(student, shortQuizId, answers, key)));

    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 200, 201]);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await xpOf(student.user.id)).toBe(20);
  });

  it('rejects reuse of an Idempotency-Key by another user with 409', async () => {
    const [alice, bob] = [await registerUser(app), await registerUser(app)];
    const key = randomUUID();
    await submit(alice, shortQuizId, await buildAnswers(SHORT_QUIZ, { correct: 1 }), key).expect(201);

    const res = await submit(bob, shortQuizId, await buildAnswers(SHORT_QUIZ, { correct: 1 }), key).expect(409);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await xpOf(bob.user.id)).toBe(0);
  });

  describe('validation (422 with field errors, nothing stored)', () => {
    it('rejects an option id that is not one of the question’s options', async () => {
      const student = await registerUser(app);
      const answers = await buildAnswers(MAIN_QUIZ, { correct: 12 });
      answers[2] = { ...answers[2], option_id: answers[3].option_id };

      const res = await submit(student, mainQuizId, answers).expect(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details).toEqual([{ field: 'answers[2].option_id', message: expect.any(String) }]);
      expect(await xpOf(student.user.id)).toBe(0);
    });

    it('rejects an unknown (random) option id', async () => {
      const student = await registerUser(app);
      const answers = await buildAnswers(MAIN_QUIZ, { correct: 12 });
      answers[0] = { ...answers[0], option_id: randomUUID() };
      const res = await submit(student, mainQuizId, answers).expect(422);
      expect(res.body.error.details[0].field).toBe('answers[0].option_id');
    });

    it('rejects unanswered and duplicated questions', async () => {
      const student = await registerUser(app);
      const answers = await buildAnswers(MAIN_QUIZ, { correct: 12 });
      answers[11] = answers[0];

      const res = await submit(student, mainQuizId, answers).expect(422);
      expect(res.body.error.details.map((d) => d.field)).toEqual(['answers[11].question_id', 'answers']);
    });

    it('rejects questions from another quiz', async () => {
      const student = await registerUser(app);
      const answers = await buildAnswers(MAIN_QUIZ, { correct: 12 });
      answers.push((await buildAnswers(SHORT_QUIZ, { correct: 1 }))[0]);
      const res = await submit(student, mainQuizId, answers).expect(422);
      expect(res.body.error.details[0]).toMatchObject({ field: 'answers[12].question_id' });
    });

    it('rejects a client-supplied score instead of trusting it', async () => {
      const student = await registerUser(app);
      const res = await request(app)
        .post(`/api/quizzes/${mainQuizId}/submit`)
        .set(student.auth)
        .set('Idempotency-Key', randomUUID())
        .send({ answers: await buildAnswers(MAIN_QUIZ, { correct: 0 }), score: 12 })
        .expect(422);
      expect(res.body.error.details[0].message).toMatch(/score/);
    });

    it('rejects malformed ids and an empty answer list', async () => {
      const student = await registerUser(app);
      const res = await submit(student, mainQuizId, [{ question_id: 'x', option_id: 'y' }]).expect(422);
      expect(res.body.error.details.map((d) => d.field)).toEqual(['answers[0].question_id', 'answers[0].option_id']);
      await submit(student, mainQuizId, []).expect(422);
    });
  });

  it('requires a well-formed Idempotency-Key header', async () => {
    const student = await registerUser(app);
    const answers = await buildAnswers(MAIN_QUIZ, { correct: 1 });

    const missing = await request(app).post(`/api/quizzes/${mainQuizId}/submit`).set(student.auth).send({ answers }).expect(400);
    expect(missing.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const bad = await submit(student, mainQuizId, answers, 'short').expect(400);
    expect(bad.body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
  });

  it('returns 404 when submitting to an unknown quiz', async () => {
    const student = await registerUser(app);
    await submit(student, randomUUID(), await buildAnswers(MAIN_QUIZ, { correct: 1 })).expect(404);
  });

  it('rolls back the attempt when a later step in the transaction fails', async () => {
    const student = await registerUser(app);
    // Test-only trigger that makes the XP update fail for this user, after the attempt row is inserted.
    await db.raw(`
      CREATE FUNCTION test_fail_xp_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'simulated failure'; END $$;
      CREATE TRIGGER test_fail_xp_update BEFORE UPDATE OF xp ON users
        FOR EACH ROW WHEN (NEW.id = '${student.user.id}') EXECUTE FUNCTION test_fail_xp_update();
    `);
    try {
      const res = await submit(student, mainQuizId, await buildAnswers(MAIN_QUIZ, { correct: 12 })).expect(500);
      expect(res.body.error).toEqual({ code: 'INTERNAL_ERROR', message: expect.any(String), details: [] });
    } finally {
      await db.raw('DROP TRIGGER test_fail_xp_update ON users; DROP FUNCTION test_fail_xp_update();');
    }

    expect(await db('attempts').where({ user_id: student.user.id }).count('* as n').first()).toEqual({ n: 0 });
    expect(await xpOf(student.user.id)).toBe(0);
    // Nothing was half-saved, so the student can still complete the quiz.
    await submit(student, mainQuizId, await buildAnswers(MAIN_QUIZ, { correct: 12 })).expect(201);
  });

  it('rate-limits submissions per user with 429', async () => {
    const limitedApp = createApp({ rateLimits: { submitPerMinute: 2 } });
    const student = await registerUser(app);
    const post = () =>
      request(limitedApp).post(`/api/quizzes/${randomUUID()}/submit`).set(student.auth).set('Idempotency-Key', randomUUID()).send({ answers: [] });
    await post().expect(422);
    await post().expect(422);
    expect((await post().expect(429)).body.error.code).toBe('RATE_LIMITED');
  });
});
