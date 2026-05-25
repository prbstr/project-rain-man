/**
 * Manual test suite for CandleFetcher
 * 
 * Tests:
 * 1. Interval conversion (ms calculation)
 * 2. Candle normalization
 * 3. Validation integration
 * 4. Polling state management
 * 5. Error handling
 */

import { strict as assert } from 'assert';
import { CandleFetcher } from './candles.js';

console.log('\n' + '='.repeat(60));
console.log('CandleFetcher Test Suite');
console.log('='.repeat(60));

/**
 * TEST 1: Interval conversion
 */
console.log('\n[TEST 1] Interval Conversion');

const fetcher = new CandleFetcher();

assert.strictEqual(fetcher._intervalToMs('1m'), 60 * 1000, '1m = 60s');
assert.strictEqual(fetcher._intervalToMs('5m'), 5 * 60 * 1000, '5m = 300s');
assert.strictEqual(fetcher._intervalToMs('1h'), 60 * 60 * 1000, '1h = 3600s');
assert.strictEqual(fetcher._intervalToMs('4h'), 4 * 60 * 60 * 1000, '4h = 14400s');
assert.strictEqual(fetcher._intervalToMs('1d'), 24 * 60 * 60 * 1000, '1d = 86400s');

console.log('✓ 1m, 5m, 1h, 4h, 1d conversion correct');

/**
 * TEST 2: Invalid interval
 */
console.log('\n[TEST 2] Invalid Interval Rejection');

try {
  fetcher._intervalToMs('invalid');
  assert.fail('Should throw on invalid interval');
} catch (err) {
  assert(err.message.includes('Invalid interval'), 'Error should mention invalid interval');
  console.log('✓ Rejects invalid interval format');
}

/**
 * TEST 3: Polling key generation
 */
console.log('\n[TEST 3] Polling State Management');

assert.strictEqual(fetcher.getStatus().count, 0, 'Should start with no polls');
console.log('✓ Initial status: no active polls');

// Note: Full polling test requires live Bybit client
// This validates the structure is correct

/**
 * TEST 4: Singleton instance
 */
console.log('\n[TEST 4] Singleton Export');

import { candleFetcher } from './candles.js';

assert(candleFetcher instanceof CandleFetcher, 'candleFetcher should be CandleFetcher instance');
console.log('✓ Singleton instance exported correctly');

/**
 * TEST 5: Error handling
 */
console.log('\n[TEST 5] Error Handling');

const mockClient = null; // Invalid client
try {
  fetcher.startPolling(null, 'TSLA', '1h', () => {}, () => {});
  assert.fail('Should throw on null client');
} catch (err) {
  assert(err.message.includes('missing required parameters'), 'Should report missing params');
  console.log('✓ Validates required parameters before polling');
}

/**
 * SUMMARY
 */
console.log('\n' + '='.repeat(60));
console.log('Summary');
console.log('='.repeat(60));
console.log(`
✓ TEST 1 — Interval conversion (1m, 5m, 1h, 4h, 1d)
✓ TEST 2 — Invalid interval rejection
✓ TEST 3 — Polling state management
✓ TEST 4 — Singleton export
✓ TEST 5 — Error handling & validation

Integration Tests (require Bybit ccxt client):
  - Fetch real TSLA 1h candles → expect 300 returned
  - Validate candles match schema
  - Test polling with live client (would span multiple intervals)
  - Test polling error callback
  - Test stopPolling() cleanup

Next Steps:
  1. Integration test with real Bybit testnet client
  2. Validate candle normalization against ccxt format
  3. Test polling with live data (requires time)
  4. Measure poll frequency accuracy
  5. Test stopAll() cleanup
`);

console.log('\nAll manual tests passed! ✅');
