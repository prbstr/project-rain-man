/**
 * Candle Fetcher — Bridge between Bybit and Strategy Engine
 * 
 * Fetches OHLCV data from Bybit, validates it, and feeds it to the strategy engine.
 * Every candle that touches the strategy engine MUST come through fetchAndValidate().
 */

import { validateCandles } from '../strategy/validator.js';
import { executeWithCircuitBreaker } from './client.js';

/**
 * CandleFetcher — Manages OHLCV data lifecycle
 */
export class CandleFetcher {
  constructor() {
    this.pollingIntervals = {}; // Map of symbol → intervalId
  }

  /**
   * Fetch raw OHLCV data from Bybit
   * 
   * @param {Object} client — ccxt Bybit client instance
   * @param {String} symbol — Trading pair (e.g., "TSLA/USDT")
   * @param {String} interval — Candle interval (e.g., "1h", "4h")
   * @param {Number} limit — Number of candles to fetch (default 300)
   * @returns {Array} Normalized candle array: [{ open, high, low, close, volume, timestamp }, ...]
   */
  async fetchCandles(client, symbol, interval, limit = 300) {
    try {
      const ohlcv = await executeWithCircuitBreaker(client, () =>
        client.fetchOHLCV(symbol, interval, undefined, { limit })
      );

        if (!Array.isArray(ohlcv) || ohlcv.length === 0) {
        throw new Error(`No OHLCV data returned for ${symbol}`);
      }

      // Normalize to { open, high, low, close, volume, timestamp }
      const candles = ohlcv.map((c) => ({
        timestamp: c[0],  // Unix timestamp (ms)
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
        volume: c[5],
      }));

      console.log(
        `[CandleFetcher] Fetched ${candles.length} ${interval} candles for ${symbol}`
      );

      return candles;
    } catch (err) {
      console.error(
        `[CandleFetcher.fetchCandles] Error fetching ${symbol} ${interval}:`,
        err.message
      );
      throw err;
    }
  }

  /**
   * Fetch and validate OHLCV data
   * 
   * Combines fetchCandles() + validateCandles(). Throws if validation fails.
   * This is the ONLY way candles should enter the strategy engine.
   * 
   * @param {Object} client — ccxt Bybit client instance
   * @param {String} symbol — Trading pair
   * @param {String} interval — Candle interval
   * @param {Number} limit — Number of candles to fetch (default 300)
   * @returns {Array} Validated candle array
   * @throws {Error} If validation fails (data quality issue)
   */
  async fetchAndValidate(client, symbol, interval, limit = 300) {
    try {
      // Step 1: Fetch raw candles
      const candles = await this.fetchCandles(client, symbol, interval, limit);

      // Step 2: Validate
      const validation = validateCandles(candles, symbol, interval);

      if (!validation.valid) {
        const errMsg = `Validation failed for ${symbol} ${interval}: ${validation.errors.join(
          '; '
        )}`;
        console.error(`[CandleFetcher.fetchAndValidate] ${errMsg}`);
        throw new Error(errMsg);
      }

      // Log any warnings
      if (validation.warnings.length > 0) {
        console.warn(
          `[CandleFetcher] ${symbol} ${interval} warnings:`,
          validation.warnings
        );
      }

      console.log(
        `[CandleFetcher] ✓ ${symbol} ${interval}: ${candles.length} candles validated`
      );

      return candles;
    } catch (err) {
      console.error(
        `[CandleFetcher.fetchAndValidate] Error:`,
        err.message
      );
      throw err;
    }
  }

  /**
   * Start polling for fresh candles on the specified interval
   * 
   * Calls onCandles() with fresh validated data each time a new candle closes.
   * Calls onError() if fetching or validation fails (does NOT crash).
   * 
   * @param {Object} client — ccxt Bybit client instance
   * @param {String} symbol — Trading pair
   * @param {String} interval — Candle interval (determines poll frequency)
   * @param {Function} onCandles — Callback: (candles) => void (called with fresh validated candles)
   * @param {Function} onError — Callback: (error) => void (called if fetch/validate fails)
   * @returns {String} pollKey — Use to stopPolling() later
   */
  startPolling(client, symbol, interval, onCandles, onError) {
    if (!client || !symbol || !interval || !onCandles || !onError) {
      throw new Error('startPolling: missing required parameters');
    }

    // Prevent duplicate polling on same symbol
    const pollKey = `${symbol}:${interval}`;
    if (this.pollingIntervals[pollKey]) {
      console.warn(`[CandleFetcher] Already polling ${pollKey}`);
      return pollKey;
    }

    // Calculate poll frequency (slightly before candle closes)
    const intervalMs = this._intervalToMs(interval);
    const pollFrequencyMs = intervalMs * 0.9; // Poll at 90% of interval

    console.log(
      `[CandleFetcher] Starting poll for ${symbol} ${interval} (every ${pollFrequencyMs}ms)`
    );

    // Fetch immediately on start
    this._pollOnce(client, symbol, interval, onCandles, onError);

    // Then poll on interval
    const intervalId = setInterval(() => {
      this._pollOnce(client, symbol, interval, onCandles, onError);
    }, pollFrequencyMs);

    this.pollingIntervals[pollKey] = intervalId;

    return pollKey;
  }

  /**
   * Stop polling for a symbol
   * 
   * @param {String} pollKey — From startPolling() or "SYMBOL:INTERVAL"
   */
  stopPolling(pollKey) {
    if (!this.pollingIntervals[pollKey]) {
      console.warn(`[CandleFetcher] Not polling ${pollKey}`);
      return;
    }

    clearInterval(this.pollingIntervals[pollKey]);
    delete this.pollingIntervals[pollKey];

    console.log(`[CandleFetcher] Stopped polling ${pollKey}`);
  }

  /**
   * Single poll iteration (internal)
   */
  async _pollOnce(client, symbol, interval, onCandles, onError) {
    try {
      const candles = await this.fetchAndValidate(client, symbol, interval, 300);
      onCandles(candles);
    } catch (err) {
      // Log error and call onError callback, but don't crash polling
      console.error(`[CandleFetcher._pollOnce] Error:`, err.message);
      onError(err);
    }
  }

  /**
   * Convert interval string to milliseconds
   * @private
   */
  _intervalToMs(interval) {
    const parsed = interval.match(/^(\d+)([mhd])$/);
    if (!parsed) {
      throw new Error(`Invalid interval: ${interval}`);
    }

    const num = parseInt(parsed[1], 10);
    const unit = parsed[2];

    switch (unit) {
      case 'm':
        return num * 60 * 1000;
      case 'h':
        return num * 60 * 60 * 1000;
      case 'd':
        return num * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Unknown interval unit: ${unit}`);
    }
  }

  /**
   * Stop all polling
   */
  stopAll() {
    for (const key of Object.keys(this.pollingIntervals)) {
      this.stopPolling(key);
    }
    console.log('[CandleFetcher] Stopped all polling');
  }

  /**
   * Get polling status
   */
  getStatus() {
    return {
      activePolls: Object.keys(this.pollingIntervals),
      count: Object.keys(this.pollingIntervals).length,
    };
  }
}

/**
 * Singleton instance for module-level use
 */
export const candleFetcher = new CandleFetcher();
