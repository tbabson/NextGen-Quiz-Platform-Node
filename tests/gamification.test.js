import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import db from '../src/db/knex.js';
import { isRuleSatisfied } from '../src/services/badge.service.js';
import { MAIN_QUIZ, SHORT_QUIZ, buildAnswers, quizIdFor, registerUser } from './helpers.js';

const app = createApp();
const quizIds = {};

beforeAll(async () => {
  quizIds[MAIN_QUIZ] = await quizIdFor(MAIN_QUIZ);
  quizIds[SHORT_QUIZ] = await quizIdFor(SHORT_QUIZ);
});

afterAll(() => db.destroy());

const play = (student, slug, correct, key = randomUUID()) =>
  buildAnswers(slug, { correct }).then((answers) =>
    request(app).post(`/api/quizzes/${quizIds[slug]}/submit`).set(student.auth).set('Idempotency-Key', key).send({ answers }),
  );

const dashboard = (student) => request(app).get('/api/me/dashboard').set(student.auth).expect(200).then((r) => r.body);
const codes = (badges) => badges.map((b) => b.code).sort();

describe('isRuleSatisfied', () => {
  const stats = { xp: 100, quizzesCompleted: 1, hasPerfectScore: false };

  it('evaluates each rule type', () => {
    expect(isRuleSatisfied({ type: 'quizzes_completed_at_least', value: 1 }, stats)).toBe(true);
    expect(isRuleSatisfied({ type: 'quizzes_completed_at_least', value: 2 }, stats)).toBe(false);
    expect(isRuleSatisfied({ type: 'xp_at_least', value: 100 }, stats)).toBe(true);
    expect(isRuleSatisfied({ type: 'xp_at_least', value: 101 }, stats)).toBe(false);
    expect(isRuleSatisfied({ type: 'perfect_score' }, stats)).toBe(false);
    expect(isRuleSatisfied({ type: 'perfect_score' }, { ...stats, hasPerfectScore: true })).toBe(true);
  });

  it('never awards for unknown or malformed rules', () => {
    expect(isRuleSatisfied({ type: 'free_badge' }, stats)).toBe(false);
    expect(isRuleSatisfied(null, stats)).toBe(false);
  });
});

describe('badges awarded inside the submit transaction', () => {
  it('awards First Steps, Perfect Score and XP 100 at the right moments, each exactly once', async () => {
    const student = await registerUser(app);

    // 6/6 → 80 XP: first completion + perfect, but below 100 XP.
    const first = await play(student, SHORT_QUIZ, 6).then((r) => r.body);
    expect(first.xp_awarded).toBe(80);
    expect(codes(first.badges_awarded)).toEqual(['FIRST_STEPS', 'PERFECT_SCORE']);

    // 3/12 → +30 = 110 XP: only XP 100 is new.
    const second = await play(student, MAIN_QUIZ, 3).then((r) => r.body);
    expect(codes(second.badges_awarded)).toEqual(['XP_100']);

    const dash = await dashboard(student);
    expect(dash.xp).toBe(110);
    expect(codes(dash.badges)).toEqual(['FIRST_STEPS', 'PERFECT_SCORE', 'XP_100']);
    expect(await db('user_badges').where({ user_id: student.user.id }).count('* as n').first()).toEqual({ n: 3 });
  });

  it('awards nothing for a zero score except First Steps', async () => {
    const student = await registerUser(app);
    const res = await play(student, MAIN_QUIZ, 0).then((r) => r.body);
    expect(res.xp_awarded).toBe(0);
    expect(codes(res.badges_awarded)).toEqual(['FIRST_STEPS']);
  });

  it('returns the same badges on an idempotent replay without awarding again', async () => {
    const student = await registerUser(app);
    const key = randomUUID();
    const first = await play(student, MAIN_QUIZ, 12, key);
    const replay = await play(student, MAIN_QUIZ, 12, key);

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(codes(replay.body.badges_awarded)).toEqual(['FIRST_STEPS', 'PERFECT_SCORE', 'XP_100']);
    expect(replay.body.badges_awarded).toEqual(first.body.badges_awarded);
    expect(await db('user_badges').where({ user_id: student.user.id }).count('* as n').first()).toEqual({ n: 3 });
  });

  it('rolls back badges together with the attempt and XP when the transaction fails', async () => {
    const student = await registerUser(app);
    // Fail on the badge insert itself: the last write in the transaction.
    await db.raw(`
      CREATE FUNCTION test_fail_badge() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'simulated badge failure'; END $$;
      CREATE TRIGGER test_fail_badge BEFORE INSERT ON user_badges
        FOR EACH ROW WHEN (NEW.user_id = '${student.user.id}') EXECUTE FUNCTION test_fail_badge();
    `);
    try {
      await play(student, MAIN_QUIZ, 12).then((r) => expect(r.status).toBe(500));
    } finally {
      await db.raw('DROP TRIGGER test_fail_badge ON user_badges; DROP FUNCTION test_fail_badge();');
    }

    const dash = await dashboard(student);
    expect(dash).toMatchObject({ xp: 0, quizzes_completed: 0, badges: [] });
    expect(await db('attempts').where({ user_id: student.user.id }).count('* as n').first()).toEqual({ n: 0 });
  });
});

