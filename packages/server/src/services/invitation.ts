import { getDb } from '../db/schema.js';
import { v4 as uuid } from 'uuid';

export type InvitationType = 'room' | 'dm' | 'bot_share';
export type InvitationStatus = 'pending' | 'accepted' | 'rejected';

export interface Invitation {
  id: string;
  type: InvitationType;
  fromUser: string;
  toUser: string;
  resourceId: string;
  status: InvitationStatus;
  createdAt: string;
  updatedAt: string;
}

function rowToInvitation(row: any): Invitation {
  return {
    id: row.id,
    type: row.type as InvitationType,
    fromUser: row.from_user,
    toUser: row.to_user,
    resourceId: row.resource_id,
    status: row.status as InvitationStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createInvitation(type: InvitationType, fromUser: string, toUser: string, resourceId: string): Invitation {
  const db = getDb();

  // Check for existing pending invitation (same type, to_user, resource_id)
  const existing = db.prepare(
    'SELECT * FROM invitations WHERE type = ? AND to_user = ? AND resource_id = ? AND status = ?'
  ).get(type, toUser, resourceId, 'pending') as any;

  if (existing) return rowToInvitation(existing);

  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO invitations (id, type, from_user, to_user, resource_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, type, fromUser, toUser, resourceId, 'pending', now, now);

  return { id, type, fromUser, toUser, resourceId, status: 'pending', createdAt: now, updatedAt: now };
}

export function acceptInvitation(invitationId: string, userId: string): { success: boolean; error?: string; resourceId?: string; type?: InvitationType; fromUser?: string } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM invitations WHERE id = ?').get(invitationId) as any;

  if (!row) return { success: false, error: 'Invitation not found' };
  if (row.to_user !== userId) return { success: false, error: 'Not your invitation' };
  if (row.status !== 'pending') return { success: false, error: 'Invitation already ' + row.status };

  const now = new Date().toISOString();
  db.prepare('UPDATE invitations SET status = ?, updated_at = ? WHERE id = ?').run('accepted', now, invitationId);

  return { success: true, resourceId: row.resource_id, type: row.type as InvitationType, fromUser: row.from_user };
}

export function rejectInvitation(invitationId: string, userId: string): { success: boolean; error?: string } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM invitations WHERE id = ?').get(invitationId) as any;

  if (!row) return { success: false, error: 'Invitation not found' };
  if (row.to_user !== userId) return { success: false, error: 'Not your invitation' };
  if (row.status !== 'pending') return { success: false, error: 'Invitation already ' + row.status };

  const now = new Date().toISOString();
  db.prepare('UPDATE invitations SET status = ?, updated_at = ? WHERE id = ?').run('rejected', now, invitationId);

  return { success: true };
}

export function getPendingInvitations(userId: string): Invitation[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM invitations WHERE to_user = ? AND status = ? ORDER BY created_at DESC'
  ).all(userId, 'pending') as any[];

  return rows.map(rowToInvitation);
}

export function getInvitationCount(userId: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM invitations WHERE to_user = ? AND status = ?'
  ).get(userId, 'pending') as any;
  return row?.count || 0;
}
