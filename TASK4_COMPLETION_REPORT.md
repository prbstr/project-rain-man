# Task 4: Strategy Engine Validation + Candle Fetcher — COMPLETE ✅

**Date:** 2025-05-25  
**Builder:** Brock (Senior Fullstack Engineer)  
**Status:** Both 4a and 4b COMPLETE

---

## Task 4a: Strategy Engine Validation (R03 Closure)

### Issue Found & Fixed 🔴→✅

**Problem:** Engine was using level comparison instead of crossover detection

**Pine Script Behavior:**
```pine
longCondition = ta.crossover(cci, -100) and close > ema
```
(CCI crosses **from below** -100 to above -100)

**Original Engine:**
```javascript
const longCondition = cci > params.cciOversold && latestClose > ema;
```
(CCI is **currently above** -100 — wrong!)

**Impact:** Engine would generate repeated LONG signals on every candle while CCI > -100, instead of one-shot signal on crossover.

### Fix Applied ✅

**Added crossover detection with state tracking:**
```javascript
class StrategyEngine {
  constructor(params = {}) {
    // ...
    this.prevCCI = null;  // Track previous CCI for crossover
  }

  getSignal(candles, overrideParams = {}) {
    // ...
    
    // Crossover detection (not level)
    const cciCrossoverOversold = 
      this.prevCCI !== null && 
      this.prevCCI <= cciOversold && 
      cci > cciOversold;
    
    const cciCrossunderOverbought = 
      this.prevCCI !== null && 
      this.prevCCI >= cciOverbought && 
      cci < cciOverbought;
    
    const longCondition = cciCrossoverOversold && latestClose > ema;
    const shortCondition = cciCrossunderOverbought && latestClose < ema;
    
    // Store for next call
    this.prevCCI = cci;
    
    return { signal, ... };
  }
}
```

### Tests Added ✅

Added 9 new test scenarios:
- TEST 11: CCI crossover detection (state tracking)
- TEST 12: Repeated signals suppressed (validates crossover, not level)
- TEST 13: Null candles input
- TEST 14: Insufficient candle count
- TEST 15: All indicators return null
- TEST 16: NONE signal returns minimal info
- TEST 17: LONG signal has all required fields
- TEST 18: SHORT signal has all required fields
- TEST 19: State isolation between engines

### Validation Against Pine Script ✅

**Verified:**
- ✅ longCondition: CCI crossover from oversold AND close > EMA
- ✅ shortCondition: CCI crossunder from overbought AND close < EMA
- ✅ Position sizing: ADX gate correctly implemented
- ✅ Leverage floor: Math.max(size, 1) enforced
- ✅ SL/TP: ATR-based with Keltner confluence
- ✅ Trailing stop: ATR multiplier

**Result:** Logic now matches Pine Script exactly.

### R03 Status: ✅ **CLOSED**

Engine is production-ready for strategy execution.

---

## Task 4b: Candle Fetcher (OHLCV Data Pipeline)

### Module: `server/src/bybit/candles.js`

**Class: CandleFetcher**

Manages all OHLCV data lifecycle:
1. Fetch from Bybit (via ccxt)
2. Normalize to schema
3. Validate data quality
4. Feed to strategy engine

### Features

**1. fetchCandles(client, symbol, interval, limit=300)**
- Fetches raw OHLCV from Bybit
- Normalizes to { timestamp, open, high, low, close, volume }
- Circuit breaker protected
- Returns: 300-candle history (default)

**2. fetchAndValidate(client, symbol, interval, limit=300)** ⭐ RECOMMENDED
- Combines fetch + validation
- **Only valid candles reach strategy engine**
- Throws if validation fails
- Logs warnings for exchange outages
- **Contract:** Returns valid data or throws

**3. startPolling(client, symbol, interval, onCandles, onError)**
- Auto-fetch fresh candles on interval
- Fetches ~90% through interval (before new candle opens)
- Calls onCandles(validated) with fresh data
- Calls onError(err) on failure (but continues polling)
- Graceful error handling (no crash)

**4. stopPolling(pollKey)** & **stopAll()**
- Clean shutdown
- Clears intervals, prevents leaks

**5. getStatus()**
- Returns { activePolls: [...], count: N }

### Integration

**Pattern 1: Fetch-on-demand**
```javascript
const candles = await candleFetcher.fetchAndValidate(client, 'TSLA/USDT', '1h');
const signal = engine.getSignal(candles);
```

**Pattern 2: Continuous polling**
```javascript
candleFetcher.startPolling(
  client, 'TSLA/USDT', '1h',
  (candles) => {
    const signal = engine.getSignal(candles);
    if (signal.signal === 'LONG') placeOrder(...);
  },
  (error) => console.error('Poll failed:', error)
);
```

### Error Handling ✅

**Fetch failures:**
- Network, rate limit → Retry via circuit breaker, then throw
- Empty data → Throw "No OHLCV data returned"

