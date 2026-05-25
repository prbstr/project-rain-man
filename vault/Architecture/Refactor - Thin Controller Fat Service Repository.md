# Architecture Refactor: Thin Controller / Fat Service / Repository Pattern

**Decided:** 2026-05-25
**Status:** Planned — execute after demo
**Owner:** Zane (design) → Alex + Brock (implementation)

---

## Why

Current routes mix HTTP parsing, validation, business logic, and Prisma calls in one place. This works at small scale but creates problems as the system grows:

- Can't unit test business logic without spinning up Express
- Can't swap Prisma for anything else without touching business logic
- Auth route is already 84 lines and growing

---

## Target Structure

```
server/src/
├── routes/           → HTTP wiring only (method + path → controller)
├── controllers/      → parse req, validate, call service, send res
├── services/         → business logic, no HTTP concerns
├── repositories/     → all Prisma calls, returns plain objects
├── middleware/       → auth guard, error handler, rate limit
├── auth/             → JWT tokens, AES encryption (stays as-is)
├── bybit/            → ccxt client, candles, price feed (stays as-is)
├── strategy/         → engine, validator (stays as-is)
├── risk/             → guardian (promoted to service layer)
├── polymarket/       → feed (promoted to service layer)
└── ws/               → WebSocket server (stays as-is)
```

---

## Layer Contracts

### Repository — data access only
- Wraps Prisma. Never called from routes or controllers directly.
- Returns plain JS objects, never raw Prisma models.
- Handles `findById`, `findByEmail`, `create`, `update`, `delete`, `list`.
- No business logic. No encryption. No token generation.

```js
// repositories/user.repository.js
export async function findByEmail(email) {
  return prisma.user.findUnique({ where: { email } });
}
export async function create(data) {
  return prisma.user.create({ data });
}
```

### Service — business logic only
- Calls repositories and other services. Never touches `req`/`res`.
- Throws typed errors (`AuthError`, `NotFoundError`, `ValidationError`).
- All crypto, token generation, risk calculations live here.

```js
// services/auth.service.js
export async function login(email, password) {
  const user = await userRepo.findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    throw new AuthError('Invalid credentials');
  return { accessToken: generateAccessToken(user), refreshToken: await generateRefreshToken(user) };
}
```

### Controller — HTTP translation only
- Parse and validate request (Zod).
- Call one service method.
- Map result or error to HTTP response.
- 15–25 lines max per handler.

```js
// controllers/auth.controller.js
export async function login(req, res, next) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const tokens = await authService.login(email, password);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
}
```

### Route — wiring only
```js
// routes/auth.routes.js
import { login, register, refresh, logout } from '../controllers/auth.controller.js';
router.post('/login', login);
router.post('/register', register);
router.post('/refresh', refresh);
router.post('/logout', logout);
```

---

## Domain Breakdown

### Auth domain
| Layer | File | Responsibility |
|---|---|---|
| Repository | `repositories/user.repository.js` | findByEmail, create, findById |
| Repository | `repositories/refreshToken.repository.js` | create, findByToken, delete, deleteByUser |
| Service | `services/auth.service.js` | login, register, refresh, logout, validateToken |
| Controller | `controllers/auth.controller.js` | HTTP handlers |
| Route | `routes/auth.routes.js` | POST /login, /register, /refresh, /logout |

### Keys domain
| Layer | File | Responsibility |
|---|---|---|
| Repository | `repositories/apiKey.repository.js` | upsert, findByUser, deleteById |
| Service | `services/keys.service.js` | saveKey (encrypt), listKeys, deleteKey, getDecrypted |
| Controller | `controllers/keys.controller.js` | HTTP handlers |

### Risk domain
| Layer | File | Responsibility |
|---|---|---|
| Repository | `repositories/userSettings.repository.js` | findByUser, update, setHalt, clearHalt |
| Repository | `repositories/riskEvent.repository.js` | create, findByUser |
| Service | `services/risk.service.js` | canTrade, enforceDrawdown, killSwitch, enforcePositionLimits, resetHalt |
| Controller | `controllers/risk.controller.js` | HTTP handlers |

### Trades domain
| Layer | File | Responsibility |
|---|---|---|
| Repository | `repositories/trade.repository.js` | create, findByUser, close, list |
| Service | `services/trade.service.js` | openTrade, closeTrade, getPnL |
| Controller | `controllers/trades.controller.js` | HTTP handlers |

### Prices domain (no DB)
| Layer | File | Responsibility |
|---|---|---|
| Service | `services/prices.service.js` | Thin wrapper around priceFeed |
| Controller | `controllers/prices.controller.js` | GET /api/prices/latest |

### Polymarket domain (no DB)
| Layer | File | Responsibility |
|---|---|---|
| Service | `services/polymarket.service.js` | Thin wrapper around feed.js |
| Controller | `controllers/polymarket.controller.js` | GET /api/polymarket/watchlist, /search |

---

## Error Handling

Introduce typed errors caught by the global error middleware:

```js
// middleware/errors.js
export class AppError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
export class AuthError extends AppError {
  constructor(msg) { super(msg, 401); }
}
export class NotFoundError extends AppError {
  constructor(msg) { super(msg, 404); }
}
export class ValidationError extends AppError {
  constructor(msg) { super(msg, 400); }
}
export class ConflictError extends AppError {
  constructor(msg) { super(msg, 409); }
}

// Global error handler in index.js
app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
});
```

Services throw typed errors. Controllers pass them to `next()`. No try/catch in every controller — use a `asyncHandler` wrapper:

```js
export const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
```

---

## Migration Strategy

Do this in one PR, domain by domain. Order:

1. **Auth** — highest value, most logic currently in route
2. **Keys** — encryption concern should be in service, not route
3. **Risk** — guardian.js is already service-shaped, just needs wiring
4. **Trades** — straightforward
5. **Prices + Polymarket** — thin wrappers, quick

**Do not** touch `bybit/`, `strategy/`, `ws/` — they're already well-structured modules.

---

## Team Assignment
- **Alex** — repositories layer + auth/keys/trades services + controllers
- **Brock** — risk service refactor (guardian.js → service pattern) + error middleware + asyncHandler
- **Review** — Zane signs off before merge

---

## Definition of Done
- [ ] No Prisma calls outside `repositories/`
- [ ] No `req`/`res` in `services/`
- [ ] No business logic in `controllers/` or `routes/`
- [ ] All existing API behaviour preserved (no breaking changes)
- [ ] Global error handler catches all typed errors
- [ ] Existing tests still pass
