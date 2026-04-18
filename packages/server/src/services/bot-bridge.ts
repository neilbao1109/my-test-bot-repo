import type { BotContext, BotStatus } from '../types.js';
import type { BotConfig } from './bot-registry.js';
import { OpenClawClient } from './openclaw-client.js';
import { SshTunnel, tunnelConfigFromEnv } from './ssh-tunnel.js';
import crypto from 'crypto';

/**
 * BotBridge — per-bot OpenClaw Gateway connection.
 * Each bot gets its own client, session map, and streaming state.
 */

interface ActiveStream {
  chunks: string[];
  done: boolean;
  listeners: Set<(chunk: string, done: boolean) => void>;
}

type ConnectionMode = 'local' | 'remote-url' | 'ssh-tunnel' | 'mock';

const DEFAULT_GW_URL = 'ws://127.0.0.1:18789';

export class BotBridge {
  private config: BotConfig;
  private client: OpenClawClient | null = null;
  private tunnel: SshTunnel | null = null;
  private initPromise: Promise<void> | null = null;
  private roomSessions = new Map<string, string>();
  private activeStreams = new Map<string, ActiveStream>();
  private subscribedSessions = new Set<string>();
  private connectionMode: ConnectionMode;

  constructor(config: BotConfig) {
    this.config = config;
    this.connectionMode = this.detectMode();
  }

  private detectMode(): ConnectionMode {
    if (!this.config.gateway.authToken) return 'mock';
    if (this.config.gateway.sshHost) return 'ssh-tunnel';
    if (this.config.gateway.url) return 'remote-url';
    return 'local';
  }

  private getEffectiveGatewayUrl(): string {
    return this.config.gateway.url || DEFAULT_GW_URL;
  }

  private async ensureClient(): Promise<OpenClawClient> {
    if (this.client?.isConnected) return this.client;

    if (this.initPromise) {
      await this.initPromise;
      if (this.client?.isConnected) return this.client;
    }

    this.initPromise = (async () => {
      if (this.connectionMode === 'mock') {
        console.warn(`[BotBridge:${this.config.id}] No auth token — running in mock mode`);
        throw new Error('No auth token configured');
      }

      let gatewayUrl: string;

      if (this.connectionMode === 'ssh-tunnel') {
        const tunnelConfig = tunnelConfigFromEnv(this.config.gateway.sshHost);
        if (!tunnelConfig) throw new Error('SSH tunnel config missing');
        this.tunnel = new SshTunnel(tunnelConfig);
        console.log(`[BotBridge:${this.config.id}] Opening SSH tunnel to ${tunnelConfig.sshHost}...`);
        const localPort = await this.tunnel.start();
        gatewayUrl = `ws://127.0.0.1:${localPort}`;
        console.log(`[BotBridge:${this.config.id}] SSH tunnel ready: ${gatewayUrl}`);

        this.tunnel.on('ready', (port: number) => {
          console.log(`[BotBridge:${this.config.id}] SSH tunnel restarted on port ${port}`);
          this.reconnectClient(`ws://127.0.0.1:${port}`);
        });
      } else if (this.connectionMode === 'remote-url') {
        gatewayUrl = this.config.gateway.url!;
        console.log(`[BotBridge:${this.config.id}] Connecting to remote Gateway: ${gatewayUrl}`);
      } else {
        gatewayUrl = DEFAULT_GW_URL;
        console.log(`[BotBridge:${this.config.id}] Connecting to local Gateway: ${gatewayUrl}`);
      }

      this.client = new OpenClawClient({
        url: gatewayUrl,
        authToken: this.config.gateway.authToken,
        clientId: `clawchat-${this.config.id}`,
      });

      this.client.on('event:session.message', (payload: any) => this.handleSessionMessage(payload));
      this.client.on('event:session.tool', () => {});

      await this.client.connect();
      console.log(`[BotBridge:${this.config.id}] Connected (mode: ${this.connectionMode})`);
    })();

    await this.initPromise;
    return this.client!;
  }

  private async reconnectClient(newUrl: string) {
    try {
      this.client?.disconnect();
      this.client = new OpenClawClient({
        url: newUrl,
        authToken: this.config.gateway.authToken,
        clientId: `clawchat-${this.config.id}`,
      });
      this.client.on('event:session.message', (payload: any) => this.handleSessionMessage(payload));
      await this.client.connect();

      for (const sessionKey of this.subscribedSessions) {
        try {
          await this.client.rpc('sessions.messages.subscribe', { key: sessionKey });
        } catch {}
      }
      console.log(`[BotBridge:${this.config.id}] Reconnected`);
    } catch (err: any) {
      console.error(`[BotBridge:${this.config.id}] Reconnect failed:`, err.message);
    }
  }

  private handleSessionMessage(payload: any) {
    const { sessionKey, role, delta, done } = payload;
    if (role !== 'assistant') return;

    for (const [runId, stream] of this.activeStreams) {
      if (runId.startsWith(sessionKey + ':')) {
        const text = delta || '';
        if (text) {
          stream.chunks.push(text);
          for (const listener of stream.listeners) listener(text, false);
        }
        if (done) {
          stream.done = true;
          for (const listener of stream.listeners) listener('', true);
        }
        return;
      }
    }
  }

