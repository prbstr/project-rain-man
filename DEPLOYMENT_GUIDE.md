# Deployment Guide — Rain Man Backend

## Pre-Deployment Checklist

### 1. Database Migration
```bash
cd ~/.openclaw/dev/project-rain-man/server
npx prisma migrate dev --name add-risk-management
```

This creates:
- `haltedUntil`, `haltReason` fields in UserSettings table
- RiskEvent table with type enum
- Indexes on userId + createdAt

**Verify:**
```bash
npx prisma studio  # Browse database
# Check: users → settings has halt* fields
# Check: risk_events table exists with type enum
```

### 2. Environment Setup
```bash
# In server/.env (or deployment environment)
BYBIT_TESTNET=true
BYBIT_MAINNET_ACKNOWLEDGED=  # Leave empty for testnet
```

### 3. Dependency Check
```bash
cd server
npm ls ccxt @prisma/client express
# Should all be present from package.json
```

### 4. Syntax Validation
```bash
node --check src/bybit/client.js
node --check src/risk/guardian.js
node --check src/routes/api.js
```

All should return clean (no output).

---

## Testing Before Deploy

### Unit: Manual Test Suites
```bash
cd server

# Bybit module
node src/bybit/client.test.js
# Expected: "All manual tests passed! ✅"

# Risk module
node src/risk/guardian.test.js
# Expected: "All manual tests passed! ✅"
```

### Integration: Bybit Testnet
1. Create Bybit testnet account: https://testnet.bybit.com
2. Generate API key (read-only first):
   - API Key: `xxx...`
   - API Secret: `yyy...`
3. Create test user in database:
   ```javascript
   const user = await prisma.user.create({
     data: {
       email: 'test@example.com',
       username: 'testuser',
       passwordHash: '...',
       settings: {
         create: {
           maxDailyDrawdown: 2.0,  // Low for testing
           maxOpenPositions: 2,
           botEnabled: false
         }
       }
     }
   });
   ```
4. Store API key:
   ```bash
   POST /api/keys
   {
     "exchange": "bybit",
     "label": "testnet",
     "apiKey": "...",
     "apiSecret": "...",
     "isTestnet": true
   }
   ```
5. Test health check:
   ```bash
   GET /api/bybit/status
   # Expected: { ok: true, latencyMs: X, circuitBreaker: { state: 'CLOSED', failures: 0 } }
   ```
6. Test risk status:
   ```bash
   GET /api/risk/status
   # Expected: { halted: false, drawdown: { current: 0, limit: 2 }, positions: { open: 0, max: 2 }, ... }
   ```

### Integration: Kill Switch Test
1. Open 2 test positions (tiny amounts):
   ```bash
   POST /api/orders
   { "symbol": "TSLA", "side": "long", "qty": 0.001, "price": 250 }
   ```
2. Trigger kill switch:
   ```bash
   POST /api/risk/kill
   # Expected: { success: true, closed: [2 positions], errors: [] }
   ```
3. Verify positions closed:
   ```bash
   GET /api/trades
   # All should have status: 'CLOSED', exitPrice, pnl
   ```
4. Verify audit log:
   ```javascript
   const events = await prisma.riskEvent.findMany({
     where: { type: 'KILL_SWITCH' }
   });
   // Should have 1 entry with details { closedPositions: [...] }
   ```

### Integration: Drawdown Halt Test
1. Set `maxDailyDrawdown = 1%` for test user
2. Open trade, close with -2% loss
3. Verify halt triggered:
   ```bash
   GET /api/risk/status
   # Expected: { halted: true, haltReason: "Daily drawdown exceeded 1%..." }
   ```
4. Attempt to trade:
   ```bash
   GET /api/risk/status or any order
   # Expected: { allowed: false, reason: "Trading halted..." }
   ```
5. Try reset before 24h:
   ```bash
   POST /api/risk/reset
   # Expected: { reset: false, reason: "Halt still active. 1440m remaining." }
   ```

---

## Production Deployment

### 1. Environment Variables
```bash
# Deployment system (Vercel, Railway, etc.)
DATABASE_URL=postgresql://...
JWT_ACCESS_SECRET=<strong-random>
JWT_REFRESH_SECRET=<strong-random>
BYBIT_TESTNET=true
PORT=3001
CLIENT_URL=https://frontend.example.com
```

### 2. Deploy Server
```bash
# Build & start
npm install
npm start

# Or with PM2
pm2 start "npm start" --name rain-man-server
```

### 3. Health Check
```bash
curl http://localhost:3001/health
# Expected: { status: 'ok', ts: <timestamp> }
```

### 4. Smoke Tests
```bash
# Auth
POST /auth/login → { accessToken, refreshToken }

# API
GET /api/me → { id, email, username, settings }
GET /api/bybit/status → { status, circuitBreaker, key }
GET /api/risk/status → { halted, drawdown, positions, ... }
```

---

## Monitoring & Alerting

