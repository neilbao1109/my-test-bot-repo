import { v4 as uuid } from 'uuid';
import { getDb } from '../db/schema.js';
import type { User } from '../types.js';

export interface Friendship {
  id: string;
  userA: string;
  userB: string;
  status: 'pending' | 'accepted';
  requester: string;
  message?: string;
  createdAt: string;
  acceptedAt?: string;
}

function rowToFriendship(row: any): Friendship {
  return {
    id: row.id,
    userA: row.user_a,
    userB: row.user_b,
    status: row.status,
    requester: row.requester,
    message: row.message || undefined,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at || undefined,
  };
}

function rowToUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email || undefined,
    avatarUrl: row.avatar_url,
    isBot: !!row.is_bot,
    isOnline: !!row.is_online,
    createdAt: row.created_at,
  };
}

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Check if two users are friends (accepted) */
export function areFriends(userA: string, userB: string): boolean {
  const db = getDb();
  const [a, b] = orderedPair(userA, userB);
  const row = db.prepare(
    `SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'accepted'`
  ).get(a, b);
  return !!row;
}

/** Send a friend request */
export function sendFriendRequest(fromUserId: string, toUserId: string, message?: string): { friendship?: Friendship; error?: string } {
  if (fromUserId === toUserId) return { error: 'cannot_add_self' };
  const db = getDb();
  const [a, b] = orderedPair(fromUserId, toUserId);

  // Check existing
  const existing = db.prepare(
    `SELECT * FROM friendships WHERE user_a = ? AND user_b = ?`
  ).get(a, b) as any;

  if (existing) {
    if (existing.status === 'accepted') return { error: 'already_friends' };
    if (existing.status === 'pending') return { error: 'request_exists' };
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO friendships (id, user_a, user_b, status, requester, message, created_at)
     VALUES (?, ?, ?, 'pending', ?, ?, datetime('now'))`
  ).run(id, a, b, fromUserId, message || null);

  const row = db.prepare('SELECT * FROM friendships WHERE id = ?').get(id) as any;
  return { friendship: rowToFriendship(row) };
}

/** Accept a friend request */
export function acceptFriendRequest(friendshipId: string, userId: string): { friendship?: Friendship; error?: string } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM friendships WHERE id = ?').get(friendshipId) as any;
  if (!row) return { error: 'not_found' };
  if (row.status === 'accepted') return { error: 'already_accepted' };
  // Only the non-requester can accept
  const targetUser = row.requester === row.user_a ? row.user_b : row.user_a;
  if (userId !== targetUser) return { error: 'not_authorized' };

  db.prepare(
    `UPDATE friendships SET status = 'accepted', accepted_at = datetime('now') WHERE id = ?`
  ).run(friendshipId);

  const updated = db.prepare('SELECT * FROM friendships WHERE id = ?').get(friendshipId) as any;
  return { friendship: rowToFriendship(updated) };
}

/** Reject (delete) a friend request */
export function rejectFriendRequest(friendshipId: string, userId: string): { success: boolean; error?: string } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM friendships WHERE id = ?').get(friendshipId) as any;
  if (!row) return { success: false, error: 'not_found' };
  if (row.status !== 'pending') return { success: false, error: 'not_pending' };
  const targetUser = row.requester === row.user_a ? row.user_b : row.user_a;
  if (userId !== targetUser) return { success: false, error: 'not_authorized' };

  db.prepare('DELETE FROM friendships WHERE id = ?').run(friendshipId);
  return { success: true };
}

/** Remove a friend (delete accepted friendship) */
export function removeFriend(userId: string, friendUserId: string): { success: boolean; error?: string } {
  const db = getDb();
  const [a, b] = orderedPair(userId, friendUserId);
  const result = db.prepare(
    `DELETE FROM friendships WHERE user_a = ? AND user_b = ? AND status = 'accepted'`
  ).run(a, b);
  return { success: result.changes > 0, error: result.changes === 0 ? 'not_found' : undefined };
}

/** Get friend list (accepted) for a user */
export function getFriends(userId: string): User[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT u.* FROM users u
    JOIN friendships f ON (
      (f.user_a = ? AND f.user_b = u.id) OR
      (f.user_b = ? AND f.user_a = u.id)
    )
    WHERE f.status = 'accepted'
    ORDER BY u.username
  `).all(userId, userId) as any[];
  return rows.map(rowToUser);
}

/** Get pending friend requests (incoming and outgoing) */
export function getFriendRequests(userId: string): { incoming: (Friendship & { user: User })[], outgoing: (Friendship & { user: User })[] } {
  const db = getDb();
  // Incoming: where userId is NOT the requester
  const incomingRows = db.prepare(`
    SELECT f.*, u.id as uid, u.username, u.email, u.avatar_url, u.is_bot, u.is_online, u.created_at as u_created_at
    FROM friendships f
    JOIN users u ON u.id = f.requester
    WHERE f.status = 'pending'
      AND ((f.user_a = ? AND f.requester != ?) OR (f.user_b = ? AND f.requester != ?))
  `).all(userId, userId, userId, userId) as any[];

  const incoming = incomingRows.map(r => ({
    ...rowToFriendship(r),
    user: {
      id: r.uid,
      username: r.username,
      email: r.email || undefined,
      avatarUrl: r.avatar_url,
      isBot: !!r.is_bot,
      isOnline: !!r.is_online,
      createdAt: r.u_created_at,
    },
  }));

  // Outgoing: where userId IS the requester
  const outgoingRows = db.prepare(`
    SELECT f.*,
           CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END as other_id
    FROM friendships f
    WHERE f.status = 'pending' AND f.requester = ?
  `).all(userId, userId) as any[];

  const outgoing = outgoingRows.map(r => {
    const otherUser = db.prepare('SELECT * FROM users WHERE id = ?').get(r.other_id) as any;
    return {
      ...rowToFriendship(r),
      user: otherUser ? rowToUser(otherUser) : { id: r.other_id, username: 'Unknown', isBot: false, isOnline: false, createdAt: '' },
    };
  });

  return { incoming, outgoing };
}

/** Search users by email (for adding friends) */
export function searchUsersByEmail(query: string): User[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM users WHERE email LIKE ? AND is_bot = 0 LIMIT 20`
  ).all(`%${query}%`) as any[];
  return rows.map(rowToUser);
}
