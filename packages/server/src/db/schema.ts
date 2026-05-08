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
      type TEXT NOT NULL CHECK(type IN ('dm', 'group', 'bot')),
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

  // Migration: add context_ids column if missing
  const msgCols2 = db.prepare("PRAGMA table_info('messages')").all() as any[];
  if (!msgCols2.some((c: any) => c.name === 'context_ids')) {
    db.exec('ALTER TABLE messages ADD COLUMN context_ids TEXT');
  }

  // Versioned migrations using PRAGMA user_version
  const version = (db.prepare('PRAGMA user_version').get() as any).user_version;

  if (version < 1) {
    db.exec(`PRAGMA foreign_keys = OFF`);
    db.transaction(() => {
      // Create dm_pairs table for DM uniqueness
      db.exec(`
        CREATE TABLE IF NOT EXISTS dm_pairs (
          user_a TEXT NOT NULL REFERENCES users(id),
          user_b TEXT NOT NULL REFERENCES users(id),
          room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
          PRIMARY KEY (user_a, user_b),
          CHECK(user_a < user_b)
        );
        CREATE INDEX IF NOT EXISTS idx_dm_pairs_room ON dm_pairs(room_id);
      `);

      // Rebuild rooms table with name allowing NULL
      db.exec(`
        CREATE TABLE rooms_new (
          id TEXT PRIMARY KEY,
          name TEXT,
          type TEXT NOT NULL CHECK(type IN ('dm', 'group')),
          created_by TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO rooms_new SELECT id, name, type, created_by, created_at FROM rooms;
        DROP TABLE rooms;
        ALTER TABLE rooms_new RENAME TO rooms;
      `);
      db.exec('PRAGMA user_version = 1');
    })();
    db.exec(`PRAGMA foreign_keys = ON`);
    console.log('[Migration] v1: dm_pairs table created, rooms.name now nullable');
  }

  if (version < 2) {
    db.transaction(() => {
      // User-registered bots
      db.exec(`
        CREATE TABLE IF NOT EXISTS bots (
          bot_id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          username TEXT NOT NULL,
          avatar_url TEXT,
          gateway_url TEXT,
          auth_token TEXT NOT NULL,
          agent_id TEXT,
          ssh_host TEXT,
          trigger_type TEXT NOT NULL DEFAULT 'all' CHECK(trigger_type IN ('all', 'mention', 'room-member')),
          is_public INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_bots_owner ON bots(owner_id);
      `);

      // Universal invitation table
      db.exec(`
        CREATE TABLE IF NOT EXISTS invitations (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK(type IN ('room', 'dm', 'bot_share')),
          from_user TEXT NOT NULL REFERENCES users(id),
          to_user TEXT NOT NULL REFERENCES users(id),
          resource_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_invitations_to ON invitations(to_user, status);
        CREATE INDEX IF NOT EXISTS idx_invitations_resource ON invitations(resource_id);
      `);

      db.exec('PRAGMA user_version = 2');
    })();
    console.log('[Migration] v2: bots and invitations tables created');
  }

  if (version < 3) {
    db.transaction(() => {
      // Fix bots table columns: rename id→bot_id, trigger→trigger_type, add username/avatar_url
      const botsInfo = db.prepare("PRAGMA table_info('bots')").all() as any[];
      const hasOldSchema = botsInfo.some((c: any) => c.name === 'id') && !botsInfo.some((c: any) => c.name === 'bot_id');
      if (hasOldSchema) {
        db.exec(`
          CREATE TABLE bots_new (
            bot_id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            username TEXT NOT NULL DEFAULT '',
            avatar_url TEXT,
            gateway_url TEXT,
            auth_token TEXT NOT NULL,
            agent_id TEXT,
            ssh_host TEXT,
            trigger_type TEXT NOT NULL DEFAULT 'all' CHECK(trigger_type IN ('all', 'mention', 'room-member')),
            is_public INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          INSERT INTO bots_new (bot_id, owner_id, username, avatar_url, gateway_url, auth_token, agent_id, ssh_host, trigger_type, is_public, created_at, updated_at)
            SELECT id, owner_id, '', NULL, gateway_url, auth_token, agent_id, ssh_host, trigger, is_public, created_at, updated_at FROM bots;
          DROP TABLE bots;
          ALTER TABLE bots_new RENAME TO bots;
          CREATE INDEX IF NOT EXISTS idx_bots_owner ON bots(owner_id);
        `);
        console.log('[Migration] v3: rebuilt bots table with correct columns');
      }
      db.exec('PRAGMA user_version = 3');
    })();
    console.log('[Migration] v3: bots schema aligned');
  }

  if (version < 4) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS bot_shares (
          id TEXT PRIMARY KEY,
          bot_id TEXT NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,
          shared_by TEXT NOT NULL REFERENCES users(id),
          shared_to TEXT NOT NULL REFERENCES users(id),
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(bot_id, shared_to)
        );
        CREATE INDEX IF NOT EXISTS idx_bot_shares_to ON bot_shares(shared_to, status);
      `);
      db.exec('PRAGMA user_version = 4');
    })();
    console.log('[Migration] v4: bot_shares table created');
  }

  if (version < 5) {
    db.exec(`PRAGMA foreign_keys = OFF`);
    db.transaction(() => {
      db.exec(`
        CREATE TABLE rooms_new (
          id TEXT PRIMARY KEY,
          name TEXT,
          type TEXT NOT NULL CHECK(type IN ('dm', 'group', 'bot')),
          created_by TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO rooms_new SELECT * FROM rooms;
        DROP TABLE rooms;
        ALTER TABLE rooms_new RENAME TO rooms;
      `);
      db.exec('PRAGMA user_version = 5');
    })();
    db.exec(`PRAGMA foreign_keys = ON`);

    // Convert existing bot DMs to 'bot' type
    db.exec(`
      UPDATE rooms SET type='bot' WHERE type='dm' AND id IN (
        SELECT rm.room_id FROM room_members rm
        JOIN users u ON rm.user_id = u.id
        WHERE u.is_bot = 1
      )
    `);
    console.log('[Migration] v5: added bot room type');
  }

  if (version < 6) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS friendships (
          id TEXT PRIMARY KEY,
          user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK(status IN ('pending', 'accepted')),
          requester TEXT NOT NULL REFERENCES users(id),
          message TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          accepted_at TEXT,
          UNIQUE(user_a, user_b),
          CHECK(user_a < user_b)
        );
        CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);
        CREATE INDEX IF NOT EXISTS idx_friendships_a ON friendships(user_a, status);
        CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships(user_b, status);
      `);

      // Backfill friendships from existing dm_pairs
      const dmPairs = db.prepare('SELECT user_a, user_b FROM dm_pairs').all() as any[];
      const insertFriend = db.prepare(
        `INSERT OR IGNORE INTO friendships (id, user_a, user_b, status, requester, created_at, accepted_at)
         VALUES (?, ?, ?, 'accepted', ?, datetime('now'), datetime('now'))`
      );
      for (const pair of dmPairs) {
        const id = `fr_${pair.user_a}_${pair.user_b}`;
        insertFriend.run(id, pair.user_a, pair.user_b, pair.user_a);
      }
      console.log(`[Migration] v6: backfilled ${dmPairs.length} friendships from dm_pairs`);

      db.exec('PRAGMA user_version = 6');
    })();
    console.log('[Migration] v6: friendships table created');
  }

  if (version < 7) {
    db.transaction(() => {
      // Add identity_key column to bots for per-bot device identity
      const cols = db.prepare("PRAGMA table_info(bots)").all() as any[];
      if (!cols.some((c: any) => c.name === 'identity_key')) {
        db.exec('ALTER TABLE bots ADD COLUMN identity_key TEXT');
        console.log('[Migration] v7: added identity_key column to bots');
      }
      db.exec('PRAGMA user_version = 7');
    })();
    console.log('[Migration] v7: bots identity_key');
  }

  if (version < 8) {
    // Add status column to bots and archived_at column to rooms
    // Must disable FK outside transaction for table rebuild
    const botsCols = db.prepare("PRAGMA table_info(bots)").all() as any[];
    if (!botsCols.some((c: any) => c.name === 'status')) {
      db.exec("ALTER TABLE bots ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
      console.log('[Migration] v8: added status column to bots');
    }
    const roomsCols = db.prepare("PRAGMA table_info(rooms)").all() as any[];
    if (!roomsCols.some((c: any) => c.name === 'archived_at')) {
      db.exec('ALTER TABLE rooms ADD COLUMN archived_at TEXT DEFAULT NULL');
      console.log('[Migration] v8: added archived_at column to rooms');
    }
    db.exec('PRAGMA user_version = 8');
    console.log('[Migration] v8: bot status + room archived_at');
  }
}
