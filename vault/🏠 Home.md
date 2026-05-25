# Project Rain Man

> A systematic, risk-managed trading system targeting Bybit tokenized stocks and crypto markets.

---

## Quick Links

- [[Architecture/System Overview]] — Full system design
- [[Strategy/Base Strategy]] — CCI/EMA/ADX/ATR Pine Script logic
- [[Strategy/Build Order]] — What we're building and in what sequence
- [[Risk/Risk Register]] — Known risks and mitigations
- [[API/Bybit API Reference]] — Endpoints, auth, rate limits
- [[Sessions/2026-05-25]] — First session notes

---

## Status

| Component | Status |
|---|---|
| Vault setup | ✅ Done |
| Tech stack decision | ✅ Locked |
| Pine Script base | ✅ Received (execution block) |
| Monorepo scaffold | ⏳ Next |
| Bybit ccxt connection | ⏳ Pending |
| Strategy port to JS | ⏳ Pending |
| Polymarket feed | ⏳ Pending |
| React dashboard | ⏳ Pending |

---

## Team

| Agent | Role |
|---|---|
| Zane | Lead Financial Analyst & Solution Architect |
| Alex | Implementation |
| Brock | Implementation (resilience & edge cases) |
| Cho | Implementation (frontend & clean backends) |
| Monday | Coordination |
| **Sharad** | **Operator & decision-maker** |

---

## Capital & Market

- **Capital:** Under $5k
- **Primary market:** Bybit tokenized stocks (TSLA, AAPL, NVDA)
- **Leverage:** Up to 10x
- **Polymarket:** Sentiment/probability oracle only
- **Hosting:** Local-first, VPS-ready structure
