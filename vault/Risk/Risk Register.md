# Risk Register

Last updated: 2026-05-25

---

## Active Risks

| ID | Risk | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|---|
| R01 | API key exposure | Low | Critical | AES-256-GCM encrypted at rest, never logged | ✅ CLOSED |
| R02 | Accidental mainnet order during dev | Medium | High | Fatal error at module load if BYBIT_TESTNET=true and mainnet attempted | ✅ CLOSED |
| R03 | Strategy logic port error (Pine → JS) | Medium | High | Critical bug found + fixed: level comparison → crossover detection (prevCCI state tracking) | ✅ CLOSED |
| R04 | Exchange downtime / rate limit | Medium | Medium | Circuit breaker (CLOSED→OPEN→HALF_OPEN) + exponential backoff retry | ✅ CLOSED |
| R05 | Runaway loss without kill switch | Low | Critical | Daily drawdown limit + 24h halt + 2-phase emergency flatten all | ✅ CLOSED |
| R06 | Corrupted or missing market data | Medium | Medium | validateCandles() — 5 checks: count, schema, OHLC sanity, gaps, staleness | ✅ CLOSED |
| R07 | Over-leveraged position in volatile market | Medium | High | enforcePositionLimits() — hard blocks on leverageCap + maxPositionSize% | ✅ CLOSED |

---

## Risk Posture Rules (non-negotiable)

1. **Testnet first** — all Bybit integration validated on testnet before any mainnet call
2. **Keys never in code** — .env only, never committed, never logged
3. **Kill switch always available** — dashboard must be able to flatten all positions
4. **Daily drawdown limit** — system stops trading if equity drops X% in a session (threshold TBD with Sharad)
5. **No blind position sizing** — position size always bounded by equity check before order placement

---

## Decisions Needed from Sharad

- [ ] Max daily drawdown % (e.g. 5% of equity = stop for the day)
- [ ] Max single position size (e.g. 20% of capital max per trade)
- [ ] Max concurrent open positions
- [ ] Leverage cap (Bybit allows 10x on tokenized stocks — what's our actual limit?)

---

## Related

- [[Architecture/System Overview]]
- [[Strategy/Build Order]]
