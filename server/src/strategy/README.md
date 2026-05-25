# Strategy Validator — R06: Market Data Validation

## Overview
Before any OHLCV candle data reaches the strategy engine, it must pass rigorous validation. This module ensures data integrity and prevents bad data from causing incorrect trading signals.

## Features

### 1. Minimum Candle Count
```javascript
// Reject if < 250 candles (needed for EMA-200 + other indicators)
if (candles.length < 250) {
  // error: insufficient history
}
```

**Why:** Strategy uses EMA-200 and other long-period indicators that require historical depth.

### 2. Schema Validation
Each candle must have all required fields as valid numbers:
```javascript
{
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  timestamp: number  // epoch ms
}
```

**Checks:**
- All fields present (no undefined/null)
- All numeric (type check)
- Not NaN, Infinity, or negative (except timestamp)

### 3. OHLC Sanity
Validate price relationships within each candle:

```javascript
high >= max(open, close, low)   // High is the highest
low  <= min(open, close, high)  // Low is the lowest
open <= high && open >= low     // Open in range
close <= high && close >= low   // Close in range
```

**Rejects:** Any candle with impossible OHLC values (e.g., high < low)

### 4. Gap Detection
Detect unexpected timestamp jumps between candles:

```javascript
// Expected interval: inferred from first two candles
// Warning threshold: > 2.5× expected interval
if (gapMultiple > 2.5) {
  warnings.push(`Gap of ${gapMultiple}× interval (exchange outage?)`)
}
```

**Note:** Warnings, not errors. Exchange outages happen; we just log them.

### 5. Staleness Check
Reject data that's too old:

```javascript
// Max age: 3.5× the candle interval
if (ageMs > expectedInterval * 3.5) {
  errors.push('Candle data is stale')
}
```

**Example:** For 1h candles, reject if newest is > 3.5h old.

## API

### validateCandles(candles, symbol, interval)
```javascript
import { validateCandles } from '../strategy/validator.js';

const result = validateCandles(candles, 'TSLA', '1h');
// {
//   valid: boolean,
//   errors: string[],      // Hard rejects
//   warnings: string[]     // Logged, not blocking
// }

if (!result.valid) {
  console.error(result.errors);
  return; // Don't feed to strategy
}

// Proceed with strategy
const signal = strategyEngine.getSignal(result.candles);
```

### validateCandleMap(candleMap, interval)
Validate multiple symbols at once:

```javascript
const candleMap = {
  'TSLA': [...250 candles],
  'AAPL': [...250 candles],
  'NVDA': [...250 candles]
};

const results = validateCandleMap(candleMap, '1h');
// {
//   TSLA: { valid: true, errors: [], warnings: [] },
//   AAPL: { valid: true, ... },
//   NVDA: { valid: false, errors: [...], ... }
// }
```

### validateCandlesStrict(candles, symbol, interval)
Strict mode: treat warnings as errors:

```javascript
const result = validateCandlesStrict(candles, 'TSLA', '1h');
// If any warnings exist, valid = false
// Useful for critical execution points
```

### getValidationSummary(results)
Get overview of batch validation:

```javascript
const summary = getValidationSummary(results);
// {
//   total: 3,
//   valid: 2,
//   invalid: 1,
//   totalErrors: 5,
//   totalWarnings: 2
// }
```

## Integration

### Before Strategy Execution
```javascript
// 1. Fetch candles from Bybit
const candles = await client.fetchOHLCV('TSLA', '1h', limit=300);

// 2. Validate before use
const validation = validateCandles(candles, 'TSLA', '1h');

if (!validation.valid) {
  console.error('Data validation failed', validation.errors);
  return; // Skip this symbol
}

// 3. Pass to strategy engine
const signal = strategyEngine.getSignal(candles);
```

### In Order Placement Route
```javascript
import { validateCandles } from '../strategy/validator.js';

router.post('/orders', async (req, res) => {
  const { symbol, quantity, price } = req.body;

  // Pre-order checks
  const check = await canTrade(userId);
  if (!check.allowed) return res.status(403).json({ error: check.reason });

  // Fetch fresh candles
  const candles = await client.fetchOHLCV(symbol, '1h', limit=300);

  // Validate candles
  const validation = validateCandles(candles, symbol, '1h');
  if (!validation.valid) {
    return res.status(400).json({
      error: 'Market data validation failed',
      errors: validation.errors
    });
  }

  // Place order...
});
```

## Error Handling

### Hard Errors (Block Execution)
- Insufficient candles (< 250)
- Missing required fields
- NaN/Infinity/negative values
- Impossible OHLC (high < low)
- Stale data (> 3.5× interval old)

### Warnings (Log, Don't Block)
- Large gaps (> 2.5× interval) — likely exchange outage
- Suspicious timestamp (pre-2001)

## Testing

### Manual Tests
```bash
cd server
node src/strategy/validator.test.js
```

Tests:
- ✓ Minimum candle count (250+)
- ✓ Schema validation (required fields, types)
- ✓ OHLC sanity (high >= all, low <= all)
- ✓ Gap detection (> 2.5× warns, not blocks)
- ✓ Staleness check (> 3.5× old blocks)
- ✓ Batch validation
- ✓ Strict mode

### Integration Testing
1. Fetch real Bybit candles for TSLA
2. Run validateCandles()
3. Expect: valid=true, warnings=0 (normal market conditions)
4. Expect: warnings=N during exchange outages (valid=true still)

## Performance

- **validateCandles():** O(n) where n = candle count (250-300)
- **validateCandleMap():** O(n×m) where m = symbol count
- **Cost:** < 100ms for typical batch (3 symbols, 250 candles each)

## Logging

```
[Validator] ✓ TSLA 1h: 250 candles valid (newest: 2025-05-25T17:30:00Z)
[Validator] ⚠ AAPL 1h: 1 warning (gap 2.6× at 2025-05-25T12:00:00Z)
[Validator] ✗ NVDA 1h: 3 errors, 1 warning (stale data, NaN in volume)
```

## Security & Resilience

- **No data mutation:** Validation doesn't modify input
- **Defensive:** Checks all edge cases (NaN, Infinity, negative)
- **Graceful:** Gaps/outages = warnings, not blockers
- **Fast:** Designed for pre-order latency requirements

## Next Steps

1. Hook validateCandles() before all StrategyEngine.getSignal() calls
2. Add to order placement route (as shown above)
3. Monitor warnings for exchange outage patterns
4. Set up alerts for validation failures (data source issue)

## Files

- `validator.js` — Core module (240 lines)
- `validator.test.js` — Manual tests (320 lines)
- `../risk/guardian.js` — Integration point (enforcePositionLimits)
