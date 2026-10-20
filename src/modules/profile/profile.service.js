import db from '../../db/knex.js';
import AppError from '../../utils/AppError.js';

const PROFILE_COLUMNS = ['id', 'name', 'email', 'xp', 'created_at'];

// A valid token for a user that no longer exists.
const userGone = () => AppError.unauthorized('User no longer exists.');

export async function getProfile(userId) {
  const user = await db('users').where({ id: userId }).first(PROFILE_COLUMNS);
  if (!user) throw userGone();
  return user;
}

export async function updateProfile(userId, { name }) {
  const [user] = await db('users').where({ id: userId }).update({ name }).returning(PROFILE_COLUMNS);
  if (!user) throw userGone();
  return user;
}
