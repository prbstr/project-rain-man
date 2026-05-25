# RiskGuardian — Risk Management & Enforcement

## Overview
RiskGuardian enforces trading constraints at the business logic level:
- **Daily drawdown limits** — Automatic trading halt if daily loss exceeds threshold
- **Emergency kill switch** — Flatten all positions (cancel orders + close at market)
- **Position limits** — Block trades when max open positions reached
- **Audit logging** — Immutable RiskEvent trail of all enforcement actions

## Features

### 1. Pre-Trade Validation
```javascript
import { canTrade } from '../risk/guardian.js';

const check = await canTrade(userId);
if (!check.allowed) {
  // { allowed: false, reason: "..." }
  return res.status(403).json({ error: check.reason });
}
// Proceed with order...
```

**Checks:**
1. **Halt status** — Is user halted? (haltedUntil in future)
2. **Bot enabled** — Is botEnabled=true in settings?
3. **Position limit** — Open positions < maxOpenPositions?

**Returns:** `{ allowed: true }` or `{ allowed: false, reason: "..." }`

### 1b. Position Limits & Leverage Cap (R07)
```javascript
import { enforcePositionLimits } from '../risk/guardian.js';

const check = await enforcePositionLimits(userId, qty, price, symbol);
if (!check.allowed) {
  return res.status(403).json({ error: check.reason });
}
// { effectiveLeverage: 1.5, allowed: true }
```

**Checks:**
1. **Effective leverage** — `(qty × price) / equity ≤ leverageCap`
2. **Position size** — `(qty × price) / equity × 100 ≤ maxPositionSize %`

**Behavior:**
- Fetches live equity from Bybit (circuit breaker protected)
- Calculates effective leverage and position size
- **Hard block:** No override, no warning — order rejected if either limit exceeded
- Returns clear error message with actual leverage + required cap

**Example:**
```javascript
// User: equity=$10k, leverageCap=2×, maxPositionSize=30%
// Order: 150 shares @ $100 = $15k notional
// Leverage: $15k / $10k = 1.5× → OK (< 2×)
// Position%: 1.5 × 100 = 150% → REJECTED (> 30%)
// Result: "Position size exceeded: 150% > 30% limit. Notional: $15000, Equity: $10000"
```

### 2. Daily Drawdown Calculation
```javascript
import { calculateDailyDrawdown } from '../risk/guardian.js';

const dd = await calculateDailyDrawdown(userId);
// {
//   currentDrawdown: -3.5,  // % change from opening equity
//   openingEquity: 10000,   // first trade's entry cost
//   currentEquity: 9650,    // opening + accumulated P&L
//   trades: [...]           // today's trades
// }
```

- **Baseline:** First trade's entry cost on the day (UTC midnight)
- **Update:** Accumulates P&L from closed positions
- **Returns:** Daily % change (negative = loss)

### 3. Drawdown Enforcement
```javascript
import { enforceDailyDrawdown } from '../risk/guardian.js';

const result = await enforceDailyDrawdown(userId);
// { halted: true, reason: "Daily drawdown exceeded 5% (current: -7.2%)" }
// or
// { halted: false }
```

**Behavior:**
- Calculates daily drawdown
- If `drawdown < 0` AND `|drawdown| > maxDailyDrawdown`:
  - Sets `haltedUntil = now + 24h`
  - Sets `haltReason` string
  - Creates `HALT_DRAWDOWN` RiskEvent
  - Logs action
- If already halted, does nothing (no re-halt)

### 4. Emergency Kill Switch
```javascript
import { emergencyFlattenAll } from '../risk/guardian.js';

const result = await emergencyFlattenAll(userId);
// {
//   success: true,
//   closed: [
//     { symbol: "TSLA", side: "LONG", qty: 10, exitPrice: 234.56, pnl: 100 },
//     ...
//   ],
//   errors: []  // or partial failures
// }
```

**2-Phase Close:**

