import { v4 as uuid } from 'uuid';
import { getDb } from '../db/schema.js';
import type { User } from '../types.js';

export function createOrGetUser(username: string): User {
  const db = getDb();

  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
  if (existing) {
    return rowToUser(existing);
  }

  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO users (id, username, is_bot, is_online, created_at)
    VALUES (?, ?, 0, 1, ?)
  `).run(id, username, now);

  return { id, username, isBot: false, isOnline: true, createdAt: now };
}

export function setOnline(userId: string, online: boolean) {
  const db = getDb();
  db.prepare('UPDATE users SET is_online = ? WHERE id = ?').run(online ? 1 : 0, userId);
}

export function getUser(userId: string): User | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  return row ? rowToUser(row) : null;
}

function rowToUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url,
    isBot: !!row.is_bot,
    isOnline: !!row.is_online,
    createdAt: row.created_at,
  };
}