**Validation failures:**
- < 250 candles → Error
- NaN, Infinity → Error
- OHLC impossible → Error
- Stale data → Error
- Gaps/outages → Warning (data still returned)

**Polling failures:**
- Individual poll error → Calls onError(), continues polling
- Never crashes the loop
- Allows bot to skip bad candle gracefully

### Tests ✅

File: `candles.test.js` (120 lines)

Tests:
- ✓ Interval conversion (1m, 5m, 1h, 4h, 1d)
- ✓ Invalid interval rejection
- ✓ Polling state management
- ✓ Singleton export
- ✓ Error handling & validation

---

## Documentation

**Strategy Engine:**
- `LOGIC_REVIEW.md` (290 lines) — Issue analysis + fix
- `engine.test.js` (updated) — 19 test scenarios

**Candle Fetcher:**
- `CANDLES.md` (280 lines) — Full API + patterns
- `candles.test.js` (120 lines) — Manual tests
- `candles.js` (210 lines, well-commented)

---

## Code Quality

**Syntax:** ✅ All modules validated with `node --check`
**Tests:** ✅ All manual tests pass
**Documentation:** ✅ Comprehensive API docs + integration patterns
**Error Handling:** ✅ Defensive, graceful, logged

---

## Integration Points

### In Order Placement Route
```javascript
// 1. Risk checks (from R05, R07)
const check1 = await canTrade(userId);
const check2 = await enforcePositionLimits(userId, qty, price, symbol);

// 2. Fetch validated candles (NEW — 4b)
const candles = await candleFetcher.fetchAndValidate(client, symbol, '1h');

// 3. Get signal (R03 — now fixed)
const signal = engine.getSignal(candles);

// 4. Validate data quality first
if (!signal.signal || signal.signal === 'NONE') {
  return res.json({ signal: 'NONE', reason: 'No signal' });
}

// 5. Place order
const order = await client.createOrder(...);
```

### In Bot/Polling Mode
```javascript
// Start polling
candleFetcher.startPolling(
  client, symbol, '1h',
  (candles) => {
    // Engine now receives ONLY validated candles
    const signal = engine.getSignal(candles);
    // Trade...
  },
  (error) => {
    // Handle gracefully, polling continues
    console.error('Poll error:', error);
  }
);
```

---

## Risk Register Final Update

| ID | Risk | Implementation | Status |
|---|---|---|---|
| R01 | API key exposure | AES-256-GCM encryption | ✅ CLOSED |
| R02 | Accidental mainnet | Fatal enforcement at startup | ✅ CLOSED |
| R03 | Strategy port errors | Unit tests + crossover logic fix | ✅ CLOSED |
| R04 | Exchange downtime | Circuit breaker + retry | ✅ CLOSED |
| R05 | Runaway loss | Daily drawdown + kill switch | ✅ CLOSED |
| R06 | Bad market data | validateCandles (5 checks) | ✅ CLOSED |
| R07 | Over-leveraged | enforcePositionLimits | ✅ CLOSED |

**All 7/7 risks now closed.** ✅

---

## Summary

**Task 4a (Strategy Engine):**
- ✅ Found critical bug (level comparison instead of crossover)
- ✅ Implemented correct crossover detection with state tracking
- ✅ Added 9 new test scenarios
- ✅ Validated against Pine Script logic
- ✅ R03 **CLOSED**

**Task 4b (Candle Fetcher):**
- ✅ Implemented fetchCandles() — raw fetch + normalize
- ✅ Implemented fetchAndValidate() — fetch + validation (recommended API)
- ✅ Implemented startPolling() — auto-fetch on interval with error isolation
- ✅ Implemented stopPolling() + stopAll() — clean shutdown
- ✅ Full documentation + tests
- ✅ Ready for integration

**Code Quality:**
- ✅ 2 modules (engine.js fixed + candles.js new)
- ✅ 2 test suites (9 new tests + 5 new tests)
- ✅ ~1000 lines of code
- ✅ ~800 lines of documentation
- ✅ 100% syntax validated
- ✅ All manual tests pass

**Status:** Ready for integration testing with testnet Bybit.

---

## Files

**Modified:**
- `server/src/strategy/engine.js` — Crossover logic + state tracking

**New:**
- `server/src/strategy/LOGIC_REVIEW.md` — Issue analysis
- `server/src/strategy/engine.test.js` — Updated with 9 new tests
- `server/src/bybit/candles.js` — CandleFetcher module
- `server/src/bybit/candles.test.js` — Tests
- `server/src/bybit/CANDLES.md` — Documentation

---

## Sign-Off

**Builder:** Brock  
**Lead:** Zane  
**Timestamp:** 2025-05-25 18:45 GMT+2  
**Status:** All tasks complete, all risks closed ✅

**Risk Register: 7/7 CLOSED**

Backend is production-ready for integration testing.
