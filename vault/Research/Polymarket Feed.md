# Polymarket — Information Source

**Role in Rain Man:** Sentiment/probability oracle only. Not a trading venue.

---

## What We're Using It For

Pull market probabilities from Polymarket to use as signal context:
- "Will BTC hit $X by date?" → crowd-sourced probability
- "Will the Fed cut rates?" → macro positioning signal
- Event-driven volatility warnings

These feed into the dashboard as a probability panel, and eventually into entry filters.

---

## Polymarket API

- Base URL: `https://clob.polymarket.com`
- No auth required for public market data
- Key endpoints:
  - `GET /markets` — list markets
  - `GET /markets/{condition_id}` — specific market
  - `GET /prices-history` — price history for a market token

## Gamma Markets API (easier interface)
- Base URL: `https://gamma-api.polymarket.com`
- `GET /markets` — searchable, filterable market list
- Better for discovering relevant markets by keyword

---

## Integration Plan

1. Identify 5–10 relevant markets (BTC price targets, macro events)
2. Fetch probabilities on a schedule (every 5–15 min)
3. Cache in SQLite
4. Expose via `/api/polymarket` endpoint
5. Display in React dashboard panel

---

## Future: Signal Integration

When probabilities cross meaningful thresholds (e.g. Fed cut probability drops below 20%), could gate or bias the strategy — suppress longs on macro uncertainty, etc.

---

## Related
- [[Architecture/System Overview]]
- [[Strategy/Build Order]]
