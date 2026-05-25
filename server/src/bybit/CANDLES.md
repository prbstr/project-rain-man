# CandleFetcher — OHLCV Data Pipeline

## Overview
CandleFetcher bridges Bybit and the strategy engine. **Every candle that touches the strategy engine MUST come through `fetchAndValidate()`.**

## Architecture

```
Bybit API
    ↓
fetchCandles()          [fetch raw OHLCV, normalize]
    ↓
validateCandles()       [5-check validator]
    ↓
Strategy Engine         [only receive valid candles]
```

## API

### `fetchCandles(client, symbol, interval, limit=300)`
Fetch raw OHLCV data from Bybit.

```javascript
import { candleFetcher } from '../bybit/candles.js';

const candles = await candleFetcher.fetchCandles(
  client,      // ccxt Bybit client instance
  'TSLA/USDT', // trading pair
  '1h',        // candle interval
  300          // optional: number of candles (default 300)
);

// Returns:
// [
//   { timestamp: 1716648000000, open: 250, high: 255, low: 248, close: 252, volume: 10000 },
//   ...
// ]
```

**Returns:** Array of normalized candles (300-candle history by default)

**Throws:** If fetch fails or returns empty data

**Note:** Use `fetchAndValidate()` instead — this is the low-level fetch.

---

### `fetchAndValidate(client, symbol, interval, limit=300)`
**THE RECOMMENDED WAY to get candles.** Combines fetch + validation.

```javascript
const candles = await candleFetcher.fetchAndValidate(
  client,
  'TSLA/USDT',
  '1h',
  300
);

// Returns: Validated candles (ready for strategy engine)
// Throws: If validation fails (data quality issue)
```

**Contract:**
- ✅ Returns only if candles are valid
- ✅ Throws with clear error if validation fails
- ✅ Logs warnings for exchange outages (gaps, etc)
- ✅ Normalizes ccxt output to strategy engine schema

**Usage in Strategy:**
```javascript
try {
  const candles = await candleFetcher.fetchAndValidate(client, 'TSLA/USDT', '1h');
  const signal = engine.getSignal(candles);
  // Proceed with signal
} catch (err) {
  console.error('Data fetch/validation failed:', err.message);
  // Skip this candle cycle, try again next interval
}
```

---

### `startPolling(client, symbol, interval, onCandles, onError)`
Auto-fetch fresh candles on the specified interval.

```javascript
const pollKey = candleFetcher.startPolling(
  client,
  'TSLA/USDT',
  '1h',
  (candles) => {
    // Called with fresh validated candles each time
    const signal = engine.getSignal(candles);
    console.log('Signal:', signal.signal);
  },
  (error) => {
    // Called if fetch/validation fails (doesn't crash polling)
    console.error('Poll error:', error.message);
    // Log to audit, skip this cycle, continue polling
  }
);

// Later:
candleFetcher.stopPolling(pollKey);
```

**Behavior:**
- Fetches and validates on startup (immediately)
- Then polls every ~90% of the interval (to catch close before open of next)
- Calls `onCandles(candles)` with fresh validated data
- Calls `onError(error)` if anything fails (but continues polling)
- **Does not crash** — polling continues even if individual fetch fails

**Example: 1h candle interval**
```
Minute 0:   Start polling → Fetch immediately → onCandles()
Minute 54:  Poll 1 → Fetch → onCandles()
Minute 54:  Poll 2 → Fetch → onCandles()
Hour 1 @ Min 0: Poll 3 → Fetch (new candle!) → onCandles()
```

---

### `stopPolling(pollKey)`
Stop polling for a specific symbol.

```javascript
candleFetcher.stopPolling('TSLA/USDT:1h');
```

---

### `stopAll()`
Stop all active polls.

```javascript
candleFetcher.stopAll();
```

---

### `getStatus()`
Get current polling status.

```javascript
const status = candleFetcher.getStatus();
// { activePolls: ['TSLA/USDT:1h', 'AAPL/USDT:1h'], count: 2 }
```

---

## Candle Schema

**Input (from ccxt):**
```javascript
[
  timestamp_ms,  // [0] Unix epoch milliseconds
  open,          // [1]
  high,          // [2]
  low,           // [3]
  close,         // [4]
  volume         // [5]
]
```

**Output (normalized):**
```javascript
{
  timestamp: number,  // Unix epoch ms
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number
}
```

---

## Integration with Strategy

### Pattern 1: Fetch-on-demand
```javascript
// In signal generation route
router.get('/api/signal/:symbol', async (req, res) => {
  try {
    const candles = await candleFetcher.fetchAndValidate(
      client, req.params.symbol, '1h'
    );
    const signal = engine.getSignal(candles);
    res.json(signal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

### Pattern 2: Continuous polling
```javascript
// In bot startup
candleFetcher.startPolling(
  client,
  'TSLA/USDT',
  '1h',
  (candles) => {
    const signal = engine.getSignal(candles);
    if (signal.signal === 'LONG') {
      placeOrder('TSLA/USDT', 'long', signal.positionSize);
    }
  },
  (error) => {
    console.error('Poll error:', error.message);
    // Log, alert, but keep polling
  }
);
```

---

## Error Handling

**Fetch Failures:**
- Network error, rate limit → `executeWithCircuitBreaker` retries, then throws
- Empty data returned → Throws "No OHLCV data returned"

**Validation Failures:**
- < 250 candles → Error (EMA-200 needs history)
- NaN, Infinity → Error (schema check)
- OHLC impossible (high < low) → Error
- Stale data (> 3.5h old) → Error
- Gaps/outages → Warning (logged, data still returned)

**Polling Error Handling:**
- Individual poll failure → Calls `onError(error)`, continues polling
- Never crashes the polling loop
- Allows trading bot to skip bad candle cycles gracefully

---

## Performance

- **fetchCandles():** ~100-200ms (1 Bybit API call + normalization)
- **fetchAndValidate():** ~100-250ms (fetch + 5-check validation)
- **Polling:** No overhead between polls (uses native JS setInterval)

---

## Testing

### Unit Tests
```bash
node src/bybit/candles.test.js
```

Validates:
- Interval conversion (1m, 5m, 1h, 4h, 1d)
- Error handling (null client, invalid interval)
- Polling state management

### Integration Tests
(Require testnet Bybit client)
```javascript
const client = createBybitClient(key, secret, true);
const candles = await candleFetcher.fetchAndValidate(
  client, 'TSLA/USDT', '1h'
);
expect(candles.length).toBeGreaterThan(0);
expect(candles[0]).toHaveProperty('timestamp');
```

---

## Security & Reliability

- ✅ Circuit breaker on all Bybit calls (rate limit + downtime protection)
- ✅ Validation before strategy execution (prevents bad data signals)
- ✅ Polling error isolation (failures don't crash bot)
- ✅ No plaintext keys (uses decrypted client from guardian)
- ✅ Audit-friendly (all fetches logged)

---

## Files

- `candles.js` (210 lines) — Core module
- `candles.test.js` (120 lines) — Manual tests
- `CANDLES.md` — This documentation
- Integration with: `strategy/validator.js`, `strategy/engine.js`, `client.js`
