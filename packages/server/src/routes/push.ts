import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { createMessage } from '../services/message.js';
import { createRoom, addMemberToRoom } from '../services/room.js';
import { getAllBots } from '../services/bot-registry.js';
import { getIo } from '../services/io.js';

const router = Router();

const PUSH_SECRET = process.env.CLAWCHAT_PUSH_SECRET || '';
const NOTIFICATIONS_ROOM_NAME = '🔔 Notifications';

/**
 * Find or create the shared Notifications room.
 * All users are added as members so they receive push messages.
 */
function getOrCreateNotificationsRoom(): string {
  const db = getDb();

  // Look for existing Notifications room
  const existing = db.prepare(
    `SELECT id FROM rooms WHERE name = ? LIMIT 1`
  ).get(NOTIFICATIONS_ROOM_NAME) as { id: string } | undefined;

  if (existing) return existing.id;

  // Create it with the first bot as initial member
  const bots = getAllBots();
  const botId = bots[0]?.id || 'bot-clawchat';
  const room = createRoom(NOTIFICATIONS_ROOM_NAME, 'group', [botId]);

  // Add all existing non-bot users
  const users = db.prepare(`SELECT id FROM users WHERE is_bot = 0`).all() as { id: string }[];
  for (const u of users) {
    addMemberToRoom(room.id, u.id);
  }

  console.log(`[Push] Created Notifications room: ${room.id}`);
  return room.id;
}

/**
 * POST /api/push
 *
 * Body: { message: string, secret?: string, source?: string }
 *
 * Inserts a bot message into the 🔔 Notifications room and broadcasts
 * it to all connected clients via Socket.IO.
 */
router.post('/push', (req, res) => {
  // Auth: if CLAWCHAT_PUSH_SECRET is set, require it
  if (PUSH_SECRET && req.body.secret !== PUSH_SECRET) {
    res.status(401).json({ error: 'Invalid push secret' });
    return;
  }

  const { message, source } = req.body as { message?: string; source?: string };
  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const roomId = getOrCreateNotificationsRoom();
    const bots = getAllBots();
    const botId = bots[0]?.id || 'bot-clawchat';

    const content = source ? `**[${source}]**\n\n${message}` : message;

    const msg = createMessage({
      roomId,
      userId: botId,
      content,
    });

    // Broadcast to all clients in the room
    const io = getIo();
    io.to(roomId).emit('message:new', msg);

    // Also emit a notification event for clients not in the room
    io.emit('notification:push', {
      roomId,
      roomName: NOTIFICATIONS_ROOM_NAME,
      message: msg,
    });

    console.log(`[Push] Message delivered to ${NOTIFICATIONS_ROOM_NAME} (${roomId}): ${message.slice(0, 80)}...`);
    res.json({ ok: true, messageId: msg.id, roomId });
  } catch (err: any) {
    console.error('[Push] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
