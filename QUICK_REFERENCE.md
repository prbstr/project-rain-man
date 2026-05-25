# Rain Man Backend — Quick Reference

## Module Exports & Usage

### 1. Bybit Client (`server/src/bybit/client.js`)

```javascript
import { 
  createBybitClient,      // Factory: decrypt keys, create ccxt instance
  executeWithCircuitBreaker, // Wrap calls with CB + retry
  checkConnection,        // Health check (server time)
  getCircuitBreakerStatus, // CB state query
  BybitError              // Normalized error class
} from '../bybit/client.js';

// Create client
const client = createBybitClient(encKey, encSecret, isTestnet);

// Execute with protection
const balance = await executeWithCircuitBreaker(client, () => 
  client.fetchBalance()
);

// Check health
const { ok, latencyMs } = await checkConnection(client);

// Query CB state
const status = getCircuitBreakerStatus(client);
// { state: 'CLOSED'|'OPEN'|'HALF_OPEN', failures: N, lastFailureTime, openedAt }
```

**Error Types:**
```javascript
try {
  await executeWithCircuitBreaker(client, fn);
} catch (err) {
  if (err instanceof BybitError) {
    // err.type = 'ExchangeDown'|'RateLimited'|'AuthFailed'|'InsufficientFunds'|'InvalidOrder'
    console.error(`[${err.type}] ${err.message}`);
  }
}
```

---

### 2. Risk Guardian (`server/src/risk/guardian.js`)

```javascript
import {
  canTrade,               // Pre-trade check
  calculateDailyDrawdown, // Drawdown calculation
  enforceDailyDrawdown,   // Halt trigger
  emergencyFlattenAll,    // Kill switch
  resetHalt,              // Clear 24h halt
  getRiskStatus,          // Status report (9 fields)
  logRiskEvent            // Audit log
} from '../risk/guardian.js';

// Check before any trade
const check = await canTrade(userId);
if (!check.allowed) {
  return res.status(403).json({ error: check.reason });
}

// After trade close
const dd = await calculateDailyDrawdown(userId);
// { currentDrawdown: -3.5, openingEquity, currentEquity, trades }

const enforced = await enforceDailyDrawdown(userId);
// { halted: true/false, reason?: string }

// Emergency: flatten all
const result = await emergencyFlattenAll(userId);
// { success, closed: [{symbol, side, qty, exitPrice, pnl}, ...], errors: [] }

// Clear halt (only after 24h)
const reset = await resetHalt(userId);
// { reset: true/false, reason: string }

// Full status
const status = await getRiskStatus(userId);
// {
//   halted: boolean,
//   haltedUntil: DateTime,
//   haltReason: string,
//   drawdown: { current: %, limit: %, exceeded: boolean },
//   positions: { open: N, max: M },
//   botEnabled: boolean
// }

// Manual audit log
await logRiskEvent(userId, 'KILL_SWITCH', { ordersApplied: [...], errors: [...] });
```

---

## API Endpoints

### Bybit Integration

**GET /api/bybit/status**
```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/bybit/status
```
Response:
```json
{
  "status": { "ok": true, "latencyMs": 42 },
  "circuitBreaker": { "state": "CLOSED", "failures": 0 },
  "key": { "label": "main", "isTestnet": true }
}
```

### Risk Management

**GET /api/risk/status**
```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/risk/status
```

**POST /api/risk/kill**
```bash
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:3001/api/risk/kill
```

**POST /api/risk/reset**
```bash
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:3001/api/risk/reset
```

---

## Database Models

### UserSettings
```prisma
model UserSettings {
  maxDailyDrawdown Float       @default(5.0)   // % daily loss limit
  maxPositionSize Float        @default(20.0)  // % per position
  maxOpenPositions Int         @default(3)     // position count limit
  botEnabled Boolean           @default(false) // trading on/off
  haltedUntil DateTime?                        // when halt expires
  haltReason String?                           // why halted
}
```

### RiskEvent
```prisma
model RiskEvent {
  id String @id
  userId String
  type RiskEventType          // KILL_SWITCH | HALT_DRAWDOWN | HALT_MANUAL | RESET
  details Json?               // context: errors, positions, etc
  createdAt DateTime
  @@index([userId, createdAt])
}
```

---

## Common Patterns

