import { Router } from 'express';
import { getDb } from '../db/schema.js';
import { createMessage } from '../services/message.js';
import { getAllBots } from '../services/bot-registry.js';
import { getRooms } from '../services/room.js';
import { getIo } from '../services/io.js';

const router = Router();

const PUSH_SECRET = process.env.CLAWCHAT_PUSH_SECRET || '';

/**
 * Find the first bot/group room for a given bot.
 * Used as fallback when no `to` is specified.
 */
function getDefaultBotRoom(botId: string): string | null {
  const botRooms = getRooms(botId);
  const room = botRooms.find(r => (r.type === 'bot' || r.type === 'group') && r.name !== 'Notifications' && !r.archivedAt);
  return room?.id || null;
}

/**
 * Resolve the bot ID from optional parameter, defaulting to first bot.
 */
function resolveBotId(botId?: string): string | null {
  if (botId) {
    // Validate bot exists
    const bots = getAllBots();
    const found = bots.find(b => b.id === botId);
    return found ? found.id : null;
  }
  const bots = getAllBots();
  return bots[0]?.id || null;
}

function resolveTargetRoom(to?: string, botId?: string): string | null {
  if (!to) return getDefaultBotRoom(botId || getAllBots()[0]?.id || '');

  const db = getDb();

  const byId = db.prepare('SELECT id FROM rooms WHERE id = ?').get(to) as { id: string } | undefined;
  if (byId) return byId.id;

  const byName = db.prepare('SELECT id FROM rooms WHERE name = ? LIMIT 1').get(to) as { id: string } | undefined;
  if (byName) return byName.id;

  return null;
}

router.post('/push', (req, res) => {
  if (PUSH_SECRET && req.body.secret !== PUSH_SECRET) {
    res.status(401).json({ error: 'Invalid push secret' });
    return;
  }

  const { message, source, to, botId: reqBotId } = req.body as {
    message?: string; source?: string; to?: string; botId?: string;
  };
  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const botId = resolveBotId(reqBotId);
  if (!botId) {
    res.status(404).json({ error: reqBotId ? `Bot not found: ${reqBotId}` : 'No bots configured' });
    return;
  }

  try {
    const roomId = resolveTargetRoom(to, botId);
    if (!roomId) {
      res.status(404).json({ error: `Room not found: ${to || 'default (no rooms for bot)'}` });
      return;
    }

    const content = source ? `**[${source}]**\n\n${message}` : message;

    const msg = createMessage({
      roomId,
      userId: botId,
      content,
    });

    const io = getIo();
    io.to(roomId).emit('message:new', msg);

    console.log(`[Push] Bot ${botId} -> room ${roomId}: ${message.slice(0, 80)}...`);
    res.json({ ok: true, messageId: msg.id, roomId, botId });
  } catch (err: any) {
    console.error('[Push] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
