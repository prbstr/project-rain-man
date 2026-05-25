import { prisma } from '../db/client.js';

export class RefreshTokenRepository {
  async create(data) {
    return prisma.refreshToken.create({
      data,
    });
  }

  async findByToken(token) {
    return prisma.refreshToken.findUnique({
      where: { token },
    });
  }

  async deleteByToken(token) {
    return prisma.refreshToken.deleteMany({
      where: { token },
    });
  }

  async deleteByUserId(userId) {
    return prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  async deleteExpired() {
    return prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
