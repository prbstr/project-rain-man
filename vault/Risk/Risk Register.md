# Risk Register

Last updated: 2026-05-25

---

## Active Risks

| ID | Risk | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|---|
| R01 | API key exposure | Low | Critical | Keys in .env only, .gitignore enforced, never logged | ⚠️ Mitigate before any mainnet work |
| R02 | Accidental mainnet order during dev | Medium | High | Testnet-only until explicit mainnet flag set | ⚠️ Enforce from day one |
| R03 | Strategy logic port error (Pine → JS) | Medium | High | Unit test against known OHLCV data before live | 📋 Planned |
| R04 | Exchange downtime / rate limit | Medium | Medium | ccxt handles retries; add circuit breaker | 📋 Planned |
| R05 | Runaway loss without kill switch | Low | Critical | Kill switch in dashboard + daily drawdown limit | 📋 Planned |
| R06 | Corrupted or missing market data | Medium | Medium | Data validation layer before feeding strategy | 📋 Planned |
| R07 | Over-leveraged position in volatile market | Medium | High | Hard cap on position size; leverage limit in code | 📋 Planned |

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
