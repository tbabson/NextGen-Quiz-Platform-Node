import { submitQuiz } from '../../modules/quizzes/quizzes.service.js';
import { hashPassword } from '../../utils/password.js';
import * as data from '../seed-data.js';

/**
 * Idempotent seed: safe to re-run against a live database. Badges are upserted by code,
 * quizzes are created only if their slug is new, and users only if their email is new.
 */
export async function seed(knex) {
  await knex.transaction(async (trx) => {
    await seedBadges(trx);
    for (const quiz of data.quizzes) {
      await seedQuiz(trx, quiz);
    }
    await seedUsers(trx);
  });

  // After commit: demo attempts go through the real submit service, so seeded XP and badges
  // follow exactly the same rules as live play. Fixed idempotency keys make re-runs replay, not duplicate.
  for (const attempt of data.demoAttempts) {
    await seedAttempt(knex, attempt);
  }
}

async function seedAttempt(knex, { email, quiz: slug, correct }) {
  const user = await knex('users').where({ email }).first('id');
  const quiz = await knex('quizzes').where({ slug }).first('id');

  const options = await knex('options as o')
    .join('questions as qs', 'qs.id', 'o.question_id')
    .where('qs.quiz_id', quiz.id)
    .orderBy([{ column: 'qs.position' }, { column: 'o.position' }])
    .select('o.id', 'o.question_id', 'o.is_correct', 'qs.position');

  // Right answers for the first `correct` questions, a wrong one for the rest.
  const answers = [...new Set(options.map((o) => o.position))].map((position) => {
    const pick = options.find((o) => o.position === position && o.is_correct === position <= correct);
    return { question_id: pick.question_id, option_id: pick.id };
  });

  try {
    await submitQuiz({ userId: user.id, quizId: quiz.id, answers, idempotencyKey: `seed:${email}:${slug}` }, { conn: knex });
  } catch (error) {
    // Already completed under another key (e.g. the account played it live): leave it alone.
    if (error.code !== 'QUIZ_ALREADY_COMPLETED') throw error;
  }
}

async function seedBadges(trx) {
  await trx('badges')
    .insert(data.badges)
    .onConflict('code')
    .merge(['name', 'description', 'rule']);
}

async function seedQuiz(trx, quiz) {
  const existing = await trx('quizzes').where({ slug: quiz.slug }).first('id');
  if (existing) return;

  const [{ id: quizId }] = await trx('quizzes')
    .insert({
      slug: quiz.slug,
      title: quiz.title,
      description: quiz.description,
      xp_per_correct: quiz.xp_per_correct,
    })
    .returning('id');

  for (const [questionIndex, question] of quiz.questions.entries()) {
    const [{ id: questionId }] = await trx('questions')
      .insert({ quiz_id: quizId, text: question.text, position: questionIndex + 1 })
      .returning('id');

    await trx('options').insert(
      question.options.map((text, optionIndex) => ({
        question_id: questionId,
        text,
        is_correct: optionIndex === question.correct,
        position: optionIndex + 1,
      })),
    );
  }
}

async function seedUsers(trx) {
  const passwordHash = await hashPassword(data.DEMO_PASSWORD);
  await trx('users')
    .insert(data.users.map((user) => ({ ...user, password_hash: passwordHash })))
    .onConflict('email')
    .ignore();
}
