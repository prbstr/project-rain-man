# Strategy Engine Logic Review — Task 4a

**Reviewer:** Brock  
**Date:** 2025-05-25  
**Status:** 🔴 ISSUES FOUND (Critical)

---

## Comparison: Pine Script vs. Engine Implementation

### Pine Script Entry Conditions
```pine
longCondition = ta.crossover(cci, cciOversold) and close > ema
shortCondition = ta.crossunder(cci, cciOverbought) and close < ema
```

**Key Point:** Pine Script uses `ta.crossover()` and `ta.crossunder()` — these detect **crossings**, not just level comparisons.

### Engine Implementation
```javascript
const longCondition = cci > params.cciOversold && latestClose > ema;
const shortCondition = cci < params.cciOverbought && latestClose < ema;
```

**Issue:** Engine uses **level comparisons**, not **crossings**.

---

## Issue 1: CCI Crossover Logic ❌

### Problem
- **Pine:** `ta.crossover(cci, -100)` = CCI crosses **from below** -100 to above -100
- **Engine:** `cci > -100` = CCI is **currently above** -100
- **Impact:** Engine will generate LONG signals on every candle where CCI > -100, not just on the crossover

### Example
```
Candle 1: CCI = -95 (just crossed above -100)  → LONG ✓
Candle 2: CCI = -80 (still above -100)         → LONG ✓ (WRONG — should be NONE)
Candle 3: CCI = -70 (still above -100)         → LONG ✓ (WRONG — should be NONE)
```

**Impact:** Engine will generate multiple repeated signals instead of one-shot signals on crossovers.

---

## Issue 2: Missing Crossover Detection ❌

To fix, the engine needs to track **previous CCI value** to detect crossovers:

```javascript
// NOT implemented:
const prevCCI = this.prevCCI ?? null;
const cciCrossoverOversold = prevCCI !== null && prevCCI <= cciOversold && cci > cciOversold;
const cciCrossunderOverbought = prevCCI !== null && prevCCI >= cciOverbought && cci < cciOverbought;

// Then use:
const longCondition = cciCrossoverOversold && latestClose > ema;
const shortCondition = cciCrossunderOverbought && latestClose < ema;
```

**Current Status:** NOT implemented. Engine will not correctly match Pine Script behavior.

---

## Issue 3: Position Sizing — ADX Gate Correctly Implemented ✓

**Pine Script:**
```pine
positionSize = adx > adxThreshold ? baseSize * sizeMultiplier : baseSize
```

**Engine:**
```javascript
const positionSize = adx > params.adxThreshold
  ? baseSize * params.sizeMultiplier
  : baseSize;
```

✅ **Correct.** ADX gate is implemented properly.

---

## Issue 4: Position Sizing — Leverage Floor Correctly Implemented ✓

**Pine Script:**
```pine
positionSizeFinal = math.max(positionSize, 1)
```

**Engine:**
```javascript
positionSize: Math.max(positionSize, 1),
```

✅ **Correct.** Floor of 1 is enforced.

---

## Issue 5: Stop-Loss & Take-Profit — Correct ✓

**Pine Script:**
```pine
stopLossATR = atr * stopLossMultiplier
takeProfitATR = stopLossATR * takeProfitRatio
longSL = useKeltnerForStops ? math.min(..., kcLower) : ...
```

**Engine:**
```javascript
const stopLossATR = atr * params.stopLossMultiplier;
const takeProfitATR = stopLossATR * params.takeProfitRatio;
...
stopLoss = params.useKeltnerForStops
  ? Math.min(entryPrice - stopLossATR, keltner.lower)
  : entryPrice - stopLossATR;
```

✅ **Correct.** Stop-loss and Keltner confluence logic matches.

---

## Issue 6: Trailing Stop — Correctly Implemented ✓

**Pine Script:**
```pine
trail_points = trailStopMultiplier * atr
```

