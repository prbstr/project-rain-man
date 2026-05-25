import { Router } from 'express';
import { keysController } from '../controllers/KeysController.js';
import { tradesController } from '../controllers/TradesController.js';
import { userRepository } from '../repositories/UserRepository.js';
import { createBybitClient, checkConnection, getCircuitBreakerStatus } from '../bybit/client.js';
import { keysService } from '../services/KeysService.js';
import * as RiskController from '../controllers/RiskController.js';
import * as PolymarketController from '../controllers/PolymarketController.js';
import * as PricesController from '../controllers/PricesController.js';
import * as SettingsController from '../controllers/SettingsController.js';

export const apiRouter = Router();

// --- User ---
apiRouter.get('/me', async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.user.sub);
    res.json(user);
  } catch (err) { next(err); }
});

// --- Keys ---
apiRouter.post('/keys',        (req, res, next) => keysController.createOrUpdateKey(req, res, next));
apiRouter.get('/keys',         (req, res, next) => keysController.listKeys(req, res, next));
apiRouter.delete('/keys/:id',  (req, res, next) => keysController.deleteKey(req, res, next));

// --- Trades ---
apiRouter.get('/trades', (req, res, next) => tradesController.getTradeHistory(req, res, next));

// --- Settings ---
apiRouter.get('/settings',   SettingsController.getSettings);
apiRouter.patch('/settings', SettingsController.updateSettings);

// --- Bybit ---
apiRouter.get('/bybit/status', async (req, res, next) => {
  try {
    const apiKey = await keysService.getActiveKey(req.user.sub, 'bybit');
    if (!apiKey) return res.status(400).json({ error: 'No active Bybit API key configured' });
    const client = createBybitClient(apiKey.apiKeyEnc, apiKey.apiSecretEnc, apiKey.isTestnet);
    const healthCheck = await checkConnection(client);
    const cbStatus = getCircuitBreakerStatus(client);
    res.json({ status: healthCheck, circuitBreaker: cbStatus, key: { label: apiKey.label, isTestnet: apiKey.isTestnet } });
  } catch (err) { next(err); }
});

// --- Risk ---
apiRouter.get('/risk/status', RiskController.getStatus);
apiRouter.post('/risk/kill',  RiskController.kill);
apiRouter.post('/risk/reset', RiskController.reset);

// --- Polymarket ---
apiRouter.get('/polymarket/watchlist', PolymarketController.watchlist);
apiRouter.get('/polymarket/search',    PolymarketController.searchMarkets);

// --- Prices ---
apiRouter.get('/prices/latest', PricesController.getLatestPrices);
