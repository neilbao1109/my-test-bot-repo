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
import authRouter from './routes/auth.js';
import { setupSocketHandlers } from './socket/handlers.js';
import { shutdown, getConnectionMode } from './services/bot-bridge.js';
import { initBotRegistry, getAllBots, getBridge } from './services/bot-registry.js';
import { createRoom, getRooms, addMemberToRoom } from './services/room.js';
import { createMessage } from './services/message.js';
import { getAllUsers } from './services/user.js';

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

// Initialize bot registry (upserts bot users in DB, creates bridges)
initBotRegistry();

setupSocketHandlers(io);

// ── Push notifications: subscribe bot sessions for cron/heartbeat messages ──
async function setupPushNotifications() {
  const bots = getAllBots();
  for (const bot of bots) {
    const bridge = getBridge(bot.id);
    if (!bridge) continue;

    // Find or create a #notifications room for this bot
    const notifRoomName = '🔔 Notifications';
    // Get rooms for the bot user to find existing notifications room
    const botRooms = getRooms(bot.id);
    let notifRoom = botRooms.find(r => r.name === notifRoomName);
    if (!notifRoom) {
      notifRoom = createRoom(notifRoomName, 'dm', [bot.id], bot.id);
      console.log(`[Push] Created notifications room: ${notifRoom.id}`);
    }

    // Ensure all non-bot users are members of the notifications room
    const allUsers = getAllUsers();
    for (const u of allUsers) {
      if (!u.isBot) addMemberToRoom(notifRoom.id, u.id);
    }

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

    // Subscribe the notifications room session
    await bridge.subscribeRoomForPush(notifRoom.id);
    console.log(`[Push] Bot ${bot.username} notifications room ready: ${notifRoom.id}`);
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
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
