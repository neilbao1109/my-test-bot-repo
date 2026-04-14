import { v4 as uuid } from 'uuid';
import { getDb } from '../db/schema.js';
import type { Thread } from '../types.js';

export function createThread(roomId: string, parentMessageId: string): Thread {
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO threads (id, room_id, parent_message_id, reply_count, last_reply_at)
    VALUES (?, ?, ?, 0, ?)
  `).run(id, roomId, parentMessageId, now);

  return { id, roomId, parentMessageId, replyCount: 0, lastReplyAt: now };
}

export function getThread(threadId: string): Thread | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM threads WHERE id = ?').get(threadId) as any;
  if (!row) return null;
  return {
    id: row.id,
    roomId: row.room_id,
    parentMessageId: row.parent_message_id,
    replyCount: row.reply_count,
    lastReplyAt: row.last_reply_at,
  };
}

export function getThreadByMessage(messageId: string): Thread | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM threads WHERE parent_message_id = ?').get(messageId) as any;
  if (!row) return null;
  return {
    id: row.id,
    roomId: row.room_id,
    parentMessageId: row.parent_message_id,
    replyCount: row.reply_count,
    lastReplyAt: row.last_reply_at,
  };
}

export function getThreadsForRoom(roomId: string): Thread[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM threads WHERE room_id = ? ORDER BY last_reply_at DESC').all(roomId) as any[];
  return rows.map(row => ({
    id: row.id,
    roomId: row.room_id,
    parentMessageId: row.parent_message_id,
    replyCount: row.reply_count,
    lastReplyAt: row.last_reply_at,
  }));
}