describe('GET /api/me/dashboard', () => {
  it('returns name, xp, quizzes completed, badges and rank for a new student', async () => {
    const student = await registerUser(app, { name: 'Zainab Bello' });
    const dash = await dashboard(student);

    expect(dash).toMatchObject({
      id: student.user.id,
      name: 'Zainab Bello',
      email: student.user.email,
      xp: 0,
      quizzes_completed: 0,
      total_quizzes: 2,
      badges: [],
      rank: expect.any(Number),
      total_players: expect.any(Number),
    });
    expect(dash.rank).toBeLessThanOrEqual(dash.total_players);
  });

  it('updates automatically after a quiz', async () => {
    const student = await registerUser(app);
    const before = await dashboard(student);
    await play(student, MAIN_QUIZ, 10);
    const after = await dashboard(student);

    expect(after).toMatchObject({ xp: 100, quizzes_completed: 1 });
    expect(codes(after.badges)).toEqual(['FIRST_STEPS', 'XP_100']);
    expect(after.rank).toBeLessThan(before.rank);
  });

  it('returns 401 without a token', async () => {
    await request(app).get('/api/me/dashboard').expect(401);
  });
});

describe('GET /api/leaderboard', () => {
  it('orders by xp desc with global ranks and never exposes emails', async () => {
    const student = await registerUser(app);
    const res = await request(app).get('/api/leaderboard?limit=100').set(student.auth).expect(200);
    const rows = res.body.leaderboard;

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toEqual({ user_id: expect.any(String), name: expect.any(String), xp: expect.any(Number), rank: 1, is_current_user: expect.any(Boolean) });
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].xp).toBeLessThanOrEqual(rows[i - 1].xp);
      expect(rows[i].rank).toBeGreaterThan(rows[i - 1].rank);
    }
    expect(JSON.stringify(res.body)).not.toContain('@');
  });

  it('breaks ties in favour of whoever reached the score first', async () => {
    const early = await registerUser(app);
    const late = await registerUser(app);
    // Both end on 80 XP; `late` registered second but must not jump ahead, and must reach 80 later.
    await play(early, SHORT_QUIZ, 6);
    await play(late, SHORT_QUIZ, 6);

    const [earlyDash, lateDash] = [await dashboard(early), await dashboard(late)];
    expect(earlyDash.xp).toBe(lateDash.xp);
    expect(earlyDash.rank).toBeLessThan(lateDash.rank);
  });

  it('agrees with the dashboard rank and reports the caller’s own position', async () => {
    const student = await registerUser(app);
    await play(student, MAIN_QUIZ, 12);
    await play(student, SHORT_QUIZ, 6); // 220 XP, the maximum possible

    const res = await request(app).get('/api/leaderboard?limit=5').set(student.auth).expect(200);
    const me = res.body.leaderboard.find((row) => row.is_current_user);
    const dash = await dashboard(student);

    expect(res.body.leaderboard).toHaveLength(5);
    expect(me).toMatchObject({ user_id: student.user.id, xp: 220, rank: dash.rank });
    expect(res.body.current_user).toEqual({ rank: dash.rank, total_players: dash.total_players });
  });

  it('defaults to 20 rows and validates limit', async () => {
    const student = await registerUser(app);
    const res = await request(app).get('/api/leaderboard').set(student.auth).expect(200);
    expect(res.body.leaderboard.length).toBeLessThanOrEqual(20);

    await request(app).get('/api/leaderboard?limit=0').set(student.auth).expect(422);
    await request(app).get('/api/leaderboard?limit=101').set(student.auth).expect(422);
    await request(app).get('/api/leaderboard?limit=abc').set(student.auth).expect(422);
  });

  it('returns 401 without a token', async () => {
    await request(app).get('/api/leaderboard').expect(401);
  });
});
