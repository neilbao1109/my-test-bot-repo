import { v4 as uuid } from 'uuid';
import { getDb } from '../db/schema.js';
import type { Message } from '../types.js';

export function createMessage(params: {
  roomId: string;
  userId: string;
  content: string;
  type?: Message['type'];
  threadId?: string;
  replyTo?: string;
  contextIds?: string[];
}): Message {
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();
  const contextIdsJson = params.contextIds && params.contextIds.length > 0 ? JSON.stringify(params.contextIds) : null;
  // For backward compat, set reply_to to first context id if not explicitly provided
  const replyTo = params.replyTo || (params.contextIds && params.contextIds.length > 0 ? params.contextIds[0] : null);

  db.prepare(`
    INSERT INTO messages (id, room_id, thread_id, user_id, content, type, reply_to, context_ids, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, params.roomId, params.threadId || null, params.userId, params.content, params.type || 'text', replyTo || null, contextIdsJson, now, now);

  // Update thread reply count if in a thread
  if (params.threadId) {
    db.prepare(`
      UPDATE threads SET reply_count = reply_count + 1, last_reply_at = ? WHERE id = ?
    `).run(now, params.threadId);
  }

  return {
    id,
    roomId: params.roomId,
    threadId: params.threadId || null,
    userId: params.userId,
    content: params.content,
    type: params.type || 'text',
    replyTo: replyTo || null,
    contextIds: params.contextIds || [],
    reactions: {},
    isEdited: false,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function getMessages(roomId: string, options?: {
  threadId?: string;
  limit?: number;
  before?: string;
}): Message[] {
  const db = getDb();
  const limit = options?.limit || 50;

  let query = 'SELECT * FROM messages WHERE room_id = ? AND is_deleted = 0';
  const params: any[] = [roomId];

  if (options?.threadId) {
    query += ' AND thread_id = ?';
    params.push(options.threadId);
  } else {
    query += ' AND thread_id IS NULL';
  }

  if (options?.before) {
    query += ' AND created_at < ?';
    params.push(options.before);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(query).all(...params) as any[];
  return rows.reverse().map(rowToMessage);
}

export function editMessage(messageId: string, content: string): Message | null {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE messages SET content = ?, is_edited = 1, updated_at = ? WHERE id = ?
  `).run(content, now, messageId);

  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as any;
  return row ? rowToMessage(row) : null;
}

export function deleteMessage(messageId: string): boolean {
  const db = getDb();
  const result = db.prepare('UPDATE messages SET is_deleted = 1 WHERE id = ?').run(messageId);
  return result.changes > 0;
}

export function addReaction(messageId: string, emoji: string, userId: string): Record<string, string[]> {
  const db = getDb();
  const row = db.prepare('SELECT reactions FROM messages WHERE id = ?').get(messageId) as any;
  if (!row) return {};

  const reactions = JSON.parse(row.reactions);
  if (!reactions[emoji]) reactions[emoji] = [];

  const idx = reactions[emoji].indexOf(userId);
  if (idx >= 0) {
    reactions[emoji].splice(idx, 1);
    if (reactions[emoji].length === 0) delete reactions[emoji];
  } else {
    reactions[emoji].push(userId);
  }

  db.prepare('UPDATE messages SET reactions = ? WHERE id = ?').run(JSON.stringify(reactions), messageId);
  return reactions;
}

export function searchMessages(query: string, options: {
  roomId?: string;
  roomIds?: string[];
  limit?: number;
}): { results: Message[]; total: number } {
  const db = getDb();
  const limit = options.limit || 50;
  const searchTerm = `%${query}%`;

  let countQuery: string;
  let dataQuery: string;
  const params: any[] = [];

  if (options.roomId) {
    countQuery = `SELECT COUNT(*) as total FROM messages WHERE room_id = ? AND is_deleted = 0 AND type = 'text' AND thread_id IS NULL AND content LIKE ? COLLATE NOCASE`;
    dataQuery = `SELECT * FROM messages WHERE room_id = ? AND is_deleted = 0 AND type = 'text' AND thread_id IS NULL AND content LIKE ? COLLATE NOCASE ORDER BY created_at DESC LIMIT ?`;
    params.push(options.roomId, searchTerm);
  } else if (options.roomIds && options.roomIds.length > 0) {
    const placeholders = options.roomIds.map(() => '?').join(',');
    countQuery = `SELECT COUNT(*) as total FROM messages WHERE room_id IN (${placeholders}) AND is_deleted = 0 AND type = 'text' AND thread_id IS NULL AND content LIKE ? COLLATE NOCASE`;
    dataQuery = `SELECT * FROM messages WHERE room_id IN (${placeholders}) AND is_deleted = 0 AND type = 'text' AND thread_id IS NULL AND content LIKE ? COLLATE NOCASE ORDER BY created_at DESC LIMIT ?`;
    params.push(...options.roomIds, searchTerm);
  } else {
    return { results: [], total: 0 };
  }

  const totalRow = db.prepare(countQuery).get(...params) as any;
  const total = totalRow?.total || 0;

  const rows = db.prepare(dataQuery).all(...params, limit) as any[];
  return { results: rows.map(rowToMessage), total };
}

