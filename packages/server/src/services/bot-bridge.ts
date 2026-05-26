import type { BotContext, BotStatus } from '../types.js';
import type { BotConfig } from './bot-registry.js';
import { OpenClawClient } from './openclaw-client.js';
import { SshTunnel, tunnelConfigFromEnv } from './ssh-tunnel.js';
import { getPlatformContext } from './platform-context.js';
import crypto from 'crypto';

/**
 * BotBridge — per-bot OpenClaw Gateway connection.
 * Each bot gets its own client, session map, and streaming state.
 */

interface ActiveStream {
  chunks: string[];
  done: boolean;
  listeners: Set<(chunk: string, done: boolean) => void>;
  gwRunId?: string; // Gateway runId for matching agent events
  lastActivity: number; // timestamp of last agent event (including tool calls)
}

type ConnectionMode = 'local' | 'remote-url' | 'ssh-tunnel' | 'mock';

const DEFAULT_GW_URL = 'ws://127.0.0.1:18789';

export class BotBridge {
  private config: BotConfig;
  private client: OpenClawClient | null = null;
  private tunnel: SshTunnel | null = null;
  private initPromise: Promise<void> | null = null;
  private roomSessions = new Map<string, string>();
  private sessionRooms = new Map<string, string>(); // reverse: sessionKey → roomId
  private activeStreams = new Map<string, ActiveStream>();
  private subscribedSessions = new Set<string>();
  private activeResponseSessions = new Set<string>();
  private contextInjectedSessions = new Set<string>(); // tracks which sessions got platform context + chat history
  private lastChatSendTime = new Map<string, number>(); // sessionKey → timestamp of last chat.send
  private knownSessionIds = new Map<string, string>(); // sessionKey → last known sessionId (for reset detection)
  private connectionMode: ConnectionMode;
  private mgmtSessionKey: string | null = null;

