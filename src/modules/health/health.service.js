import db from '../../db/knex.js';

const DB_PING_TIMEOUT_MS = 2000;

/** Resolves true if the database answers `SELECT 1` within the timeout. */
export async function pingDatabase() {
  try {
    await db.raw('SELECT 1').timeout(DB_PING_TIMEOUT_MS, { cancel: true });
    return true;
  } catch {
    return false;
  }
}
