import { v4 as uuid } from 'uuid';
import { getDb } from '../db/schema.js';
import type { Room, User } from '../types.js';

export function createRoom(name: string, type: 'dm' | 'group', memberIds: string[]): Room {
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare('INSERT INTO rooms (id, name, type, created_at) VALUES (?, ?, ?, ?)').run(id, name, type, now);

  const insertMember = db.prepare('INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)');
  for (const userId of memberIds) {
    insertMember.run(id, userId);
  }
  // Always add bot to the room
  insertMember.run(id, 'bot-clawchat');

  return { id, name, type, createdAt: now };
}

export function getRooms(userId: string): Room[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT r.* FROM rooms r
    JOIN room_members rm ON r.id = rm.room_id
    WHERE rm.user_id = ?
    ORDER BY r.created_at DESC
  `).all(userId) as any[];

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    createdAt: r.created_at,
  }));
}

export function getRoomMembers(roomId: string): User[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT u.* FROM users u
    JOIN room_members rm ON u.id = rm.user_id
    WHERE rm.room_id = ?
  `).all(roomId) as any[];

  return rows.map(r => ({
    id: r.id,
    username: r.username,
    avatarUrl: r.avatar_url,
    isBot: !!r.is_bot,
    isOnline: !!r.is_online,
    createdAt: r.created_at,
  }));
}

export function getRoom(roomId: string): Room | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as any;
  if (!row) return null;
  return { id: row.id, name: row.name, type: row.type, createdAt: row.created_at };
}
