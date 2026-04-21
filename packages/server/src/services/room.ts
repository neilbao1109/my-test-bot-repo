import { v4 as uuid } from 'uuid';
import { getDb } from '../db/schema.js';
import { getAutoJoinBotIds } from '../services/bot-registry.js';
import type { Room, User } from '../types.js';

export function createRoom(name: string, type: 'dm' | 'group', memberIds: string[], createdBy?: string): Room {
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare('INSERT INTO rooms (id, name, type, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, type, createdBy || null, now);

  const insertMember = db.prepare('INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)');
  for (const userId of memberIds) {
    insertMember.run(id, userId);
  }
  // Add auto-join bots to the room
  const autoJoinBots = getAutoJoinBotIds();
  for (const botId of autoJoinBots) {
    insertMember.run(id, botId);
  }

  return { id, name, type, createdBy: createdBy || undefined, createdAt: now };
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
    createdBy: r.created_by || undefined,
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
  return { id: row.id, name: row.name, type: row.type, createdBy: row.created_by || undefined, createdAt: row.created_at };
}

export function addMemberToRoom(roomId: string, userId: string): boolean {
  const db = getDb();
  const result = db.prepare('INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)').run(roomId, userId);
  return result.changes > 0;
}

export function removeMemberFromRoom(roomId: string, userId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(roomId, userId);
  return result.changes > 0;
}

export function renameRoom(roomId: string, name: string, userId?: string): { room: Room | null; error?: string } {
  const db = getDb();
  const existing = getRoom(roomId);
  if (!existing) return { room: null, error: 'Room not found' };
  // Only creator can rename (if creator is tracked)
  if (existing.createdBy && userId && existing.createdBy !== userId) {
    return { room: null, error: 'Only the room creator can rename' };
  }
  db.prepare('UPDATE rooms SET name = ? WHERE id = ?').run(name, roomId);
  return { room: getRoom(roomId) };
}

export function searchUsers(query: string): User[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM users WHERE username LIKE ? LIMIT 20').all(`%${query}%`) as any[];
  return rows.map(r => ({
    id: r.id,
    username: r.username,
    avatarUrl: r.avatar_url,
    isBot: !!r.is_bot,
    isOnline: !!r.is_online,
    createdAt: r.created_at,
  }));
}
