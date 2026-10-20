import { describe, expect, it } from 'vitest';
import { PERFECT_SCORE_BONUS, scoreAnswers, validateAnswers } from '../src/services/scoring.service.js';

// Three questions; the correct option for question N is `qN-right`.
const questions = [1, 2, 3].map((n) => ({
  id: `q${n}`,
  position: n,
  options: [
    { id: `q${n}-right`, is_correct: true },
    { id: `q${n}-wrong`, is_correct: false },
  ],
}));

const answer = (n, choice) => ({ question_id: `q${n}`, option_id: `q${n}-${choice}` });

describe('scoreAnswers', () => {
  it('awards xp per correct answer plus the perfect-score bonus when all are correct', () => {
    const result = scoreAnswers({ questions, answers: [answer(1, 'right'), answer(2, 'right'), answer(3, 'right')], xpPerCorrect: 10 });
    expect(result).toMatchObject({ score: 3, total: 3, perfect: true, xpEarned: 3 * 10 + PERFECT_SCORE_BONUS });
    expect(PERFECT_SCORE_BONUS).toBe(20);
  });

  it('awards zero xp when none are correct', () => {
    const result = scoreAnswers({ questions, answers: [answer(1, 'wrong'), answer(2, 'wrong'), answer(3, 'wrong')], xpPerCorrect: 10 });
    expect(result).toMatchObject({ score: 0, total: 3, perfect: false, xpEarned: 0 });
  });

  it('gives no bonus for a partial score', () => {
    const result = scoreAnswers({ questions, answers: [answer(1, 'right'), answer(2, 'wrong'), answer(3, 'right')], xpPerCorrect: 10 });
    expect(result).toMatchObject({ score: 2, perfect: false, xpEarned: 20 });
  });

  it('uses the quiz xp_per_correct value', () => {
    const result = scoreAnswers({ questions, answers: [answer(1, 'right'), answer(2, 'wrong'), answer(3, 'wrong')], xpPerCorrect: 25 });
    expect(result.xpEarned).toBe(25);
  });

  it('returns per-question results in question order regardless of answer order', () => {
    const result = scoreAnswers({ questions, answers: [answer(3, 'wrong'), answer(1, 'right'), answer(2, 'right')], xpPerCorrect: 10 });
    expect(result.results).toEqual([
      { question_id: 'q1', option_id: 'q1-right', is_correct: true },
      { question_id: 'q2', option_id: 'q2-right', is_correct: true },
      { question_id: 'q3', option_id: 'q3-wrong', is_correct: false },
    ]);
  });
});

describe('validateAnswers', () => {
  it('accepts exactly one valid answer per question', () => {
    expect(validateAnswers(questions, [answer(1, 'right'), answer(2, 'wrong'), answer(3, 'right')])).toEqual([]);
  });

  it('reports unanswered questions', () => {
    expect(validateAnswers(questions, [answer(1, 'right'), answer(2, 'right')])).toEqual([
      { field: 'answers', message: 'Question 3 (q3) is not answered.' },
    ]);
  });

  it('reports a question answered twice', () => {
    const details = validateAnswers(questions, [answer(1, 'right'), answer(1, 'wrong'), answer(2, 'right'), answer(3, 'right')]);
    expect(details).toEqual([{ field: 'answers[1].question_id', message: 'Question is answered more than once.' }]);
  });

  it('reports an option that belongs to a different question', () => {
    const details = validateAnswers(questions, [{ question_id: 'q1', option_id: 'q2-right' }, answer(2, 'right'), answer(3, 'right')]);
    expect(details).toEqual([{ field: 'answers[0].option_id', message: 'Option does not belong to this question.' }]);
  });

  it('reports unknown question and option ids', () => {
    const details = validateAnswers(questions, [
      answer(1, 'right'),
      answer(2, 'right'),
      { question_id: 'q3', option_id: 'nope' },
      { question_id: 'q99', option_id: 'q99-right' },
    ]);
    expect(details).toEqual([
      { field: 'answers[2].option_id', message: 'Option does not belong to this question.' },
      { field: 'answers[3].question_id', message: 'Question does not belong to this quiz.' },
    ]);
  });
});
