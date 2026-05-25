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
| Monorepo scaffold | ✅ Done |
| Auth backend (JWT + bcrypt + AES-256) | ✅ Done |
| Bybit ccxt connection | ✅ Done (testnet enforced, circuit breaker) |
| Risk guardian (kill switch + drawdown) | ✅ Done |
| Market data validator | ✅ Done |
| Leverage cap enforcement | ✅ Done |
| OHLCV candle fetcher | ✅ Done (Brock) |
| Strategy engine (CCI/EMA/ADX/ATR port) | ✅ Done (Alex + Brock bug fix) |
| Strategy unit tests (R03) | ✅ Done — critical crossover bug caught + fixed |
| React app scaffold + auth UI | 🔨 Cho (in progress) |
| Polymarket feed | ✅ Done (Brock) |
| WebSocket server (real-time price/signal/risk feeds) | ✅ Done (Brock) |
| React dashboard (positions, P&L, signals) | ⏳ Pending |
| Prisma migration | ⏳ Needs Postgres + .env setup |

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
