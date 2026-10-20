import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Must be a valid email address.').max(254);

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name must be at most 100 characters.'),
  email,
  // bcrypt only uses the first 72 bytes of a password; reject longer input rather than silently truncating it.
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes.'),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required.').max(1024),
});
