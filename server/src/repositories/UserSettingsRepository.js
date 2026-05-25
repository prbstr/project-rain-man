import { prisma } from '../db/client.js';

export class UserSettingsRepository {
  async findByUserId(userId) {
    return prisma.userSettings.findUnique({
      where: { userId },
    });
  }

  async create(userId) {
    return prisma.userSettings.create({
      data: { userId },
    });
  }

  async update(userId, data) {
    return prisma.userSettings.update({
      where: { userId },
      data,
    });
  }
}

export const userSettingsRepository = new UserSettingsRepository();
