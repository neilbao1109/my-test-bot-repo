import type { BotContext, BotStatus } from '../types.js';
import { OpenClawClient } from './openclaw-client.js';
import { SshTunnel, tunnelConfigFromEnv } from './ssh-tunnel.js';
import crypto from 'crypto';

/**
 * Bot Bridge — OpenClaw Gateway integration with local + remote support.
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │                   Connection Modes                      │
 * ├─────────────────────────────────────────────────────────┤
 * │ Mode 1 — Local (default)                               │
 * │   ClawChat Server  ──WS──▶  localhost:18789 (Gateway)  │
 * │   Set: OPENCLAW_AUTH_TOKEN                              │
 * │                                                         │
 * │ Mode 2 — Remote via explicit URL                        │
 * │   ClawChat Server  ──WS──▶  remote:18789 (Gateway)     │
 * │   Set: OPENCLAW_GATEWAY_URL + OPENCLAW_AUTH_TOKEN       │
 * │                                                         │
 * │ Mode 3 — Remote via auto SSH tunnel                     │
 * │   ClawChat Server  ──SSH──▶  remote Gateway             │
 * │   Set: OPENCLAW_SSH_HOST + OPENCLAW_AUTH_TOKEN          │
 * │   (auto-creates tunnel, picks free local port)          │
 * │                                                         │
 * │ Mode 4 — Mock (no token)                                │
 * │   Demo responses, no Gateway needed                     │
 * └─────────────────────────────────────────────────────────┘
 *
 * Priority: SSH tunnel > explicit URL > local default
 */

// ── Config ──

const AUTH_TOKEN = process.env.OPENCLAW_AUTH_TOKEN || '';
const AGENT_ID = process.env.OPENCLAW_AGENT_ID || undefined;
const EXPLICIT_GW_URL = process.env.OPENCLAW_GATEWAY_URL || '';
const DEFAULT_GW_URL = 'ws://127.0.0.1:18789';

// ── State ──

const roomSessions = new Map<string, string>();

interface ActiveStream {
  chunks: string[];
  done: boolean;
  listeners: Set<(chunk: string, done: boolean) => void>;
}
const activeStreams = new Map<string, ActiveStream>();

let client: OpenClawClient | null = null;
let tunnel: SshTunnel | null = null;
let initPromise: Promise<void> | null = null;
const subscribedSessions = new Set<string>();

// ── Connection mode detection ──

type ConnectionMode = 'local' | 'remote-url' | 'ssh-tunnel' | 'mock';

function detectMode(): ConnectionMode {
  if (!AUTH_TOKEN) return 'mock';
  if (tunnelConfigFromEnv()) return 'ssh-tunnel';
  if (EXPLICIT_GW_URL) return 'remote-url';
  return 'local';
}

function getEffectiveGatewayUrl(): string {
  if (EXPLICIT_GW_URL) return EXPLICIT_GW_URL;
  return DEFAULT_GW_URL;
}

const connectionMode = detectMode();

// ── Init ──

async function ensureClient(): Promise<OpenClawClient> {
  if (client?.isConnected) return client;

  if (initPromise) {
    await initPromise;
    if (client?.isConnected) return client;
  }

  initPromise = (async () => {
    if (connectionMode === 'mock') {
      console.warn('[BotBridge] No OPENCLAW_AUTH_TOKEN — running in mock mode');
      throw new Error('No auth token configured');
    }

    let gatewayUrl: string;

    // Mode 3: SSH tunnel
    if (connectionMode === 'ssh-tunnel') {
      const tunnelConfig = tunnelConfigFromEnv()!;
      tunnel = new SshTunnel(tunnelConfig);

      console.log(`[BotBridge] Opening SSH tunnel to ${tunnelConfig.sshHost}...`);
      const localPort = await tunnel.start();
      gatewayUrl = `ws://127.0.0.1:${localPort}`;
      console.log(`[BotBridge] SSH tunnel ready: ${gatewayUrl} → ${tunnelConfig.sshHost}:${tunnelConfig.remoteGwPort || 18789}`);

      // Re-connect Gateway client if tunnel restarts
      tunnel.on('ready', (port: number) => {
        console.log(`[BotBridge] SSH tunnel restarted on port ${port}, reconnecting Gateway client...`);
        reconnectClient(`ws://127.0.0.1:${port}`);
      });
    }
    // Mode 2: explicit remote URL
    else if (connectionMode === 'remote-url') {
      gatewayUrl = EXPLICIT_GW_URL;
      console.log(`[BotBridge] Connecting to remote Gateway: ${gatewayUrl}`);
    }
    // Mode 1: local
    else {
      gatewayUrl = DEFAULT_GW_URL;
      console.log(`[BotBridge] Connecting to local Gateway: ${gatewayUrl}`);
    }

    client = new OpenClawClient({
      url: gatewayUrl,
      authToken: AUTH_TOKEN,
      clientId: 'clawchat-server',
    });

    // Listen for streaming events
    client.on('event:session.message', handleSessionMessage);
    client.on('event:session.tool', () => { /* ignored */ });

    await client.connect();
    console.log(`[BotBridge] Connected to OpenClaw Gateway (mode: ${connectionMode})`);
  })();

  await initPromise;
  return client!;
}

