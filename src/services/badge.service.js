/**
 * Badges are data, not code: each row in `badges` carries a JSON rule, and this service decides whether
 * a user's stats satisfy it. New badges of an existing rule type need only a new row.
 */

/** Pure: does `stats` ({ xp, quizzesCompleted, hasPerfectScore }) satisfy `rule`? */
export function isRuleSatisfied(rule, stats) {
  switch (rule?.type) {
    case 'quizzes_completed_at_least':
      return stats.quizzesCompleted >= rule.value;
    case 'perfect_score':
      return stats.hasPerfectScore;
    case 'xp_at_least':
      return stats.xp >= rule.value;
    default:
      // Unknown rule types never award, so a bad row cannot hand out badges.
      return false;
  }
}

/**
 * Awards every badge the user now qualifies for and returns the newly awarded badge codes.
 * Must run inside the submit transaction (`trx`) after the attempt and XP are written, so the stats
 * include this attempt and a rollback also undoes the badges. ON CONFLICT DO NOTHING means a badge
 * already held is never awarded twice.
 */
export async function evaluateBadges(trx, { userId, attemptId }) {
  const [stats, badges] = await Promise.all([loadStats(trx, userId), trx('badges').select('id', 'code', 'rule')]);

  const earned = badges.filter((badge) => isRuleSatisfied(badge.rule, stats));
  if (earned.length === 0) return [];

  const inserted = await trx('user_badges')
    .insert(earned.map((badge) => ({ user_id: userId, badge_id: badge.id, attempt_id: attemptId })))
    .onConflict(['user_id', 'badge_id'])
    .ignore()
    .returning('badge_id');

  const insertedIds = new Set(inserted.map((row) => row.badge_id));
  return earned.filter((badge) => insertedIds.has(badge.id)).map((badge) => badge.code);
}

async function loadStats(trx, userId) {
  const row = await trx('users as u')
    .leftJoin('attempts as a', 'a.user_id', 'u.id')
    .where('u.id', userId)
    .groupBy('u.id')
    .first(
      'u.xp',
      trx.raw('count(a.id)::int AS quizzes_completed'),
      trx.raw('coalesce(bool_or(a.score = a.total), false) AS has_perfect_score'),
    );

  return { xp: row.xp, quizzesCompleted: row.quizzes_completed, hasPerfectScore: row.has_perfect_score };
}
