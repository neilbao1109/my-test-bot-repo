import { getDb } from '../db/schema.js';
import type { BotContext, BotStatus } from '../types.js';
import { BotBridge } from './bot-bridge.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');

// ── Types ──

export type TriggerType = 'all' | 'mention' | 'room-member';

export interface BotConfig {
  id: string;
  username: string;
  avatarUrl?: string;
  gateway: {
    url?: string;
    authToken: string;
    agentId?: string;
    sshHost?: string;
  };
  trigger: TriggerType;
}

// ── Registry ──

const bots = new Map<string, BotConfig>();
const bridges = new Map<string, BotBridge>();
const systemBotIds = new Set<string>();

/**
 * Load bot configs from BOTS_CONFIG env (JSON array) or fall back
 * to single-bot mode using legacy env vars.
 */
export function loadBotConfigs(): BotConfig[] {
  // Priority: 1) BOTS_CONFIG env var  2) data/bots.json file  3) legacy single-bot env vars

  // 1) Env var
  const raw = process.env.BOTS_CONFIG;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as BotConfig[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.error('[BotRegistry] Failed to parse BOTS_CONFIG:', e);
    }
  }

  // 2) Config file: data/bots.json
  const configPath = path.join(DATA_DIR, 'bots.json');
  if (fs.existsSync(configPath)) {
    try {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(fileContent) as BotConfig[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`[BotRegistry] Loaded ${parsed.length} bot(s) from ${configPath}`);
        return parsed;
      }
    } catch (e) {
      console.error(`[BotRegistry] Failed to parse ${configPath}:`, e);
    }
  }

  // Fallback: single bot from legacy env vars
  const authToken = process.env.OPENCLAW_AUTH_TOKEN || '';
  return [{
    id: 'bot-clawchat',
    username: 'ClawBot',
    avatarUrl: '/bot-avatar.svg',
    gateway: {
      url: process.env.OPENCLAW_GATEWAY_URL || undefined,
      authToken,
      agentId: process.env.OPENCLAW_AGENT_ID || undefined,
      sshHost: process.env.OPENCLAW_SSH_HOST || undefined,
    },
    trigger: 'all' as TriggerType,
  }];
}

/**
 * Initialize registry: load configs, upsert bot users in DB, create bridges.
 */
export function initBotRegistry(): void {
  const configs = loadBotConfigs();
  const db = getDb();

  const upsert = db.prepare(`
    INSERT INTO users (id, username, avatar_url, is_bot, is_online)
    VALUES (?, ?, ?, 1, 1)
    ON CONFLICT(id) DO UPDATE SET username=excluded.username, avatar_url=excluded.avatar_url, is_bot=1, is_online=1
  `);

  // Load system bots from config
  for (const cfg of configs) {
    upsert.run(cfg.id, cfg.username, cfg.avatarUrl || null);
    bots.set(cfg.id, cfg);
    bridges.set(cfg.id, new BotBridge(cfg));
    systemBotIds.add(cfg.id);
    console.log(`[BotRegistry] Registered system bot: ${cfg.username} (${cfg.id}) trigger=${cfg.trigger}`);
  }

  // Load user-registered bots from DB
  const userBots = db.prepare('SELECT * FROM bots').all() as any[];
  for (const row of userBots) {
    const cfg: BotConfig = {
      id: row.bot_id,
      username: row.username,
      avatarUrl: row.avatar_url || undefined,
      gateway: {
        url: row.gateway_url || undefined,
        authToken: row.auth_token,
        agentId: row.agent_id || undefined,
        sshHost: row.ssh_host || undefined,
      },
      trigger: (row.trigger_type || 'all') as TriggerType,
    };
    upsert.run(cfg.id, cfg.username, cfg.avatarUrl || null);
    bots.set(cfg.id, cfg);
    bridges.set(cfg.id, new BotBridge(cfg));
    console.log(`[BotRegistry] Registered user bot: ${cfg.username} (${cfg.id}) owner=${row.owner_id}`);
  }
}

/** Get all registered bot configs */
export function getAllBots(): BotConfig[] {
  return Array.from(bots.values());
}

/** Get a specific bot config */
export function getBot(botId: string): BotConfig | undefined {
  return bots.get(botId);
}

/** Get the BotBridge for a bot */
export function getBridge(botId: string): BotBridge | undefined {
  return bridges.get(botId);
}

/** Check if a user ID belongs to a bot */
export function isBotUser(userId: string): boolean {
  return bots.has(userId);
}

/** Get all bot IDs */
export function getAllBotIds(): string[] {
  return Array.from(bots.keys());
}

/**
 * Get all bots available to a user.
 * Returns system bots + user's own bots + shared bots (accepted).
 */
