/**
 * PolymarketFeed — Sentiment Overlay for Dashboard
 * 
 * Pulls probability data from Polymarket (Gamma + CLOB APIs) as macro sentiment indicators.
 * Used to contextualize trading signals with market sentiment.
 * 
 * No auth required — all endpoints are public.
 */

// Keywords used to dynamically discover relevant markets from Gamma API
const WATCHLIST_KEYWORDS = [
  'bitcoin', 'ethereum', 'crypto', 'fed', 'federal reserve',
  'inflation', 'nasdaq', 'recession', 'trump', 'tariff', 'rate cut', 'oil', 'gold'
];

// Max markets to show on the watchlist
const WATCHLIST_LIMIT = 8;

/**
 * In-memory cache with TTL
 * Key: string (market ID)
 * Value: { data, expiresAt }
 */
class CacheWithTTL {
  constructor(ttlMs = 5 * 60 * 1000) {
    this.store = new Map();
    this.ttlMs = ttlMs;
  }

  set(key, data) {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.data;
  }

  clear() {
    this.store.clear();
  }

  stats() {
    return {
      entries: this.store.size,
      ttlMs: this.ttlMs,
    };
  }
}

/**
 * PolymarketFeed — Market data and sentiment
 */
class PolymarketFeed {
  constructor() {
    this.cache = new CacheWithTTL(5 * 60 * 1000); // 5-minute TTL
    this.baseUrlGamma = 'https://gamma-api.polymarket.com';
    this.baseUrlClob = 'https://clob.polymarket.com';
  }

  /**
   * Search Polymarket markets by keyword
   * Hits Gamma API: https://gamma-api.polymarket.com/markets
   * 
   * @param {String} keywords — Search query (e.g., "bitcoin", "fed rate")
   * @returns {Array} Markets: [{ id, question, probability, volume, endDate }, ...]
   * @throws {Error} If fetch fails
   */
  async searchMarkets(keywords) {
    if (!keywords || keywords.trim().length === 0) {
      throw new Error('searchMarkets: keywords required');
    }

    try {
      console.log(`[Polymarket] Searching for: ${keywords}`);

      const url = `${this.baseUrlGamma}/markets?keywords=${encodeURIComponent(keywords)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      });

      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const markets = Array.isArray(data) ? data : data.markets || [];

      // Normalize response
      const normalized = markets.map((m) => ({
        id: m.id || m.conditionId,
        question: m.question || m.title || 'Unknown',
        probability: m.probability ?? null,
        volume: m.volume ?? 0,
        endDate: m.endDate || m.maturationTime,
      }));

      console.log(`[Polymarket] Found ${normalized.length} markets for: ${keywords}`);

      return normalized;
    } catch (err) {
      console.error('[Polymarket.searchMarkets] Error:', err.message);
      throw err;
    }
  }

  /**
   * Get probability for a specific market
   * Hits CLOB API: https://clob.polymarket.com/markets/{conditionId}
   * Returns YES token probability (0–1)
   * 
   * @param {String} conditionId — Market condition ID
   * @returns {Number} Probability (0–1 float)
   * @throws {Error} If fetch fails
   */
  async getMarketProbability(conditionId) {
    if (!conditionId) {
      throw new Error('getMarketProbability: conditionId required');
    }

    // Check cache first
    const cached = this.cache.get(conditionId);
    if (cached !== null) {
      console.log(`[Polymarket] Cache hit: ${conditionId}`);
      return cached;
    }

    try {
      const url = `${this.baseUrlClob}/markets/${conditionId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000,
      });

      if (!response.ok) {
        throw new Error(`CLOB API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      // CLOB API returns tokens array — find the YES token price
      const yesToken = data.tokens?.find(t => t.outcome === 'Yes');
      const probability = parseFloat(yesToken?.price ?? data.probability ?? data.yesPrice ?? 0);

      // Validate range
      if (probability < 0 || probability > 1) {
        throw new Error(`Invalid probability: ${probability}`);
      }

      // Cache the result
      this.cache.set(conditionId, probability);

      console.log(`[Polymarket] ${conditionId}: ${(probability * 100).toFixed(1)}%`);

      return probability;
    } catch (err) {
      console.error(`[Polymarket.getMarketProbability] Error (${conditionId}):`, err.message);
      throw err;
    }
  }

  /**
   * Get curated watchlist with probabilities
   * Fetches all watchlist markets in parallel, caches result (5 min TTL).
   * Degrades gracefully: if one market fails, others still return.
   * 
   * @returns {Array} Watchlist: [{ label, probability, lastUpdate }, ...]
   */
  async getWatchlist() {
    const cacheKey = 'watchlist';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    console.log('[Polymarket] Building dynamic watchlist...');

    try {
      // Fetch all active markets and filter for finance/macro relevance
      const res = await fetch(
        'https://gamma-api.polymarket.com/markets?limit=500&active=true&closed=false'
      );
      if (!res.ok) throw new Error(`Gamma API error: ${res.status} ${res.statusText}`);
      const markets = await res.json();

      const pattern = new RegExp(WATCHLIST_KEYWORDS.join('|'), 'i');
      const relevant = markets
        .filter(m => pattern.test(m.question || ''))
        .slice(0, WATCHLIST_LIMIT);

      console.log(`[Polymarket] Found ${relevant.length} relevant markets`);

      // Fetch probabilities in parallel, degrade gracefully
      const results = await Promise.all(
        relevant.map(async (m) => {
          try {
            const probability = await this.getMarketProbability(m.conditionId);
            return {
              label: m.question?.slice(0, 80),
              probability,
              conditionId: m.conditionId,
              lastUpdate: new Date().toISOString(),
            };
          } catch (err) {
            return {
              label: m.question?.slice(0, 80),
              probability: null,
              conditionId: m.conditionId,
              error: err.message,
              lastUpdate: new Date().toISOString(),
            };
          }
        })
      );

      const loaded = results.filter(r => r.probability !== null).length;
      console.log(`[Polymarket] Watchlist: ${loaded}/${results.length} markets loaded`);

      this.cache.set(cacheKey, results);
      return results;
    } catch (err) {
      console.error('[Polymarket.getWatchlist] Error:', err.message);
      throw err;
    }
  }

  /**
   * Clear cache manually
   */
  clearCache() {
    this.cache.clear();
    console.log('[Polymarket] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.stats();
  }

  /**
   * Update watchlist configuration
   * Useful for runtime changes without redeployment
   */
  updateWatchlist(newConfig) {
    if (!Array.isArray(newConfig)) {
      throw new Error('updateWatchlist: newConfig must be an array');
    }

    // Validate structure
    for (const item of newConfig) {
      if (!item.conditionId || !item.label) {
        throw new Error('updateWatchlist: each item must have conditionId and label');
      }
    }

    WATCHLIST_CONFIG.length = 0; // Clear array
    WATCHLIST_CONFIG.push(...newConfig);
    this.clearCache(); // Invalidate cache

    console.log(`[Polymarket] Watchlist updated: ${WATCHLIST_CONFIG.length} markets`);
  }
}

/**
 * Singleton instance for module-level use
 */
export const polymarketFeed = new PolymarketFeed();

export default PolymarketFeed;
