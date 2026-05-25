# System Overview

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                  React Frontend                      │
│  - Dashboard: open positions, P&L, signal log        │
│  - Controls: start/stop bot, adjust params           │
│  - Polymarket panel: relevant market probabilities   │
└─────────────────┬───────────────────────────────────┘
                  │ REST + WebSocket
┌─────────────────▼───────────────────────────────────┐
│                 Node.js Backend                      │
│  - Strategy engine (CCI/EMA/ADX/ATR logic)           │
│  - Bybit API integration (orders, positions)         │
│  - Polymarket API (fetch market probabilities)       │
│  - TradingView webhook receiver                      │
│  - SQLite for trade history                          │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Backend runtime | Node.js + Express | Fast, async, JS ecosystem |
| WebSocket | ws | Lightweight, works with Express |
| Exchange integration | ccxt | Handles Bybit auth, rate limits, normalises API |
| Strategy indicators | technicalindicators | CCI, EMA, ADX, ATR — all available |
| Database | better-sqlite3 | Local, no server, fast for time-series logs |
| Frontend | React + recharts | Clean dashboard, good charting |
| Secrets | .env (never committed) | Non-negotiable |

## Monorepo Structure

```
project-rain-man/
├── client/          # React frontend
├── server/          # Node.js backend
│   ├── bybit/       # ccxt integration
│   ├── strategy/    # CCI/EMA/ADX/ATR engine
│   ├── polymarket/  # Probability feed
│   └── db/          # SQLite schema + queries
├── strategy/        # Pine Script originals + JS ports
├── .env.example     # Template — never commit .env
├── .gitignore
└── README.md
```

## Deployment

- **Phase 1:** Local (npm start) — no hosting cost
- **Phase 2:** VPS (PM2 + nginx) — single deployment step from this structure

## Related

- [[Strategy/Base Strategy]]
- [[API/Bybit API Reference]]
- [[Strategy/Build Order]]