### Order Placement (template)
```javascript
// 1. Pre-trade check
const check = await canTrade(userId);
if (!check.allowed) return res.status(403).json({ error: check.reason });

// 2. Fetch API key
const apiKey = await prisma.userApiKey.findFirst({
  where: { userId, isActive: true, exchange: 'bybit' }
});

// 3. Create client
const client = createBybitClient(apiKey.apiKeyEnc, apiKey.apiSecretEnc, apiKey.isTestnet);

// 4. Place order (with circuit breaker)
const order = await executeWithCircuitBreaker(client, () =>
  client.createLimitOrder(symbol, side, quantity, price)
);

// 5. Record trade
await prisma.trade.create({
  data: { userId, symbol, side, qty: quantity, entryPrice: order.price, status: 'OPEN' }
});

// 6. Enforce drawdown
await enforceDailyDrawdown(userId);
```

### Position Close (template)
```javascript
// 1. Get trade
const trade = await prisma.trade.findUnique({ where: { id: tradeId } });

// 2. Close via market order
const order = await executeWithCircuitBreaker(client, () =>
  client.createMarketOrder(trade.symbol, oppositeSide, trade.qty)
);

// 3. Calculate P&L
const pnl = calculatePnL(trade, order);

// 4. Update trade record
await prisma.trade.update({
  where: { id: tradeId },
  data: { exitPrice: order.price, pnl, status: 'CLOSED', closedAt: new Date() }
});

// 5. Check drawdown
await enforceDailyDrawdown(userId);
```

### Emergency Response
```javascript
const result = await emergencyFlattenAll(userId);
if (result.success) {
  console.log(`Flattened ${result.closed.length} positions`);
  // Notify user via dashboard/email
} else {
  console.error('Kill switch had errors:', result.errors);
}
```

---

## Configuration

### Environment Variables

```bash
# Required (already set)
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...

# Bybit control
BYBIT_TESTNET=true          # Always true (default)
BYBIT_MAINNET_ACKNOWLEDGED= # Leave empty for testnet

# To enable mainnet (careful!)
BYBIT_TESTNET=false
BYBIT_MAINNET_ACKNOWLEDGED=true
```

### UserSettings Defaults

```javascript
{
  maxDailyDrawdown: 5.0,      // % daily loss limit
  maxPositionSize: 20.0,      // % of equity per trade
  maxOpenPositions: 3,        // max concurrent positions
  botEnabled: false,          // trading disabled by default
  haltedUntil: null,
  haltReason: null
}
```

---

## Monitoring & Debugging

### Circuit Breaker Status
```javascript
const cb = getCircuitBreakerStatus(client);
console.log(cb.state);  // 'CLOSED', 'OPEN', or 'HALF_OPEN'
console.log(cb.failures); // consecutive failure count
```

### Audit Trail
```javascript
const events = await prisma.riskEvent.findMany({
  where: { userId, type: 'KILL_SWITCH' },
  orderBy: { createdAt: 'desc' },
  take: 10
});
```

### Drawdown Tracking
```javascript
const dd = await calculateDailyDrawdown(userId);
console.log(`Current drawdown: ${dd.currentDrawdown.toFixed(2)}%`);
console.log(`Opening equity: ${dd.openingEquity}`);
console.log(`Current equity: ${dd.currentEquity}`);
```

---

## Error Recovery

### Rate Limited (auto-recovered)
```
[Bybit] Rate limited. Retry 1/3 after 1000ms
[Bybit] Rate limited. Retry 2/3 after 2000ms
[Bybit] Rate limited. Retry 3/3 after 4000ms
```
→ No action needed, auto-retry with backoff

### Circuit Breaker Open
```
[CircuitBreaker] ✗ Opened after 3 failures. Will retry in 30s
```
→ Wait 30s, automatically transitions to HALF_OPEN

### Halt Active
```
GET /api/risk/status → { halted: true, haltedUntil: <DateTime> }
POST /api/risk/reset → { reset: false, reason: "Halt still active. 120m remaining." }
```
→ Wait until haltedUntil expires, then POST /api/risk/reset

---

## Deployment Checklist

- [ ] Run `npx prisma migrate dev --name add-risk-management`
- [ ] Set `BYBIT_TESTNET=true` in production environment
- [ ] Integrate `canTrade()` check in order routes
- [ ] Call `enforceDailyDrawdown()` after trade closes
- [ ] Monitor RiskEvent logs for HALT_DRAWDOWN and KILL_SWITCH
- [ ] Set up alerts on high drawdown days
- [ ] Test kill switch with 1-2 positions before live

---

## Support

**Bybit Issues:**
- See `server/src/bybit/README.md`
- Check circuit breaker status via GET /api/bybit/status

**Risk Issues:**
- See `server/src/risk/README.md`
- Query audit trail: `SELECT * FROM risk_events WHERE userId = ? ORDER BY createdAt DESC`

**Questions:**
- Brock (implementation): backend resilience, error handling, audit
- Zane (design): risk thresholds, strategy integration
