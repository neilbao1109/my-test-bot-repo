import { Router } from 'express';
import { getRooms } from '../services/room.js';
import { getMessages } from '../services/message.js';
import { getCommands } from '../services/command.js';
import { getBotStatus } from '../services/bot-bridge.js';
import { getConnectionMode } from '../services/bot-bridge.js';

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

export default router;
