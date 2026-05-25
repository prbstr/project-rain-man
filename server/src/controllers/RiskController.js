import { getRiskStatus, killSwitch, resetHalt } from '../services/RiskService.js';
import { userApiKeyRepository } from '../repositories/UserApiKeyRepository.js';
import { decrypt } from '../auth/crypto.js';
import { createBybitClient } from '../bybit/client.js';

export async function getStatus(req, res, next) {
  try {
    const status = await getRiskStatus(req.user.sub);
    res.json(status);
  } catch (err) {
    next(err);
  }
}

export async function kill(req, res, next) {
  try {
    const userId = req.user.sub;
    const activeKey = await userApiKeyRepository.findActiveForUser(userId, 'bybit');
    if (!activeKey) {
      return res.status(400).json({ error: 'No active Bybit key found — cannot flatten positions' });
    }
    const client = createBybitClient(
      decrypt(activeKey.apiKeyEnc),
      decrypt(activeKey.apiSecretEnc),
      activeKey.isTestnet
    );
    const result = await killSwitch(userId, client);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function reset(req, res, next) {
  try {
    const result = await resetHalt(req.user.sub);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
