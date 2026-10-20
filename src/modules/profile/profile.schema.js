import { z } from 'zod';
import { displayName } from '../auth/auth.schema.js';

// Strict: only the display name is editable. Email is the login identity; XP is earned, never set.
export const updateProfileSchema = z.object({ name: displayName }).strict();
