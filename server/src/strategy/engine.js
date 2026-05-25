import {
  CCI,
  EMA,
  ADX,
  ATR,
  KeltnerChannels,
} from 'technicalindicators';

/**
 * StrategyEngine — Technical indicator calculations and signal generation
 * Based on Pine Script logic (CCI, EMA, ADX, ATR, Keltner channels)
 */
class StrategyEngine {
  constructor(params = {}) {
    // Merge defaults with provided params
    this.params = {
      cciLength: 20,
      cciOversold: -100,
      cciOverbought: 100,
      emaLength: 200,
      adxLength: 14,
      adxThreshold: 25,
      sizeMultiplier: 1.5,
      leverage: 5,
      stopLossMultiplier: 1.5,
      takeProfitRatio: 2.0,
      trailStopMultiplier: 1.0,
      useKeltnerForStops: true,
      kcLength: 20,
      kcMultiplier: 1.5,
      capital: 1000,
      ...params,
    };

    // State tracking for crossover detection (required for Pine Script fidelity)
    this.prevCCI = null;
  }

  /**
   * Calculate CCI (Commodity Channel Index)
   * @param {Array} candles - OHLCV array
   * @param {Number} length - Period
   * @returns {Number} Latest CCI value
   */
  calcCCI(candles, length) {
    if (!candles || candles.length < length) return null;
    
    const result = CCI.calculate({
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: candles.map((c) => c.close),
      period: length,
    });
    
    return result.length > 0 ? result[result.length - 1] : null;
  }

  /**
   * Calculate EMA (Exponential Moving Average)
   * @param {Array} candles - OHLCV array
   * @param {Number} length - Period
   * @returns {Number} Latest EMA value
   */
  calcEMA(candles, length) {
    if (!candles || candles.length < length) return null;
    const closes = candles.map((c) => c.close);
    const result = EMA.calculate({
      values: closes,
      period: length,
    });
    return result.length > 0 ? result[result.length - 1] : null;
  }

  /**
   * Calculate ADX (Average Directional Index)
   * @param {Array} candles - OHLCV array
   * @param {Number} length - Period
   * @returns {Number} Latest ADX value
   */
  calcADX(candles, length) {
    if (!candles || candles.length < length) return null;
    const result = ADX.calculate({
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: candles.map((c) => c.close),
      period: length,
    });
    // ADX returns an object with { adx, pdi, mdi }
    if (result.length > 0) {
      const last = result[result.length - 1];
      return typeof last === 'object' ? last.adx : last;
    }
    return null;
  }

  /**
   * Calculate ATR (Average True Range)
   * @param {Array} candles - OHLCV array
   * @param {Number} length - Period
   * @returns {Number} Latest ATR value
   */
  calcATR(candles, length) {
    if (!candles || candles.length < length) return null;
    const result = ATR.calculate({
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: candles.map((c) => c.close),
      period: length,
    });
    return result.length > 0 ? result[result.length - 1] : null;
  }

  /**
   * Calculate Keltner Channel (EMA ± (ATR × multiplier))
   * @param {Array} candles - OHLCV array
   * @param {Number} emaLength - EMA period
   * @param {Number} atrMultiplier - ATR multiplier for bands
   * @returns {Object} { mid, upper, lower }
   */
  calcKeltner(candles, emaLength, atrMultiplier) {
    const mid = this.calcEMA(candles, emaLength);
    const atr = this.calcATR(candles, emaLength);

    if (mid === null || atr === null) {
      return { mid: null, upper: null, lower: null };
    }

    return {
      mid,
      upper: mid + atr * atrMultiplier,
      lower: mid - atr * atrMultiplier,
    };
  }

  /**
   * Generate trading signal with position sizing, stops, and profits
   * @param {Array} candles - OHLCV array (must have at least 250 candles for all indicators)
   * @param {Object} overrideParams - Optional param overrides
   * @returns {Object} Signal with indicators, position size, stops, and profits
   */
  getSignal(candles, overrideParams = {}) {
    const params = { ...this.params, ...overrideParams };

    if (!candles || candles.length < Math.max(params.cciLength, params.emaLength)) {
      return {
        signal: 'NONE',
        cci: null,
        ema: null,
        adx: null,
        atr: null,
        keltner: { mid: null, upper: null, lower: null },
        positionSize: 0,
        stopLoss: null,
        takeProfit: null,
        trailPoints: null,
      };
    }

    // Calculate all indicators
    const cci = this.calcCCI(candles, params.cciLength);
    const ema = this.calcEMA(candles, params.emaLength);
    const adx = this.calcADX(candles, params.adxLength);
    const atr = this.calcATR(candles, params.adxLength);
    const keltner = this.calcKeltner(candles, params.kcLength, params.kcMultiplier);

    if (
      cci === null ||
      ema === null ||
      adx === null ||
      atr === null ||
      keltner.mid === null
    ) {
      return {
        signal: 'NONE',
        cci,
        ema,
        adx,
        atr,
        keltner,
        positionSize: 0,
        stopLoss: null,
        takeProfit: null,
        trailPoints: null,
      };
    }

    const latestClose = candles[candles.length - 1].close;

    // Entry conditions (from Pine Script) — CROSSOVER detection, not level comparison
    // Pine Script uses ta.crossover/ta.crossunder which detect the crossing point
    const cciCrossoverOversold =
      this.prevCCI !== null &&
      this.prevCCI <= params.cciOversold &&
      cci > params.cciOversold;
    const cciCrossunderOverbought =
      this.prevCCI !== null &&
      this.prevCCI >= params.cciOverbought &&
      cci < params.cciOverbought;

    const longCondition = cciCrossoverOversold && latestClose > ema;
    const shortCondition = cciCrossunderOverbought && latestClose < ema;

    // Determine signal
    let signal = 'NONE';
    if (longCondition) signal = 'LONG';
    else if (shortCondition) signal = 'SHORT';

    // Position sizing: scale with ADX
    const baseSize = (params.capital * params.leverage) / 100;
    const positionSize =
      adx > params.adxThreshold
        ? baseSize * params.sizeMultiplier
        : baseSize;

    // Stop-loss and take-profit
    const stopLossATR = atr * params.stopLossMultiplier;
    const takeProfitATR = stopLossATR * params.takeProfitRatio;

    let stopLoss = null;
    let takeProfit = null;

    if (signal === 'LONG') {
      // For backtest, use latest close as entry price
      const entryPrice = latestClose;
      stopLoss = params.useKeltnerForStops
        ? Math.min(entryPrice - stopLossATR, keltner.lower)
        : entryPrice - stopLossATR;
      takeProfit = entryPrice + takeProfitATR;
    } else if (signal === 'SHORT') {
      const entryPrice = latestClose;
      stopLoss = params.useKeltnerForStops
        ? Math.max(entryPrice + stopLossATR, keltner.upper)
        : entryPrice + stopLossATR;
      takeProfit = entryPrice - takeProfitATR;
    }

    const trailPoints =
      signal !== 'NONE' ? params.trailStopMultiplier * atr : null;

    // Store current CCI for next call's crossover detection
    this.prevCCI = cci;

    return {
      signal,
      cci,
      ema,
      adx,
      atr,
      keltner,
      positionSize: Math.max(positionSize, 1),
      stopLoss,
      takeProfit,
      trailPoints,
    };
  }
}

export default StrategyEngine;
