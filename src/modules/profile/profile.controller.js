import * as profileService from './profile.service.js';

export async function get(req, res) {
  res.set('Cache-Control', 'no-store').json(await profileService.getProfile(req.user.id));
}

export async function update(req, res) {
  res.json(await profileService.updateProfile(req.user.id, req.valid.body));
}
