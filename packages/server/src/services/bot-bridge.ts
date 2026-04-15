import type { BotContext, BotStatus } from '../types.js';
import { OpenClawClient } from './openclaw-client.js';
import crypto from 'crypto';

/**
 * Bot Bridge — real OpenClaw Gateway integration.
 *
 * Architecture:
 * - Connects to local OpenClaw Gateway via WebSocket (ws://127.0.0.1:18789)
 * - Creates a dedicated session per ClawChat room
 * - Sends user messages via sessions.send
 * - Streams AI responses back via session.message events
 *
 * Environment variables:
 *   OPENCLAW_GATEWAY_URL   — default ws://127.0.0.1:18789
 *   OPENCLAW_AUTH_TOKEN     — required, gateway auth token
 *   OPENCLAW_AGENT_ID       — optional, agent to use (defaults to 'default')
 */

const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
const AUTH_TOKEN = process.env.OPENCLAW_AUTH_TOKEN || '';
const AGENT_ID = process.env.OPENCLAW_AGENT_ID || undefined;

// Session map: roomId -> sessionKey
const roomSessions = new Map<string, string>();

// Active stream collectors: messageRunId -> { chunks, listeners }
interface ActiveStream {
  chunks: string[];
  done: boolean;
  listeners: Set<(chunk: string, done: boolean) => void>;
}
const activeStreams = new Map<string, ActiveStream>();

let client: OpenClawClient | null = null;
let clientReady = false;
let initPromise: Promise<void> | null = null;

// Track subscribed sessions to avoid duplicate subscribes
const subscribedSessions = new Set<string>();

async function ensureClient(): Promise<OpenClawClient> {
  if (client?.isConnected) return client;

  if (initPromise) {
    await initPromise;
    if (client?.isConnected) return client;
  }

  initPromise = (async () => {
    if (!AUTH_TOKEN) {
      console.warn('[BotBridge] OPENCLAW_AUTH_TOKEN not set — falling back to mock mode');
      throw new Error('No auth token configured');
    }

    client = new OpenClawClient({
      url: GATEWAY_URL,
      authToken: AUTH_TOKEN,
      clientId: 'clawchat-server',
    });

    // Listen for streaming events
    client.on('event:session.message', (payload: any) => {
      handleSessionMessage(payload);
    });

    client.on('event:session.tool', (payload: any) => {
      // Tool events can be ignored or logged
    });

    await client.connect();
    clientReady = true;
    console.log('[BotBridge] Connected to OpenClaw Gateway');
  })();

  await initPromise;
  return client!;
}

