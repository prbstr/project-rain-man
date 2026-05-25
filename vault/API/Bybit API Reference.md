# Bybit API Reference

## Endpoints

| Environment | REST Base URL |
|---|---|
| Mainnet | `https://api.bybit.com` |
| Testnet | `https://api-testnet.bybit.com` |

| Environment | WebSocket URL |
|---|---|
| Public (mainnet) | `wss://stream.bybit.com/v5/public` |
| Private (mainnet) | `wss://stream.bybit.com/v5/private` |

> ⚠️ **Testnet first — always. Non-negotiable.**

---

## Authentication

- Method: HMAC-SHA256
- Signature payload: `timestamp + api_key + recv_window + params`
- Keys: stored in `.env` only, never in code or logs

---

## Rate Limits

- Vary by endpoint category (normal vs premium tier)
- ccxt handles rate limiting automatically — do not bypass it
- Monitor `X-Bapi-Limit-Status` headers in production

---

## Key Endpoints

### Market Data
| Endpoint | Purpose |
|---|---|
| `GET /v5/market/tickers` | Latest price, 24h stats |
| `GET /v5/market/kline` | OHLCV candles |
| `GET /v5/market/orderbook` | Order book depth |

### Orders
| Endpoint | Purpose |
|---|---|
| `POST /v5/order/create` | Place order |
| `POST /v5/order/cancel` | Cancel order |
| `GET /v5/order/realtime` | Open orders |
| `GET /v5/order/history` | Order history |

### Positions
| Endpoint | Purpose |
|---|---|
| `GET /v5/position/list` | Open positions |
| `POST /v5/position/set-risk-limit` | Set risk limits |

### Account
| Endpoint | Purpose |
|---|---|
| `GET /v5/account/wallet-balance` | Equity + balance |

---

## Order Types
- `Market` — instant fill at best price
- `Limit` — fills at specified price or better
- `Conditional` — trigger-based (stop orders)
- `Post-only` — maker-only limit orders

## Tokenized Stocks
- Available: TSLA, AAPL, NVDA (and others)
- Trading hours: 24/7 (unlike underlying stocks)
- Leverage: up to 10x
- Margin: USDT-settled perpetuals

---

## WebSocket Streams

### Public (no auth)
- Orderbook: `orderbook.{depth}.{symbol}`
- Trades: `publicTrade.{symbol}`
- Klines: `kline.{interval}.{symbol}`

### Private (auth required)
- Positions: `position`
- Orders: `order`
- Wallet: `wallet`

---

## Error Codes to Know
| Code | Meaning |
|---|---|
| 10001 | Request parameter error |
| 10002 | Invalid timestamp |
| 10003 | Invalid API key |
| 10006 | Rate limit exceeded |
| 110007 | Insufficient balance |

---

## Related
- [[Architecture/System Overview]]
- [[Strategy/Build Order]]
