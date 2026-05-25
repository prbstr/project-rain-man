const styles = {
  card: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '20px',
    minWidth: '200px',
  },
  badgeContainer: {
    marginBottom: '16px',
  },
  badge: {
    display: 'inline-block',
    padding: '12px 24px',
    borderRadius: '6px',
    fontSize: '18px',
    fontWeight: 'bold',
    minWidth: '120px',
    textAlign: 'center',
  },
  badgeLong: {
    backgroundColor: '#4ade80',
    color: '#000',
  },
  badgeShort: {
    backgroundColor: '#ef4444',
    color: '#fff',
  },
  badgeNone: {
    backgroundColor: '#555',
    color: '#ccc',
  },
  indicators: {
    fontSize: '12px',
    color: '#aaa',
    marginTop: '12px',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  indicator: {
    padding: '8px',
    backgroundColor: '#0a0a0a',
    borderRadius: '4px',
    borderLeft: '2px solid #333',
  },
  label: {
    fontSize: '10px',
    color: '#666',
    textTransform: 'uppercase',
  },
  value: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#fff',
    marginTop: '4px',
  },
  timestamp: {
    fontSize: '11px',
    color: '#666',
    marginTop: '12px',
    fontStyle: 'italic',
  },
};

export function SignalBadge({ signal, cci, adx, ema, timestamp }) {
  let badgeStyle = styles.badgeNone;
  let badgeText = 'NONE';

  if (signal === 'LONG') {
    badgeStyle = styles.badgeLong;
    badgeText = '⬆ LONG';
  } else if (signal === 'SHORT') {
    badgeStyle = styles.badgeShort;
    badgeText = '⬇ SHORT';
  }

  return (
    <div style={styles.card}>
      <div style={styles.badgeContainer}>
        <div style={{ ...styles.badge, ...badgeStyle }}>{badgeText}</div>
      </div>

      <div style={styles.indicators}>
        <div style={styles.indicator}>
          <div style={styles.label}>CCI</div>
          <div style={styles.value}>{cci !== null ? cci.toFixed(1) : '—'}</div>
        </div>
        <div style={styles.indicator}>
          <div style={styles.label}>ADX</div>
          <div style={styles.value}>{adx !== null ? adx.toFixed(1) : '—'}</div>
        </div>
        <div style={styles.indicator}>
          <div style={styles.label}>EMA</div>
          <div style={styles.value}>{ema !== null ? `$${ema.toFixed(2)}` : '—'}</div>
        </div>
      </div>

      {timestamp && (
        <div style={styles.timestamp}>
          {new Date(timestamp).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
