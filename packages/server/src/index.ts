import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/api.js';
import { setupSocketHandlers } from './socket/handlers.js';
import { shutdown, getConnectionMode } from './services/bot-bridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
// CORS: allow any origin so the client can be deployed separately
app.use(cors());
app.use(express.json());

// API routes
app.use('/api', apiRouter);

// Serve static client files in production
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

setupSocketHandlers(io);

// Ensure data directory exists
import fs from 'fs';
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const HOST = process.env.HOST || '0.0.0.0';

httpServer.listen(Number(PORT), HOST, () => {
  const mode = getConnectionMode();
  console.log(`🚀 ClawChat Server running on http://${HOST}:${PORT}`);
  console.log(`🤖 Bot Bridge mode: ${mode}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
