/**
 * WebSocket Server — Real-time Frontend Feeds
 * 
 * Provides live data feeds to dashboard:
 * - Price updates
 * - Trading signals
 * - Risk events (halt, kill switch, drawdown)
 * 
 * Channels: 'prices', 'signals', 'risk'
 * Auth: JWT token on connect
 * Isolation: Per-user (signal for user A doesn't reach user B)
 */

import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';

/**
 * Connection registry and subscriptions
 * Map: ws instance → { userId, channels: Set, authed: boolean }
 */
const connections = new Map();

/**
 * Setup WebSocket server integrated with Express
 * 
 * @param {http.Server} server — Express server instance
 * @returns {Object} { setupWebSocket, broadcastPrice, broadcastSignal, broadcastRiskEvent }
 */
export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });

  console.log('[WebSocket] Server setup on ws://localhost:3001/ws');

  /**
   * Handle new WebSocket connections
   */
  wss.on('connection', (ws) => {
    const remoteAddr = ws._socket?.remoteAddress || 'unknown';
    console.log(`[WebSocket] New connection from ${remoteAddr}`);

    // Initialize connection state
    const connState = {
      userId: null,
      channels: new Set(),
      authed: false,
      authedAt: null,
    };
    connections.set(ws, connState);

    // Heartbeat: ping every 30s, drop if no pong within 10s
    let isAlive = true;
    ws.isAlive = true;

    const pingInterval = setInterval(() => {
      if (!ws.isAlive) {
        console.log(`[WebSocket] Heartbeat timeout: ${remoteAddr}`);
        clearInterval(pingInterval);
        ws.close(1000, 'Heartbeat timeout');
        connections.delete(ws);
        return;
      }

      ws.isAlive = false;
      ws.ping(() => {
        // ping sent
      });
    }, 30000);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    /**
     * Handle incoming messages
     */
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());

        // First message must be auth
        if (!connState.authed && message.type !== 'auth') {
          console.warn(`[WebSocket] Non-auth first message from ${remoteAddr}`);
          ws.close(1008, 'Auth required');
          return;
        }

        if (message.type === 'auth') {
          handleAuth(ws, message, connState, remoteAddr);
        } else if (message.type === 'subscribe') {
          handleSubscribe(ws, message, connState, remoteAddr);
        } else if (message.type === 'unsubscribe') {
          handleUnsubscribe(ws, message, connState, remoteAddr);
        } else {
          console.warn(`[WebSocket] Unknown message type: ${message.type}`);
        }
      } catch (err) {
        console.error(`[WebSocket] Message parse error:`, err.message);
        ws.close(1011, 'Invalid message');
      }
    });

    /**
     * Handle connection close
     */
    ws.on('close', () => {
      clearInterval(pingInterval);
      connections.delete(ws);
      console.log(`[WebSocket] Connection closed: ${connState.userId || 'unknown'}`);
    });

    /**
     * Handle errors
     */
    ws.on('error', (err) => {
      console.error(`[WebSocket] Error (${connState.userId}):`, err.message);
      connections.delete(ws);
    });

    /**
     * Auth timeout: close connection if no auth within 5s
     */
    const authTimeout = setTimeout(() => {
      if (!connState.authed) {
        console.log(`[WebSocket] Auth timeout: ${remoteAddr}`);
        ws.close(1008, 'Auth timeout');
        connections.delete(ws);
      }
    }, 5000);

    // Clear timeout on auth or close
    const originalOnMessage = ws.onmessage;
    ws.once('message', () => clearTimeout(authTimeout));
    ws.once('close', () => clearTimeout(authTimeout));
  });

  /**
   * Handle auth message
   */
  function handleAuth(ws, message, connState, remoteAddr) {
    const { token } = message;

    if (!token) {
      console.warn(`[WebSocket] Auth without token: ${remoteAddr}`);
      ws.close(1008, 'Token required');
      return;
    }

    try {
      // Verify JWT
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      connState.userId = decoded.sub; // User ID from JWT
      connState.authed = true;
      connState.authedAt = Date.now();

      ws.send(JSON.stringify({
        type: 'auth',
        status: 'ok',
        userId: connState.userId,
      }));

      console.log(`[WebSocket] Authenticated: ${connState.userId}`);
    } catch (err) {
      console.warn(`[WebSocket] Auth failed (${remoteAddr}):`, err.message);
      ws.close(1008, 'Invalid token');
      connections.delete(ws);
    }
  }

  /**
   * Handle subscribe message
   */
  function handleSubscribe(ws, message, connState, remoteAddr) {
    if (!connState.authed) {
      ws.close(1008, 'Not authenticated');
      return;
    }

    const { channels } = message;
    if (!Array.isArray(channels)) {
      console.warn(`[WebSocket] Invalid channels: ${remoteAddr}`);
      ws.close(1008, 'Channels must be an array');
      return;
    }

    // Validate channel names
    const validChannels = new Set(['prices', 'signals', 'risk']);
    for (const channel of channels) {
      if (!validChannels.has(channel)) {
        console.warn(`[WebSocket] Invalid channel: ${channel}`);
        ws.close(1008, `Unknown channel: ${channel}`);
        return;
      }
      connState.channels.add(channel);
    }

    ws.send(JSON.stringify({
      type: 'subscribe',
      status: 'ok',
      channels: Array.from(connState.channels),
    }));

    console.log(
      `[WebSocket] ${connState.userId} subscribed: ${Array.from(connState.channels).join(', ')}`
    );
  }

  /**
   * Handle unsubscribe message
   */
  function handleUnsubscribe(ws, message, connState, remoteAddr) {
    if (!connState.authed) {
      ws.close(1008, 'Not authenticated');
      return;
    }

    const { channels } = message;
    if (!Array.isArray(channels)) {
      ws.close(1008, 'Channels must be an array');
      return;
    }

    for (const channel of channels) {
      connState.channels.delete(channel);
    }

    ws.send(JSON.stringify({
      type: 'unsubscribe',
      status: 'ok',
      channels: Array.from(connState.channels),
    }));

    console.log(
      `[WebSocket] ${connState.userId} unsubscribed. Remaining: ${Array.from(connState.channels).join(', ')}`
    );
  }

  /**
   * Broadcast price update to all 'prices' channel subscribers
   * Only sent to authenticated connections subscribed to 'prices'
   */
  function broadcastPrice(userId, symbol, price, change24h) {
    if (!symbol || price === undefined) {
      console.warn('[broadcastPrice] Missing symbol or price');
      return;
    }

    const message = JSON.stringify({
      type: 'price',
      userId,
      symbol,
      price,
      change24h,
      ts: Date.now(),
    });

    let count = 0;
    for (const [ws, connState] of connections.entries()) {
      if (
        connState.authed &&
        connState.channels.has('prices') &&
        connState.userId === userId // Per-user isolation
      ) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
          count++;
        }
      }
    }

    if (count > 0) {
      console.log(`[broadcastPrice] Sent to ${count} subscribers (${userId}:${symbol})`);
    }
  }

  /**
   * Broadcast trading signal to 'signals' channel subscribers
   * Signal shape matches StrategyEngine.getSignal() output
   */
  function broadcastSignal(userId, signal) {
    if (!signal || !signal.signal) {
      console.warn('[broadcastSignal] Invalid signal object');
      return;
    }

    const message = JSON.stringify({
      type: 'signal',
      userId,
      ...signal,
      ts: Date.now(),
    });

    let count = 0;
    for (const [ws, connState] of connections.entries()) {
      if (
        connState.authed &&
        connState.channels.has('signals') &&
        connState.userId === userId // Per-user isolation
      ) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
          count++;
        }
      }
    }

    if (count > 0) {
      console.log(`[broadcastSignal] Sent to ${count} subscribers (${userId}:${signal.signal})`);
    }
  }

  /**
   * Broadcast risk event to 'risk' channel subscribers
   * Used for halt notifications, kill switch confirmation, drawdown alerts
   */
  function broadcastRiskEvent(userId, event) {
    if (!event || !event.type) {
      console.warn('[broadcastRiskEvent] Invalid event object');
      return;
    }

    const message = JSON.stringify({
      type: 'risk',
      userId,
      ...event,
      ts: Date.now(),
    });

    let count = 0;
    for (const [ws, connState] of connections.entries()) {
      if (
        connState.authed &&
        connState.channels.has('risk') &&
        connState.userId === userId // Per-user isolation
      ) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
          count++;
        }
      }
    }

    if (count > 0) {
      console.log(`[broadcastRiskEvent] Sent to ${count} subscribers (${userId}:${event.type})`);
    }
  }

  /**
   * Gracefully close all connections
   */
  function closeAll() {
    console.log('[WebSocket] Closing all connections...');
    for (const [ws, connState] of connections.entries()) {
      ws.close(1001, 'Server shutting down');
    }
    connections.clear();
    wss.close();
    console.log('[WebSocket] All connections closed');
  }

  return {
    wss,
    broadcastPrice,
    broadcastSignal,
    broadcastRiskEvent,
    closeAll,
  };
}

/**
 * Export singleton functions for use by other modules
 * These are populated by setupWebSocket()
 */
let broadcastPrice = () => {
  console.warn('[broadcastPrice] WebSocket not initialized');
};
let broadcastSignal = () => {
  console.warn('[broadcastSignal] WebSocket not initialized');
};
let broadcastRiskEvent = () => {
  console.warn('[broadcastRiskEvent] WebSocket not initialized');
};
let closeAll = () => {
  console.warn('[closeAll] WebSocket not initialized');
};

/**
 * Initialize exports after setupWebSocket is called
 */
export function initializeWebSocketExports(ws) {
  broadcastPrice = ws.broadcastPrice;
  broadcastSignal = ws.broadcastSignal;
  broadcastRiskEvent = ws.broadcastRiskEvent;
  closeAll = ws.closeAll;
}

export { broadcastPrice, broadcastSignal, broadcastRiskEvent, closeAll };
