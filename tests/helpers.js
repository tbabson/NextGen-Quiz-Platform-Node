import { randomUUID } from 'node:crypto';
import request from 'supertest';
import db from '../src/db/knex.js';

export const MAIN_QUIZ = 'digital-literacy-basics'; // 12 questions
export const SHORT_QUIZ = 'nigeria-quick-facts'; // 6 questions

export async function quizIdFor(slug) {
  return (await db('quizzes').where({ slug }).first('id')).id;
}

/** Builds a full answer set for a quiz with exactly `correct` right answers (the first N questions). */
export async function buildAnswers(slug, { correct }) {
  const options = await db('options as o')
    .join('questions as qs', 'qs.id', 'o.question_id')
    .join('quizzes as q', 'q.id', 'qs.quiz_id')
    .where('q.slug', slug)
    .orderBy([{ column: 'qs.position' }, { column: 'o.position' }])
    .select('o.id', 'o.question_id', 'o.is_correct', 'qs.position');

  const positions = [...new Set(options.map((o) => o.position))];
  return positions.map((position) => {
    const choices = options.filter((o) => o.position === position);
    const pick = choices.find((o) => o.is_correct === position <= correct);
    return { question_id: pick.question_id, option_id: pick.id };
  });
}

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
