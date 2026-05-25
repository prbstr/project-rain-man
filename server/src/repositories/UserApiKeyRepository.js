import { prisma } from '../db/client.js';

export class UserApiKeyRepository {
  async findById(id) {
    return prisma.userApiKey.findUnique({
      where: { id },
    });
  }

  async findByIdForUser(id, userId) {
    return prisma.userApiKey.findFirst({
      where: { id, userId },
    });
  }

  async findAllForUser(userId) {
    return prisma.userApiKey.findMany({
      where: { userId },
      select: { id: true, exchange: true, label: true, isTestnet: true, isActive: true, createdAt: true }
    });
  }

  async findActiveForUser(userId, exchange) {
    return prisma.userApiKey.findFirst({
      where: {
        userId,
        exchange,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upsert(userId, exchange, label, apiKeyEnc, apiSecretEnc, isTestnet) {
    return prisma.userApiKey.upsert({
      where: { userId_exchange_label: { userId, exchange, label } },
      create: {
        userId,
        exchange,
        label,
        apiKeyEnc,
        apiSecretEnc,
        isTestnet,
      },
      update: {
        apiKeyEnc,
        apiSecretEnc,
        isTestnet,
      },
    });
  }

  async delete(id, userId) {
    return prisma.userApiKey.deleteMany({
      where: { id, userId },
    });
  }
}

export const userApiKeyRepository = new UserApiKeyRepository();
