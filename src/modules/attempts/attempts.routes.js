import { Router } from 'express';
import requireAuth from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import asyncHandler from '../../utils/asyncHandler.js';
import * as controller from './attempts.controller.js';
import { attemptParamsSchema, listAttemptsQuerySchema } from './attempts.schema.js';

export default function attemptsRoutes() {
  const router = Router();
  router.use(requireAuth);

  router.get('/', validate({ query: listAttemptsQuerySchema }), asyncHandler(controller.list));
  router.get('/:id', validate({ params: attemptParamsSchema }), asyncHandler(controller.get));

  return router;
}
