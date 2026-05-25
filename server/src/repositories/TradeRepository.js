import { prisma } from '../db/client.js';

export class TradeRepository {
  async findById(id) {
    return prisma.trade.findUnique({
      where: { id },
    });
  }

  async findByIdForUser(id, userId) {
    return prisma.trade.findFirst({
      where: { id, userId },
    });
  }

  async findAllForUser(userId, limit = 100) {
    return prisma.trade.findMany({
      where: { userId },
      orderBy: { openedAt: 'desc' },
      take: limit,
    });
  }

  async findOpenForUser(userId) {
    return prisma.trade.findMany({
      where: {
        userId,
        closedAt: null,
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  async create(data) {
    return prisma.trade.create({
      data,
    });
  }

  async update(id, data) {
    return prisma.trade.update({
      where: { id },
      data,
    });
  }

  async close(id, closePrice, closedAt, pnl) {
    return prisma.trade.update({
      where: { id },
      data: {
        closedAt,
        closePrice,
        pnl,
      },
    });
  }
}

export const tradeRepository = new TradeRepository();
