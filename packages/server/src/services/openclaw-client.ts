import WebSocket from 'ws';
import crypto from 'crypto';
import { EventEmitter } from 'events';

/**
 * OpenClaw Gateway WebSocket client.
 * Connects to the local Gateway, handles handshake + auth,
 * and exposes typed RPC call / event subscription helpers.
 */

interface GatewayConfig {
  url: string;           // ws://127.0.0.1:18789
  authToken: string;     // gateway.auth.token
  clientId?: string;
}

interface PendingRequest {
  resolve: (payload: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class OpenClawClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: GatewayConfig;
  private pending = new Map<string, PendingRequest>();
  private connected = false;
  private handshakeComplete = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private deviceId: string;
  private deviceKeyPair: { publicKey: string; privateKey: string } | null = null;

  constructor(config: GatewayConfig) {
    super();
    this.config = config;
    this.deviceId = config.clientId || `clawchat-${crypto.randomBytes(4).toString('hex')}`;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.on('open', () => {
          console.log('[OpenClaw] WebSocket connected');
          this.connected = true;
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const frame = JSON.parse(data.toString());
            this.handleFrame(frame, resolve, reject);
          } catch (err) {
            console.error('[OpenClaw] Failed to parse frame:', err);
          }
        });

        this.ws.on('close', (code, reason) => {
          console.log(`[OpenClaw] WebSocket closed: ${code} ${reason}`);
          this.connected = false;
          this.handshakeComplete = false;
          this.scheduleReconnect();
        });

        this.ws.on('error', (err) => {
          console.error('[OpenClaw] WebSocket error:', err.message);
          if (!this.handshakeComplete) {
            reject(err);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  private handleFrame(frame: any, connectResolve?: (v: void) => void, connectReject?: (e: Error) => void) {
    // Handle challenge
    if (frame.type === 'event' && frame.event === 'connect.challenge') {
      this.handleChallenge(frame.payload, connectResolve, connectReject);
      return;
    }

    // Handle response to our requests
    if (frame.type === 'res') {
      const pending = this.pending.get(frame.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(frame.id);
        if (frame.ok) {
          pending.resolve(frame.payload);
        } else {
          pending.reject(new Error(frame.error?.message || 'RPC error'));
        }
        return;
      }

      // This might be the connect response
      if (frame.payload?.type === 'hello-ok') {
        this.handshakeComplete = true;
        console.log(`[OpenClaw] Handshake complete, protocol ${frame.payload.protocol}`);
        connectResolve?.();
        return;
      }
    }

    // Handle server-push events
    if (frame.type === 'event') {
      this.emit('gateway-event', frame);
      this.emit(`event:${frame.event}`, frame.payload);
    }
  }

  private async handleChallenge(
    challenge: { nonce: string; ts: number },
    connectResolve?: (v: void) => void,
    connectReject?: (e: Error) => void
  ) {
    try {
      // Generate ephemeral keypair for device identity
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
      const pubKeyDer = publicKey.export({ type: 'spki', format: 'der' });
      const pubKeyB64 = pubKeyDer.toString('base64');

      // Compute device ID from public key fingerprint
      const fingerprint = crypto.createHash('sha256').update(pubKeyDer).digest('hex').slice(0, 16);
      this.deviceId = `clawchat-${fingerprint}`;

      // Sign challenge nonce (v3 payload)
      const signPayload = JSON.stringify({
        version: 'v3',
        deviceId: this.deviceId,
        clientId: 'clawchat-server',
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        token: this.config.authToken,
        nonce: challenge.nonce,
        signedAt: Date.now(),
        platform: 'linux',
        deviceFamily: 'server',
      });
      const signature = crypto.sign(null, Buffer.from(signPayload), privateKey).toString('base64');

      const connectId = this.genId();
      const connectReq = {
        type: 'req',
        id: connectId,
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'clawchat-server',
            version: '0.1.0',
            platform: 'linux',
            mode: 'operator',
          },
          role: 'operator',
          scopes: ['operator.read', 'operator.write'],
          caps: [],
          commands: [],
          permissions: {},
          auth: { token: this.config.authToken },
          locale: 'en-US',
          userAgent: 'clawchat-server/0.1.0',
          device: {
            id: this.deviceId,
            publicKey: pubKeyB64,
            signature,
            signedAt: Date.now(),
            nonce: challenge.nonce,
          },
        },
      };

      // Register pending for this connect id
      this.pending.set(connectId, {
        resolve: (payload: any) => {
          this.handshakeComplete = true;
          console.log('[OpenClaw] Handshake complete');
          connectResolve?.();
        },
        reject: (err: Error) => {
          connectReject?.(err);
        },
        timer: setTimeout(() => {
          this.pending.delete(connectId);
          connectReject?.(new Error('Connect handshake timed out'));
        }, 15000),
      });

      this.send(connectReq);
    } catch (err: any) {
      console.error('[OpenClaw] Challenge handling failed:', err);
      connectReject?.(err);
    }
  }

  /** Send a typed RPC request and wait for the response */
  async rpc(method: string, params: Record<string, any> = {}, timeoutMs = 30000): Promise<any> {
    if (!this.connected || !this.handshakeComplete) {
      throw new Error('Not connected to OpenClaw Gateway');
    }

    const id = this.genId();
    const req = { type: 'req', id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.send(req);
    });
  }

  /** Send a raw frame */
  private send(frame: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  get isConnected(): boolean {
    return this.connected && this.handshakeComplete;
  }

  private genId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      console.log('[OpenClaw] Attempting reconnect...');
      try {
        await this.connect();
      } catch (err: any) {
        console.error('[OpenClaw] Reconnect failed:', err.message);
        this.scheduleReconnect();
      }
    }, 5000);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.handshakeComplete = false;
  }
}
