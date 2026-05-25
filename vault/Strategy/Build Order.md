# Build Order

Sequence locked 2026-05-25. Local-first, VPS-ready.

---

## Phase 1 — Foundation

### 1. Monorepo Scaffold
- [ ] Create `~/dev/project-rain-man/` structure
- [ ] `/client`, `/server`, `/strategy` directories
- [ ] `package.json` at root (workspaces)
- [ ] `.env.example`, `.gitignore`
- [ ] `README.md`
- [ ] Git init + GitHub remote

### 2. Bybit Connection (ccxt)
- [ ] Install ccxt in `/server`
- [ ] Connect to Bybit **testnet** first
- [ ] Fetch live price for TSLA/USDT (tokenized stock)
- [ ] Place a test order (testnet)
- [ ] Validate auth flow (HMAC-SHA256)

### 3. Strategy Engine (JS port of Pine Script)
- [ ] Install `technicalindicators`
- [ ] Port CCI, EMA, ADX, ATR calculations
- [ ] Port Keltner Channel (manual)
- [ ] Port entry conditions (longCondition, shortCondition)
- [ ] Port position sizing logic
- [ ] Port SL/TP logic
- [ ] Unit test against known OHLCV data

### 4. Polymarket Feed
- [ ] Research Polymarket API endpoints
- [ ] Fetch relevant markets (BTC price targets, macro events)
- [ ] Parse probability data
- [ ] Expose via `/api/polymarket` endpoint

### 5. React Dashboard
- [ ] Scaffold React app in `/client`
- [ ] Open positions widget
- [ ] P&L chart (recharts)
- [ ] Signal log
- [ ] Polymarket probability panel
- [ ] Kill switch (stop all positions)
- [ ] Parameter controls (live param adjustment)

---

## Phase 2 — Hardening

- [ ] Daily drawdown limit enforcement
- [ ] Position exposure monitor
- [ ] Credential rotation procedure
- [ ] VPS deployment (PM2 + nginx)
- [ ] TradingView webhook receiver

---

## Phase 3 — Optimisation

- [ ] Full Pine Script reconstruction
- [ ] Backtest on 3+ years BTC/ETH data, multiple timeframes
- [ ] Parameter optimisation (walk-forward, not curve-fitting)
- [ ] Regime filter (avoid low-ADX/choppy periods)
- [ ] Polymarket signal integration into entry logic

---

## Related

- [[Architecture/System Overview]]
- [[Strategy/Base Strategy]]
