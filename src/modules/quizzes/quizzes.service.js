import db from '../../db/knex.js';
import { evaluateBadges } from '../../services/badge.service.js';
import { PERFECT_SCORE_BONUS, scoreAnswers, validateAnswers } from '../../services/scoring.service.js';
import AppError from '../../utils/AppError.js';
import { isUniqueViolation } from '../../utils/pgErrors.js';

/** All quizzes with a per-user `completed` flag and a summary of the user's attempt, if any. */
export async function listQuizzes(userId) {
  const rows = await db('quizzes as q')
    .leftJoin('attempts as a', function joinUserAttempt() {
      this.on('a.quiz_id', 'q.id').andOn('a.user_id', db.raw('?', [userId]));
    })
    .select(
      'q.id',
      'q.slug',
      'q.title',
      'q.description',
      'q.xp_per_correct',
      db.raw('(SELECT count(*) FROM questions qs WHERE qs.quiz_id = q.id)::int AS question_count'),
      'a.id as attempt_id',
      'a.score',
      'a.total',
      'a.xp_awarded',
      'a.submitted_at',
    )
    .orderBy('q.created_at', 'asc');

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    xp_per_correct: row.xp_per_correct,
    question_count: row.question_count,
    max_xp: row.question_count * row.xp_per_correct + PERFECT_SCORE_BONUS,
    completed: row.attempt_id !== null,
    attempt: row.attempt_id
      ? { id: row.attempt_id, score: row.score, total: row.total, xp_awarded: row.xp_awarded, submitted_at: row.submitted_at }
      : null,
  }));
}

/** A quiz for answering. Columns are selected explicitly so `is_correct` can never leak to the client. */
export async function getQuizForPlay(quizId, userId) {
  const quiz = await db('quizzes').where({ id: quizId }).first('id', 'slug', 'title', 'description', 'xp_per_correct');
  if (!quiz) throw AppError.notFound('Quiz not found.');

  const [questions, options, attempt] = await Promise.all([
    db('questions').where({ quiz_id: quizId }).orderBy('position').select('id', 'text', 'position'),
    db('options as o')
      .join('questions as qs', 'qs.id', 'o.question_id')
      .where('qs.quiz_id', quizId)
      .orderBy([{ column: 'qs.position' }, { column: 'o.position' }])
      .select('o.id', 'o.question_id', 'o.text'),
    db('attempts').where({ user_id: userId, quiz_id: quizId }).first('id'),
  ]);

  const optionsByQuestion = groupBy(options, 'question_id');

  return {
    ...quiz,
    question_count: questions.length,
    max_xp: questions.length * quiz.xp_per_correct + PERFECT_SCORE_BONUS,
    completed: Boolean(attempt),
    attempt_id: attempt?.id ?? null,
    questions: questions.map((question) => ({
      ...question,
      options: (optionsByQuestion.get(question.id) ?? []).map(({ id, text }) => ({ id, text })),
    })),
  };
}

/**
 * Grades and records a submission. Everything that changes state happens in ONE transaction:
 * lock user → insert attempt → add XP → evaluate badges → commit. Any error rolls it all back.
 *
 * Duplicate protection has two layers:
 *  1. Same Idempotency-Key → the stored attempt is replayed (`replayed: true`, HTTP 200).
 *  2. New key but the quiz is already completed → 409 QUIZ_ALREADY_COMPLETED (UNIQUE(user_id, quiz_id)).
 *
 * Returns `{ attemptId, replayed }`. `conn` is injectable so the seed can reuse this exact logic.
 */
