import { getDb } from '../db/schema.js';
import type { BotContext, BotStatus } from '../types.js';
import { BotBridge } from './bot-bridge.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

  for (const cfg of configs) {
    upsert.run(cfg.id, cfg.username, cfg.avatarUrl || null);
    bots.set(cfg.id, cfg);
    bridges.set(cfg.id, new BotBridge(cfg));
    console.log(`[BotRegistry] Registered bot: ${cfg.username} (${cfg.id}) trigger=${cfg.trigger}`);
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
 * @deprecated Phase 1: no longer used. Will be removed in Phase 2.
 * Get bots that should be added to every new room ('all' trigger type).
 */
export function getAutoJoinBotIds(): string[] {
  return Array.from(bots.values())
    .filter(b => b.trigger === 'all')
    .map(b => b.id);
}

/**
 * Get all bots available to a user.
 * Phase 1: returns all system bots (registered bots).
 */
export function getAvailableBots(_userId?: string): BotConfig[] {
  return Array.from(bots.values());
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
export function getRespondingBots(content: string, roomId: string, senderId: string, roomType?: 'dm' | 'group'): BotConfig[] {
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
