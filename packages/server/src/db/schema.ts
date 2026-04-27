import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(path.join(__dirname, '../../data/clawchat.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
  }
  return db;
}

/**
 * Graceful DB shutdown: checkpoint WAL and close connection.
 * Call this during server shutdown to ensure all data is flushed.
 */
export function closeDb(): void {
  if (!db) return;
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    console.log('[DB] WAL checkpoint complete');
  } catch (err: any) {
    console.error('[DB] WAL checkpoint failed:', err.message);
  }
  try {
    db.close();
    console.log('[DB] Connection closed');
  } catch (err: any) {
    console.error('[DB] Close failed:', err.message);
  }
  db = undefined as any;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      avatar_url TEXT,
      is_bot INTEGER NOT NULL DEFAULT 0,
      is_online INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('dm', 'group')),
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS room_members (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (room_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      thread_id TEXT,
      user_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('text', 'command', 'system', 'file', 'forward')),
      reply_to TEXT REFERENCES messages(id),
      reactions TEXT NOT NULL DEFAULT '{}',
      is_edited INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      parent_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      reply_count INTEGER NOT NULL DEFAULT 0,
      last_reply_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pinned_messages (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      pinned_by TEXT NOT NULL REFERENCES users(id),
      pinned_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(message_id)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_pinned_room ON pinned_messages(room_id, pinned_at);
  `);

  // Migration: add created_by column if missing
  const cols = db.prepare("PRAGMA table_info('rooms')").all() as any[];
  if (!cols.some((c: any) => c.name === 'created_by')) {
    db.exec('ALTER TABLE rooms ADD COLUMN created_by TEXT');
  }

  // Migration: fix stale foreign keys referencing "messages_old" in pinned_messages and threads
  const pinnedDDL = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='pinned_messages'").get() as any;
  if (pinnedDDL?.sql?.includes('messages_old')) {
    db.exec(`
      CREATE TABLE pinned_messages_new (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        pinned_by TEXT NOT NULL REFERENCES users(id),
        pinned_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(message_id)
      );
      INSERT INTO pinned_messages_new SELECT * FROM pinned_messages;
      DROP TABLE pinned_messages;
      ALTER TABLE pinned_messages_new RENAME TO pinned_messages;
      CREATE INDEX IF NOT EXISTS idx_pinned_room ON pinned_messages(room_id, pinned_at);
    `);
    console.log('[Migration] Rebuilt pinned_messages with correct FK');
  }

  const threadsDDL = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='threads'").get() as any;
  if (threadsDDL?.sql?.includes('messages_old')) {
    db.exec(`
      CREATE TABLE threads_new (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        parent_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        reply_count INTEGER NOT NULL DEFAULT 0,
        last_reply_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO threads_new SELECT * FROM threads;
      DROP TABLE threads;
      ALTER TABLE threads_new RENAME TO threads;
    `);
    console.log('[Migration] Rebuilt threads with correct FK');
  }
}
