import { Router } from 'express';
import { prisma } from '../db/client.js';
import { encrypt, decrypt } from '../auth/crypto.js';
import { createBybitClient, checkConnection, getCircuitBreakerStatus } from '../bybit/client.js';
import { 
  canTrade, 
  calculateDailyDrawdown, 
  enforceDailyDrawdown, 
  emergencyFlattenAll, 
  resetHalt, 
  getRiskStatus 
} from '../risk/guardian.js';
import { polymarketFeed } from '../polymarket/feed.js';
import { z } from 'zod';

export const apiRouter = Router();

// GET /api/me
apiRouter.get('/me', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true, email: true, username: true, role: true, createdAt: true, settings: true }
  });
  res.json(user);
});

// --- API Keys ---
const apiKeySchema = z.object({
  exchange: z.literal('bybit'),
  label: z.string().min(1).max(50),
  apiKey: z.string().min(10),
  apiSecret: z.string().min(10),
  isTestnet: z.boolean().default(true),
});

// POST /api/keys — save encrypted API keys
apiRouter.post('/keys', async (req, res) => {
  const parsed = apiKeySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { exchange, label, apiKey, apiSecret, isTestnet } = parsed.data;

  const record = await prisma.userApiKey.upsert({
    where: { userId_exchange_label: { userId: req.user.sub, exchange, label } },
    create: {
      userId: req.user.sub,
      exchange,
      label,
      apiKeyEnc: encrypt(apiKey),
      apiSecretEnc: encrypt(apiSecret),
      isTestnet,
    },
    update: {
      apiKeyEnc: encrypt(apiKey),
      apiSecretEnc: encrypt(apiSecret),
      isTestnet,
    }
  });

  res.json({ id: record.id, exchange, label, isTestnet });
});

// GET /api/keys — list keys (no plaintext)
apiRouter.get('/keys', async (req, res) => {
  const keys = await prisma.userApiKey.findMany({
    where: { userId: req.user.sub },
    select: { id: true, exchange: true, label: true, isTestnet: true, isActive: true, createdAt: true }
  });
  res.json(keys);
});

// DELETE /api/keys/:id
apiRouter.delete('/keys/:id', async (req, res) => {
  await prisma.userApiKey.deleteMany({
    where: { id: req.params.id, userId: req.user.sub }
  });
  res.json({ message: 'Key deleted' });
});

// --- Trades ---
// GET /api/trades
apiRouter.get('/trades', async (req, res) => {
  const trades = await prisma.trade.findMany({
    where: { userId: req.user.sub },
    orderBy: { openedAt: 'desc' },
    take: 100,
  });
  res.json(trades);
});

// --- Settings ---
// PATCH /api/settings
apiRouter.patch('/settings', async (req, res) => {
  const settings = await prisma.userSettings.update({
    where: { userId: req.user.sub },
    data: req.body,
  });
  res.json(settings);
});

// --- Bybit Integration ---
// GET /api/bybit/status — health check with active API key
apiRouter.get('/bybit/status', async (req, res) => {
  try {
    // Get the active (or most recent) API key
    const apiKey = await prisma.userApiKey.findFirst({
      where: {
        userId: req.user.sub,
        exchange: 'bybit',
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!apiKey) {
      return res.status(400).json({ error: 'No active Bybit API key configured' });
    }

    // Create client and check connection
    const client = createBybitClient(apiKey.apiKeyEnc, apiKey.apiSecretEnc, apiKey.isTestnet);
    const healthCheck = await checkConnection(client);
    const cbStatus = getCircuitBreakerStatus(client);

    res.json({
      status: healthCheck,
      circuitBreaker: cbStatus,
      key: { label: apiKey.label, isTestnet: apiKey.isTestnet },
    });
  } catch (err) {
    console.error('[Bybit Status] Error:', err.message);
    res.status(500).json({ error: err.message, type: err.type || 'UnknownError' });
  }
});

// --- Risk Management ---
// GET /api/risk/status — halt status, drawdown, position count
apiRouter.get('/risk/status', async (req, res) => {
  try {
    const status = await getRiskStatus(req.user.sub);
    res.json(status);
  } catch (err) {
    console.error('[Risk Status] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/risk/kill — emergency flatten all positions
apiRouter.post('/risk/kill', async (req, res) => {
  try {
    console.log(`[Risk] Kill switch triggered by user ${req.user.sub}`);
    const result = await emergencyFlattenAll(req.user.sub);
    res.json({
      success: result.success,
      closed: result.closed,
      errors: result.errors,
    });
  } catch (err) {
    console.error('[Risk Kill] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/risk/reset — clear halt (only after 24h window)
apiRouter.post('/risk/reset', async (req, res) => {
  try {
    const result = await resetHalt(req.user.sub);
    if (!result.reset) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('[Risk Reset] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Polymarket Sentiment Overlay ---
// GET /api/polymarket/watchlist — curated markets (cached, < 500ms)
apiRouter.get('/api/polymarket/watchlist', async (req, res) => {
  try {
    const startMs = Date.now();
    const watchlist = await polymarketFeed.getWatchlist();
    const elapsedMs = Date.now() - startMs;

    res.json({
      watchlist,
      loadTimeMs: elapsedMs,
      cacheStats: polymarketFeed.getCacheStats(),
    });
  } catch (err) {
    console.error('[Polymarket Watchlist] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/polymarket/search — live search (not cached)
apiRouter.get('/api/polymarket/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" required' });
    }

    const markets = await polymarketFeed.searchMarkets(q);

    res.json({
      query: q,
      count: markets.length,
      markets,
    });
  } catch (err) {
    console.error('[Polymarket Search] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
