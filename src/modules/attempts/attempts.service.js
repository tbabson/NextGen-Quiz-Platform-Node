import db from '../../db/knex.js';
import AppError from '../../utils/AppError.js';

/** The caller's own attempts, newest first. */
export async function listAttempts(userId, { limit, offset }) {
  return db('attempts as a')
    .join('quizzes as q', 'q.id', 'a.quiz_id')
    .where('a.user_id', userId)
    .orderBy('a.submitted_at', 'desc')
    .limit(limit)
    .offset(offset)
    .select('a.id', 'a.quiz_id', 'q.title as quiz_title', 'a.score', 'a.total', 'a.xp_awarded', 'a.submitted_at');
}

/**
 * One attempt with a per-question breakdown. Owner-scoped: another user's attempt is reported as
 * 404 rather than 403 so the API does not confirm that the id exists.
 */
export async function getAttemptForUser(attemptId, userId) {
  const attempt = await db('attempts as a')
    .join('quizzes as q', 'q.id', 'a.quiz_id')
    .where('a.id', attemptId)
    .first('a.id', 'a.user_id', 'a.quiz_id', 'q.title as quiz_title', 'a.score', 'a.total', 'a.xp_awarded', 'a.answers', 'a.submitted_at');

  // Access control: attempt.user_id must be the caller.
  if (!attempt || attempt.user_id !== userId) throw AppError.notFound('Attempt not found.');

  const [questions, options] = await Promise.all([
    db('questions').where({ quiz_id: attempt.quiz_id }).select('id', 'text', 'position'),
    db('options as o')
      .join('questions as qs', 'qs.id', 'o.question_id')
      .where('qs.quiz_id', attempt.quiz_id)
      .select('o.id', 'o.question_id', 'o.text', 'o.is_correct'),
  ]);

  const questionsById = new Map(questions.map((q) => [q.id, q]));
  const optionsById = new Map(options.map((o) => [o.id, o]));
  const correctByQuestion = new Map(options.filter((o) => o.is_correct).map((o) => [o.question_id, o]));
  const optionView = (option) => (option ? { id: option.id, text: option.text } : null);

  // `attempt.answers` is the grading snapshot taken at submit time, so the result never changes later.
  const results = attempt.answers.map((answer) => {
    const question = questionsById.get(answer.question_id);
    return {
      question_id: answer.question_id,
      position: question?.position ?? null,
      text: question?.text ?? null,
      selected_option: optionView(optionsById.get(answer.option_id)),
      correct_option: optionView(correctByQuestion.get(answer.question_id)),
      is_correct: answer.is_correct,
    };
  });

  return {
    id: attempt.id,
    quiz: { id: attempt.quiz_id, title: attempt.quiz_title },
    score: attempt.score,
    total: attempt.total,
    percentage: Math.round((attempt.score / attempt.total) * 100),
    perfect: attempt.score === attempt.total,
    xp_awarded: attempt.xp_awarded,
    submitted_at: attempt.submitted_at,
    results,
  };
}
