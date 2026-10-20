import { getAttemptForUser } from '../attempts/attempts.service.js';
import * as quizzesService from './quizzes.service.js';

export async function list(req, res) {
  const quizzes = await quizzesService.listQuizzes(req.user.id);
  res.json({ quizzes });
}

export async function get(req, res) {
  res.json(await quizzesService.getQuizForPlay(req.valid.params.id, req.user.id));
}

/** 201 for a new attempt; 200 with `Idempotent-Replayed: true` when the same key is retried. */
export async function submit(req, res) {
  const { attemptId, replayed } = await quizzesService.submitQuiz({
    userId: req.user.id,
    quizId: req.valid.params.id,
    answers: req.valid.body.answers,
    idempotencyKey: req.idempotencyKey,
  });

  const result = await getAttemptForUser(attemptId, req.user.id);
  res
    .status(replayed ? 200 : 201)
    .set('Idempotent-Replayed', String(replayed))
    .json(result);
}