**Engine:**
```javascript
const trailPoints = signal !== 'NONE' ? params.trailStopMultiplier * atr : null;
```

✅ **Correct.** Trailing stop multiplier is implemented.

---

## Summary of Issues

| Issue | Severity | Status | Fix |
|---|---|---|---|
| CCI crossover logic (not just level) | 🔴 CRITICAL | ❌ Missing | Implement crossover detection |
| Previous CCI tracking | 🔴 CRITICAL | ❌ Missing | Store prevCCI between calls |
| ADX gate | 🟢 OK | ✅ Correct | N/A |
| Position sizing floor | 🟢 OK | ✅ Correct | N/A |
| SL/TP logic | 🟢 OK | ✅ Correct | N/A |
| Keltner confluence | 🟢 OK | ✅ Correct | N/A |
| Trailing stop | 🟢 OK | ✅ Correct | N/A |

---

## Test Coverage Analysis

**Current Tests:**
- ✓ Default params initialization
- ✓ CCI calculation (basic)
- ✓ EMA calculation (basic)
- ✓ ADX calculation
- ✓ ATR calculation
- ✓ Keltner channel
- ✓ Signal generation (basic)
- ✓ Signal properties
- ✓ Insufficient candles handling
- ✓ Param overrides

**Missing Tests:**
- ❌ CCI crossover detection (specific to Pine Script logic)
- ❌ Multiple signals in same oversold region (should be only one)
- ❌ Null indicator handling (all return null)
- ❌ Edge case: CCI exactly at threshold
- ❌ Crossover vs. level comparison validation
- ❌ State retention between calls (prevCCI)

---

## Recommendation

### 🔴 R03 Status: **NOT CLOSED** (Logic Error Found)

**Required Before Closure:**
1. Implement crossover detection (not level comparison)
2. Track previous CCI value (maintain state)
3. Add tests for crossover behavior
4. Validate against Pine Script on sample data
5. Test repeated signal suppression

**Severity:** CRITICAL — Engine will generate incorrect signals compared to Pine Script specification.

---

## Proposed Fix

**Option A: Stateful Engine (Recommended)**
```javascript
class StrategyEngine {
  constructor(params = {}) {
    // ... existing code ...
    this.prevCCI = null;
    this.prevClose = null;
  }

  getSignal(candles, overrideParams = {}) {
    // ... calculate indicators ...
    
    // Crossover detection
    const cciCrossoverOversold = 
      this.prevCCI !== null && 
      this.prevCCI <= params.cciOversold && 
      cci > params.cciOversold;
    
    const cciCrossunderOverbought = 
      this.prevCCI !== null && 
      this.prevCCI >= params.cciOverbought && 
      cci < params.cciOverbought;
    
    // Entry conditions
    const longCondition = cciCrossoverOversold && latestClose > ema;
    const shortCondition = cciCrossunderOverbought && latestClose < ema;
    
    // ... rest of logic ...
    
    // Store for next call
    this.prevCCI = cci;
    this.prevClose = latestClose;
    
    return { signal, ... };
  }
}
```

**Option B: Pass Previous State**
```javascript
getSignal(candles, prevCCI = null, overrideParams = {}) {
  // Use prevCCI from caller
  // Return object includes current cci so caller can track state
}
```

**Recommendation:** Option A (stateful) is cleaner for strategy engine usage.

---

## Files to Review/Update

1. `server/src/strategy/engine.js` — Fix crossover logic + state tracking
2. `server/src/strategy/engine.test.js` — Add missing tests
3. `strategy/pine/base-strategy.pine` — Reference (already correct)

---

## Next Steps

1. ✅ Implement crossover detection in engine.js
2. ✅ Add state tracking (prevCCI, prevClose)
3. ✅ Add 5+ tests for crossover behavior
4. ✅ Validate with sample data
5. ✅ Confirm R03 closure or flag remaining issues

**Timeline:** Ready to implement immediately.
