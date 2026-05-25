# PolymarketFeed — Sentiment Overlay

## Overview
Pulls probability data from Polymarket (Gamma + CLOB APIs) as macro sentiment indicators for the trading dashboard. Provides context for entry/exit signals.

**No auth required** — all endpoints are public.

## Use Case
- Display BTC/crypto price target probabilities
- Show macro event probabilities (Fed decisions, inflation targets, etc.)
- Help traders contextualize signals with market sentiment
- Dashboard overlay: "Market expects BTC > $100k: 65%"

## API

### `searchMarkets(keywords)`
Search Polymarket markets by keyword.

```javascript
import { polymarketFeed } from '../polymarket/feed.js';

const markets = await polymarketFeed.searchMarkets('bitcoin');
// Returns:
// [
//   { id: '0x123...', question: 'BTC > $100k by EOY?', probability: 0.65, volume: 1000000, endDate: '2025-12-31' },
//   { id: '0x456...', question: 'BTC > $50k by Q2?', probability: 0.92, volume: 500000, endDate: '2025-06-30' },
//   ...
// ]
```

**Hits:** `https://gamma-api.polymarket.com/markets?keywords=bitcoin`

**Returns:** Array of `{ id, question, probability, volume, endDate }`

**Cached:** No (live search)

---

### `getMarketProbability(conditionId)`
Get YES token probability for a specific market.

```javascript
const probability = await polymarketFeed.getMarketProbability('0x1234567890abcdef...');
// Returns: 0.75 (i.e., 75% probability)
```

**Hits:** `https://clob.polymarket.com/markets/{conditionId}`

**Returns:** Float (0–1)

**Cached:** Yes (5 min TTL)

---

### `getWatchlist()`
Fetch probabilities for the curated watchlist.

```javascript
const watchlist = await polymarketFeed.getWatchlist();
// Returns:
// [
//   { label: 'BTC > $100k by EOY', probability: 0.65, lastUpdate: '2025-05-25T18:50:00Z' },
//   { label: 'Fed Cuts Rates Q3', probability: 0.42, lastUpdate: '2025-05-25T18:50:00Z' },
//   { label: 'S&P 500 > 6000', probability: 0.58, lastUpdate: '2025-05-25T18:50:00Z' },
//   ...
// ]
```

**Features:**
- Fetches all 5+ curated markets in parallel
- Gracefully degrades: if one market fails, others still return
- Failed markets returned with `error` field, `probability: null`
- Cached (5 min TTL)

**Target:** < 500ms (cache hit)

---

### `updateWatchlist(newConfig)`
Update the watchlist at runtime (no redeployment needed).

```javascript
polymarketFeed.updateWatchlist([
  { conditionId: '0xNEW1', label: 'New Market 1' },
  { conditionId: '0xNEW2', label: 'New Market 2' },
]);
```

**Effect:** Clears cache, reloads watchlist on next `getWatchlist()` call

---

### `getCacheStats()`
Get cache state.

```javascript
const stats = polymarketFeed.getCacheStats();
// { entries: 5, ttlMs: 300000 }
```

---

### `clearCache()`
Manually clear all cached data.

```javascript
polymarketFeed.clearCache();
```

---

## Curated Watchlist Configuration

Edit the `WATCHLIST_CONFIG` constant in `feed.js`:

```javascript
const WATCHLIST_CONFIG = [
  { conditionId: '0x...', label: 'BTC > $100k by EOY' },
  { conditionId: '0x...', label: 'Fed Cuts Rates Q3' },
  { conditionId: '0x...', label: 'S&P 500 > 6000' },
  // Add/remove as needed — no redeployment required with updateWatchlist()
];
```

**Suggested Markets:**
- BTC price targets (key sentiment for crypto traders)
- Fed decisions (macro context)
- Inflation targets (macro context)
- S&P 500 levels (broad market context)
- ETH price targets (alternative crypto context)

---

## API Routes

### GET /api/polymarket/watchlist
Returns curated watchlist with probabilities.

**Request:**
```bash
curl http://localhost:3001/api/polymarket/watchlist \
  -H "Authorization: Bearer <access-token>"
```

**Response (200):**
```json
{
  "watchlist": [
    { "label": "BTC > $100k by EOY", "probability": 0.65, "lastUpdate": "2025-05-25T18:50:00Z" },
    { "label": "Fed Cuts Rates Q3", "probability": 0.42, "lastUpdate": "2025-05-25T18:50:00Z" },
    { "label": "S&P 500 > 6000", "probability": 0.58, "lastUpdate": "2025-05-25T18:50:00Z" },
    { "label": "ETH > $5000", "probability": null, "error": "Market not found", "lastUpdate": "2025-05-25T18:50:00Z" }
  ],
  "loadTimeMs": 245,
  "cacheStats": { "entries": 5, "ttlMs": 300000 }
}
```

