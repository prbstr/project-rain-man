import { useState, useEffect } from 'react';
import client from '../api/client.js';

const styles = {
  panel: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '20px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: '16px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    textAlign: 'left',
    padding: '8px',
    borderBottom: '2px solid #333',
    color: '#999',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    fontSize: '11px',
  },
  td: {
    padding: '12px 8px',
    borderBottom: '1px solid #333',
    color: '#ccc',
  },
  time: {
    color: '#999',
    fontSize: '12px',
  },
  signal: {
    fontWeight: 'bold',
    padding: '4px 8px',
    borderRadius: '3px',
    display: 'inline-block',
    minWidth: '60px',
    textAlign: 'center',
  },
  signalLong: {
    backgroundColor: '#4ade80',
    color: '#000',
  },
  signalShort: {
    backgroundColor: '#ef4444',
    color: '#fff',
  },
  signalNone: {
    backgroundColor: '#555',
    color: '#ccc',
  },
  price: {
    fontFamily: 'monospace',
    color: '#fff',
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
  empty: {
    color: '#666',
    fontSize: '12px',
    textAlign: 'center',
    padding: '20px',
    fontStyle: 'italic',
  },
};

export function SignalLog() {
  const [trades, setTrades] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTrades = async () => {
      setIsLoading(true);
      setError('');
      try {
        const res = await client.get('/api/trades');
        setTrades((res.data || []).slice(0, 10)); // Last 10
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrades();
  }, []);

  const getSignalStyle = (signal) => {
    if (signal === 'LONG') return styles.signalLong;
    if (signal === 'SHORT') return styles.signalShort;
    return styles.signalNone;
  };

  return (
    <div style={styles.panel}>
      <div style={styles.title}>Recent Signals</div>

      {error && <div style={styles.error}>{error}</div>}

      {isLoading && <div style={styles.loading}>Loading signals...</div>}

      {!isLoading && trades.length === 0 && !error && (
        <div style={styles.empty}>No trades yet</div>
      )}

      {!isLoading && trades.length > 0 && (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Time</th>
              <th style={styles.th}>Signal</th>
              <th style={styles.th}>Symbol</th>
              <th style={styles.th}>Entry Price</th>
              <th style={styles.th}>SL / TP</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <td style={styles.td}>
                  <div style={styles.time}>
                    {new Date(trade.openedAt).toLocaleTimeString()}
                  </div>
                </td>
                <td style={styles.td}>
                  <span
                    style={{
                      ...styles.signal,
                      ...getSignalStyle(trade.signal),
                    }}
                  >
                    {trade.signal === 'LONG' ? '⬆' : trade.signal === 'SHORT' ? '⬇' : '─'} {trade.signal}
                  </span>
                </td>
                <td style={styles.td}>{trade.symbol}</td>
                <td style={{ ...styles.td, ...styles.price }}>
                  ${trade.entryPrice.toFixed(2)}
                </td>
                <td style={styles.td}>
                  <div style={styles.price}>
                    ${trade.stopLoss?.toFixed(2) || '—'} / ${trade.takeProfit?.toFixed(2) || '—'}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
