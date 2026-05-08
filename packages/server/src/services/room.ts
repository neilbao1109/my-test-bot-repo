import { v4 as uuid } from 'uuid';
import { getDb } from '../db/schema.js';
import { getBot } from '../services/bot-registry.js';
import type { Room, User } from '../types.js';

/**
 * Find an existing DM between two users via dm_pairs table.
 */
export function findExistingDm(userA: string, userB: string): Room | null {
  const db = getDb();
  const [a, b] = userA < userB ? [userA, userB] : [userB, userA];
  const row = db.prepare(`
    SELECT r.* FROM dm_pairs dp
    JOIN rooms r ON r.id = dp.room_id
    WHERE dp.user_a = ? AND dp.user_b = ?
  `).get(a, b) as any;
  if (!row) return null;
  return { id: row.id, name: row.name, type: row.type, createdBy: row.created_by || undefined, createdAt: row.created_at, archivedAt: row.archived_at || null };
}

export function createRoom(name: string | null, type: 'dm' | 'group' | 'bot', memberIds: string[], createdBy?: string): Room {
  const db = getDb();

  // DM uniqueness: if type is dm and exactly 2 members, check for existing
  if (type === 'dm' && memberIds.length === 2) {
    const existing = findExistingDm(memberIds[0], memberIds[1]);
    if (existing) return existing;
  }

  const id = uuid();
  const now = new Date().toISOString();

  db.prepare('INSERT INTO rooms (id, name, type, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(id, name, type, createdBy || null, now);

  const insertMember = db.prepare('INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)');
  for (const userId of memberIds) {
    insertMember.run(id, userId);
  }

  // Write dm_pairs for DM rooms
  if (type === 'dm' && memberIds.length === 2) {
    const [a, b] = memberIds[0] < memberIds[1] ? [memberIds[0], memberIds[1]] : [memberIds[1], memberIds[0]];
    db.prepare('INSERT OR IGNORE INTO dm_pairs (user_a, user_b, room_id) VALUES (?, ?, ?)').run(a, b, id);
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
    archivedAt: r.archived_at || null,
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
  return { id: row.id, name: row.name, type: row.type, createdBy: row.created_by || undefined, createdAt: row.created_at, archivedAt: row.archived_at || null };
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

export function addBotToRoom(roomId: string, botId: string): boolean {
  const bot = getBot(botId);
  if (!bot) return false;
  return addMemberToRoom(roomId, botId);
}

export function removeBotFromRoom(roomId: string, botId: string): boolean {
  const bot = getBot(botId);
  if (!bot) return false;
  return removeMemberFromRoom(roomId, botId);
}

export function renameRoom(roomId: string, name: string, userId?: string): { room: Room | null; error?: string } {
  const db = getDb();
  const existing = getRoom(roomId);
  if (!existing) return { room: null, error: 'Room not found' };
  if (existing.createdBy && userId && existing.createdBy !== userId) {
    return { room: null, error: 'Only the room creator can rename' };
  }
  db.prepare('UPDATE rooms SET name = ? WHERE id = ?').run(name, roomId);
  return { room: getRoom(roomId) };
}

export function deleteRoom(roomId: string, userId?: string): { success: boolean; error?: string } {
  const db = getDb();
  const existing = getRoom(roomId);
  if (!existing) return { success: false, error: 'Room not found' };
  if (existing.createdBy && userId && existing.createdBy !== userId) {
    return { success: false, error: 'Only the room creator can delete' };
  }
  db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
  return { success: true };
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