/** Reconnect to Gateway (e.g. after SSH tunnel restart) */
async function reconnectClient(newUrl: string) {
  try {
    client?.disconnect();
    client = new OpenClawClient({
      url: newUrl,
      authToken: AUTH_TOKEN,
      clientId: 'clawchat-server',
    });
    client.on('event:session.message', handleSessionMessage);
    await client.connect();

    // Re-subscribe sessions
    for (const sessionKey of subscribedSessions) {
      try {
        await client.rpc('sessions.messages.subscribe', { key: sessionKey });
      } catch { /* best effort */ }
    }

    console.log('[BotBridge] Reconnected to Gateway');
  } catch (err: any) {
    console.error('[BotBridge] Reconnect failed:', err.message);
  }
}

// ── Session message streaming ──

function handleSessionMessage(payload: any) {
  const { sessionKey, role, delta, done } = payload;
  if (role !== 'assistant') return;

  for (const [runId, stream] of activeStreams) {
    if (runId.startsWith(sessionKey + ':')) {
      const text = delta || '';
      if (text) {
        stream.chunks.push(text);
        for (const listener of stream.listeners) {
          listener(text, false);
        }
      }
      if (done) {
        stream.done = true;
        for (const listener of stream.listeners) {
          listener('', true);
        }
      }
      return;
    }
  }
}

// ── Session management ──

async function getSessionForRoom(roomId: string): Promise<string> {
  if (roomSessions.has(roomId)) {
    return roomSessions.get(roomId)!;
  }

  const gw = await ensureClient();

  const result = await gw.rpc('sessions.create', {
    label: `ClawChat room: ${roomId}`,
    agentId: AGENT_ID,
  });

  const sessionKey = result.sessionKey || result.key || result.id;
  if (!sessionKey) {
    throw new Error('No sessionKey in sessions.create response');
  }

  roomSessions.set(roomId, sessionKey);

  // Subscribe to session events
  if (!subscribedSessions.has(sessionKey)) {
    try {
      await gw.rpc('sessions.messages.subscribe', { key: sessionKey });
      subscribedSessions.add(sessionKey);
      console.log(`[BotBridge] Subscribed to session: ${sessionKey}`);
    } catch (err: any) {
      console.warn(`[BotBridge] Subscribe failed: ${err.message}`);
    }
  }

  console.log(`[BotBridge] Created session ${sessionKey} for room ${roomId}`);
  return sessionKey;
}

// ── Public API ──

/**
 * Stream bot response via OpenClaw Gateway.
 * Yields text chunks as the AI generates them.
 */
