import 'dotenv/config';

// Prevent unhandled rejections from crashing the server
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled rejection:', reason);
});
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/api.js';
import uploadRouter from './routes/upload.js';
import filesRouter from './routes/files.js';
import authRouter from './routes/auth.js';
import pushRouter from './routes/push.js';
import { setupSocketHandlers, signalShutdown, drainBotStreams } from './socket/handlers.js';
import { shutdown, getConnectionMode } from './services/bot-bridge.js';
import { initBotRegistry, getAllBots, getBridge } from './services/bot-registry.js';
import { initPlatformContext } from './services/platform-context.js';
import { getRooms } from './services/room.js';
import { createMessage } from './services/message.js';
import { setIo } from './services/io.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
// CORS: allow any origin so the client can be deployed separately
app.use(cors());
app.use(express.json());

// API routes
app.use('/api', authRouter);
app.use('/api', apiRouter);
app.use('/api', uploadRouter);
app.use('/api', filesRouter);
app.use('/api', pushRouter);

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

// Make io available to route handlers
setIo(io);

// Initialize platform context (copy example if needed)
initPlatformContext();

// Initialize bot registry (upserts bot users in DB, creates bridges)
initBotRegistry();

setupSocketHandlers(io);

// ── Push notifications: subscribe bot sessions for cron/heartbeat messages ──
async function setupPushNotifications() {
  const bots = getAllBots();
  for (const bot of bots) {
    const bridge = getBridge(bot.id);
    if (!bridge) continue;

    // Set up push message handler
    bridge.onPushMessage = (roomId: string, botId: string, content: string) => {
      console.log(`[Push] Bot ${botId} push to room ${roomId}: ${content.slice(0, 80)}...`);
      const msg = createMessage({
        roomId,
        userId: botId,
        content,
      });
      io.to(roomId).emit('message:new', msg);
    };

    // Restore session mappings for all rooms this bot is a member of
    const botRooms = getRooms(bot.id);
    const roomIds = botRooms.map(r => r.id);
    await bridge.restoreAllRoomSessions(roomIds);
    console.log(`[Push] Bot ${bot.username}: ${roomIds.length} rooms restored for push`);
  }
}

setupPushNotifications().catch(err => {
  console.error('[Push] Setup failed:', err.message);
});

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
let shuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return; // Prevent double shutdown
  shuttingDown = true;
  console.log(`\n🛑 ${signal} received, starting graceful shutdown...`);

  // 1. Stop accepting new connections
  httpServer.close(() => {
    console.log('[Shutdown] HTTP server closed');
  });

  // 2. Signal socket handlers to stop new bot work
  signalShutdown();

  // 3. Wait for active bot streams (max 5s)
  await drainBotStreams(5000);

  // 4. Notify connected clients and close Socket.IO
  io.emit('server:shutdown', { message: 'Server is shutting down' });
  io.close(() => {
    console.log('[Shutdown] Socket.IO closed');
  });

  // 5. Close bot bridge connections
  shutdown();

  // 6. Checkpoint and close database
  const { closeDb } = await import('./db/schema.js');
  closeDb();

  console.log('✅ Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
