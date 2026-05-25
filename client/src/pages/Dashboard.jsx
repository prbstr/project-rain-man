import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: 'white',
    borderBottom: '1px solid #ddd',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  main: {
    flex: 1,
    padding: '20px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
  },
  card: {
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '12px',
  },
  signalBadge: {
    display: 'inline-block',
    padding: '8px 16px',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  signalLong: {
    backgroundColor: '#d4edda',
    color: '#155724',
  },
  signalShort: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
  },
  signalNone: {
    backgroundColor: '#e2e3e5',
    color: '#383d41',
  },
  riskEventList: {
    listStyle: 'none',
    padding: 0,
  },
  riskEvent: {
    padding: '8px 0',
    borderBottom: '1px solid #eee',
    fontSize: '12px',
  },
  placeholder: {
    color: '#999',
    fontStyle: 'italic',
  },
};

export function Dashboard() {
  const { user, logout, accessToken } = useAuth();
  const { latestSignal, riskEvents, isConnected } = useWebSocket(accessToken);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const getSignalStyle = (signal) => {
    if (signal === 'LONG') return { ...styles.signalBadge, ...styles.signalLong };
    if (signal === 'SHORT') return { ...styles.signalBadge, ...styles.signalShort };
    return { ...styles.signalBadge, ...styles.signalNone };
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.title}>Rain Man</div>
        <div style={styles.headerRight}>
          <div>
            <strong>{user?.username || 'User'}</strong>
          </div>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <main style={styles.main}>
        {/* Signal Status */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Latest Signal</div>
          {latestSignal ? (
            <div>
              <div style={getSignalStyle(latestSignal.signal)}>
                {latestSignal.signal}
              </div>
              <div style={{ marginTop: '12px', fontSize: '12px', color: '#666' }}>
                <div>CCI: {latestSignal.cci?.toFixed(2)}</div>
                <div>ADX: {latestSignal.adx?.toFixed(2)}</div>
                <div>
                  {new Date(latestSignal.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ) : (
            <div style={styles.placeholder}>No signal yet</div>
          )}
          <div style={{ marginTop: '12px', fontSize: '12px', color: isConnected ? '#28a745' : '#dc3545' }}>
            {isConnected ? '● Connected' : '● Disconnected'}
          </div>
        </div>

        {/* Risk Events */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Recent Risk Events</div>
          {riskEvents.length > 0 ? (
            <ul style={styles.riskEventList}>
              {riskEvents.slice(0, 3).map((event) => (
                <li key={event.id} style={styles.riskEvent}>
                  <div><strong>{event.type || 'Event'}</strong></div>
                  <div>{event.message || 'Risk event triggered'}</div>
                  <div style={{ color: '#999' }}>
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div style={styles.placeholder}>No recent events</div>
          )}
        </div>

        {/* Positions Placeholder */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Open Positions</div>
          <div style={styles.placeholder}>Coming soon</div>
        </div>

        {/* P&L Chart Placeholder */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>P&L Overview</div>
          <div style={styles.placeholder}>Coming soon</div>
        </div>

        {/* Settings Placeholder */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Settings</div>
          <div style={styles.placeholder}>Coming soon</div>
        </div>
      </main>
    </div>
  );
}
