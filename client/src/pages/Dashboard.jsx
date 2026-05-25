import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';
import { usePrices } from '../hooks/usePrices';
import { useSignal } from '../hooks/useSignal';
import { PriceCard } from '../components/PriceCard';
import { SignalBadge } from '../components/SignalBadge';
import { RiskPanel } from '../components/RiskPanel';
import { PolymarketPanel } from '../components/PolymarketPanel';
import { SignalLog } from '../components/SignalLog';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: '#0f0f0f',
    color: '#fff',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    backgroundColor: '#1a1a1a',
    borderBottom: '1px solid #333',
  },
  headerTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    letterSpacing: '0.5px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  user: {
    fontSize: '14px',
    color: '#aaa',
  },
  logoutBtn: {
    padding: '8px 16px',
    backgroundColor: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },
  logoutBtnHover: {
    backgroundColor: '#444',
  },
  main: {
    flex: 1,
    padding: '24px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gridAutoRows: 'auto',
    gap: '20px',
    maxWidth: '1400px',
    margin: '0 auto',
    width: '100%',
  },
  pricesSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
    gridColumn: 'span 2',
  },
  signalSection: {
    gridColumn: 'span 1',
    gridRowStart: '1',
  },
  riskSection: {
    gridColumn: 'span 1',
  },
  fullWidth: {
    gridColumn: '1 / -1',
  },
};

export function Dashboard() {
  const { user, logout, accessToken } = useAuth();
  const { prices: wsPrices, latestSignal, isConnected } = useWebSocket(accessToken);
  const { prices } = usePrices(wsPrices);
  const signal = useSignal(latestSignal);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  // Demo prices if not available from API
  const btcPrice = prices.BTC || { price: 80980, change24h: 2.3 };
  const tslaPrice = prices.TSLA || { price: null, change24h: 0 };

  // Parse price objects (could be { price, change24h } or just { BTC: ... })
  const getBtcPrice = () => {
    if (typeof btcPrice === 'object' && 'price' in btcPrice) {
      return btcPrice.price;
    }
    return 80980;
  };

  const getBtcChange = () => {
    if (typeof btcPrice === 'object' && 'change24h' in btcPrice) {
      return btcPrice.change24h;
    }
    return 2.3;
  };

  const getTslaPrice = () => {
    if (typeof tslaPrice === 'object' && 'price' in tslaPrice) {
      return tslaPrice.price;
    }
    return null;
  };

  const getTslaChange = () => {
    if (typeof tslaPrice === 'object' && 'change24h' in tslaPrice) {
      return tslaPrice.change24h;
    }
    return 0;
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerTitle}>🌧️ Rain Man</div>
        <div style={styles.headerRight}>
          <div style={styles.user}>
            {user?.username || 'User'} {!isConnected && '(offline)'}
          </div>
          <button
            style={styles.logoutBtn}
            onClick={handleLogout}
            onMouseEnter={(e) =>
              (e.target.style.backgroundColor = styles.logoutBtnHover.backgroundColor)
            }
            onMouseLeave={(e) =>
              (e.target.style.backgroundColor = styles.logoutBtn.backgroundColor)
            }
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.main}>
        {/* Prices Section */}
        <div style={styles.pricesSection}>
          <PriceCard symbol="BTC/USDT" price={getBtcPrice()} change24h={getBtcChange()} />
          <PriceCard symbol="TSLA/USDT" price={getTslaPrice()} change24h={getTslaChange()} />
        </div>

        {/* Signal Badge */}
        <div style={styles.signalSection}>
          <SignalBadge
            signal={signal.signal}
            cci={signal.cci}
            adx={signal.adx}
            ema={signal.ema}
            timestamp={signal.timestamp}
          />
        </div>

        {/* Risk Panel */}
        <div style={styles.riskSection}>
          <RiskPanel isHalted={false} drawdownPercent={0.0} positionCount={0} />
        </div>

        {/* Polymarket Panel */}
        <div style={styles.fullWidth}>
          <PolymarketPanel />
        </div>

        {/* Signal Log */}
        <div style={styles.fullWidth}>
          <SignalLog />
        </div>
      </main>
    </div>
  );
}
