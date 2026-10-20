import * as dashboardService from './dashboard.service.js';

export async function get(req, res) {
  res.set('Cache-Control', 'no-store').json(await dashboardService.getDashboard(req.user.id));
}