function rowToMessage(row: any): Message {
  return {
    id: row.id,
    roomId: row.room_id,
    threadId: row.thread_id,
    userId: row.user_id,
    content: row.content,
    type: row.type,
    replyTo: row.reply_to,
    contextIds: row.context_ids ? JSON.parse(row.context_ids) : [],
    reactions: JSON.parse(row.reactions || '{}'),
    isEdited: !!row.is_edited,
    isDeleted: !!row.is_deleted,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getMessagesAroundId(messageId: string, roomId: string, around: number = 25): { messages: Message[]; hasOlder: boolean; hasNewer: boolean } | null {
  const db = getDb();
  const target = db.prepare('SELECT created_at FROM messages WHERE id = ? AND room_id = ? AND is_deleted = 0').get(messageId, roomId) as any;
  if (!target) return null;
  const targetTime = target.created_at;

  // Messages at or before target (including target), ordered desc, take `around`
  const olderRows = db.prepare(
    `SELECT * FROM messages WHERE room_id = ? AND is_deleted = 0 AND thread_id IS NULL AND created_at <= ? ORDER BY created_at DESC LIMIT ?`
  ).all(roomId, targetTime, around) as any[];

  // Messages after target, ordered asc, take `around`
  const newerRows = db.prepare(
    `SELECT * FROM messages WHERE room_id = ? AND is_deleted = 0 AND thread_id IS NULL AND created_at > ? ORDER BY created_at ASC LIMIT ?`
  ).all(roomId, targetTime, around) as any[];

  // Check if there are more messages beyond our window
  const hasOlder = olderRows.length === around;
  const hasNewer = newerRows.length === around;

  // Combine: older reversed (chronological) + newer
  const allRows = [...olderRows.reverse(), ...newerRows];
  return { messages: allRows.map(rowToMessage), hasOlder, hasNewer };
}

export function getMessageById(messageId: string): Message | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as any;
  return row ? rowToMessage(row) : null;
}

/**
 * Get messages in a room since a given timestamp (inclusive), capped at limit.
 * Used for group chat context: fetch everything since the bot's last reply.
 */
export function getMessagesSince(roomId: string, sinceCreatedAt: string, limit = 50): Message[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM messages
    WHERE room_id = ? AND is_deleted = 0 AND thread_id IS NULL
      AND created_at >= ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(roomId, sinceCreatedAt, limit) as any[];
  return rows.map(rowToMessage);
}

/**
 * Find the most recent message by a specific user in a room.
 */
export function getLastMessageByUser(roomId: string, userId: string): Message | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT * FROM messages
    WHERE room_id = ? AND user_id = ? AND is_deleted = 0 AND thread_id IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(roomId, userId) as any;
  return row ? rowToMessage(row) : null;
}

export function getLastMessage(roomId: string): Message | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM messages WHERE room_id = ? AND is_deleted = 0 AND thread_id IS NULL ORDER BY created_at DESC LIMIT 1'
  ).get(roomId) as any;
  return row ? rowToMessage(row) : null;
}

/**
 * Walk the reply chain upward from a messageId, returning messages in chronological order.
 * Max depth prevents infinite loops.
 */
export function getReplyChain(messageId: string, maxDepth = 8): Message[] {
  const chain: Message[] = [];
  const visited = new Set<string>();
  let currentId: string | null = messageId;

  while (currentId && chain.length < maxDepth && !visited.has(currentId)) {
    visited.add(currentId);
    const msg = getMessageById(currentId);
    if (!msg) break;
    chain.unshift(msg); // prepend to keep chronological order
    currentId = msg.replyTo;
  }

  return chain;
}
