import WebSocket from 'ws';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

/**
 * OpenClaw Gateway WebSocket client.
 * Connects to the Gateway, handles challenge-response handshake with a
 * **persistent** ed25519 keypair so the device identity stays stable across
 * restarts and reconnects.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');

interface GatewayConfig {
  url: string;
  authToken: string;
  clientId?: string;
}

interface PendingRequest {
  resolve: (payload: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PersistedIdentity {
  publicKeyDer: string;   // base64
  privateKeyDer: string;  // base64
  deviceId: string;
  deviceToken?: string;
}

export class OpenClawClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: GatewayConfig;
  private pending = new Map<string, PendingRequest>();
  private connected = false;
  private handshakeComplete = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Persistent identity
  private identity!: PersistedIdentity;
  private publicKey!: crypto.KeyObject;
  private privateKey!: crypto.KeyObject;

  constructor(config: GatewayConfig) {
    super();
    this.config = config;
    this.loadOrCreateIdentity();
  }

  // ── Identity persistence ──

  private get identityPath(): string {
    return path.join(DATA_DIR, 'device-identity.json');
  }

  /**
   * Extract raw 32-byte ed25519 public key from SPKI DER.
   * SPKI DER for ed25519 = 12-byte prefix + 32-byte raw key.
   */
  private static extractRawPublicKey(publicKey: crypto.KeyObject): Buffer {
    const spki = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    // ed25519 SPKI prefix: 302a300506032b6570032100
    const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
    if (spki.length === ED25519_SPKI_PREFIX.length + 32 &&
        spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
      return spki.subarray(ED25519_SPKI_PREFIX.length);
    }
    return spki;
  }

  /** base64url encode (no padding) */
  private static base64url(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  /** Derive deviceId the same way the Gateway does: sha256(raw_32_bytes).hex() */
  private static deriveDeviceId(publicKey: crypto.KeyObject): string {
    const raw = OpenClawClient.extractRawPublicKey(publicKey);
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private loadOrCreateIdentity() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Try to load existing identity
    if (fs.existsSync(this.identityPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.identityPath, 'utf-8')) as PersistedIdentity;
        const pubDer = Buffer.from(raw.publicKeyDer, 'base64');
        const privDer = Buffer.from(raw.privateKeyDer, 'base64');

        this.publicKey = crypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' });
        this.privateKey = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });

        // Re-derive deviceId to ensure it matches Gateway's algorithm
        const correctId = OpenClawClient.deriveDeviceId(this.publicKey);
        if (raw.deviceId !== correctId) {
          console.warn(`[OpenClaw] Fixing deviceId: ${raw.deviceId} → ${correctId}`);
          raw.deviceId = correctId;
        }
        this.identity = raw;
        this.saveIdentity();

        console.log(`[OpenClaw] Loaded device identity: ${raw.deviceId}`);
        return;
      } catch (err: any) {
        console.warn('[OpenClaw] Failed to load identity, generating new:', err.message);
      }
    }

    // Generate new keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pubDer = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    const privDer = privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer;
    const deviceId = OpenClawClient.deriveDeviceId(publicKey);

    this.publicKey = publicKey;
    this.privateKey = privateKey;
    this.identity = {
      publicKeyDer: pubDer.toString('base64'),
      privateKeyDer: privDer.toString('base64'),
      deviceId,
    };

    this.saveIdentity();
    console.log(`[OpenClaw] Created new device identity: ${deviceId}`);
  }

  private saveIdentity() {
    try {
      fs.writeFileSync(this.identityPath, JSON.stringify(this.identity, null, 2));
    } catch (err: any) {
      console.warn('[OpenClaw] Failed to save identity:', err.message);
    }
  }

  // ── Connection ──

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
    if (frame.type === 'event' && frame.event === 'connect.challenge') {
      this.handleChallenge(frame.payload, connectResolve, connectReject);
      return;
    }

    if (frame.type === 'res') {
      const pending = this.pending.get(frame.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(frame.id);
        if (frame.ok) {
          // Check for hello-ok with device token
          if (frame.payload?.type === 'hello-ok' && frame.payload.auth?.deviceToken) {
            this.identity.deviceToken = frame.payload.auth.deviceToken;
            this.saveIdentity();
            console.log('[OpenClaw] Device token saved');
          }
          pending.resolve(frame.payload);
        } else {
          pending.reject(new Error(frame.error?.message || 'RPC error'));
        }
        return;
      }

      if (frame.payload?.type === 'hello-ok') {
        this.handshakeComplete = true;
        if (frame.payload.auth?.deviceToken) {
          this.identity.deviceToken = frame.payload.auth.deviceToken;
          this.saveIdentity();
        }
        console.log(`[OpenClaw] Handshake complete, protocol ${frame.payload.protocol}`);
        connectResolve?.();
        return;
      }
    }

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
      // Send raw 32-byte public key as base64url (Gateway expects this format)
      const rawPubKey = OpenClawClient.extractRawPublicKey(this.publicKey);
      const pubKeyB64Url = OpenClawClient.base64url(rawPubKey);
      const now = Date.now();

      // Sign with v3 payload
      const signPayload = JSON.stringify({
        version: 'v3',
        deviceId: this.identity.deviceId,
        clientId: 'gateway-client',
        role: 'operator',
        scopes: ['operator.read', 'operator.write'],
        token: this.config.authToken,
        nonce: challenge.nonce,
        signedAt: now,
        platform: 'linux',
        deviceFamily: 'server',
      });
      const signature = crypto.sign(null, Buffer.from(signPayload), this.privateKey).toString('base64');

      const connectId = this.genId();

      // Build auth — prefer stored device token for reconnects
      const auth: Record<string, string> = { token: this.config.authToken };
      if (this.identity.deviceToken) {
        auth.deviceToken = this.identity.deviceToken;
      }

      const connectReq = {
        type: 'req',
        id: connectId,
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'gateway-client',
            version: '0.1.0',
            platform: 'linux',
            mode: 'backend',
          },
          role: 'operator',
          scopes: ['operator.read', 'operator.write'],
          caps: [],
          commands: [],
          permissions: {},
          auth,
          locale: 'en-US',
          userAgent: 'gateway-client/0.1.0',
          device: {
            id: this.identity.deviceId,
            publicKey: pubKeyB64Url,
            signature,
            signedAt: now,
            nonce: challenge.nonce,
          },
        },
      };

      this.pending.set(connectId, {
        resolve: (payload: any) => {
          this.handshakeComplete = true;
          if (payload?.auth?.deviceToken) {
            this.identity.deviceToken = payload.auth.deviceToken;
            this.saveIdentity();
          }
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

  // ── RPC ──

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
