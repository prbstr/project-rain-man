/**
 * Strategy Data Validator — R06
 * 
 * Ensures OHLCV candle data is valid before reaching the strategy engine.
 * Validates: minimum history, schema, OHLC sanity, gaps, staleness.
 */

/**
 * Validate candle data before strategy execution
 * 
 * Returns: { valid: boolean, errors: string[], warnings: string[] }
 * Errors = hard rejects (data unusable)
 * Warnings = issues logged but data usable (e.g., exchange outage gap)
 */
export function validateCandles(candles, symbol = 'UNKNOWN', interval = '1h') {
  const errors = [];
  const warnings = [];

  // ============================================================
  // CHECK 1: Minimum candle count (need EMA-200 history)
  // ============================================================
  const MIN_CANDLES = 250;

  if (!Array.isArray(candles)) {
    errors.push('Candles must be an array');
    return { valid: false, errors, warnings };
  }

  if (candles.length < MIN_CANDLES) {
    errors.push(
      `Insufficient candle history: ${candles.length} < ${MIN_CANDLES} required for EMA-200`
    );
    return { valid: false, errors, warnings };
  }

  // ============================================================
  // CHECK 2: Schema validation (each candle)
  // ============================================================
  const requiredFields = ['open', 'high', 'low', 'close', 'volume', 'timestamp'];

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // Missing fields?
    for (const field of requiredFields) {
      if (!(field in candle)) {
        errors.push(`Candle ${i} missing field: ${field}`);
        continue;
      }

      const value = candle[field];

      // Type check: must be number
      if (typeof value !== 'number') {
        errors.push(
          `Candle ${i} field '${field}' is not a number: ${typeof value} = ${value}`
        );
        continue;
      }

      // NaN check
      if (Number.isNaN(value)) {
        errors.push(`Candle ${i} field '${field}' is NaN`);
        continue;
      }

      // Infinity check (edge case)
      if (!Number.isFinite(value)) {
        errors.push(`Candle ${i} field '${field}' is not finite: ${value}`);
        continue;
      }

      // Negative price/volume check
      if ((field !== 'timestamp' && value < 0)) {
        errors.push(
          `Candle ${i} field '${field}' is negative: ${value}`
        );
        continue;
      }
    }

    // Timestamp must be > 0 (epoch ms)
    if (candle.timestamp < 1000000000000) {
      warnings.push(`Candle ${i} timestamp looks suspiciously old: ${candle.timestamp}`);
    }
  }

  // Stop here if schema errors exist
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // ============================================================
  // CHECK 3: OHLC sanity checks
  // ============================================================
  for (let i = 0; i < candles.length; i++) {
    const { open, high, low, close } = candles[i];

    // High >= all prices
    if (high < open) {
      errors.push(`Candle ${i} high (${high}) < open (${open})`);
    }
    if (high < close) {
      errors.push(`Candle ${i} high (${high}) < close (${close})`);
    }
    if (high < low) {
      errors.push(`Candle ${i} high (${high}) < low (${low}) — impossible`);
    }

    // Low <= all prices
    if (low > open) {
      errors.push(`Candle ${i} low (${low}) > open (${open})`);
    }
    if (low > close) {
      errors.push(`Candle ${i} low (${low}) > close (${close})`);
    }
    if (low > high) {
      errors.push(`Candle ${i} low (${low}) > high (${high}) — impossible`);
    }

    // Open/Close within high/low range
    if (open > high || open < low) {
      errors.push(`Candle ${i} open (${open}) outside [${low}, ${high}] range`);
    }
    if (close > high || close < low) {
      errors.push(`Candle ${i} close (${close}) outside [${low}, ${high}] range`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // ============================================================
  // CHECK 4: Gap detection (timestamp continuity)
  // ============================================================
  // Infer interval from first two candles
  let expectedInterval = null;

  if (candles.length >= 2) {
    const diff = candles[1].timestamp - candles[0].timestamp;
    expectedInterval = diff;
  }

  if (expectedInterval && expectedInterval > 0) {
    const MAX_GAP_TOLERANCE = 2.5; // Allow up to 2.5× interval gap (exchange outages)

    for (let i = 1; i < candles.length; i++) {
      const gap = candles[i].timestamp - candles[i - 1].timestamp;
      const gapMultiple = gap / expectedInterval;

      if (gapMultiple > MAX_GAP_TOLERANCE) {
        const minutes = Math.round(gap / 60000);
        warnings.push(
          `Candle ${i} gap of ${gapMultiple.toFixed(1)}× interval ` +
          `(${minutes}m). Possible exchange outage at ${new Date(candles[i - 1].timestamp).toISOString()}`
        );
      }
    }
  }

  // ============================================================
  // CHECK 5: Staleness check (most recent candle)
  // ============================================================
  const newestCandle = candles[candles.length - 1];
  const now = Date.now();
  const ageMs = now - newestCandle.timestamp;

  if (expectedInterval && expectedInterval > 0) {
    const MAX_STALE_TOLERANCE = 3.5; // Allow up to 3.5× interval old

    if (ageMs > expectedInterval * MAX_STALE_TOLERANCE) {
      const ageMinutes = Math.round(ageMs / 60000);
      const intervalMinutes = Math.round(expectedInterval / 60000);
      errors.push(
        `Candle data is stale: ${ageMinutes}m old (> ${intervalMinutes}m × 3.5 tolerance). ` +
        `Newest: ${new Date(newestCandle.timestamp).toISOString()}`
      );
    }
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  const valid = errors.length === 0;

  if (valid) {
    console.log(
      `[Validator] ✓ ${symbol} ${interval}: ${candles.length} candles valid ` +
      `(newest: ${new Date(newestCandle.timestamp).toISOString()})` +
      (warnings.length > 0 ? ` — ${warnings.length} warnings` : '')
    );
  } else {
    console.error(
      `[Validator] ✗ ${symbol} ${interval}: ${errors.length} errors, ${warnings.length} warnings`
    );
    errors.forEach(e => console.error(`  ✗ ${e}`));
  }

  warnings.forEach(w => console.warn(`  ⚠ ${w}`));

  return { valid, errors, warnings };
}

/**
 * Batch validate multiple symbol candles
 * Returns map: { symbol: { valid, errors, warnings }, ... }
 */
export function validateCandleMap(candleMap, interval = '1h') {
  const results = {};

  for (const [symbol, candles] of Object.entries(candleMap)) {
    results[symbol] = validateCandles(candles, symbol, interval);
  }

  return results;
}

/**
 * Strict mode: reject if ANY warnings exist
 * Used for critical strategy execution where we want zero ambiguity
 */
export function validateCandlesStrict(candles, symbol = 'UNKNOWN', interval = '1h') {
  const result = validateCandles(candles, symbol, interval);

  if (result.warnings.length > 0) {
    result.valid = false;
    result.errors.push(
      `${result.warnings.length} warnings treated as errors (strict mode)`
    );
    result.errors.push(...result.warnings);
    result.warnings = [];
  }

  return result;
}

/**
 * Get validation summary for logging/monitoring
 */
export function getValidationSummary(results) {
  let validCount = 0;
  let errorCount = 0;
  let warningCount = 0;

  for (const result of Object.values(results)) {
    if (result.valid) validCount++;
    errorCount += result.errors.length;
    warningCount += result.warnings.length;
  }

  return {
    total: Object.keys(results).length,
    valid: validCount,
    invalid: Object.keys(results).length - validCount,
    totalErrors: errorCount,
    totalWarnings: warningCount,
  };
}
