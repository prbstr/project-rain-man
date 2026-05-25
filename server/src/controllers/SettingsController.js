import { userSettingsRepository } from '../repositories/UserSettingsRepository.js';

export async function getSettings(req, res, next) {
  try {
    const settings = await userSettingsRepository.findByUserId(req.user.sub);
    if (!settings) return res.status(404).json({ error: 'Settings not found' });
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

export async function updateSettings(req, res, next) {
  try {
    const settings = await userSettingsRepository.update(req.user.sub, req.body);
    res.json(settings);
  } catch (err) {
    next(err);
  }
}
