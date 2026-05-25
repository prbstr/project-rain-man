const styles = {
  card: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '16px',
    minWidth: '140px',
    textAlign: 'center',
  },
  symbol: {
    fontSize: '12px',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: '8px',
  },
  price: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: '8px',
    fontFamily: 'monospace',
  },
  change: {
    fontSize: '14px',
    fontWeight: '600',
  },
  changePositive: {
    color: '#4ade80',
  },
  changeNegative: {
    color: '#ef4444',
  },
  changeNeutral: {
    color: '#999',
  },
  loading: {
    color: '#666',
    fontSize: '14px',
  },
};

export function PriceCard({ symbol, price, change24h }) {
  const isPositive = change24h > 0;
  const isNegative = change24h < 0;

  let changeStyle = styles.changeNeutral;
  if (isPositive) changeStyle = styles.changePositive;
  else if (isNegative) changeStyle = styles.changeNegative;

  const changeSign = isPositive ? '+' : '';
  const changeArrow = isPositive ? '▲' : isNegative ? '▼' : '─';

  return (
    <div style={styles.card}>
      <div style={styles.symbol}>{symbol}</div>
      {price !== null && price !== undefined ? (
        <>
          <div style={styles.price}>${price.toFixed(2)}</div>
          <div style={{ ...styles.change, ...changeStyle }}>
            {changeArrow} {changeSign}{change24h.toFixed(2)}%
          </div>
        </>
      ) : (
        <div style={styles.loading}>─</div>
      )}
    </div>
  );
}
