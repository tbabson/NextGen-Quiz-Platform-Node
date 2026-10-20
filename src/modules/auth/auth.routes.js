import { Router } from 'express';
import requireTrustedOrigin from '../../middleware/trustedOrigin.js';
import validate from '../../middleware/validate.js';
import asyncHandler from '../../utils/asyncHandler.js';
import * as controller from './auth.controller.js';
import { loginSchema, registerSchema } from './auth.schema.js';

/**
 * @param {{ credentialsLimiter: import('express').RequestHandler, sessionLimiter: import('express').RequestHandler }} limiters
 */
export default function authRoutes({ credentialsLimiter, sessionLimiter }) {
  const router = Router();
  // Every auth route reads or sets the refresh cookie, so all of them get the CSRF origin check.
  router.use(requireTrustedOrigin);

  router.post('/register', credentialsLimiter, validate({ body: registerSchema }), asyncHandler(controller.register));
  router.post('/login', credentialsLimiter, validate({ body: loginSchema }), asyncHandler(controller.login));
  router.post('/refresh', sessionLimiter, asyncHandler(controller.refresh));
  router.post('/logout', sessionLimiter, asyncHandler(controller.logout));

  return router;
}
