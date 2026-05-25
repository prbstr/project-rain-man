import { useState } from 'react';
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
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
  },
  statusActive: {
    color: '#4ade80',
  },
  statusHalted: {
    color: '#ef4444',
  },
  statusIndicator: {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    animation: 'pulse 2s infinite',
  },
  stats: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '16px',
  },
  stat: {
    padding: '12px',
    backgroundColor: '#0a0a0a',
    borderRadius: '6px',
    borderLeft: '2px solid #333',
  },
  statLabel: {
    fontSize: '11px',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: '4px',
  },
  statValue: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#fff',
  },
  drawdownWarning: {
    borderLeftColor: '#ef4444',
  },
  killSwitch: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  killSwitchHover: {
    backgroundColor: '#991b1b',
  },
  killSwitchDisabled: {
    backgroundColor: '#666',
    cursor: 'not-allowed',
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '400px',
    textAlign: 'center',
  },
  modalText: {
    color: '#fff',
    marginBottom: '20px',
    fontSize: '14px',
  },
  modalButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  modalButton: {
    padding: '10px 20px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px',
  },
  modalConfirm: {
    backgroundColor: '#dc2626',
    color: 'white',
  },
  modalCancel: {
    backgroundColor: '#444',
    color: '#fff',
  },
};

export function RiskPanel({ isHalted = false, drawdownPercent = 0, positionCount = 0 }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleKillSwitch = async () => {
    setIsLoading(true);
    setError('');
    try {
      await client.post('/api/risk/kill');
      setShowConfirm(false);
      // Optionally refresh status here
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const statusText = isHalted ? 'HALTED' : 'ACTIVE';
  const statusStyle = isHalted ? styles.statusHalted : styles.statusActive;
  const indicator = isHalted ? '⛔' : '✅';

  return (
    <>
      <div style={styles.panel}>
        <div style={styles.header}>
          <div style={styles.title}>Risk Status</div>
          <div style={{ ...styles.status, ...statusStyle }}>
            {indicator} {statusText}
          </div>
        </div>

        <div style={styles.stats}>
          <div style={styles.stat}>
            <div style={styles.statLabel}>Drawdown Today</div>
            <div style={styles.statValue}>{drawdownPercent.toFixed(2)}%</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statLabel}>Open Positions</div>
            <div style={styles.statValue}>{positionCount}</div>
          </div>
        </div>

        <button
          style={{
            ...styles.killSwitch,
            ...(isLoading ? styles.killSwitchDisabled : {}),
          }}
          onClick={() => setShowConfirm(true)}
          disabled={isLoading}
        >
          🔴 KILL SWITCH
        </button>

        {error && (
          <div
            style={{
              marginTop: '12px',
              padding: '8px',
              backgroundColor: '#7f1d1d',
              color: '#fecaca',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          >
            {error}
          </div>
        )}
      </div>

      {showConfirm && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalText}>
              <strong>EMERGENCY FLATTEN</strong>
              <div style={{ marginTop: '8px' }}>
                Close all open positions immediately?
              </div>
            </div>
            <div style={styles.modalButtons}>
              <button
                style={{ ...styles.modalButton, ...styles.modalConfirm }}
                onClick={handleKillSwitch}
                disabled={isLoading}
              >
                {isLoading ? 'Flattening...' : 'Confirm'}
              </button>
              <button
                style={{ ...styles.modalButton, ...styles.modalCancel }}
                onClick={() => setShowConfirm(false)}
                disabled={isLoading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
