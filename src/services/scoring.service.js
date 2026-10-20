/**
 * Pure grading logic: no I/O, so it is trivially unit-testable and can be called inside a transaction.
 *
 * `questions` is the answer key: [{ id, position, options: [{ id, is_correct }] }].
 * `answers` is what the client sent: [{ question_id, option_id }].
 */

export const PERFECT_SCORE_BONUS = 20;

/**
 * Returns a list of field errors (empty when valid). Rules: every answer refers to a question in this
 * quiz, each question is answered at most once, each option belongs to its question, and every
 * question is answered.
 */
export function validateAnswers(questions, answers) {
  const optionsByQuestion = new Map(questions.map((q) => [q.id, new Set(q.options.map((o) => o.id))]));
  const answered = new Set();
  const details = [];

  answers.forEach((answer, index) => {
    const optionIds = optionsByQuestion.get(answer.question_id);

    if (!optionIds) {
      details.push({ field: `answers[${index}].question_id`, message: 'Question does not belong to this quiz.' });
    } else if (answered.has(answer.question_id)) {
      details.push({ field: `answers[${index}].question_id`, message: 'Question is answered more than once.' });
    } else {
      answered.add(answer.question_id);
      if (!optionIds.has(answer.option_id)) {
        details.push({ field: `answers[${index}].option_id`, message: 'Option does not belong to this question.' });
      }
    }
  });

  for (const question of questions) {
    if (!answered.has(question.id)) {
      details.push({ field: 'answers', message: `Question ${question.position} (${question.id}) is not answered.` });
    }
  }

  return details;
}

/**
 * Grades already-validated answers. XP = correct × xpPerCorrect, plus PERFECT_SCORE_BONUS for 100%.
 * `results` follows question order and is what gets stored in attempts.answers.
 */
export function scoreAnswers({ questions, answers, xpPerCorrect }) {
  const chosen = new Map(answers.map((a) => [a.question_id, a.option_id]));

  const results = questions.map((question) => {
    const optionId = chosen.get(question.id);
    const correctOption = question.options.find((o) => o.is_correct);
    return { question_id: question.id, option_id: optionId, is_correct: optionId === correctOption?.id };
  });

  const total = questions.length;
  const score = results.filter((r) => r.is_correct).length;
  const perfect = total > 0 && score === total;
  const xpEarned = score * xpPerCorrect + (perfect ? PERFECT_SCORE_BONUS : 0);

  return { score, total, perfect, xpEarned, results };
}
