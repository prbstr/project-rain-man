# Bybit ccxt Integration Module

## Overview
`client.js` wraps the ccxt Bybit exchange adapter with production-grade resilience, security, and operational safety.

## Features

### 1. Testnet Enforcement ✅
- **Default:** TESTNET mode (`BYBIT_TESTNET=true`)
- **Mainnet guard:** Requires explicit `BYBIT_TESTNET=false` AND `BYBIT_MAINNET_ACKNOWLEDGED=true`
- **Behavior:** Throws fatal error at module load if mainnet is attempted without acknowledgment
- **Why:** Prevents accidental live trading on wrong network

```javascript
// Environment setup (testnet — default)
BYBIT_TESTNET=true

// To enable mainnet (extremely careful)
BYBIT_TESTNET=false
BYBIT_MAINNET_ACKNOWLEDGED=true
```

### 2. Per-User Client Factory
```javascript
import { createBybitClient } from '../bybit/client.js';
import { decrypt } from '../auth/crypto.js';

// Decrypt keys from database and create ccxt instance
const client = createBybitClient(encryptedApiKey, encryptedApiSecret, isTestnet);
```

- **Key management:** Decrypts AES-256-GCM encrypted keys from database
- **Isolation:** Each user gets their own ccxt instance
- **Safety:** Keys are never stored in plaintext or logged

### 3. Rate Limit Handling
```javascript
// Automatic retry with exponential backoff
// Catches ccxt.RateLimitExceeded and retries up to 3 times
// Backoff: 1s, 2s, 4s
await executeWithCircuitBreaker(client, () => client.fetchTickers());
```

- **Built-in:** ccxt has `enableRateLimit: true` configured
- **Wrapper:** `withRetry()` catches RateLimitExceeded specifically
- **Logging:** Each retry attempt is logged with backoff duration

### 4. Circuit Breaker
```javascript
// State machine: CLOSED → OPEN → HALF_OPEN → CLOSED
//
// CLOSED (normal):     Accept all calls
// OPEN (broken):       Reject calls for 30 seconds
// HALF_OPEN (testing): Allow next call to test recovery
```

**Thresholds:**
- **Failure threshold:** 3 consecutive failures → OPEN
- **Recovery window:** 30 seconds
- **Recovery:** 1 success in HALF_OPEN → CLOSED

**Usage:**
```javascript
try {
  await executeWithCircuitBreaker(client, async () => {
    return await client.fetchBalance();
  });
} catch (err) {
  if (err.type === 'ExchangeDown') {
    // Handle circuit-breaker rejection
    console.error(`Retry available in ${err.message}`);
  }
}
```

**Logs:**
```
[CircuitBreaker] ✓ Recovered to CLOSED
[CircuitBreaker] ✗ Opened after 3 failures. Will retry in 30s
[CircuitBreaker] → HALF_OPEN (testing recovery)
```

### 5. Error Normalization
All ccxt errors are mapped to 5 internal types:

| Internal Type | ccxt Source | When |
|---|---|---|
| `ExchangeDown` | `ExchangeNotAvailable` | Bybit API is down |
| `RateLimited` | `RateLimitExceeded` | Too many requests (auto-retried) |
| `AuthFailed` | `AuthenticationError` | Invalid API key/secret |
| `InsufficientFunds` | `InsufficientBalance` | Account balance too low |
| `InvalidOrder` | `InvalidOrder` | Order parameters rejected |

**Example:**
```javascript
try {
  await executeWithCircuitBreaker(client, () => client.createOrder(...));
} catch (err) {
  if (err instanceof BybitError) {
    switch (err.type) {
      case 'AuthFailed':
        // Handle auth error
        break;
      case 'ExchangeDown':
        // Handle exchange downtime
        break;
      // ...etc
    }
  }
}
```

### 6. Health Check
```javascript
import { checkConnection } from '../bybit/client.js';

const result = await checkConnection(client);
// { ok: true, latencyMs: 45 } or
// { ok: false, error: "...", type: "ExchangeDown" }
```

- **Endpoint:** Fetches server time from Bybit
- **Timing:** Returns latency in milliseconds
- **Resilience:** Uses circuit breaker internally

### 7. Security & Logging

**Plaintext Key Protection:**
- Keys are decrypted only for ccxt use
- Never logged, even in error messages
- Circuit breaker status is logged (state, failure count, timing)
- No raw ccxt errors leak to API responses

**Logging Examples:**
```
[Bybit] Mode: TESTNET
[Bybit] Rate limited. Retry 1/3 after 1000ms
[CircuitBreaker] ✗ Opened after 3 failures. Will retry in 30s
[CircuitBreaker] → HALF_OPEN (testing recovery)
[CircuitBreaker] ✓ Recovered to CLOSED
```

## API Integration

### GET /api/bybit/status
Health check endpoint using the user's active API key.

**Request:**
```
GET /api/bybit/status
Authorization: Bearer <access-token>
```

**Response (success):**
```json
{
  "status": {
    "ok": true,
    "latencyMs": 42
  },
  "circuitBreaker": {
    "state": "CLOSED",
    "failures": 0,
    "lastFailureTime": null,
    "openedAt": null
  },
  "key": {
    "label": "main-trading",
    "isTestnet": true
  }
}
```

**Response (error):**
```json
{
  "error": "Exchange rate limit hit. Retrying with backoff.",
  "type": "RateLimited"
}
```

## Testing

### Manual Tests
```bash
cd server
node src/bybit/client.test.js
```

Validates:
- ✓ Testnet enforcement
- ✓ Client creation with encrypted keys
- ✓ Circuit breaker state machine
- ✓ Error normalization (5 types)
- ✓ Plaintext key security
- ✓ Status reporting

### Integration Testing
Requires real Bybit testnet API credentials:

1. Create a testnet account at [Bybit testnet](https://testnet.bybit.com)
2. Generate API key with **read** permissions only
3. POST to `/api/keys`:
   ```json
   {
     "exchange": "bybit",
     "label": "test",
     "apiKey": "<key>",
     "apiSecret": "<secret>",
     "isTestnet": true
   }
   ```
4. Call `GET /api/bybit/status` to verify connection

## Risk Mitigation

| Risk | Mitigation | Status |
|---|---|---|
| R02: Accidental mainnet | Testnet enforcement at startup | ✅ |
| R04: Exchange downtime | Circuit breaker + health check | ✅ |
| R06: Bad market data | Validation layer (next task) | ⏳ |
| API key exposure | AES-256-GCM + secure decryption | ✅ |
| Rate limit crashes | Auto-retry with backoff | ✅ |

## Next Steps

1. **Data validation layer** — Validate market data before strategy use
2. **Order validation** — Enforce position limits, drawdown caps
3. **Monitoring & alerts** — Track circuit breaker state, failure patterns
4. **Load testing** — Verify backoff/retry under sustained rate limiting

## Files

- `client.js` — Main module (220 lines)
- `client.test.js` — Manual test suite (190 lines)
- `README.md` — This file
- `../routes/api.js` — Updated with `/api/bybit/status` endpoint