export async function* streamBotResponse(content: string, context: BotContext): AsyncGenerator<string> {
  let gw: OpenClawClient;
  try {
    gw = await ensureClient();
  } catch {
    yield* mockStream(content);
    return;
  }

  const sessionKey = await getSessionForRoom(context.roomId);
  const runId = `${sessionKey}:${crypto.randomBytes(4).toString('hex')}`;

  const stream: ActiveStream = {
    chunks: [],
    done: false,
    listeners: new Set(),
  };
  activeStreams.set(runId, stream);

  try {
    const chunkQueue: Array<{ text: string; done: boolean }> = [];
    let chunkResolve: (() => void) | null = null;

    const listener = (text: string, done: boolean) => {
      chunkQueue.push({ text, done });
      if (chunkResolve) {
        chunkResolve();
        chunkResolve = null;
      }
    };
    stream.listeners.add(listener);

    // Send message (triggers AI response)
    const sendPromise = gw.rpc('sessions.send', {
      key: sessionKey,
      message: content,
      agentId: AGENT_ID,
    }, 120000);

    let yieldedAny = false;

    // Timeout: if no streaming events arrive in 30s, fall back to RPC result
    const streamTimeout = setTimeout(() => {
      stream.done = true;
      listener('', true);
    }, 30000);

    // When RPC completes, push the full response if streaming didn't work
    sendPromise.then((result: any) => {
      clearTimeout(streamTimeout);
      console.log('[BotBridge] sessions.send result:', JSON.stringify(result, null, 2)?.slice(0, 500));
      if (!yieldedAny) {
        const text = extractResponseText(result);
        console.log('[BotBridge] Extracted text:', text?.slice(0, 200));
        if (text) {
          chunkQueue.push({ text, done: false });
        }
      }
      chunkQueue.push({ text: '', done: true });
      if (chunkResolve) { chunkResolve(); chunkResolve = null; }
    }).catch((err: Error) => {
      clearTimeout(streamTimeout);
      console.error('[BotBridge] sessions.send failed:', err.message);
      chunkQueue.push({ text: `⚠️ Error: ${err.message}`, done: false });
      chunkQueue.push({ text: '', done: true });
      if (chunkResolve) { chunkResolve(); chunkResolve = null; }
    });

    // Yield loop
    while (true) {
      if (chunkQueue.length === 0) {
        await new Promise<void>(r => { chunkResolve = r; });
      }
      while (chunkQueue.length > 0) {
        const item = chunkQueue.shift()!;
        if (item.done) return;
        if (item.text) {
          yieldedAny = true;
          yield item.text;
        }
      }
    }
  } finally {
    activeStreams.delete(runId);
  }
}

export async function getBotStatus(): Promise<BotStatus> {
  try {
    const gw = await ensureClient();
    const health = await gw.rpc('health');
    return {
      connected: true,
      model: health?.model || 'openclaw',
      uptime: health?.uptime || process.uptime(),
    };
  } catch {
    return {
      connected: client?.isConnected ?? false,
      model: connectionMode === 'mock' ? 'mock (no token)' : `openclaw (${connectionMode}, disconnected)`,
      uptime: process.uptime(),
    };
  }
}

/** Return current connection mode for status display */
export function getConnectionMode(): string {
  return connectionMode;
}

/** Graceful shutdown */
export function shutdown() {
  client?.disconnect();
  tunnel?.stop();
}

// ── Helpers ──

function extractResponseText(result: any): string | null {
  if (!result) return null;
  if (result.summary) return result.summary;
  if (result.content) return result.content;
  if (result.text) return result.text;
  if (result.messages) {
    const assistant = result.messages.filter((m: any) => m.role === 'assistant');
    if (assistant.length > 0) {
      return assistant.map((m: any) =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      ).join('\n');
    }
  }
  return null;
}

// ── Fallback mock ──

async function* mockStream(content: string): AsyncGenerator<string> {
  const lower = content.toLowerCase();
  let response: string;

  if (lower.includes('hello') || lower.includes('hi') || lower.includes('你好')) {
    response = "Hey there! 👋 I'm ClawBot running in demo mode. Set `OPENCLAW_AUTH_TOKEN` to connect to a real OpenClaw Gateway!";
  } else {
    response = [
      `⚠️ **Demo Mode** — Not connected to OpenClaw Gateway.`,
      ``,
      `To enable real AI responses, configure one of:`,
      ``,
      `**Local Gateway:**`,
      '```',
      `OPENCLAW_AUTH_TOKEN=your_token`,
      '```',
      ``,
      `**Remote Gateway (direct):**`,
      '```',
      `OPENCLAW_GATEWAY_URL=ws://your-server:18789`,
      `OPENCLAW_AUTH_TOKEN=your_token`,
      '```',
      ``,
      `**Remote Gateway (SSH tunnel):**`,
      '```',
      `OPENCLAW_SSH_HOST=user@your-server`,
      `OPENCLAW_AUTH_TOKEN=your_token`,
      '```',
      ``,
      `Your message: "${content.slice(0, 80)}${content.length > 80 ? '...' : ''}"`,
    ].join('\n');
  }

  const words = response.split(' ');
  for (let i = 0; i < words.length; i++) {
    yield (i === 0 ? '' : ' ') + words[i];
    await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 50));
  }
}