**Phase 1: Cancel all open orders**
- Fetch open orders per symbol (from user's open trades)
- Cancel each order via ccxt
- Log cancellation (success/error per order)

**Phase 2: Close all open positions**
- For each open trade:
  - Create market order (opposite side, full quantity)
  - Capture exit price and execute P&L
  - Update trade record (status=CLOSED, closedAt)
  - Log close with P&L

**Error handling:**
- Partial failures don't abort remaining closes
- All errors logged in details
- Returns `success=true` if ≥1 position closed OR no positions existed

**Audit:**
- Creates `KILL_SWITCH` RiskEvent with full details (orders, positions, errors)

### 5. Reset Halt
```javascript
import { resetHalt } from '../risk/guardian.js';

const result = await resetHalt(userId);
// { reset: true, reason: "Halt cleared" }
// or
// { reset: false, reason: "Halt still active. 120m remaining." }
```

**Behavior:**
- Check if `haltedUntil` is in the past
- If still active, reject with minutes remaining
- If expired: clear haltedUntil and haltReason, create RESET RiskEvent

### 6. Risk Status
```javascript
import { getRiskStatus } from '../risk/guardian.js';

const status = await getRiskStatus(userId);
// {
//   halted: false,
//   haltedUntil: null,
//   haltReason: null,
//   drawdown: {
//     current: -2.1,        // today's %
//     limit: 5.0,           // maxDailyDrawdown setting
//     exceeded: false
//   },
//   positions: {
//     open: 2,              // count
//     max: 3                // maxOpenPositions setting
//   },
//   botEnabled: true
// }
```

### 7. Audit Logging (Immutable)
```javascript
import { logRiskEvent } from '../risk/guardian.js';

await logRiskEvent(userId, 'KILL_SWITCH', {
  timestamp: '2025-05-25T12:34:56Z',
  closedPositions: [...],
  errors: [...]
});
```

**RiskEventType enum:**
- `KILL_SWITCH` — Emergency flatten triggered
- `HALT_DRAWDOWN` — Daily drawdown limit exceeded
- `HALT_MANUAL` — Manual halt (for future use)
- `RESET` — Halt cleared

**Properties:**
- Immutable: Only CREATE, never UPDATE/DELETE
- Indexed: userId + createdAt (fast audit queries)
- Details: JSON field with context

## API Routes

### GET /api/risk/status
```
Authorization: Bearer <access-token>

Response (200):
{
  "halted": false,
  "haltedUntil": null,
  "drawdown": { "current": -2.1, "limit": 5.0, "exceeded": false },
  "positions": { "open": 2, "max": 3 },
  ...
}
```

### POST /api/risk/kill
```
Authorization: Bearer <access-token>

Response (200):
{
  "success": true,
  "closed": [
    { "symbol": "TSLA", "side": "LONG", "qty": 10, "exitPrice": 234.56, "pnl": 100 },
    { "symbol": "AAPL", "side": "SHORT", "qty": 5, "exitPrice": 180.50, "pnl": -25 }
  ],
  "errors": []
}
```

### POST /api/risk/reset
```
Authorization: Bearer <access-token>

Response (200):
{
  "reset": true,
  "reason": "Halt cleared"
}

Response (400 — if still halted):
{
  "reset": false,
  "reason": "Halt still active. 120m remaining."
}
```

## Database Schema

### UserSettings (extended)
```prisma
model UserSettings {
  id                String   @id @default(cuid())
  userId            String   @unique
  maxDailyDrawdown  Float    @default(5.0)   // % loss limit per day
  maxPositionSize   Float    @default(20.0)  // % of equity per trade
  maxOpenPositions  Int      @default(3)     // position count limit
  botEnabled        Boolean  @default(false) // trading enabled?
  haltedUntil       DateTime?                // when halt expires
  haltReason        String?                  // why halted
  updatedAt         DateTime @updatedAt
  // ... relations
}
```

### RiskEvent (new)
```prisma
model RiskEvent {
  id        String      @id @default(cuid())
  userId    String
  type      RiskEventType
  details   Json?       // context: errors, positions, orders, etc
  createdAt DateTime    @default(now())
  
  @@index([userId, createdAt])
}

enum RiskEventType {
  KILL_SWITCH
  HALT_DRAWDOWN
  HALT_MANUAL
  RESET
}
```

## Integration Points

### 1. Pre-Order Placement
Before creating any order (strategy or manual):

```javascript
// Check 1: General trading eligibility
const check1 = await canTrade(userId);
if (!check1.allowed) {
  return res.status(403).json({ error: check1.reason });
}

// Check 2: Position size & leverage limits (R07)
const check2 = await enforcePositionLimits(userId, qty, price, symbol);
if (!check2.allowed) {
  return res.status(403).json({ error: check2.reason });
}

// Both pass: proceed with order
const order = await client.createOrder(...);
```

**Sequence:** canTrade() → enforcePositionLimits() → place order

### 2. Post-Trade Close
After closing a position:

```javascript
await enforceDailyDrawdown(userId); // Check if drawdown exceeded
```

### 3. Emergency Response
User-triggered or bot-triggered kill switch:

```javascript
const result = await emergencyFlattenAll(userId);
// Logs all actions to KILL_SWITCH RiskEvent
```

## Risk Register Alignment

| Risk | Implementation | Status |
|---|---|---|
| **R05: Runaway loss** | Daily drawdown + 24h halt | ✅ |
| **R05: Kill switch** | emergencyFlattenAll (2-phase) | ✅ |
| **R05: Position limit** | canTrade + maxOpenPositions | ✅ |
| **R06: Bad market data** | validateCandles (strategy/validator.js) | ✅ |
| **R07: Over-leveraged** | enforcePositionLimits (leverage cap) | ✅ |
| **Audit trail** | RiskEvent immutable log | ✅ |

## Error Handling

### Bybit Client Integration
- All exchange calls wrapped with `executeWithCircuitBreaker`
- Rate limits auto-retry with backoff
- Exchange errors mapped to normalized types
- Partial failures in kill switch don't abort remaining closes

### Logging
- All enforcement actions logged:
  ```
  [RiskGuardian] User <id> HALTED: Daily drawdown exceeded 5%
  [RiskGuardian.kill] Cancelled order <id> on TSLA
  [RiskGuardian.kill] Closed position TSLA LONG 10 @ 234.56
  [RiskGuardian] User <id> halt reset
  ```
- RiskEvent audit log captures all details (JSON)

## Testing

### Manual Tests
```bash
cd server
node src/risk/guardian.test.js
```

Validates all logic paths without database.

### Integration Tests
Requires test user + testnet API key:

1. Create user with `maxDailyDrawdown=2%`
2. Open 2 trades
3. Close 1st trade with -3% loss → `GET /api/risk/status` should show halted
4. `POST /api/risk/kill` → expect all positions closed
5. Query RiskEvent log → verify audit trail
6. `POST /api/risk/reset` before 24h → expect error
7. `POST /api/risk/reset` after 24h → expect success

## Security Considerations

1. **Immutable Audit Log** — RiskEvent records never deleted; enables forensic analysis
2. **No plaintext keys** — AES-256-GCM decrypted only for ccxt use
3. **Rate limiting** — Circuit breaker protects against exchange hammering during kill switch
4. **Fail-safe** — Partial failures in kill switch don't silently drop positions
5. **Halt enforcement** — canTrade called before every order; prevents race conditions

## Next Steps

1. Run migration: `npx prisma migrate dev --name add-risk-management`
2. Integrate `canTrade()` check into order placement
3. Call `enforceDailyDrawdown()` after each trade close
4. Monitor RiskEvent logs in production
5. Set up alerts on HALT_DRAWDOWN and KILL_SWITCH events

## Files

- `guardian.js` — Core module (390 lines)
- `guardian.test.js` — Manual test suite (250 lines)
- `README.md` — This file
- `../routes/api.js` — Routes (3 endpoints added)
- `../prisma/schema.prisma` — Schema (UserSettings + RiskEvent)
