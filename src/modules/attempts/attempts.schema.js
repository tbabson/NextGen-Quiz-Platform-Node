import { z } from 'zod';

export const attemptParamsSchema = z.object({ id: z.string().uuid() });

export const listAttemptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
