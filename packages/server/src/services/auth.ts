import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/schema.js';
import type { User } from '../types.js';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const fallback = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  JWT_SECRET not set — using random secret (tokens won\'t survive restart)');
  return fallback;
})();

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

export async function register(email: string, username: string, password: string): Promise<{ token: string; user: User }> {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) throw new Error('Email already registered');

  const id = uuid();
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(password, 10);

  db.prepare('INSERT INTO users (id, username, email, password_hash, is_bot, is_online, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)').run(id, username, email, passwordHash, now);

  const user: User = { id, username, email, isBot: false, isOnline: false, createdAt: now };
  const token = jwt.sign({ userId: id, email }, JWT_SECRET, { expiresIn: '7d' });
  return { token, user };
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
  if (!row) throw new Error('Invalid email or password');

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) throw new Error('Invalid email or password');

  const user = rowToUser(row);
  const token = jwt.sign({ userId: user.id, email: row.email }, JWT_SECRET, { expiresIn: '7d' });
  return { token, user };
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
  } catch {
    return null;
  }
}
