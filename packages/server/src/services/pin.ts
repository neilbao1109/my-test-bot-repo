import { v4 as uuid } from 'uuid';
import { getDb } from '../db/schema.js';

export interface PinnedMessage {
  id: string;
  messageId: string;
  roomId: string;
  pinnedBy: string;
  pinnedAt: string;
  // Joined message fields
  content: string;
  userId: string;
  type: string;
  createdAt: string;
}

export function pinMessage(messageId: string, roomId: string, pinnedBy: string): PinnedMessage | null {
  const db = getDb();

  // Check message exists and belongs to room
  const msg = db.prepare('SELECT id FROM messages WHERE id = ? AND room_id = ? AND is_deleted = 0').get(messageId, roomId) as any;
  if (!msg) return null;

  // Upsert: delete any stale record first, then insert fresh
  db.prepare('DELETE FROM pinned_messages WHERE message_id = ?').run(messageId);

  const id = uuid();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO pinned_messages (id, message_id, room_id, pinned_by, pinned_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, messageId, roomId, pinnedBy, now);
  } catch (err: any) {
    console.error('[Pin] Insert failed:', err.message);
    return null;
  }

  return getPinnedMessage(id);
}

export function unpinMessage(messageId: string, roomId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM pinned_messages WHERE message_id = ? AND room_id = ?').run(messageId, roomId);
  return result.changes > 0;
}

export function getPinnedMessages(roomId: string): PinnedMessage[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.id, p.message_id as messageId, p.room_id as roomId, p.pinned_by as pinnedBy, p.pinned_at as pinnedAt,
           m.content, m.user_id as userId, m.type, m.created_at as createdAt
    FROM pinned_messages p
    JOIN messages m ON m.id = p.message_id
    WHERE p.room_id = ? AND m.is_deleted = 0
    ORDER BY p.pinned_at DESC
  `).all(roomId) as PinnedMessage[];
  return rows;
}

function getPinnedMessage(id: string): PinnedMessage | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT p.id, p.message_id as messageId, p.room_id as roomId, p.pinned_by as pinnedBy, p.pinned_at as pinnedAt,
           m.content, m.user_id as userId, m.type, m.created_at as createdAt
    FROM pinned_messages p
    JOIN messages m ON m.id = p.message_id
    WHERE p.id = ?
  `).get(id) as PinnedMessage | undefined;
  return row || null;
}
