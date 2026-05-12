import { Router } from 'express';
import { getRooms } from '../services/room.js';
import { getMessages } from '../services/message.js';
import { getCommands } from '../services/command.js';
import { getBotStatus } from '../services/bot-bridge.js';
import { getConnectionMode } from '../services/bot-bridge.js';
import { getPlatformContext, setPlatformContext } from '../services/platform-context.js';
import { deploySkill, undeploySkill, listSkills } from '../services/skill-deploy.js';
import { getDb } from '../db/schema.js';
import { verifyToken } from '../services/auth.js';
import { getIo } from '../services/io.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/commands', (_req, res) => {
  res.json(getCommands());
});

router.get('/bot/status', async (_req, res) => {
  const status = await getBotStatus();
  res.json({ ...status, mode: getConnectionMode() });
});

router.get('/rooms/:roomId/messages', (req, res) => {
  const { roomId } = req.params;
  const { threadId, limit, before } = req.query;
  const messages = getMessages(roomId, {
    threadId: threadId as string,
    limit: limit ? parseInt(limit as string) : undefined,
    before: before as string,
  });
  res.json(messages);
});

// ── Platform Context ──

router.get('/platform/context', (_req, res) => {
  const content = getPlatformContext();
  res.json({ content });
});

router.put('/platform/context', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content must be a string' });
  }
  try {
    setPlatformContext(content);
    res.json({ ok: true, length: content.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Skill Deployment ──

// Auth middleware for skill endpoints
function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  req.userId = payload.userId;
  next();
}

function requireBotOwner(req: any, res: any, next: any) {
  const { botId } = req.params;
  const db = getDb();
  const bot = db.prepare('SELECT owner_id FROM bots WHERE bot_id = ?').get(botId) as any;
  if (!bot) {
    return res.status(404).json({ error: 'Bot not found' });
  }
  if (bot.owner_id !== req.userId) {
    return res.status(403).json({ error: 'Not bot owner' });
  }
  next();
}

router.post('/bots/:botId/skills', requireAuth, requireBotOwner, async (req: any, res: any) => {
  const { botId } = req.params;
  const { name, content } = req.body;
  if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9-]+$/.test(name)) {
    return res.status(400).json({ error: 'name must be alphanumeric with hyphens' });
  }
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content is required' });
  }
  if (content.length > 50 * 1024) {
    return res.status(400).json({ error: 'Content exceeds 50KB limit' });
  }
  try {
    const deployment = await deploySkill(botId, name, content, req.userId);
    // Emit socket event
    const io = getIo();
    if (io) {
      io.emit('skill:status', { botId, skillName: name, status: deployment.status, error: deployment.errorMessage });
    }
    res.json(deployment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/bots/:botId/skills', requireAuth, requireBotOwner, (req: any, res: any) => {
  const { botId } = req.params;
  const skills = listSkills(botId);
  res.json(skills);
});

router.delete('/bots/:botId/skills/:name', requireAuth, requireBotOwner, async (req: any, res: any) => {
  const { botId, name } = req.params;
  try {
    const result = await undeploySkill(botId, name, req.userId);
    const io = getIo();
    if (io) {
      io.emit('skill:status', { botId, skillName: name, status: 'removed' });
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
