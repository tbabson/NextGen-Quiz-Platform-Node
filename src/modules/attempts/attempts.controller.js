import * as attemptsService from './attempts.service.js';

export async function list(req, res) {
  const attempts = await attemptsService.listAttempts(req.user.id, req.valid.query);
  res.json({ attempts });
}

export async function get(req, res) {
  res.json(await attemptsService.getAttemptForUser(req.valid.params.id, req.user.id));
}
