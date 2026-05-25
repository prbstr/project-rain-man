import ccxt from 'ccxt';
import { decrypt } from '../auth/crypto.js';

/**
 * TESTNET ENFORCEMENT AT STARTUP
 * Prevents accidental mainnet instantiation by design
 */
const BYBIT_TESTNET = process.env.BYBIT_TESTNET !== 'false';

if (!BYBIT_TESTNET && !process.env.BYBIT_MAINNET_ACKNOWLEDGED) {
  throw new Error(
    'FATAL: Mainnet mode detected. Set BYBIT_MAINNET_ACKNOWLEDGED=true only if you explicitly intend mainnet trading. ' +
    'Default is testnet (BYBIT_TESTNET=true). Never disable testnet enforcement in production.'
  );
}

console.log(`[Bybit] Mode: ${BYBIT_TESTNET ? 'TESTNET' : 'MAINNET'}`);

/**
 * Circuit breaker state machine
 * CLOSED → normal operation
 * OPEN → reject calls for 30s (after 3 consecutive failures)
 * HALF_OPEN → allow next call to determine recovery
 */
class CircuitBreaker {
  constructor() {
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failures = 0;
    this.lastFailureTime = null;
    this.openedAt = null;
    this.FAILURE_THRESHOLD = 3;
    this.RECOVERY_WINDOW_MS = 30 * 1000; // 30 seconds
  }

  recordSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      console.log('[CircuitBreaker] ✓ Recovered to CLOSED');
    }
  }

  recordFailure() {
    this.failures += 1;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.FAILURE_THRESHOLD && this.state === 'CLOSED') {
      this.state = 'OPEN';
      this.openedAt = Date.now();
      console.error(
        `[CircuitBreaker] ✗ Opened after ${this.failures} failures. ` +
        `Will retry in ${this.RECOVERY_WINDOW_MS / 1000}s`
      );
    }
  }

  canAttempt() {
    if (this.state === 'CLOSED') return true;

    if (this.state === 'OPEN') {
      const elapsedMs = Date.now() - this.openedAt;
      if (elapsedMs >= this.RECOVERY_WINDOW_MS) {
        this.state = 'HALF_OPEN';
        this.failures = 0;
        console.log('[CircuitBreaker] → HALF_OPEN (testing recovery)');
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow one attempt
    return true;
  }

  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      openedAt: this.openedAt,
    };
  }
}

/**
 * Normalized internal error types
 * Prevents raw ccxt errors from leaking to callers
 */
export class BybitError extends Error {
  constructor(type, message, originalError = null) {
    super(message);
    this.name = 'BybitError';
    this.type = type; // ExchangeDown, RateLimited, AuthFailed, InsufficientFunds, InvalidOrder
    this.originalError = originalError;
  }
}

/**
 * Map ccxt exceptions to normalized error types
 */
function normalizeError(err) {
  if (err instanceof ccxt.RateLimitExceeded) {
    return new BybitError('RateLimited', 'Exchange rate limit hit. Retrying with backoff.', err);
  }
  if (err instanceof ccxt.ExchangeNotAvailable) {
    return new BybitError('ExchangeDown', 'Bybit is temporarily unavailable.', err);
  }
  if (err instanceof ccxt.AuthenticationError) {
    return new BybitError('AuthFailed', 'API credentials are invalid or revoked.', err);
  }
  if (err instanceof ccxt.InsufficientBalance) {
    return new BybitError('InsufficientFunds', 'Account has insufficient funds for this order.', err);
  }
  if (err instanceof ccxt.InvalidOrder) {
    return new BybitError('InvalidOrder', 'Order parameters are invalid.', err);
  }
  // Fallback
  return new BybitError('UnknownError', err.message || 'Unknown error', err);
}

/**
 * Retry helper with exponential backoff
 * Catches RateLimitExceeded and retries up to 3 times
 */
async function withRetry(fn, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!(err instanceof ccxt.RateLimitExceeded)) {
        throw err; // Only retry on rate limits
      }
      if (attempt === maxRetries) break;

      const backoffMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      console.warn(`[Bybit] Rate limited. Retry ${attempt}/${maxRetries} after ${backoffMs}ms`);
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }
  throw lastError;
}

/**
 * Per-user Bybit client factory
 * Decrypts keys and creates a ccxt instance with circuit breaker
 */
export function createBybitClient(encryptedApiKey, encryptedApiSecret, isTestnet = BYBIT_TESTNET) {
  let apiKey, apiSecret;

  // Decrypt keys safely
  try {
    apiKey = decrypt(encryptedApiKey);
    apiSecret = decrypt(encryptedApiSecret);
  } catch (err) {
    throw new BybitError('AuthFailed', 'Failed to decrypt API credentials.', err);
  }

  // Instantiate ccxt Bybit client
  const client = new ccxt.bybit({
    apiKey,
    secret: apiSecret,
    enableRateLimit: true,
    options: {
      defaultType: 'spot', // Default to spot trading
      testnet: isTestnet,
    },
  });

  // Attach circuit breaker to this client instance
  if (!client._circuitBreaker) {
    client._circuitBreaker = new CircuitBreaker();
  }

  // Clear sensitive data from memory after use
  apiKey = null;
  apiSecret = null;

  return client;
}

/**
 * Wrap a ccxt call with circuit breaker and retry logic
 */
export async function executeWithCircuitBreaker(client, fn) {
  const cb = client._circuitBreaker;

  if (!cb.canAttempt()) {
    throw new BybitError(
      'ExchangeDown',
      `Circuit breaker is OPEN. Last failure at ${new Date(cb.lastFailureTime).toISOString()}. ` +
      `Retry in ${Math.ceil((cb.openedAt + cb.RECOVERY_WINDOW_MS - Date.now()) / 1000)}s.`
    );
  }

  try {
    const result = await withRetry(fn);
    cb.recordSuccess();
    return result;
  } catch (err) {
    cb.recordFailure();
    throw normalizeError(err);
  }
}

/**
 * Health check: fetch server time
 * Returns { ok: true, latencyMs } or { ok: false, error }
 */
export async function checkConnection(client) {
  const startMs = Date.now();

  try {
    await executeWithCircuitBreaker(client, () => client.fetchTime());
    const latencyMs = Date.now() - startMs;
    return { ok: true, latencyMs };
  } catch (err) {
    return { ok: false, error: err.message, type: err.type };
  }
}

/**
 * Get current circuit breaker status (for diagnostics)
 */
export function getCircuitBreakerStatus(client) {
  return client._circuitBreaker.getStatus();
}