  private async getSessionForRoom(roomId: string): Promise<string> {
    if (this.roomSessions.has(roomId)) {
      return this.roomSessions.get(roomId)!;
    }

    const gw = await this.ensureClient();
    const label = `ClawChat room: ${roomId} [bot:${this.config.id}]`;

    let sessionKey: string | undefined;
    try {
      const list = await gw.rpc('sessions.list', { label });
      const sessions = list?.sessions || list || [];
      if (Array.isArray(sessions) && sessions.length > 0) {
        sessionKey = sessions[0].sessionKey || sessions[0].key || sessions[0].id;
      }
    } catch (err: any) {
      console.warn(`[BotBridge:${this.config.id}] sessions.list failed: ${err.message}`);
    }

    if (!sessionKey) {
      const result = await gw.rpc('sessions.create', {
        label,
        agentId: this.config.gateway.agentId,
      });
      sessionKey = result.sessionKey || result.key || result.id;
      if (!sessionKey) throw new Error('No sessionKey in sessions.create response');
    }

    this.roomSessions.set(roomId, sessionKey);

    if (!this.subscribedSessions.has(sessionKey)) {
      try {
        await gw.rpc('sessions.messages.subscribe', { key: sessionKey });
        this.subscribedSessions.add(sessionKey);
      } catch (err: any) {
        console.warn(`[BotBridge:${this.config.id}] Subscribe failed: ${err.message}`);
      }
    }

    return sessionKey;
  }

  /** Stream bot response */
  async *streamResponse(content: string, context: BotContext): AsyncGenerator<string> {
    let gw: OpenClawClient;
    try {
      gw = await this.ensureClient();
    } catch {
      yield* this.mockStream(content);
      return;
    }

    const sessionKey = await this.getSessionForRoom(context.roomId);
    const runId = `${sessionKey}:${crypto.randomBytes(4).toString('hex')}`;

    const stream: ActiveStream = { chunks: [], done: false, listeners: new Set() };
    this.activeStreams.set(runId, stream);

    try {
      const sendResult = await gw.rpc('chat.send', {
        sessionKey,
        message: content,
        idempotencyKey: crypto.randomBytes(16).toString('hex'),
      }, 10000);

      const chatRunId = sendResult?.runId;
      if (!chatRunId) {
        yield '⚠️ Failed to start AI response';
        return;
      }

      try {
        await gw.rpc('agent.wait', { runId: chatRunId, timeoutMs: 120000 }, 130000);
      } catch (err: any) {
        console.error(`[BotBridge:${this.config.id}] agent.wait failed:`, err.message);
      }

      try {
        const history = await gw.rpc('chat.history', { sessionKey, limit: 5 });
        const messages = history?.messages || (Array.isArray(history) ? history : []);
        const assistantMsgs = messages.filter((m: any) => m.role === 'assistant');
        if (assistantMsgs.length > 0) {
          const text = this.extractContentValue(assistantMsgs[assistantMsgs.length - 1].content);
          if (text) { yield text; return; }
        }
      } catch (err: any) {
        console.error(`[BotBridge:${this.config.id}] chat.history failed:`, err.message);
      }

      yield '⚠️ AI responded but could not extract the response text';
    } finally {
      this.activeStreams.delete(runId);
    }
  }

  async getStatus(): Promise<BotStatus> {
    try {
      const gw = await this.ensureClient();
      const health = await gw.rpc('health');
      return {
        connected: true,
        model: health?.model || 'openclaw',
        uptime: health?.uptime || process.uptime(),
      };
    } catch {
      return {
        connected: this.client?.isConnected ?? false,
        model: this.connectionMode === 'mock' ? 'mock (no token)' : `openclaw (${this.connectionMode}, disconnected)`,
        uptime: process.uptime(),
      };
    }
  }

  getConnectionMode(): string {
    return this.connectionMode;
  }

  shutdown() {
    this.client?.disconnect();
    this.tunnel?.stop();
  }

  private extractContentValue(content: any): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.filter((p: any) => p.type === 'text' && typeof p.text === 'string').map((p: any) => p.text).join('\n');
    }
    if (content && typeof content.text === 'string') return content.text;
    return JSON.stringify(content);
  }

  private async *mockStream(content: string): AsyncGenerator<string> {
    const lower = content.toLowerCase();
    let response: string;
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('你好')) {
      response = `Hey there! 👋 I'm ${this.config.username} running in demo mode. Set the auth token to connect to a real OpenClaw Gateway!`;
    } else {
      response = `⚠️ **Demo Mode** — ${this.config.username} is not connected to OpenClaw Gateway. Configure auth token to enable real AI responses.\n\nYour message: "${content.slice(0, 80)}${content.length > 80 ? '...' : ''}"`;
    }

    const words = response.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield (i === 0 ? '' : ' ') + words[i];
      await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 50));
    }
  }
}

// ── Legacy exports for backward compatibility ──

import { getRespondingBots, getBridge, isBotUser as _isBotUser } from './bot-registry.js';

/** @deprecated Use bot-registry.ts streamBotResponse instead */
export async function* streamBotResponse(content: string, context: BotContext): AsyncGenerator<string> {
  // Legacy: use first available bot
  const bots = getRespondingBots(content, context.roomId, context.userId);
  const bot = bots[0];
  if (!bot) {
    yield '⚠️ No bot configured to respond';
    return;
  }
  const bridge = getBridge(bot.id);
  if (!bridge) {
    yield '⚠️ Bot bridge not found';
    return;
  }
  yield* bridge.streamResponse(content, context);
}

export async function getBotStatus(): Promise<BotStatus> {
  // Legacy: return status of first bot
  const { getAllBots } = await import('./bot-registry.js');
  const allBots = getAllBots();
  if (allBots.length === 0) return { connected: false, model: 'none', uptime: 0 };
  const bridge = getBridge(allBots[0].id);
  return bridge ? bridge.getStatus() : { connected: false, model: 'none', uptime: 0 };
}

export function getConnectionMode(): string {
  return 'registry';
}

export function shutdown() {
  // Import dynamically to avoid circular dependency at module level
  import('./bot-registry.js').then(({ shutdownAll }) => shutdownAll());
}
