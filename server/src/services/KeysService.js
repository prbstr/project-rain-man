import { userApiKeyRepository } from '../repositories/UserApiKeyRepository.js';
import { encrypt } from '../auth/crypto.js';

export class KeysService {
  async listKeys(userId) {
    return userApiKeyRepository.findAllForUser(userId);
  }

  async createOrUpdateKey(userId, exchange, label, apiKey, apiSecret, isTestnet) {
    const apiKeyEnc = encrypt(apiKey);
    const apiSecretEnc = encrypt(apiSecret);

    return userApiKeyRepository.upsert(
      userId,
      exchange,
      label,
      apiKeyEnc,
      apiSecretEnc,
      isTestnet
    );
  }

  async deleteKey(userId, keyId) {
    return userApiKeyRepository.delete(keyId, userId);
  }

  async getActiveKey(userId, exchange) {
    return userApiKeyRepository.findActiveForUser(userId, exchange);
  }
}

export const keysService = new KeysService();
