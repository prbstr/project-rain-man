import './loadEnv.js';
import { startPriceFeed, stopPriceFeed } from './bybit/priceFeed.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import http from 'http';
import { authRouter } from './routes/auth.js';
import { apiRouter } from './routes/api.js';
import { authenticateToken } from './middleware/auth.js';
import { setupWebSocket, initializeWebSocketExports } from './ws/server.js';

const app = express();
const PORT = process.env.PORT || 3001;

// --- Security middleware ---
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

// --- Rate limiting ---
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use(limiter);

// --- Routes ---
app.use('/auth', authLimiter, authRouter);
app.use('/api', authenticateToken, apiRouter);

// --- Health check ---
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

// --- Error handler ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// --- WebSocket setup ---
const server = http.createServer(app);
const ws = setupWebSocket(server);
initializeWebSocketExports(ws);

server.listen(PORT, () => {
  console.log(`Rain Man server running on port ${PORT}`);
  console.log(`WebSocket ready at ws://localhost:${PORT}/ws`);
  startPriceFeed(['BTC/USDT', 'ETH/USDT'], 10000);
});

// --- Graceful shutdown ---
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  stopPriceFeed();
  ws.closeAll();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