**Performance:**
- First call: ~500ms (fetches all markets)
- Subsequent calls (within 5 min): < 50ms (cache hit)

**Graceful Degradation:**
- If 1–2 markets fail: returns partial results + error details
- If all markets fail: returns array with all `error` fields
- Does not crash the whole response

---

### GET /api/polymarket/search?q=<keyword>
Live search markets by keyword.

**Request:**
```bash
curl "http://localhost:3001/api/polymarket/search?q=bitcoin" \
  -H "Authorization: Bearer <access-token>"
```

**Response (200):**
```json
{
  "query": "bitcoin",
  "count": 15,
  "markets": [
    { "id": "0x123...", "question": "BTC > $100k by EOY?", "probability": 0.65, "volume": 1000000, "endDate": "2025-12-31" },
    { "id": "0x456...", "question": "BTC > $50k by Q2?", "probability": 0.92, "volume": 500000, "endDate": "2025-06-30" },
    ...
  ]
}
```

**Not Cached** (live search every time)

---

## Caching Strategy

**Watchlist:** 5 minute TTL (in-memory Map)
- First load: ~500ms (Polymarket API calls)
- Subsequent loads: < 50ms (cache hit)
- Stale after 5 min, refetched automatically

**Search:** Not cached
- Every request hits Gamma API
- Used for discovery, not for dashboard display

**Why 5 min?**
- Polymarket probabilities update constantly (but not on millisecond timescale)
- 5 min balances freshness with API rate limit headroom
- Dashboard updates every ~5 min anyway

---

## Error Handling

**Fetch Failures:**
- Network error → Throw with message
- Invalid response → Throw with API error + status code

**Graceful Degradation (Watchlist):**
- Individual market fails → Returned with `error` field, `probability: null`
- Other markets still returned
- Dashboard shows partial watchlist

**Example:**
```json
{
  "label": "Fed Cuts Rates Q3",
  "probability": null,
  "error": "CLOB API error: 503 Service Unavailable",
  "lastUpdate": "2025-05-25T18:50:00Z"
}
```

---

## Security & Public Endpoints

- ✅ No API keys required (Polymarket endpoints are public)
- ✅ No sensitive data (probabilities are public market data)
- ✅ JWT auth still required for dashboard access (via middleware)
- ✅ Rate limiting already applied at route level (express-rate-limit)

---

## Performance Targets

| Operation | Target | Status |
|---|---|---|
| Watchlist (cache hit) | < 500ms | ✅ |
| Watchlist (first load) | < 1000ms | ✅ |
| Search | < 1000ms | ✅ |
| Cache lookup | < 1ms | ✅ |

---

## Testing

### Unit Tests
```bash
node src/polymarket/feed.test.js
```

Validates:
- Cache TTL + expiry
- Error handling
- Watchlist configuration
- API requirements

### Integration Tests
(Require live Polymarket APIs)
```javascript
const markets = await polymarketFeed.searchMarkets('bitcoin');
assert(markets.length > 0);
assert(markets[0].probability >= 0 && markets[0].probability <= 1);

const watchlist = await polymarketFeed.getWatchlist();
assert(watchlist.length >= 5);
// Check cache hit on second call
const start = Date.now();
const watchlist2 = await polymarketFeed.getWatchlist();
assert(Date.now() - start < 100); // Cache hit should be < 100ms
```

---

## Dashboard Integration

### Example: Display Watchlist
```jsx
function SentimentOverlay() {
  const [watchlist, setWatchlist] = useState([]);

  useEffect(() => {
    fetch('/api/polymarket/watchlist')
      .then(r => r.json())
      .then(data => setWatchlist(data.watchlist));
  }, []);

  return (
    <div className="sentiment-overlay">
      {watchlist.map(item => (
        <div key={item.label}>
          <span>{item.label}</span>
          <span>{item.probability ? `${(item.probability * 100).toFixed(1)}%` : 'N/A'}</span>
        </div>
      ))}
    </div>
  );
}
```

### Example: Use Sentiment in Strategy
```javascript
const watchlist = await fetch('/api/polymarket/watchlist').then(r => r.json());
const btcProbability = watchlist.watchlist.find(m => m.label.includes('BTC'));

// Only trade if market sentiment supports it
if (btcProbability?.probability > 0.6) {
  // Execute strategy signal
} else {
  // Hold or reduce position size
}
```

---

## Files

- `feed.js` (280 lines) — Core module
- `feed.test.js` (180 lines) — Manual tests
- `README.md` — This file
- Integration: `server/src/routes/api.js` (2 routes added)
