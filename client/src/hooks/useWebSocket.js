import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(accessToken) {
  const [prices, setPrices] = useState({});
  const [latestSignal, setLatestSignal] = useState(null);
  const [riskEvents, setRiskEvents] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectDelayRef = useRef(1000); // Start at 1s, exponential backoff

  const closeWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!accessToken) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);
        reconnectDelayRef.current = 1000; // Reset backoff

        // Send auth message
        ws.send(
          JSON.stringify({
            type: 'auth',
            token: accessToken,
          })
        );

        // Subscribe to channels
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            channels: ['prices', 'signals', 'risk'],
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.channel === 'prices') {
            setPrices((prev) => ({
              ...prev,
              [data.symbol]: data.price,
            }));
          } else if (data.channel === 'signals') {
            setLatestSignal({
              signal: data.signal,
              timestamp: data.timestamp,
              cci: data.cci,
              adx: data.adx,
            });
          } else if (data.channel === 'risk') {
            setRiskEvents((prev) => [
              { ...data, id: Date.now() },
              ...prev.slice(0, 9), // Keep last 10
            ]);
          }
        } catch (err) {
          console.error('[WebSocket] Message parse error:', err.message);
        }
      };

      ws.onerror = (event) => {
        console.error('[WebSocket] Error:', event);
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // Exponential backoff reconnect (max 30s)
        const delay = Math.min(reconnectDelayRef.current, 30000);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            30000
          );
          connectWebSocket();
        }, delay);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[WebSocket] Connection error:', err.message);
      setIsConnected(false);
    }
  }, [accessToken]);

  // Connect on mount and when accessToken changes
  useEffect(() => {
    if (accessToken) {
      connectWebSocket();
    }

    return () => {
      closeWebSocket();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [accessToken, connectWebSocket, closeWebSocket]);

  return {
    prices,
    latestSignal,
    riskEvents,
    isConnected,
  };
}
