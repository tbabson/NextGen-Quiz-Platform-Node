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
