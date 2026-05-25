# Base Strategy — CCI/EMA/ADX/ATR

**Source:** Pine Script execution block provided by Sharad (2026-05-25)
**Status:** Execution block only — needs full reconstruction before backtesting

---

## Logic Summary

### Entry Conditions
```pinescript
longCondition  = ta.crossover(cci, cciOversold)   and close > ema  // Long in uptrend
shortCondition = ta.crossunder(cci, cciOverbought) and close < ema  // Short in downtrend
```
- **Long:** CCI crosses up through oversold threshold AND price is above EMA
- **Short:** CCI crosses down through overbought threshold AND price is below EMA
- EMA acts as the trend filter — no counter-trend trades

### Position Sizing
```pinescript
capital          = strategy.equity
baseSize         = capital * (leverage / 100)
positionSize     = adx > adxThreshold ? baseSize * sizeMultiplier : baseSize
positionSizeFinal = math.max(positionSize, 1)
```
- ADX gates size: trending markets get larger positions
- Leverage-adjusted base size
- Floor of 1 to prevent zero/negative sizing

### Stop-Loss & Take-Profit
```pinescript
stopLossATR    = atr * stopLossMultiplier
takeProfitATR  = stopLossATR * takeProfitRatio

// Adaptive SL — Keltner Channel confluence
longSL  = useKeltnerForStops ? min(avg_price - stopLossATR, kcLower) : avg_price - stopLossATR
shortSL = useKeltnerForStops ? max(avg_price + stopLossATR, kcUpper) : avg_price + stopLossATR

longTP  = avg_price + takeProfitATR
shortTP = avg_price - takeProfitATR
```
- ATR-based stops scale with volatility
- Optional Keltner Channel stops: tighter of ATR stop or KC band
- Trailing stop via `trail_points = trailStopMultiplier * atr`

### Indicators Required
| Indicator | Purpose |
|---|---|
| CCI | Entry momentum signal |
| EMA | Trend filter |
| ADX | Trend strength gate for sizing |
| ATR | Volatility-adjusted stops and trailing |
| Keltner Channel (mid/upper/lower) | Adaptive stop confluence |

---

## What's Missing (to reconstruct full Pine Script)

- [ ] `strategy()` declaration (title, overlay, commission, slippage, initial capital)
- [ ] `input()` declarations for all parameters:
  - cciOversold, cciOverbought, cciLength
  - emaLength
  - adxThreshold, adxLength, sizeMultiplier
  - leverage
  - stopLossMultiplier, takeProfitRatio, trailStopMultiplier
  - useKeltnerForStops (bool)
  - kcLength, kcMultiplier (Keltner params)
- [ ] Indicator calculations (cci, ema, adx, atr, keltner)

---

## JS Port Plan

Library: `technicalindicators` npm package

| Pine Script | JS equivalent |
|---|---|
| `ta.cci()` | `CCI.calculate()` |
| `ta.ema()` | `EMA.calculate()` |
| `ta.adx()` | `ADX.calculate()` |
| `ta.atr()` | `ATR.calculate()` |
| Keltner Channel | Manual: EMA ± (ATR × multiplier) |

---

## Related

- [[Architecture/System Overview]]
- [[Strategy/Build Order]]
- [[API/Bybit API Reference]]
