import { getDb } from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { createInvitation } from './invitation.js';
import type { BotConfig, TriggerType } from './bot-registry.js';

export function shareBot(botId: string, sharedBy: string, sharedTo: string): { share?: any; error?: string } {
  const db = getDb();

  // Verify sharedBy owns the bot
  const bot = db.prepare('SELECT * FROM bots WHERE bot_id = ? AND owner_id = ?').get(botId, sharedBy) as any;
  if (!bot) return { error: 'Bot not found or not owned by you' };

  if (sharedBy === sharedTo) return { error: 'Cannot share bot with yourself' };

  // Check if already shared
  const existing = db.prepare('SELECT * FROM bot_shares WHERE bot_id = ? AND shared_to = ?').get(botId, sharedTo) as any;
  if (existing) return { error: 'Bot already shared with this user' };

  const id = uuid();
  try {
    db.prepare(
      'INSERT INTO bot_shares (id, bot_id, shared_by, shared_to, status) VALUES (?, ?, ?, ?, ?)'
    ).run(id, botId, sharedBy, sharedTo, 'pending');
  } catch (err: any) {
    return { error: err.message };
  }

  // Create invitation
  createInvitation('bot_share', sharedBy, sharedTo, id);

  const share = { id, botId, sharedBy, sharedTo, status: 'pending' };
  return { share };
}

export function acceptBotShare(shareId: string, userId: string): { success: boolean; error?: string; unarchivedRoomId?: string } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM bot_shares WHERE id = ?').get(shareId) as any;
  if (!row) return { success: false, error: 'Share not found' };
  if (row.shared_to !== userId) return { success: false, error: 'Not your share' };
  if (row.status !== 'pending') return { success: false, error: 'Share already ' + row.status };

  db.prepare('UPDATE bot_shares SET status = ? WHERE id = ?').run('accepted', shareId);

  // Check for archived bot room between this user and the bot — unarchive if found
  const archivedRoom = db.prepare(`
    SELECT r.id FROM rooms r
    JOIN room_members rm1 ON r.id = rm1.room_id AND rm1.user_id = ?
    JOIN room_members rm2 ON r.id = rm2.room_id AND rm2.user_id = ?
    WHERE r.type = 'bot' AND r.archived_at IS NOT NULL
    LIMIT 1
  `).get(userId, row.bot_id) as any;

  if (archivedRoom) {
    db.prepare('UPDATE rooms SET archived_at = NULL WHERE id = ?').run(archivedRoom.id);
    return { success: true, unarchivedRoomId: archivedRoom.id };
  }

  return { success: true };
}

export function revokeBotShare(shareId: string, ownerId: string): { success: boolean; error?: string } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM bot_shares WHERE id = ?').get(shareId) as any;
  if (!row) return { success: false, error: 'Share not found' };
  if (row.shared_by !== ownerId) return { success: false, error: 'Not your share to revoke' };

  db.prepare('DELETE FROM bot_shares WHERE id = ?').run(shareId);
  return { success: true };
}

export function getSharedBots(userId: string): BotConfig[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT b.* FROM bot_shares bs
    JOIN bots b ON bs.bot_id = b.bot_id
    WHERE bs.shared_to = ? AND bs.status = 'accepted'
  `).all(userId) as any[];

  return rows.map(row => ({
    id: row.bot_id,
    username: row.username,
    avatarUrl: row.avatar_url || undefined,
    gateway: {
      url: row.gateway_url || undefined,
      authToken: row.auth_token,
      agentId: row.agent_id || undefined,
      sshHost: row.ssh_host || undefined,
    },
    trigger: (row.trigger_type || 'all') as TriggerType,
  }));
}

export function getBotShares(botId: string, ownerId: string): any[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT bs.*, u.username as shared_to_name FROM bot_shares bs
    JOIN users u ON bs.shared_to = u.id
    WHERE bs.bot_id = ? AND bs.shared_by = ?
  `).all(botId, ownerId) as any[];
  return rows.map(r => ({
    id: r.id,
    botId: r.bot_id,
    sharedBy: r.shared_by,
    sharedTo: r.shared_to,
    sharedToName: r.shared_to_name,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export function getPublicBots(): BotConfig[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM bots WHERE is_public = 1').all() as any[];
  return rows.map(row => ({
    id: row.bot_id,
    username: row.username,
    avatarUrl: row.avatar_url || undefined,
    gateway: {
      url: row.gateway_url || undefined,
      authToken: row.auth_token,
      agentId: row.agent_id || undefined,
      sshHost: row.ssh_host || undefined,
    },
    trigger: (row.trigger_type || 'all') as TriggerType,
  }));
}

export function addPublicBotToUser(botId: string, userId: string): { success: boolean; error?: string } {
  const db = getDb();
  const bot = db.prepare('SELECT * FROM bots WHERE bot_id = ? AND is_public = 1').get(botId) as any;
  if (!bot) return { success: false, error: 'Bot not found or not public' };
  if (bot.owner_id === userId) return { success: false, error: 'You already own this bot' };

  const existing = db.prepare('SELECT * FROM bot_shares WHERE bot_id = ? AND shared_to = ?').get(botId, userId) as any;
  if (existing) {
    if (existing.status === 'accepted') return { success: true };
    db.prepare('UPDATE bot_shares SET status = ? WHERE id = ?').run('accepted', existing.id);
    return { success: true };
  }

  const id = uuid();
  db.prepare(
    'INSERT INTO bot_shares (id, bot_id, shared_by, shared_to, status) VALUES (?, ?, ?, ?, ?)'
  ).run(id, botId, bot.owner_id, userId, 'accepted');
  return { success: true };
}