### Logs to Watch

**Circuit Breaker State Changes:**
```
[CircuitBreaker] ✗ Opened after 3 failures. Will retry in 30s
[CircuitBreaker] → HALF_OPEN (testing recovery)
[CircuitBreaker] ✓ Recovered to CLOSED
```

**Risk Enforcement:**
```
[RiskGuardian] User <id> HALTED: Daily drawdown exceeded 5%
[RiskGuardian.kill] Closed position TSLA LONG 10 @ 234.56
[RiskGuardian] User <id> halt reset
```

**Rate Limiting:**
```
[Bybit] Rate limited. Retry 1/3 after 1000ms
```

### Alerts to Set Up

1. **Circuit breaker OPEN** (more than 3 failures):
   - Check Bybit API status
   - Review network connectivity
   - Inspect recent error logs

2. **HALT_DRAWDOWN event**:
   - Notify user immediately
   - Log to analytics
   - Manual review if > 5% drawdown (possible data error)

3. **KILL_SWITCH event**:
   - Audit all closed positions and P&L
   - Verify against user's manual request
   - Check for emergency conditions

4. **Multiple rate limit retries**:
   - May indicate Bybit outage or DDoS
   - Increase backoff timeouts if persistent
   - Check Bybit status page

### Database Queries for Monitoring

**Recent errors:**
```sql
SELECT * FROM risk_events 
WHERE type IN ('KILL_SWITCH', 'HALT_DRAWDOWN') 
ORDER BY createdAt DESC 
LIMIT 20;
```

**Halted users:**
```sql
SELECT id, email, (SELECT haltedUntil, haltReason FROM user_settings WHERE userId = users.id) 
FROM users 
WHERE (SELECT haltedUntil FROM user_settings WHERE userId = users.id) > NOW();
```

**Open positions:**
```sql
SELECT userId, COUNT(*) as open_count, SUM(pnl) as daily_pnl
FROM trades
WHERE status = 'OPEN' AND openedAt > NOW() - INTERVAL 1 day
GROUP BY userId;
```

---

## Rollback Plan

### If Bybit Integration Broken
1. Set `BYBIT_TESTNET=false` → Module fails to load (catches mainnet errors)
2. Check circuit breaker logs
3. Verify Bybit API status
4. Rollback code if needed:
   ```bash
   git revert <commit-hash>
   npm start
   ```

### If Database Migration Failed
```bash
npx prisma migrate resolve --rolled-back add-risk-management
# Or manually:
npx prisma migrate dev --name rollback-risk-management
```

### If Risk Halt System Broken
- Users halted by bug: manually update database
  ```sql
  UPDATE user_settings SET haltedUntil = NULL, haltReason = NULL WHERE userId = '<id>';
  INSERT INTO risk_events (userId, type, details, createdAt) VALUES ('<id>', 'RESET', '{"reason":"manual_override"}', NOW());
  ```

---

## Maintenance Tasks

### Daily
- Monitor circuit breaker state (should be CLOSED most of time)
- Check for new HALT_DRAWDOWN events
- Verify no stuck halt windows (haltedUntil > now)

### Weekly
- Query RiskEvent table for patterns
- Review error logs (rate limits, network)
- Verify kill switch works with 1-2 test positions

### Monthly
- Update Bybit ccxt library (`npm update ccxt`)
- Review drawdown limits with Zane (adjust if needed)
- Audit RiskEvent logs for compliance

---

## Support & Escalation

### Bybit Issues
- Check circuit breaker status: GET /api/bybit/status
- Verify testnet vs mainnet: grep BYBIT_TESTNET .env
- Check API key permissions (read/write)
- Contact: See `server/src/bybit/README.md`

### Risk System Issues
- Check halt status: GET /api/risk/status
- Query audit trail: SELECT * FROM risk_events WHERE userId = ?
- Verify settings: SELECT * FROM user_settings WHERE userId = ?
- Contact: See `server/src/risk/README.md`

### Escalation Path
1. Check logs + database
2. Refer to module README
3. Contact Brock (implementation)
4. Escalate to Zane (architecture/design)

---

## Quick Start (TL;DR)

```bash
# 1. Migrate database
cd ~/.openclaw/dev/project-rain-man/server
npx prisma migrate dev --name add-risk-management

# 2. Verify syntax
node --check src/bybit/client.js src/risk/guardian.js src/routes/api.js

# 3. Run unit tests
node src/bybit/client.test.js
node src/risk/guardian.test.js

# 4. Start server
npm start

# 5. Test endpoints
curl http://localhost:3001/health
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/risk/status
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/bybit/status

# 6. Monitor logs
tail -f logs/app.log | grep -E "(CircuitBreaker|RiskGuardian|Bybit)"
```

---

## Sign-Off

**Builder:** Brock  
**Lead:** Zane  
**Date:** 2025-05-25  
**Status:** Ready for production deployment ✅

All tests pass, documentation complete, error handling robust.
