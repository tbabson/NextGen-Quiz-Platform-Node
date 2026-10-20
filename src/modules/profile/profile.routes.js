import { Router } from 'express';
import requireAuth from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import asyncHandler from '../../utils/asyncHandler.js';
import * as controller from './profile.controller.js';
import { updateProfileSchema } from './profile.schema.js';

/** Mounted at /api/me. Password changes live in the auth module because they issue a new session. */
export default function profileRoutes() {
  const router = Router();
  router.get('/', requireAuth, asyncHandler(controller.get));
  router.patch('/', requireAuth, validate({ body: updateProfileSchema }), asyncHandler(controller.update));
  return router;
}
