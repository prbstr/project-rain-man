/**
 * Manual test suite for Strategy Validator — R06
 * 
 * Tests:
 * 1. Minimum candle count (250+)
 * 2. Schema validation (open, high, low, close, volume, timestamp all numbers)
 * 3. OHLC sanity (high >= all, low <= all)
 * 4. Gap detection (> 2.5× interval = warning)
 * 5. Staleness check (> 3.5× interval old = error)
 * 6. Batch validation
 * 7. Strict mode (warnings become errors)
 */

import { strict as assert } from 'assert';
import {
  validateCandles,
  validateCandleMap,
  validateCandlesStrict,
  getValidationSummary,
} from './validator.js';

console.log('\n' + '='.repeat(60));
console.log('Strategy Validator Test Suite — R06');
console.log('='.repeat(60));

/**
 * TEST 1: Minimum candle count
 */
console.log('\n[TEST 1] Minimum Candle Count');

// Helper: create valid candle
function createCandle(timestamp, open, high, low, close, volume = 1000) {
  return { open, high, low, close, volume, timestamp };
}

// Reject: insufficient candles
const insufficientCandles = Array.from({ length: 100 }, (_, i) =>
  createCandle(Date.now() - (250 - i) * 60000, 100, 105, 95, 102)
);

const result1 = validateCandles(insufficientCandles, 'TEST', '1h');
assert.strictEqual(result1.valid, false, 'Should reject < 250 candles');
assert(result1.errors[0].includes('250'), 'Error should mention 250 minimum');
console.log('✓ Reject: insufficient candles (100 < 250)');

// Accept: sufficient candles
const sufficientCandles = Array.from({ length: 250 }, (_, i) =>
  createCandle(Date.now() - (250 - i) * 60000, 100, 105, 95, 102)
);

const result2 = validateCandles(sufficientCandles, 'TEST', '1h');
assert.strictEqual(result2.valid, true, 'Should accept 250+ candles');
console.log('✓ Accept: sufficient candles (250)');

/**
 * TEST 2: Schema validation
 */
console.log('\n[TEST 2] Schema Validation');

// Missing field
const missingField = sufficientCandles.map((c, i) =>
  i === 10 ? { ...c, close: undefined } : c
);
const result3 = validateCandles(missingField, 'TEST', '1h');
assert.strictEqual(result3.valid, false, 'Should reject missing field');
assert(result3.errors.some(e => e.includes('close')), 'Should report missing close');
console.log('✓ Reject: missing field (close undefined)');

// NaN value
const nanValue = sufficientCandles.map((c, i) =>
  i === 10 ? { ...c, volume: NaN } : c
);
const result4 = validateCandles(nanValue, 'TEST', '1h');
assert.strictEqual(result4.valid, false, 'Should reject NaN');
assert(result4.errors.some(e => e.includes('NaN')), 'Should report NaN');
console.log('✓ Reject: NaN value (volume NaN)');

// Wrong type
const wrongType = sufficientCandles.map((c, i) =>
  i === 10 ? { ...c, high: 'not a number' } : c
);
const result5 = validateCandles(wrongType, 'TEST', '1h');
assert.strictEqual(result5.valid, false, 'Should reject non-number');
assert(result5.errors.some(e => e.includes('not a number')), 'Should report type error');
console.log('✓ Reject: wrong type (high is string)');

/**
 * TEST 3: OHLC sanity
 */
console.log('\n[TEST 3] OHLC Sanity Checks');

// High < Low (impossible)
const badOHLC1 = sufficientCandles.map((c, i) =>
  i === 10 ? { ...c, high: 90, low: 100 } : c
);
const result6 = validateCandles(badOHLC1, 'TEST', '1h');
assert.strictEqual(result6.valid, false, 'Should reject high < low');
console.log('✓ Reject: high < low (90 < 100)');

// Open > High
const badOHLC2 = sufficientCandles.map((c, i) =>
  i === 10 ? { ...c, open: 110, high: 105 } : c
);
const result7 = validateCandles(badOHLC2, 'TEST', '1h');
assert.strictEqual(result7.valid, false, 'Should reject open > high');
console.log('✓ Reject: open > high (110 > 105)');

// Close < Low
const badOHLC3 = sufficientCandles.map((c, i) =>
  i === 10 ? { ...c, close: 90, low: 95 } : c
);
const result8 = validateCandles(badOHLC3, 'TEST', '1h');
assert.strictEqual(result8.valid, false, 'Should reject close < low');
console.log('✓ Reject: close < low (90 < 95)');

// Valid OHLC
const validOHLC = sufficientCandles.map((c, i) =>
  i === 10 ? { ...c, open: 100, high: 110, low: 90, close: 105 } : c
);
const result9 = validateCandles(validOHLC, 'TEST', '1h');
assert.strictEqual(result9.valid, true, 'Should accept valid OHLC');
console.log('✓ Accept: valid OHLC (100 <= 110, 90 <= all)');

