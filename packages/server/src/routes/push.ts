import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { createMessage } from '../services/message.js';
import { getAllBots } from '../services/bot-registry.js';
import { getRooms } from '../services/room.js';
import { getIo } from '../services/io.js';

const router = Router();

const PUSH_SECRET = process.env.CLAWCHAT_PUSH_SECRET || '';

/**
 * Find the first DM room between the bot and any user.
 * Used as fallback when no `to` is specified.
 */
function getDefaultBotRoom(): string | null {
  const bots = getAllBots();
  const bot = bots[0];
  if (!bot) return null;

  const botRooms = getRooms(bot.id);
  // Prefer DM rooms (1-on-1 with a user), then any room the bot is in
  const dm = botRooms.find(r => r.type === 'dm');
  if (dm) return dm.id;

  // Fallback: first non-archived room
  const any = botRooms.find(r => !r.archivedAt);
  return any?.id || null;
}

function resolveTargetRoom(to?: string): string | null {
  if (!to) return getDefaultBotRoom();

  const db = getDb();

  // Try as room ID first
  const byId = db.prepare('SELECT id FROM rooms WHERE id = ?').get(to) as { id: string } | undefined;
  if (byId) return byId.id;

  // Try as room name
  const byName = db.prepare('SELECT id FROM rooms WHERE name = ? LIMIT 1').get(to) as { id: string } | undefined;
  if (byName) return byName.id;

  return null;
}

router.post('/push', (req, res) => {
  if (PUSH_SECRET && req.body.secret !== PUSH_SECRET) {
    res.status(401).json({ error: 'Invalid push secret' });
    return;
  }

  const { message, source, to } = req.body as { message?: string; source?: string; to?: string };
  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const roomId = resolveTargetRoom(to);
    if (!roomId) {
      res.status(404).json({ error: `Room not found: ${to || 'default (no bot rooms)'}` });
      return;
    }

    const bots = getAllBots();
    const botId = bots[0]?.id || 'bot-clawchat';

    const content = source ? `**[${source}]**\n\n${message}` : message;

    const msg = createMessage({
      roomId,
      userId: botId,
      content,
    });

    const io = getIo();
    io.to(roomId).emit('message:new', msg);

    console.log(`[Push] Message delivered to room ${roomId}: ${message.slice(0, 80)}...`);
    res.json({ ok: true, messageId: msg.id, roomId });
  } catch (err: any) {
    console.error('[Push] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
