import { z } from 'zod';

export const quizParamsSchema = z.object({ id: z.string().uuid() });

export const submitQuizSchema = z
  .object({
    answers: z
      .array(
        z
          .object({
            question_id: z.string().uuid('Must be a valid question id.'),
            option_id: z.string().uuid('Must be a valid option id.'),
          })
          .strict(),
      )
      .min(1, 'At least one answer is required.')
      .max(200, 'Too many answers.'),
  })
  // Strict: the client sends option ids only. Anything else (e.g. a "score") is rejected, not ignored.
  .strict();