export function getAvailableBots(userId?: string): BotConfig[] {
  if (!userId) return Array.from(bots.values()).filter(b => systemBotIds.has(b.id));
  const db = getDb();
  const userBotIds = (db.prepare('SELECT bot_id FROM bots WHERE owner_id = ?').all(userId) as any[]).map(r => r.bot_id);
  const userBotSet = new Set(userBotIds);

  // Get shared bots (inline query to avoid circular import with bot-share)
  const sharedRows = db.prepare(`
    SELECT b.* FROM bot_shares bs
    JOIN bots b ON bs.bot_id = b.bot_id
    WHERE bs.shared_to = ? AND bs.status = 'accepted'
  `).all(userId) as any[];
  const sharedBots: BotConfig[] = sharedRows.map(row => ({
    id: row.bot_id,
    username: row.username,
    avatarUrl: row.avatar_url || undefined,
    gateway: {
      url: row.gateway_url || undefined,
      authToken: row.auth_token,
      agentId: row.agent_id || undefined,
      sshHost: row.ssh_host || undefined,
    },
    trigger: (row.trigger_type || 'all') as TriggerType,
  }));
  const sharedBotIds = new Set(sharedBots.map((b: BotConfig) => b.id));

  // Ensure shared bots are loaded into memory maps
  for (const sb of sharedBots) {
    if (!bots.has(sb.id)) {
      bots.set(sb.id, sb);
      bridges.set(sb.id, new BotBridge(sb));
    }
  }

  return Array.from(bots.values()).filter(b => systemBotIds.has(b.id) || userBotSet.has(b.id) || sharedBotIds.has(b.id));
}

/** Check if a bot is a system bot */
export function isSystemBot(botId: string): boolean {
  return systemBotIds.has(botId);
}

/** Get bots owned by a user */
export function getUserBots(userId: string): BotConfig[] {
  const db = getDb();
  const rows = db.prepare('SELECT bot_id FROM bots WHERE owner_id = ?').all(userId) as any[];
  return rows.map(r => bots.get(r.bot_id)).filter((b): b is BotConfig => !!b);
}