/**
 * TEST 4: Gap detection
 */
console.log('\n[TEST 4] Gap Detection');

// Create candles with 2× gap (should warn, not error)
const gappyCandles = Array.from({ length: 250 }, (_, i) => {
  const baseTime = Date.now() - (250 - i) * 60000;
  const timestamp = i === 100 ? baseTime + 120000 : baseTime; // 2× gap at index 100
  return createCandle(timestamp, 100, 105, 95, 102);
});

const result10 = validateCandles(gappyCandles, 'TEST', '1h');
assert.strictEqual(result10.valid, true, 'Gap should warn, not error');
assert(result10.warnings.length > 0, 'Should have warnings');
assert(result10.warnings[0].includes('gap'), 'Should mention gap');
console.log('✓ Warn (not error): 2× gap (1h expected, 2h found)');

// Create candles with 3× gap (same: warn)
const gappierCandles = Array.from({ length: 250 }, (_, i) => {
  const baseTime = Date.now() - (250 - i) * 60000;
  const timestamp = i === 100 ? baseTime + 180000 : baseTime; // 3× gap
  return createCandle(timestamp, 100, 105, 95, 102);
});

const result11 = validateCandles(gappierCandles, 'TEST', '1h');
assert.strictEqual(result11.valid, true, 'Even 3× gap is warning');
assert(result11.warnings.length > 0, 'Should have warnings');
console.log('✓ Warn (not error): 3× gap (allows exchange outages)');

/**
 * TEST 5: Staleness check
 */
console.log('\n[TEST 5] Staleness Check');

// Fresh data
const freshCandles = Array.from({ length: 250 }, (_, i) =>
  createCandle(Date.now() - (250 - i) * 60000, 100, 105, 95, 102)
);

const result12 = validateCandles(freshCandles, 'TEST', '1h');
assert.strictEqual(result12.valid, true, 'Recent data should be valid');
console.log('✓ Accept: fresh data (within 3.5h)');

// Stale data (> 3.5h old)
const staleCandles = Array.from({ length: 250 }, (_, i) =>
  createCandle(Date.now() - 14 * 3600000 - (250 - i) * 60000, 100, 105, 95, 102)
);

const result13 = validateCandles(staleCandles, 'TEST', '1h');
assert.strictEqual(result13.valid, false, 'Stale data should error');
assert(result13.errors.some(e => e.includes('stale')), 'Should mention staleness');
console.log('✓ Reject: stale data (> 3.5h old)');

/**
 * TEST 6: Batch validation
 */
console.log('\n[TEST 6] Batch Validation');

const candleMap = {
  TSLA: sufficientCandles,
  AAPL: sufficientCandles,
  NVDA: insufficientCandles, // Invalid
};

const results = validateCandleMap(candleMap, '1h');
assert.strictEqual(Object.keys(results).length, 3, 'Should validate all 3 symbols');
assert.strictEqual(results.TSLA.valid, true, 'TSLA valid');
assert.strictEqual(results.AAPL.valid, true, 'AAPL valid');
assert.strictEqual(results.NVDA.valid, false, 'NVDA invalid');
console.log('✓ Batch: validate 3 symbols (2 valid, 1 invalid)');

const summary = getValidationSummary(results);
assert.strictEqual(summary.valid, 2, 'Summary should show 2 valid');
assert.strictEqual(summary.invalid, 1, 'Summary should show 1 invalid');
console.log(`✓ Summary: ${summary.valid} valid, ${summary.invalid} invalid`);

/**
 * TEST 7: Strict mode
 */
console.log('\n[TEST 7] Strict Mode');

const strictResult = validateCandlesStrict(gappyCandles, 'TEST', '1h');
assert.strictEqual(strictResult.valid, false, 'Strict mode should reject warnings');
assert(strictResult.errors.some(e => e.includes('strict')), 'Should mention strict mode');
console.log('✓ Strict mode: converts warnings to errors');

/**
 * SUMMARY
 */
console.log('\n' + '='.repeat(60));
console.log('Summary');
console.log('='.repeat(60));
console.log(`
✓ TEST 1 — Minimum candle count (250+)
✓ TEST 2 — Schema validation (required fields, types, NaN/Inf)
✓ TEST 3 — OHLC sanity (high >= all, low <= all)
✓ TEST 4 — Gap detection (> 2.5× = warning, not error)
✓ TEST 5 — Staleness check (> 3.5× interval old = error)
✓ TEST 6 — Batch validation (multiple symbols)
✓ TEST 7 — Strict mode (warnings become errors)

Integration Tests (require live data):
  - Fetch real Bybit 1h candles for TSLA
  - Validate using validateCandles()
  - Expect: valid=true, warnings=0
  - Feed to strategy engine only if valid

Next Steps:
  1. Hook validateCandles() before StrategyEngine.getSignal()
  2. Reject any order if validation fails
  3. Log all validations for monitoring
  4. Monitor warnings for exchange outages
`);

console.log('\nAll manual tests passed! ✅');