  /** Callback for push messages (cron, heartbeat, etc.) */
  onPushMessage?: (roomId: string, botId: string, content: string) => void;

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
        clientId: this.config.identityKey || `clawchat-${this.config.id}`,
      });

      this.client.on('event:session.message', (payload: any) => this.handleSessionMessage(payload));
      this.client.on('event:session.tool', () => {});
      this.client.on('event:agent', (payload: any) => this.handleAgentEvent(payload));
      this.client.on('event:chat', (payload: any) => this.handleChatEvent(payload));

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
        clientId: this.config.identityKey || `clawchat-${this.config.id}`,
      });
      this.client.on('event:session.message', (payload: any) => this.handleSessionMessage(payload));
      this.client.on('event:agent', (payload: any) => this.handleAgentEvent(payload));
      this.client.on('event:chat', (payload: any) => this.handleChatEvent(payload));
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

  private handleAgentEvent(payload: any) {
    const { runId: gwRunId, stream, data, sessionKey } = payload;
    if (!gwRunId) return;
    // Debug: log every agent event with matching context
    if (this.activeStreams.size > 0) {
      const streamEntries = [...this.activeStreams.entries()].map(([k, v]) => `${k.slice(0,30)}→gwR:${v.gwRunId?.slice(0,20)}`);
      console.log(`[BotBridge:${this.config.id}] handleAgentEvent: gwRunId=${gwRunId.slice(0,20)} stream=${stream} activeStreams=[${streamEntries.join(', ')}]`);
    }
    // data can be empty for some event types, but we still need to process for mapping

    // Find matching active stream by gwRunId
    let matched = false;
    for (const [streamKey, activeStream] of this.activeStreams) {
      if (activeStream.gwRunId === gwRunId) {
        matched = true;
        // Update activity timestamp for ANY agent event (keeps idle timeout alive during tool calls)
        activeStream.lastActivity = Date.now();

        // If the agent event sessionKey differs from the BotBridge session key,
        // map it to the same room (this captures the agent main session key)
        if (sessionKey && !this.sessionRooms.has(sessionKey)) {
          for (const [rid, sk] of this.roomSessions) {
            if (streamKey.startsWith(sk + ':')) {
              this.sessionRooms.set(sessionKey, rid);
              console.log(`[BotBridge:${this.config.id}] Mapped agent main session ${sessionKey} -> room ${rid}`);
              break;
            }
          }
          if (!this.sessionRooms.has(sessionKey)) {
            console.log(`[BotBridge:${this.config.id}] Failed to map: streamKey=${streamKey} roomSessions=${JSON.stringify([...this.roomSessions.entries()].map(([k,v])=>v).slice(0,3))}`);
          }
        }

        if (data && stream === 'assistant' && typeof data.delta === 'string' && data.delta.length > 0) {
          activeStream.chunks.push(data.delta);
          for (const listener of activeStream.listeners) listener(data.delta, false);
        } else if (data && stream === 'lifecycle' && data.endedAt) {
          activeStream.done = true;
          this.completedRunIds.add(gwRunId);
          setTimeout(() => this.completedRunIds.delete(gwRunId), 30000);
          for (const listener of activeStream.listeners) listener('', true);
        }
        return;
      }
    }
    if (!matched && this.activeStreams.size > 0) {
      const streamGwRunIds = [...this.activeStreams.values()].map(s => s.gwRunId).join(',');
      console.log(`[BotBridge:${this.config.id}] agent event unmatched: gwRunId=${gwRunId.slice(0,20)} activeStreams=${this.activeStreams.size} streamGwRunIds=${streamGwRunIds}`);
    }
  }

  /** Accumulated announce text, keyed by runId */
  private announceBuffers = new Map<string, { sessionKey: string; chunks: string[]; timer: ReturnType<typeof setTimeout> | null }>();
  private completedRunIds = new Set<string>();

  /**
   * Handle 'chat' events from Gateway.
   * Two responsibilities:
   * 1. Map agent main session key → room (from regular chat events that match an activeStream)
   * 2. Capture announce replies and push them to the room
   */
  private handleChatEvent(payload: any) {
    const { runId, sessionKey, state, message } = payload;
    if (!runId || !sessionKey) return;

    // --- Mapping: learn the agent main session key from ANY chat event ---
    // When a regular chat event arrives with a runId matching our activeStream,
    // the sessionKey is the agent main session. Map it to the room.
    if (!this.sessionRooms.has(sessionKey)) {
      for (const [, activeStream] of this.activeStreams) {
        if (activeStream.gwRunId === runId) {
          // Find which room this activeStream belongs to
          for (const [streamKey] of this.activeStreams) {
            if (this.activeStreams.get(streamKey) === activeStream) {
              for (const [rid, sk] of this.roomSessions) {
                if (streamKey.startsWith(sk + ':')) {
                  this.sessionRooms.set(sessionKey, rid);
                  console.log(`[BotBridge:${this.config.id}] Mapped agent main session ${sessionKey} -> room ${rid} (via chat event)`);
                  break;
                }
              }
              break;
            }
          }
          break;
        }
      }
    }

    // --- Announce / push-back handling ---
    // Previously checked for runId.startsWith('announce:'), but Gateway doesn't
    // use that prefix. Instead, detect "unsolicited" chat events for sessions
    // we know map to a room but have no active stream (e.g. sub-agent completion
    // triggers a new agent turn after the original stream ended).

    // Skip if this runId was already handled by streamResponse
    if (this.completedRunIds.has(runId)) return;

    // Skip if there's an active stream for this session (streamResponse handles it)
    let hasActiveStream = false;
    for (const [key] of this.activeStreams) {
      if (key.startsWith(sessionKey + ':')) {
        hasActiveStream = true;
        break;
      }
    }
    if (hasActiveStream || this.activeResponseSessions.has(sessionKey)) {
      // Active stream exists — streamResponse will handle this
      return;
    }

    const roomId = this.sessionRooms.get(sessionKey);
    if (!roomId || !this.onPushMessage) {
      if (state === 'final') {
        console.log(`[BotBridge:${this.config.id}] Chat event (no room mapping): sessionKey=${sessionKey.slice(0,40)} sessionRooms keys=[${[...this.sessionRooms.keys()].map(k => k.slice(0,30)).join(', ')}]`);
      }
      return;
    }

    // Only push back if this session had a recent chat.send from us (within 10 min)
    // This prevents pushing webchat/other-client turns back to ClawChat
    const PUSH_BACK_WINDOW_MS = 600000; // 10 min
    const lastSend = this.lastChatSendTime.get(sessionKey);
    if (!lastSend || (Date.now() - lastSend > PUSH_BACK_WINDOW_MS)) {
      if (state === 'final') {
        console.log(`[BotBridge:${this.config.id}] Push-back skipped (no recent chat.send): sessionKey=${sessionKey.slice(0,40)} lastSend=${lastSend ? new Date(lastSend).toISOString() : 'never'}`);
      }
      return;
    }

    console.log(`[BotBridge:${this.config.id}] Push-back chat event: runId=${runId.slice(0,20)} state=${state} sessionKey=${sessionKey.slice(0,40)} room=${roomId.slice(0,12)}`);

    // Accumulate text from delta messages
    if (state === 'delta' && message?.content) {
      const text = this.extractContentValue(message.content);
      if (text) {
        let buf = this.announceBuffers.get(runId);
        if (!buf) {
          buf = { sessionKey, chunks: [], timer: null };
          this.announceBuffers.set(runId, buf);
        }
        buf.chunks.push(text);
        if (buf.timer) clearTimeout(buf.timer);
        buf.timer = setTimeout(() => this.flushAnnounceBuffer(runId, roomId), 3000);
      }
    }

    // If we get a final, flush immediately with the complete text
    if (state === 'final') {
      if (message?.content) {
        const text = this.extractContentValue(message.content);
        if (text) {
          const buf = this.announceBuffers.get(runId);
          if (buf?.timer) clearTimeout(buf.timer);
          this.announceBuffers.delete(runId);
          console.log(`[BotBridge:${this.config.id}] Chat announce push text: [${text}] len=${text.length}`);
          if (/^(NO_REPLY|NO|HEARTBEAT_OK)\s*$/i.test(text.trim())) {
            console.log(`[BotBridge:${this.config.id}] Filtered out NO_REPLY/HEARTBEAT_OK: [${text}]`);
            return;
          }
          console.log(`[BotBridge:${this.config.id}] Chat announce push (final): room=${roomId}`);
          this.onPushMessage(roomId, this.config.id, text);
          return;
        }
      }
      this.flushAnnounceBuffer(runId, roomId);
    }
  }

  private flushAnnounceBuffer(runId: string, roomId: string) {
    const buf = this.announceBuffers.get(runId);
    if (!buf) return;
    if (buf.timer) clearTimeout(buf.timer);
    this.announceBuffers.delete(runId);

    const text = buf.chunks.join('');
    if (!text || !this.onPushMessage) return;
    if (/^(NO_REPLY|NO|HEARTBEAT_OK)\s*$/i.test(text.trim())) return;

    console.log(`[BotBridge:${this.config.id}] Chat announce push (debounce): room=${roomId} text=${text.slice(0, 80)}...`);
    this.onPushMessage(roomId, this.config.id, text);
  }

  private handleSessionMessage(payload: any) {
    const { sessionKey, role, delta, done, content } = payload;
    if (role !== 'assistant') return;

    // 1. Try to match an active stream (user-initiated request)
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

    // 2. Skip if this session has an active streamResponse (avoid duplicate)
    if (this.activeResponseSessions.has(sessionKey)) return;

    // 3. No active stream — this is a push message (cron, heartbeat, sub-agent announce, etc.)
    if (done) {
      let roomId = this.sessionRooms.get(sessionKey);

      // Fallback: try to recover mapping from session label
      if (!roomId) {
        this.tryRecoverRoomFromSession(sessionKey).then(recoveredRoomId => {
          if (recoveredRoomId && this.onPushMessage) {
            // Re-fetch the message content since we're in async recovery
            this.fetchLatestAssistantMessage(sessionKey).then(msg => {
              if (msg) this.onPushMessage?.(recoveredRoomId, this.config.id, msg);
            }).catch(() => {});
          }
        }).catch(() => {});
        return;
      }

      if (roomId && this.onPushMessage) {
        // Extract text from the content or delta
        let text = '';
        if (typeof content === 'string') {
          text = content;
        } else if (Array.isArray(content)) {
          text = content.filter((p: any) => p.type === 'text' && typeof p.text === 'string').map((p: any) => p.text).join('\n');
        } else if (delta) {
          // Accumulate — but since we only fire on done, delta might be empty
          // Fall back to fetching from history
        }

        if (!text) {
          // Try to get from chat.history
          this.fetchLatestAssistantMessage(sessionKey).then(msg => {
            if (msg && roomId) this.onPushMessage?.(roomId, this.config.id, msg);
          }).catch(() => {});
        } else {
          this.onPushMessage(roomId, this.config.id, text);
        }
      }
    }
  }

  private async fetchLatestAssistantMessage(sessionKey: string): Promise<string | null> {
    try {
      const gw = await this.ensureClient();
      const history = await gw.rpc('chat.history', { sessionKey, limit: 5 });
      const messages = history?.messages || (Array.isArray(history) ? history : []);
      const assistantMsgs = messages.filter((m: any) => m.role === 'assistant');
      for (let i = assistantMsgs.length - 1; i >= 0; i--) {
        const text = this.extractContentValue(assistantMsgs[i].content);
        if (text) return text;
      }
    } catch (err: any) {
      console.error(`[BotBridge:${this.config.id}] fetchLatestAssistantMessage failed:`, err.message);
    }
    return null;
  }

  private async getSessionForRoom(roomId: string): Promise<{ sessionKey: string; isNew: boolean }> {
    if (this.roomSessions.has(roomId)) {
      const sessionKey = this.roomSessions.get(roomId)!;
      // Check if the session has been reset by OpenClaw (daily reset, /new, etc.)
      try {
        const gw = await this.ensureClient();
        const info = await gw.rpc('sessions.get', { key: sessionKey });
        const currentSessionId = info?.sessionId || info?.id;
        const knownId = this.knownSessionIds.get(sessionKey);
        if (currentSessionId && knownId && currentSessionId !== knownId) {
          // Session was reset — clear context injection flag so history gets re-injected
          console.log(`[BotBridge:${this.config.id}] Session reset detected: ${sessionKey} (${knownId} -> ${currentSessionId})`);
          this.contextInjectedSessions.delete(sessionKey);
          this.knownSessionIds.set(sessionKey, currentSessionId);
        } else if (currentSessionId && !knownId) {
          this.knownSessionIds.set(sessionKey, currentSessionId);
        }
      } catch {
        // Non-critical — if we can't check, proceed without reset detection
      }
      return { sessionKey, isNew: false };
    }

    const gw = await this.ensureClient();
    const label = `ClawChat room: ${roomId} [bot:${this.config.id}]`;

    let sessionKey: string | undefined;
    let isNew = false;
    try {
      const list = await gw.rpc('sessions.list', { label });
      const sessions = list?.sessions || list || [];
      if (Array.isArray(sessions) && sessions.length > 0) {
        sessionKey = sessions[0].sessionKey || sessions[0].key || sessions[0].id;
        // Track the sessionId for future reset detection
        const sessionId = sessions[0].sessionId;
        if (sessionKey && sessionId) {
          this.knownSessionIds.set(sessionKey, sessionId);
        }
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
      isNew = true;
      // Track the new sessionId
      const sessionId = result.sessionId;
      if (sessionId) {
        this.knownSessionIds.set(sessionKey, sessionId);
      }
    }

    this.roomSessions.set(roomId, sessionKey);
    this.sessionRooms.set(sessionKey, roomId);

    if (!this.subscribedSessions.has(sessionKey)) {
      try {
        await gw.rpc('sessions.messages.subscribe', { key: sessionKey });
        this.subscribedSessions.add(sessionKey);
      } catch (err: any) {
        console.warn(`[BotBridge:${this.config.id}] Subscribe failed: ${err.message}`);
      }
    }

    return { sessionKey, isNew };
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

    let sessionKey: string;
    try {
      const result = await this.getSessionForRoom(context.roomId);
      sessionKey = result.sessionKey;
    } catch (err: any) {
      console.error(`[BotBridge:${this.config.id}] getSessionForRoom failed:`, err.message);
      yield '⚠️ Failed to create session';
      return;
    }

    // Mark session as having active response to prevent handleSessionMessage duplicate
    this.activeResponseSessions.add(sessionKey);

    const streamKey = `${sessionKey}:${crypto.randomBytes(4).toString('hex')}`;
    const stream: ActiveStream = { chunks: [], done: false, listeners: new Set(), lastActivity: Date.now() };
    this.activeStreams.set(streamKey, stream);

    try {
      let sendResult: any;
      try {
        // Inject platform context and chat history on first message of each session
        let messageBody = `[clawchat:room_id=${context.roomId}]\n${content}`;
        if (!this.contextInjectedSessions.has(sessionKey)) {
          const platformCtx = getPlatformContext();
          if (platformCtx) {
            messageBody = `[PLATFORM_CONTEXT]\n${platformCtx}\n[/PLATFORM_CONTEXT]\n\n${messageBody}`;
          }

          // Inject chat history for context recovery
          // This fires on the first message of each bot-bridge lifetime per session,
          // covering: new sessions, bot-bridge restarts, and session resets.
          // For daily-reset scenarios where bot-bridge stays running, we also clear
          // contextInjectedSessions periodically (see clearContextCache).
          try {
            const { buildChatHistoryContext } = await import('./message.js');
            const { getRoomMembers } = await import('./room.js');
            const members = getRoomMembers(context.roomId);
            const userMap = new Map(members.map(m => [m.id, m.username]));
            const { context: historyCtx, totalCount } = buildChatHistoryContext(context.roomId, userMap, 30);
            if (historyCtx) {
              messageBody = `[CHAT_HISTORY]\nThe following is the recent chat history of this room (${totalCount} messages total). Use it to maintain conversation continuity.\n\n${historyCtx}\n[/CHAT_HISTORY]\n\n${messageBody}`;
              console.log(`[BotBridge:${this.config.id}] Injected chat history: ${totalCount} total, recent batch for room ${context.roomId}`);
            }
          } catch (err: any) {
            console.warn(`[BotBridge:${this.config.id}] Chat history injection failed:`, err.message);
          }

          this.contextInjectedSessions.add(sessionKey);
        }

        sendResult = await gw.rpc('chat.send', {
          sessionKey,
          message: messageBody,
          idempotencyKey: crypto.randomBytes(16).toString('hex'),
        }, 10000);
      } catch (err: any) {
        console.error(`[BotBridge:${this.config.id}] chat.send failed:`, err.message);
        yield '⚠️ Failed to send message to AI';
        return;
      }

      const chatRunId = sendResult?.runId;
      const actualSessionKey = sendResult?.sessionKey;
      console.log(`[BotBridge:${this.config.id}] chat.send result: runId=${chatRunId} sessionKey=${sessionKey} actualSessionKey=${actualSessionKey} sendResultKeys=${Object.keys(sendResult || {}).join(',')}`);

      // If Gateway returned a different sessionKey (agent main session),
      // map it to the same room so announce events can find the room later
      if (actualSessionKey && actualSessionKey !== sessionKey) {
        const roomId = this.sessionRooms.get(sessionKey);
        if (roomId && !this.sessionRooms.has(actualSessionKey)) {
          this.sessionRooms.set(actualSessionKey, roomId);
          console.log(`[BotBridge:${this.config.id}] Mapped agent session ${actualSessionKey} -> room ${roomId}`);
        }
      }

      if (!chatRunId) {
        yield '⚠️ Failed to start AI response';
        return;
      }

      // Link the Gateway runId so handleAgentEvent can match
      stream.gwRunId = chatRunId;
      this.lastChatSendTime.set(sessionKey, Date.now());
      console.log(`[BotBridge:${this.config.id}] Streaming started, gwRunId=${chatRunId}`);

      // Event-driven: yield chunks as they arrive via handleAgentEvent
      const STREAM_TIMEOUT = 180000; // 3 min max
      const IDLE_TIMEOUT = 60000;    // 60s no activity at all (not just no text delta)
      const startTime = Date.now();
      let yieldedIndex = 0;

      while (true) {
        // Yield any new chunks
        while (yieldedIndex < stream.chunks.length) {
          yield stream.chunks[yieldedIndex];
          yieldedIndex++;
        }

        if (stream.done) break;

        // Check timeouts
        const now = Date.now();
        if (now - startTime > STREAM_TIMEOUT) {
          console.warn(`[BotBridge:${this.config.id}] Stream total timeout (${STREAM_TIMEOUT}ms)`);
          break;
        }
        if (now - stream.lastActivity > IDLE_TIMEOUT) {
          console.warn(`[BotBridge:${this.config.id}] Stream idle timeout (${IDLE_TIMEOUT}ms)`);
          break;
        }

        // Wait for next event
        await new Promise<void>((resolve) => {
          // Check if data arrived while we were yielding
          if (stream.done || stream.chunks.length > yieldedIndex) {
            resolve();
            return;
          }
          const onChunk = () => {
            stream.listeners.delete(onChunk);
            resolve();
          };
          stream.listeners.add(onChunk);
          // Safety: wake up every 5s to re-check timeouts
          setTimeout(() => {
            stream.listeners.delete(onChunk);
            resolve();
          }, 5000);
        });
      }

      // If no streaming chunks received, fallback to chat.history
      if (yieldedIndex === 0) {
        console.log(`[BotBridge:${this.config.id}] No streaming chunks, falling back to agent.wait + chat.history`);
        try {
          await gw.rpc('agent.wait', { runId: chatRunId, timeoutMs: 120000 }, 130000);
        } catch {}
        try {
          const history = await gw.rpc('chat.history', { sessionKey, limit: 10 });
          const messages = history?.messages || (Array.isArray(history) ? history : []);
          const assistantMsgs = messages.filter((m: any) => m.role === 'assistant');
          for (let i = assistantMsgs.length - 1; i >= 0; i--) {
            const text = this.extractContentValue(assistantMsgs[i].content);
            if (text) { yield text; return; }
          }
        } catch (err: any) {
          console.error(`[BotBridge:${this.config.id}] chat.history fallback failed:`, err.message);
        }
        yield '⚠️ AI responded but could not extract the response text';
      }
    } finally {
      this.activeStreams.delete(streamKey);
      this.activeResponseSessions.delete(sessionKey);
    }
  }

  async getSkills(): Promise<any> {
    const gw = await this.ensureClient();
    const result = await gw.rpc('skills.status', {});
    return result;
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

  async restoreAllRoomSessions(roomIds: string[]): Promise<void> {
    for (const roomId of roomIds) {
      try {
        const { sessionKey } = await this.getSessionForRoom(roomId);
        // Suppress unused variable warning — we only care about the side effect
        void sessionKey;
      } catch (err: any) {
        console.warn(`[BotBridge:${this.config.id}] restore session for room ${roomId} failed: ${err.message}`);
      }
    }
    console.log(`[BotBridge:${this.config.id}] Restored ${this.sessionRooms.size} room-session mappings`);
  }

  private async tryRecoverRoomFromSession(sessionKey: string): Promise<string | null> {
    try {
      const gw = await this.ensureClient();
      const info = await gw.rpc('sessions.get', { key: sessionKey });
      const label = info?.label || '';
      const match = label.match(/ClawChat room: ([a-f0-9-]+)/);
      if (match) {
        const roomId = match[1];
        this.roomSessions.set(roomId, sessionKey);
        this.sessionRooms.set(sessionKey, roomId);
        // Also subscribe if not already
        if (!this.subscribedSessions.has(sessionKey)) {
          try {
            await gw.rpc('sessions.messages.subscribe', { key: sessionKey });
            this.subscribedSessions.add(sessionKey);
          } catch {}
        }
        return roomId;
      }
    } catch (err: any) {
      console.warn(`[BotBridge:${this.config.id}] tryRecoverRoomFromSession failed: ${err.message}`);
    }
    return null;
  }

  /** Get or create a dedicated management session for skill deployment */
  private async getMgmtSession(): Promise<string> {
    if (this.mgmtSessionKey) return this.mgmtSessionKey;

    const gw = await this.ensureClient();
    const label = `ClawChat mgmt [bot:${this.config.id}]`;

    try {
      const list = await gw.rpc('sessions.list', { label });
      const sessions = list?.sessions || list || [];
      if (Array.isArray(sessions) && sessions.length > 0) {
        this.mgmtSessionKey = sessions[0].sessionKey || sessions[0].key || sessions[0].id;
        return this.mgmtSessionKey!;
      }
    } catch (err: any) {
      console.warn(`[BotBridge:${this.config.id}] mgmt sessions.list failed: ${err.message}`);
    }

    const result = await gw.rpc('sessions.create', {
      label,
      agentId: this.config.gateway.agentId,
    });
    this.mgmtSessionKey = result.sessionKey || result.key || result.id;
    if (!this.mgmtSessionKey) throw new Error('No sessionKey in mgmt sessions.create response');

    // Subscribe for responses
    try {
      await gw.rpc('sessions.messages.subscribe', { key: this.mgmtSessionKey });
      this.subscribedSessions.add(this.mgmtSessionKey);
    } catch {}

    return this.mgmtSessionKey;
  }

  /** Send a skill install instruction and wait for agent response */
  async sendSkillInstall(skillName: string, content: string): Promise<{ ok: boolean; error?: string }> {
    const gw = await this.ensureClient();
    const sessionKey = await this.getMgmtSession();

    const message = `[SKILL_INSTALL]\nname: ${skillName}\naction: install\n---\n${content}`;

    const sendResult = await gw.rpc('chat.send', {
      sessionKey,
      message,
      idempotencyKey: `skill-install-${skillName}-${Date.now()}`,
    }, 10000);

    const chatRunId = sendResult?.runId;
    if (!chatRunId) return { ok: false, error: 'Failed to start skill install' };

    // Wait for agent to complete (up to 120s)
    try {
      await gw.rpc('agent.wait', { runId: chatRunId, timeoutMs: 120000 }, 130000);
    } catch (err: any) {
      return { ok: false, error: `Agent timeout: ${err.message}` };
    }

    // Parse response
    try {
      const history = await gw.rpc('chat.history', { sessionKey, limit: 5 });
      const messages = history?.messages || (Array.isArray(history) ? history : []);
      const assistantMsgs = messages.filter((m: any) => m.role === 'assistant');
      for (let i = assistantMsgs.length - 1; i >= 0; i--) {
        const text = this.extractContentValue(assistantMsgs[i].content);
        if (text && text.includes('[SKILL_RESULT]')) {
          const match = text.match(/\[SKILL_RESULT\]\s*name=(\S+)\s+status=(\S+)(?:\s+reason=(.+))?/);
          if (match) {
            const status = match[2];
            if (status === 'ok') return { ok: true };
            return { ok: false, error: match[3] || 'Agent reported error' };
          }
        }
      }
    } catch (err: any) {
      return { ok: false, error: `Failed to read response: ${err.message}` };
    }

    return { ok: true }; // Assume success if no SKILL_RESULT found (agent may not follow protocol exactly)
  }

  /** Send a skill uninstall instruction */
  async sendSkillUninstall(skillName: string): Promise<{ ok: boolean; error?: string }> {
    const gw = await this.ensureClient();
    const sessionKey = await this.getMgmtSession();

    const message = `[SKILL_INSTALL]\nname: ${skillName}\naction: uninstall\n---`;

    const sendResult = await gw.rpc('chat.send', {
      sessionKey,
      message,
      idempotencyKey: `skill-uninstall-${skillName}-${Date.now()}`,
    }, 10000);

    const chatRunId = sendResult?.runId;
    if (!chatRunId) return { ok: false, error: 'Failed to start skill uninstall' };

    try {
      await gw.rpc('agent.wait', { runId: chatRunId, timeoutMs: 120000 }, 130000);
    } catch {}

    return { ok: true };
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

export async function getBotSkills(botId: string): Promise<any> {
  const bridge = getBridge(botId);
  if (!bridge) return { skills: [] };
  return bridge.getSkills();
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
