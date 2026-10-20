import { Router } from 'express';
import requireAuth from '../../middleware/auth.js';
import asyncHandler from '../../utils/asyncHandler.js';
import * as controller from './dashboard.controller.js';

/** Mounted at /api/me. */
export default function dashboardRoutes() {
  const router = Router();
  router.get('/dashboard', requireAuth, asyncHandler(controller.get));
  return router;
}
