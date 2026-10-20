import db from '../../db/knex.js';
import AppError from '../../utils/AppError.js';
import { getUserRank } from '../leaderboard/leaderboard.service.js';

export async function getDashboard(userId) {
  const [user, completed, badges, rank, totalQuizzes] = await Promise.all([
    db('users').where({ id: userId }).first('id', 'name', 'email', 'xp'),
    db('attempts').where({ user_id: userId }).count('* as n').first(),
    db('user_badges as ub')
      .join('badges as b', 'b.id', 'ub.badge_id')
      .where('ub.user_id', userId)
      .orderBy('ub.awarded_at', 'asc')
      .select('b.code', 'b.name', 'b.description', 'ub.awarded_at'),
    getUserRank(userId),
    db('quizzes').count('* as n').first(),
  ]);

  // A valid token for a user that no longer exists.
  if (!user) throw AppError.unauthorized('User no longer exists.');

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    xp: user.xp,
    quizzes_completed: completed.n,
    total_quizzes: totalQuizzes.n,
    badges,
    rank: rank.rank,
    total_players: rank.totalPlayers,
  };
}
