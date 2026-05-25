import { tradesService } from '../services/TradesService.js';

export class TradesController {
  async getTradeHistory(req, res, next) {
    try {
      const { limit } = req.query;
      const trades = await tradesService.getTradeHistory(
        req.user.sub,
        limit ? parseInt(limit, 10) : 100
      );
      res.json(trades);
    } catch (err) {
      next(err);
    }
  }

  async getOpenTrades(req, res, next) {
    try {
      const trades = await tradesService.getOpenTrades(req.user.sub);
      res.json(trades);
    } catch (err) {
      next(err);
    }
  }

  async createTrade(req, res, next) {
    try {
      const trade = await tradesService.createTrade(req.user.sub, req.body);
      res.status(201).json(trade);
    } catch (err) {
      next(err);
    }
  }

  async updateTrade(req, res, next) {
    try {
      const trade = await tradesService.updateTrade(req.user.sub, req.params.id, req.body);
      res.json(trade);
    } catch (err) {
      if (err.message === 'Trade not found') {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  }

  async closeTrade(req, res, next) {
    try {
      const { closePrice, pnl } = req.body;
      const trade = await tradesService.closeTrade(req.user.sub, req.params.id, closePrice, pnl);
      res.json(trade);
    } catch (err) {
      if (err.message === 'Trade not found') {
        return res.status(404).json({ error: err.message });
      }
      next(err);
    }
  }
}

export const tradesController = new TradesController();