/** Handle incoming session.message events for streaming */
function handleSessionMessage(payload: any) {
  // payload: { sessionKey, role, content, delta?, done?, ... }
  const { sessionKey, role, delta, content, done } = payload;

  if (role !== 'assistant') return;

  // Find active stream for this session
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

/** Get or create a session for a room */
async function getSessionForRoom(roomId: string): Promise<string> {
  if (roomSessions.has(roomId)) {
    return roomSessions.get(roomId)!;
  }

  const gw = await ensureClient();

  // Create a dedicated session for this room
  try {
    const result = await gw.rpc('sessions.create', {
      label: `ClawChat room: ${roomId}`,
      agentId: AGENT_ID,
    });

    const sessionKey = result.sessionKey || result.key || result.id;
    if (!sessionKey) {
      throw new Error('No sessionKey in sessions.create response');
    }

    roomSessions.set(roomId, sessionKey);

    // Subscribe to session events for streaming
    if (!subscribedSessions.has(sessionKey)) {
      try {
        await gw.rpc('sessions.messages.subscribe', { sessionKey });
        subscribedSessions.add(sessionKey);
        console.log(`[BotBridge] Subscribed to session events: ${sessionKey}`);
      } catch (err: any) {
        console.warn(`[BotBridge] Failed to subscribe to session events: ${err.message}`);
      }
    }

    console.log(`[BotBridge] Created session ${sessionKey} for room ${roomId}`);
    return sessionKey;
  } catch (err: any) {
    console.error(`[BotBridge] Failed to create session:`, err.message);
    throw err;
  }
}

/**
 * Stream bot response via OpenClaw Gateway.
 * Yields text chunks as the AI generates them.
 */
export async function* streamBotResponse(content: string, context: BotContext): AsyncGenerator<string> {
  let gw: OpenClawClient;
  try {
    gw = await ensureClient();
  } catch {
    // Fall back to mock if gateway unavailable
    yield* mockStream(content);
    return;
  }

  const sessionKey = await getSessionForRoom(context.roomId);
  const runId = `${sessionKey}:${crypto.randomBytes(4).toString('hex')}`;

  // Set up stream collector
  const stream: ActiveStream = {
    chunks: [],
    done: false,
    listeners: new Set(),
  };
  activeStreams.set(runId, stream);

  try {
    // Create a promise-based chunk queue for async iteration
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

    // Send the message (this triggers the AI response)
    const sendPromise = gw.rpc('sessions.send', {
      sessionKey,
      message: content,
      agentId: AGENT_ID,
    }, 120000);  // 2 min timeout for AI generation

    // Also use agent.wait as fallback to get the complete response
    let fullResponseFromRpc: string | null = null;

    // Yield chunks as they arrive from the event stream
    let streamTimeout = setTimeout(() => {
      // If no chunks after 30s, the event subscription might not be working
      // Fall back to waiting for the RPC response
      stream.done = true;
      listener('', true);
    }, 30000);

    let yieldedAny = false;

    // Race between streaming events and RPC completion
    const rpcDone = sendPromise.then((result: any) => {
      clearTimeout(streamTimeout);
      // Extract text from the sessions.send response
      if (result?.summary || result?.content || result?.text) {
        fullResponseFromRpc = result.summary || result.content || result.text;
      }
      // If we have message/messages in result
      if (result?.messages) {
        const assistantMsgs = result.messages.filter((m: any) => m.role === 'assistant');
        if (assistantMsgs.length > 0) {
          fullResponseFromRpc = assistantMsgs.map((m: any) =>
            typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
          ).join('\n');
        }
      }
      if (!yieldedAny && fullResponseFromRpc) {
        // Push full response as a single chunk
        chunkQueue.push({ text: fullResponseFromRpc, done: false });
        chunkQueue.push({ text: '', done: true });
        if (chunkResolve) {
          chunkResolve();
          chunkResolve = null;
        }
      }
      // Mark stream as done
      stream.done = true;
      chunkQueue.push({ text: '', done: true });
      if (chunkResolve) {
        chunkResolve();
        chunkResolve = null;
      }
    }).catch((err: Error) => {
      clearTimeout(streamTimeout);
      console.error('[BotBridge] sessions.send failed:', err.message);
      chunkQueue.push({ text: `⚠️ Error: ${err.message}`, done: false });
      chunkQueue.push({ text: '', done: true });
      if (chunkResolve) {
        chunkResolve();
        chunkResolve = null;
      }
    });

    // Yield loop
    while (true) {
      if (chunkQueue.length === 0) {
        // Wait for next chunk
        await new Promise<void>(resolve => {
          chunkResolve = resolve;
        });
      }

      while (chunkQueue.length > 0) {
        const item = chunkQueue.shift()!;
        if (item.done) {
          return;
        }
        if (item.text) {
          yieldedAny = true;
          yield item.text;
        }
      }
    }
  } finally {
    // Cleanup
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
      model: AUTH_TOKEN ? 'openclaw (disconnected)' : 'mock',
      uptime: process.uptime(),
    };
  }
}

// ── Fallback mock (used when gateway is unavailable) ──

async function* mockStream(content: string): AsyncGenerator<string> {
  const lower = content.toLowerCase();
  let response: string;

  if (lower.includes('hello') || lower.includes('hi') || lower.includes('你好')) {
    response = "Hey there! 👋 I'm ClawBot. The OpenClaw Gateway isn't connected right now, so I'm in demo mode. Set `OPENCLAW_AUTH_TOKEN` to connect me to the real thing!";
  } else {
    response = `⚠️ **Demo Mode** — OpenClaw Gateway is not connected.\n\nTo enable real AI responses:\n1. Set \`OPENCLAW_AUTH_TOKEN\` environment variable\n2. Ensure the OpenClaw Gateway is running at \`${GATEWAY_URL}\`\n\nYour message: "${content.slice(0, 100)}${content.length > 100 ? '...' : ''}"`;
  }

  const words = response.split(' ');
  for (let i = 0; i < words.length; i++) {
    yield (i === 0 ? '' : ' ') + words[i];
    await new Promise(resolve => setTimeout(resolve, 30 + Math.random() * 50));
  }
}
