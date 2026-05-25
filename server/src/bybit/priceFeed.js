import ccxt from 'ccxt';
import { broadcastPrice } from '../ws/server.js';

// Public client — market data only, no keys needed
let publicClient = null;

function getPublicClient() {
  if (!publicClient) {
    publicClient = new ccxt.bybit({
      enableRateLimit: true,
      sandbox: process.env.BYBIT_TESTNET !== 'false',
    });
  }
  return publicClient;
}

// In-memory price cache
const priceCache = {};

// Polling handles per symbol set
let pollHandle = null;

// Symbols to track — tokenized stocks + major crypto
const DEFAULT_SYMBOLS = ['BTC/USDT', 'ETH/USDT'];
// Note: Bybit testnet tokenized stock availability varies; we degrade gracefully

export async function fetchLatestPrices(symbols = DEFAULT_SYMBOLS) {
  const client = getPublicClient();
  const results = {};

  await Promise.allSettled(
    symbols.map(async (symbol) => {
      try {
        const ticker = await client.fetchTicker(symbol);
        results[symbol] = {
          price: ticker.last,
          change24h: ticker.percentage ?? 0,
          high24h: ticker.high,
          low24h: ticker.low,
          volume: ticker.baseVolume,
          ts: Date.now(),
        };
      } catch (err) {
        // Symbol not available on testnet — skip gracefully
        console.warn(`[PriceFeed] ${symbol} unavailable: ${err.message}`);
      }
    })
  );

  return results;
}

export function getLatestPrices() {
  return priceCache;
}

export async function startPriceFeed(symbols = DEFAULT_SYMBOLS, intervalMs = 10000) {
  if (pollHandle) return; // Already running

  console.log(`[PriceFeed] Starting — symbols: ${symbols.join(', ')}, interval: ${intervalMs}ms`);

  // Immediate first fetch
  const initial = await fetchLatestPrices(symbols);
  Object.assign(priceCache, initial);

  // Broadcast initial prices to any connected WS clients
  for (const [symbol, data] of Object.entries(priceCache)) {
    broadcastPrice(null, symbol, data.price, data.change24h);
  }

  // Poll on interval
  pollHandle = setInterval(async () => {
    try {
      const prices = await fetchLatestPrices(symbols);
      Object.assign(priceCache, prices);

      for (const [symbol, data] of Object.entries(prices)) {
        broadcastPrice(null, symbol, data.price, data.change24h);
      }
    } catch (err) {
      console.error('[PriceFeed] Poll error:', err.message);
    }
  }, intervalMs);

  console.log('[PriceFeed] Running ✅');
}

export function stopPriceFeed() {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
    console.log('[PriceFeed] Stopped');
  }
}
