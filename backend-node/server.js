require('dotenv').config();
require('express-async-errors');

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const db = require('./db');
const { bus } = require('./bus');

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection (kept process alive):', err);
});

const PORT = process.env.PORT || 5000;
const CORS_ORIGINS_RAW = (process.env.CORS_ORIGINS || '*').trim();
// The `cors` package only treats the literal string "*" as wildcard-allow-all;
// an array containing "*" is matched literally against the Origin header
// (which never equals "*"), silently blocking every cross-origin request.
const CORS_ORIGINS = CORS_ORIGINS_RAW === '*' ? true : CORS_ORIGINS_RAW.split(',').map((origin) => origin.trim());

async function main() {
  await db.connect();
  console.log('Connected to MongoDB, demo data seeded.');

  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: CORS_ORIGINS }));
  app.use(express.json());
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'backend-node', time: new Date().toISOString() });
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { detail: 'Terlalu banyak percobaan login, coba lagi beberapa saat lagi' },
  });
  app.use('/api/auth/login', loginLimiter);

  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/machines', require('./routes/machines'));
  app.use('/api/customers', require('./routes/customers'));
  app.use('/api/vendors', require('./routes/vendors'));
  app.use('/api/stock', require('./routes/stock'));
  app.use('/api/delivery', require('./routes/delivery'));
  app.use('/api/settings', require('./routes/settings'));
  app.use('/api/audit', require('./routes/audit'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/export', require('./routes/export'));

  app.use((req, res) => res.status(404).json({ detail: 'Not found' }));

  // Catches errors thrown/rejected anywhere in the routes above (express-async-errors
  // forwards them here) so a single bad request can never take the whole process down.
  app.use((err, req, res, next) => {
    console.error('Request error:', err);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ detail: 'Terjadi kesalahan pada server' });
  });

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: CORS_ORIGINS } });
  bus.io = io;

  io.on('connection', (socket) => {
    socket.emit('connected', { message: 'Realtime channel ready' });
  });

  server.listen(PORT, () => {
    console.log(`backend-node listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start backend-node:', err);
  process.exit(1);
});
