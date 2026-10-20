import { Router } from 'express';
import requireAuth from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import asyncHandler from '../../utils/asyncHandler.js';
import * as controller from './leaderboard.controller.js';
import { leaderboardQuerySchema } from './leaderboard.schema.js';

export default function leaderboardRoutes() {
  const router = Router();
  router.get('/', requireAuth, validate({ query: leaderboardQuerySchema }), asyncHandler(controller.list));
  return router;
}
