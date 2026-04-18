import { getDb } from '../db/schema.js';
import type { User } from '../types.js';

export function getUserByEmail(email: string): User | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  return row ? rowToUser(row) : null;
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

export function getAllUsers(): User[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM users ORDER BY username').all() as any[];
  return rows.map(rowToUser);
}

export function getOnlineUsers(): string[] {
  const db = getDb();
  const rows = db.prepare('SELECT id FROM users WHERE is_online = 1').all() as any[];
  return rows.map(r => r.id);
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