export async function submitQuiz({ userId, quizId, answers, idempotencyKey }, { conn = db } = {}) {
  // Fast path: a retried request does no grading work at all.
  const earlier = await findAttemptByIdempotencyKey(conn, idempotencyKey);
  if (earlier) return replay(earlier, { userId, quizId });

  const { xpPerCorrect, questions } = await loadAnswerKey(conn, quizId);

  const details = validateAnswers(questions, answers);
  if (details.length) throw AppError.validation(details, 'Every question must be answered exactly once with one of its own options.');

  const graded = scoreAnswers({ questions, answers, xpPerCorrect });

  try {
    return await conn.transaction(async (trx) => {
      // Serialises all submissions by this user: concurrent requests queue here, so the checks below
      // see each other's committed attempts and XP can never be double-awarded.
      const user = await trx('users').where({ id: userId }).forUpdate().first('id');
      if (!user) throw AppError.unauthorized('User no longer exists.');

      // Re-check under the lock: a concurrent request with the same key may have just committed.
      const raced = await findAttemptByIdempotencyKey(trx, idempotencyKey);
      if (raced) return replay(raced, { userId, quizId });

      const completed = await trx('attempts').where({ user_id: userId, quiz_id: quizId }).first('id');
      if (completed) throw alreadyCompleted(completed.id);

      const [attempt] = await trx('attempts')
        .insert({
          user_id: userId,
          quiz_id: quizId,
          score: graded.score,
          total: graded.total,
          xp_awarded: graded.xpEarned,
          answers: JSON.stringify(graded.results),
          idempotency_key: idempotencyKey,
        })
        .returning('id');

      if (graded.xpEarned > 0) {
        await trx('users')
          .where({ id: userId })
          .update({ xp: trx.raw('xp + ?', [graded.xpEarned]), xp_updated_at: trx.fn.now() });
      }

      await evaluateBadges(trx, { userId, attemptId: attempt.id });

      return { attemptId: attempt.id, replayed: false };
    });
  } catch (error) {
    // Backstop for the database constraints (the equivalent of Prisma's P2002), e.g. when the same key
    // is used concurrently by a different user, which the per-user lock does not serialise.
    // Check the key first: a same-key retry violates BOTH unique constraints and PostgreSQL may report
    // either one, but a retry must still get the replay, not a 409.
    if (isUniqueViolation(error)) {
      const existing = await findAttemptByIdempotencyKey(conn, idempotencyKey);
      if (existing) return replay(existing, { userId, quizId });
      if (isUniqueViolation(error, 'attempts_user_quiz_key')) throw alreadyCompleted();
    }
    throw error;
  }
}

/** Full answer key (including is_correct) for server-side grading only; never returned to clients. */
async function loadAnswerKey(conn, quizId) {
  const [quiz, questions, options] = await Promise.all([
    conn('quizzes').where({ id: quizId }).first('xp_per_correct'),
    conn('questions').where({ quiz_id: quizId }).orderBy('position').select('id', 'position'),
    conn('options as o')
      .join('questions as qs', 'qs.id', 'o.question_id')
      .where('qs.quiz_id', quizId)
      .select('o.id', 'o.question_id', 'o.is_correct'),
  ]);
  if (!quiz) throw AppError.notFound('Quiz not found.');

  const optionsByQuestion = groupBy(options, 'question_id');
  return {
    xpPerCorrect: quiz.xp_per_correct,
    questions: questions.map((q) => ({ ...q, options: optionsByQuestion.get(q.id) ?? [] })),
  };
}

function findAttemptByIdempotencyKey(conn, idempotencyKey) {
  return conn('attempts').where({ idempotency_key: idempotencyKey }).first('id', 'user_id', 'quiz_id');
}

/** A key may only be replayed by the same user for the same quiz; anything else is a client bug. */
function replay(attempt, { userId, quizId }) {
  if (attempt.user_id !== userId || attempt.quiz_id !== quizId) {
    throw AppError.conflict('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request.');
  }
  return { attemptId: attempt.id, replayed: true };
}

function alreadyCompleted(attemptId) {
  return AppError.conflict(
    'QUIZ_ALREADY_COMPLETED',
    'You have already completed this quiz. Rewards are only given for the first completion.',
    attemptId ? [{ attempt_id: attemptId }] : [],
  );
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  }
  return groups;
}
