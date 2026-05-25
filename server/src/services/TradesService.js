import { tradeRepository } from '../repositories/TradeRepository.js';

export class TradesService {
  async getTradeHistory(userId, limit = 100) {
    return tradeRepository.findAllForUser(userId, limit);
  }

  async getOpenTrades(userId) {
    return tradeRepository.findOpenForUser(userId);
  }

  async createTrade(userId, data) {
    return tradeRepository.create({
      userId,
      ...data,
    });
  }

  async updateTrade(userId, tradeId, data) {
    // Verify ownership
    const trade = await tradeRepository.findByIdForUser(tradeId, userId);
    if (!trade) {
      throw new Error('Trade not found');
    }

    return tradeRepository.update(tradeId, data);
  }

  async closeTrade(userId, tradeId, closePrice, pnl) {
    // Verify ownership
    const trade = await tradeRepository.findByIdForUser(tradeId, userId);
    if (!trade) {
      throw new Error('Trade not found');
    }

    return tradeRepository.close(tradeId, closePrice, new Date(), pnl);
  }
}

export const tradesService = new TradesService();
