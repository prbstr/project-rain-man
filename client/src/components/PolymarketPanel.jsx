import { useState, useEffect } from 'react';
import client from '../api/client.js';

const styles = {
  panel: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#fff',
  },
  refreshBtn: {
    padding: '6px 12px',
    backgroundColor: '#444',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  refreshBtnLoading: {
    backgroundColor: '#666',
    cursor: 'not-allowed',
  },
  market: {
    marginBottom: '12px',
    paddingBottom: '12px',
    borderBottom: '1px solid #333',
  },
  marketLast: {
    borderBottom: 'none',
    marginBottom: 0,
    paddingBottom: 0,
  },
  marketLabel: {
    fontSize: '13px',
    color: '#ccc',
    marginBottom: '6px',
    display: 'flex',
    justifyContent: 'space-between',
  },
  marketProb: {
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#fff',
  },
  barContainer: {
    height: '24px',
    backgroundColor: '#0a0a0a',
    borderRadius: '4px',
    overflow: 'hidden',
    border: '1px solid #333',
  },
  bar: {
    height: '100%',
    backgroundColor: '#3b82f6',
    transition: 'width 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: '8px',
    fontSize: '11px',
    color: '#fff',
    fontWeight: 'bold',
  },
  barHot: {
    backgroundColor: '#ef4444',
  },
  barWarm: {
    backgroundColor: '#f59e0b',
  },
  barCool: {
    backgroundColor: '#3b82f6',
  },
  loading: {
    color: '#666',
    fontSize: '12px',
    textAlign: 'center',
    padding: '20px',
  },
  error: {
    color: '#fecaca',
    fontSize: '12px',
    textAlign: 'center',
    padding: '12px',
    backgroundColor: '#7f1d1d',
    borderRadius: '4px',
  },
};

export function PolymarketPanel() {
  const [markets, setMarkets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchMarkets = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await client.get('/api/polymarket/watchlist');
      setMarkets(res.data.watchlist || []);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMarkets();

    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchMarkets, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getBarStyle = (probability) => {
    if (probability > 0.65) return styles.barHot;
    if (probability > 0.4) return styles.barWarm;
    return styles.barCool;
  };

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Polymarket Signals</div>
          {lastRefresh && (
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
              Updated {lastRefresh.toLocaleTimeString()}
            </div>
          )}
        </div>
        <button
          style={{
            ...styles.refreshBtn,
            ...(isLoading ? styles.refreshBtnLoading : {}),
          }}
          onClick={fetchMarkets}
          disabled={isLoading}
        >
          ↻ Refresh
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {isLoading && <div style={styles.loading}>Loading markets...</div>}

      {!isLoading && markets.length === 0 && !error && (
        <div style={styles.loading}>No markets available</div>
      )}

      {!isLoading &&
        markets.map((market, idx) => (
          <div
            key={idx}
            style={{
              ...styles.market,
              ...(idx === markets.length - 1 ? styles.marketLast : {}),
            }}
          >
            <div style={styles.marketLabel}>
              <span>{market.title || market.label}</span>
              <span style={styles.marketProb}>
                {(market.probability * 100).toFixed(0)}%
              </span>
            </div>
            <div style={styles.barContainer}>
              <div
                style={{
                  ...styles.bar,
                  ...getBarStyle(market.probability),
                  width: `${market.probability * 100}%`,
                }}
              >
                {market.probability > 0.15 && `${(market.probability * 100).toFixed(0)}%`}
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}
