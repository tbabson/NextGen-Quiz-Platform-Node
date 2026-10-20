import { Router } from 'express';
import requireAuth from '../../middleware/auth.js';
import requireIdempotencyKey from '../../middleware/idempotencyKey.js';
import validate from '../../middleware/validate.js';
import asyncHandler from '../../utils/asyncHandler.js';
import * as controller from './quizzes.controller.js';
import { quizParamsSchema, submitQuizSchema } from './quizzes.schema.js';

/** @param {{ submitLimiter: import('express').RequestHandler }} limiters */
export default function quizzesRoutes({ submitLimiter }) {
  const router = Router();
  router.use(requireAuth);

  router.get('/', asyncHandler(controller.list));
  router.get('/:id', validate({ params: quizParamsSchema }), asyncHandler(controller.get));
  router.post(
    '/:id/submit',
    submitLimiter,
    requireIdempotencyKey,
    validate({ params: quizParamsSchema, body: submitQuizSchema }),
    asyncHandler(controller.submit),
  );

  return router;
}
