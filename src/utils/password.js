import bcrypt from 'bcryptjs';
import env from '../config/env.js';

export function hashPassword(plain) {
  return bcrypt.hash(plain, env.BCRYPT_COST);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}
