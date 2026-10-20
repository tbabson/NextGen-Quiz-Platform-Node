import * as leaderboardService from './leaderboard.service.js';

export async function list(req, res) {
  const [entries, me] = await Promise.all([
    leaderboardService.getLeaderboard(req.valid.query),
    leaderboardService.getUserRank(req.user.id),
  ]);

  res.json({
    leaderboard: entries.map((entry) => ({ ...entry, is_current_user: entry.user_id === req.user.id })),
    // The caller's own position, even when they are outside the requested top N.
    current_user: me ? { rank: me.rank, total_players: me.totalPlayers } : null,
  });
}
