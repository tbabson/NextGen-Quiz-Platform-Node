import AppError from '../../utils/AppError.js';
import { pingDatabase } from './health.service.js';

/** Landing response for `/` and `/api`, so a visitor to the bare URL sees what this is, not a 404. */
export function info(_req, res) {
  res.json({
    name: 'PUNCH NextGen Quiz & Rewards API',
    status: 'ok',
    health: '/api/health',
    endpoints: '/api/auth, /api/quizzes, /api/attempts, /api/me, /api/leaderboard',
    docs: 'See docs/openapi.yaml in the repository.',
  });
}

export async function health(_req, res) {
  const databaseUp = await pingDatabase();
  if (!databaseUp) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Database is unreachable.', [{ field: 'database', message: 'down' }]);
  }

  res.set('Cache-Control', 'no-store').json({
    status: 'ok',
    database: 'up',
    uptime_seconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
