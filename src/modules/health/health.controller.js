import AppError from '../../utils/AppError.js';
import { pingDatabase } from './health.service.js';

export async function health(_req, res) {
  const databaseUp = await pingDatabase();
  if (!databaseUp) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Database is unreachable.', [{ database: 'down' }]);
  }

  res.set('Cache-Control', 'no-store').json({
    status: 'ok',
    database: 'up',
    uptime_seconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