/** Register a new user-created bot */
export function registerBot(config: {
  username: string;
  avatarUrl?: string;
  gatewayUrl?: string;
  authToken: string;
  agentId?: string;
  sshHost?: string;
  trigger?: TriggerType;
}, ownerId: string): BotConfig {
  const db = getDb();
  const id = `bot-${uuidv4()}`;

  const botConfig: BotConfig = {
    id,
    username: config.username,
    avatarUrl: config.avatarUrl,
    gateway: {
      url: config.gatewayUrl || undefined,
      authToken: config.authToken,
      agentId: config.agentId || undefined,
      sshHost: config.sshHost || undefined,
    },
    trigger: config.trigger || 'all',
  };

  // Insert into users table
  db.prepare(`
    INSERT INTO users (id, username, avatar_url, is_bot, is_online)
    VALUES (?, ?, ?, 1, 1)
    ON CONFLICT(id) DO UPDATE SET username=excluded.username, avatar_url=excluded.avatar_url, is_bot=1, is_online=1
  `).run(id, config.username, config.avatarUrl || null);

  // Insert into bots table
  db.prepare(`
    INSERT INTO bots (bot_id, owner_id, username, avatar_url, gateway_url, auth_token, agent_id, ssh_host, trigger_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, ownerId, config.username, config.avatarUrl || null, config.gatewayUrl || null, config.authToken, config.agentId || null, config.sshHost || null, config.trigger || 'all');

  // Add to in-memory maps
  bots.set(id, botConfig);
  bridges.set(id, new BotBridge(botConfig));

  console.log(`[BotRegistry] User ${ownerId} registered bot: ${config.username} (${id})`);
  return botConfig;
}

/** Update a user bot (only owner can update) */
export function updateBot(botId: string, updates: Partial<{
  username: string;
  avatarUrl: string;
  gatewayUrl: string;
  authToken: string;
  agentId: string;
  sshHost: string;
  trigger: TriggerType;
}>, ownerId: string): BotConfig | null {
  if (isSystemBot(botId)) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM bots WHERE bot_id = ? AND owner_id = ?').get(botId, ownerId) as any;
  if (!row) return null;

  const existing = bots.get(botId);
  if (!existing) return null;

  // Build updated config
  const updated: BotConfig = {
    ...existing,
    username: updates.username ?? existing.username,
    avatarUrl: updates.avatarUrl ?? existing.avatarUrl,
    gateway: {
      url: updates.gatewayUrl !== undefined ? (updates.gatewayUrl || undefined) : existing.gateway.url,
      authToken: updates.authToken ?? existing.gateway.authToken,
      agentId: updates.agentId !== undefined ? (updates.agentId || undefined) : existing.gateway.agentId,
      sshHost: updates.sshHost !== undefined ? (updates.sshHost || undefined) : existing.gateway.sshHost,
    },
    trigger: updates.trigger ?? existing.trigger,
  };

  // Update DB
  db.prepare(`
    UPDATE bots SET username=?, avatar_url=?, gateway_url=?, auth_token=?, agent_id=?, ssh_host=?, trigger_type=?
    WHERE bot_id=? AND owner_id=?
  `).run(updated.username, updated.avatarUrl || null, updated.gateway.url || null, updated.gateway.authToken, updated.gateway.agentId || null, updated.gateway.sshHost || null, updated.trigger, botId, ownerId);

  // Update users table
  db.prepare('UPDATE users SET username=?, avatar_url=? WHERE id=?').run(updated.username, updated.avatarUrl || null, botId);

  // Update in-memory
  bots.set(botId, updated);

  // Recreate bridge if gateway config changed
  const gatewayChanged = updates.gatewayUrl !== undefined || updates.authToken !== undefined || updates.agentId !== undefined || updates.sshHost !== undefined;
  if (gatewayChanged) {
    const oldBridge = bridges.get(botId);
    if (oldBridge) oldBridge.shutdown();
    bridges.set(botId, new BotBridge(updated));
  }

  console.log(`[BotRegistry] Updated bot: ${updated.username} (${botId})`);
  return updated;
}

/** Delete a user bot (only owner can delete) */
export function deleteBot(botId: string, ownerId: string): boolean {
  if (isSystemBot(botId)) return false;
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM bots WHERE bot_id = ? AND owner_id = ?').get(botId, ownerId);
  if (!row) return false;

  // Remove from bots table (CASCADE handles bot_shares)
  db.prepare('DELETE FROM bots WHERE bot_id = ?').run(botId);
  // Remove from users table
  db.prepare('DELETE FROM users WHERE id = ?').run(botId);

  // Shutdown bridge and remove from maps
  const bridge = bridges.get(botId);
  if (bridge) bridge.shutdown();
  bridges.delete(botId);
  bots.delete(botId);

  console.log(`[BotRegistry] Deleted bot: ${botId} by owner ${ownerId}`);
  return true;
}

/** Test bot connection to gateway */
export async function testBotConnection(config: {
  gatewayUrl?: string;
  authToken: string;
  agentId?: string;
  sshHost?: string;
}): Promise<{ ok: boolean; error?: string; model?: string }> {
  const tempConfig: BotConfig = {
    id: `test-${uuidv4()}`,
    username: '__test__',
    gateway: {
      url: config.gatewayUrl || undefined,
      authToken: config.authToken,
      agentId: config.agentId || undefined,
      sshHost: config.sshHost || undefined,
    },
    trigger: 'all',
  };
  const bridge = new BotBridge(tempConfig);
  try {
    const status = await bridge.getStatus();
    return { ok: status.connected, model: status.model };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Connection failed' };
  } finally {
    bridge.shutdown();
  }
}

/**
 * Parse @mentions from message content and return matching bot IDs.
 */
export function parseMentionedBots(content: string): string[] {
  const mentioned: string[] = [];
  for (const bot of bots.values()) {
    // Match @Username (case-insensitive)
    const pattern = new RegExp(`@${escapeRegex(bot.username)}\\b`, 'i');
    if (pattern.test(content)) {
      mentioned.push(bot.id);
    }
  }
  return mentioned;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Determine which bots should respond to a message.
 * @param content    message text
 * @param roomId     room where message was sent
 * @param senderId   who sent the message
 * @param roomType   'dm' | 'group' — in group rooms, trigger='all' behaves like 'mention'
 */
export function getRespondingBots(content: string, roomId: string, senderId: string, roomType?: 'dm' | 'group' | 'bot'): BotConfig[] {
  // Never respond to messages from bots (prevent loops)
  if (isBotUser(senderId)) return [];

  const mentioned = new Set(parseMentionedBots(content));
  const responding: BotConfig[] = [];

  for (const bot of bots.values()) {
    switch (bot.trigger) {
      case 'all':
        // In group rooms, only respond when mentioned (silent observe otherwise)
        if (roomType === 'group') {
          if (mentioned.has(bot.id)) responding.push(bot);
        } else {
          responding.push(bot);
        }
        break;
      case 'mention':
        if (mentioned.has(bot.id)) responding.push(bot);
        break;
      case 'room-member':
        if (roomType === 'group') {
          // In group rooms, room-member bots only respond when mentioned
          if (mentioned.has(bot.id)) responding.push(bot);
        } else if (isBotInRoom(bot.id, roomId)) {
          responding.push(bot);
        }
        break;
    }
  }

  return responding;
}

function isBotInRoom(botId: string, roomId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?').get(roomId, botId);
  return !!row;
}

/**
 * Stream a bot response.
 */
export async function* streamBotResponse(botId: string, content: string, context: BotContext): AsyncGenerator<string> {
  const bridge = bridges.get(botId);
  if (!bridge) {
    yield `⚠️ Bot ${botId} not found`;
    return;
  }
  yield* bridge.streamResponse(content, context);
}

/** Get status for a specific bot */
export async function getBotStatus(botId: string): Promise<BotStatus> {
  const bridge = bridges.get(botId);
  if (!bridge) {
    return { connected: false, model: 'unknown', uptime: 0 };
  }
  return bridge.getStatus();
}

/** Graceful shutdown */
export function shutdownAll(): void {
  for (const bridge of bridges.values()) {
    bridge.shutdown();
  }
}

