import { Router } from 'express';
import asyncHandler from '../../utils/asyncHandler.js';
import * as controller from './health.controller.js';

export default function healthRoutes() {
  const router = Router();
  router.get('/', asyncHandler(controller.health));
  return router;
}
