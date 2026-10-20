import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Must be a valid email address.').max(254);

/** Display name rule, shared with the profile module so registration and edits agree. */
export const displayName = z.string().trim().min(1, 'Name is required.').max(100, 'Name must be at most 100 characters.');

// bcrypt only uses the first 72 bytes of a password; reject longer input rather than silently truncating it.
const newPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes.');

export const registerSchema = z.object({
  name: displayName,
  email,
  password: newPassword,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required.').max(1024),
});

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required.').max(1024),
    new_password: newPassword,
  })
  .strict()
  .refine((body) => body.current_password !== body.new_password, {
    path: ['new_password'],
    message: 'New password must be different from the current one.',
  });
