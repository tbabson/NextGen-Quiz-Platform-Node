import db from '../../db/knex.js';

/**
 * Ranking: highest XP first; among equal XP, whoever reached it earliest (xp_updated_at) ranks higher.
 * RANK() runs over the whole table before LIMIT, so positions are global, not page-relative.
 */
const RANK_WINDOW = 'RANK() OVER (ORDER BY xp DESC, xp_updated_at ASC)';

export async function getLeaderboard({ limit }) {
  return db('users')
    .select('id as user_id', 'name', 'xp', db.raw(`${RANK_WINDOW}::int AS rank`))
    .orderBy([
      { column: 'xp', order: 'desc' },
      { column: 'xp_updated_at', order: 'asc' },
      { column: 'id', order: 'asc' }, // fully deterministic paging even on exact ties
    ])
    .limit(limit);
}

/** The user's global position under the same ordering as the leaderboard, plus the field size. */
export async function getUserRank(userId) {
  const row = await db
    .with('ranked', (qb) => qb.from('users').select('id', db.raw(`${RANK_WINDOW}::int AS rank`)))
    .from('ranked')
    .where({ id: userId })
    .first('rank', db.raw('(SELECT count(*) FROM users)::int AS total_players'));

  return row ? { rank: row.rank, totalPlayers: row.total_players } : null;
}
