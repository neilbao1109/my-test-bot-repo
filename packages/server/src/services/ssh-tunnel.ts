import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import { EventEmitter } from 'events';

/**
 * SSH Tunnel Manager — auto-creates and maintains an SSH tunnel
 * to forward a local port to a remote OpenClaw Gateway.
 *
 * Environment variables:
 *   OPENCLAW_SSH_HOST       — remote host (e.g. user@gateway-host)
 *   OPENCLAW_SSH_KEY        — path to SSH private key (optional, uses default)
 *   OPENCLAW_SSH_PORT       — SSH port on remote (default: 22)
 *   OPENCLAW_REMOTE_GW_PORT — Gateway port on the remote host (default: 18789)
 *   OPENCLAW_LOCAL_GW_PORT  — Local port for the tunnel (default: auto-assigned)
 */

export interface TunnelConfig {
  sshHost: string;         // user@host
  sshPort?: number;        // default 22
  sshKey?: string;         // path to private key
  remoteGwHost?: string;   // default 127.0.0.1
  remoteGwPort?: number;   // default 18789
  localPort?: number;      // 0 = auto-assign
  keepAliveInterval?: number; // seconds, default 30
}

export class SshTunnel extends EventEmitter {
  private config: TunnelConfig;
  private process: ChildProcess | null = null;
  private localPort: number = 0;
  private alive = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stopping = false;

  constructor(config: TunnelConfig) {
    super();
    this.config = {
      sshPort: 22,
      remoteGwHost: '127.0.0.1',
      remoteGwPort: 18789,
      localPort: 0,
      keepAliveInterval: 30,
      ...config,
    };
  }

  /** Start the tunnel; resolves with the local port once the tunnel is up */
  async start(): Promise<number> {
    this.stopping = false;

    // If a specific local port was requested, use it; otherwise find a free one
    this.localPort = this.config.localPort || await this.findFreePort();

    return new Promise((resolve, reject) => {
      const args = this.buildSshArgs();
      console.log(`[SSH Tunnel] Starting: ssh ${args.join(' ')}`);

      this.process = spawn('ssh', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let resolved = false;
      let stderrBuf = '';

      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        stderrBuf += text;

        // Check for successful tunnel establishment
        // ssh -v prints "Local forwarding listening on 127.0.0.1 port XXXX"
        // or we detect the tunnel is ready when the process doesn't exit immediately
        if (text.includes('Permission denied') || text.includes('Connection refused')) {
          if (!resolved) {
            resolved = true;
            reject(new Error(`SSH tunnel failed: ${text.trim()}`));
          }
        }
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        // Normally no stdout for -N tunnel
      });

      this.process.on('error', (err) => {
        console.error('[SSH Tunnel] Process error:', err.message);
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      this.process.on('close', (code) => {
        this.alive = false;
        console.log(`[SSH Tunnel] Process exited with code ${code}`);
        this.emit('close', code);

        if (!resolved) {
          resolved = true;
          reject(new Error(`SSH tunnel exited immediately (code ${code}): ${stderrBuf.trim()}`));
        }

        if (!this.stopping) {
          this.scheduleRestart();
        }
      });

      // Give SSH a moment to establish the tunnel, then probe it
      setTimeout(async () => {
        if (resolved) return;
        try {
          await this.probePort(this.localPort);
          this.alive = true;
          resolved = true;
          console.log(`[SSH Tunnel] Tunnel up on localhost:${this.localPort} → ${this.config.sshHost}:${this.config.remoteGwPort}`);
          this.emit('ready', this.localPort);
          resolve(this.localPort);
        } catch {
          // Port not open yet, keep waiting
          setTimeout(async () => {
            if (resolved) return;
            try {
              await this.probePort(this.localPort);
              this.alive = true;
              resolved = true;
              console.log(`[SSH Tunnel] Tunnel up on localhost:${this.localPort}`);
              resolve(this.localPort);
            } catch {
              if (!resolved) {
                resolved = true;
                reject(new Error(`SSH tunnel: local port ${this.localPort} not reachable after timeout. stderr: ${stderrBuf.trim()}`));
              }
            }
          }, 5000);
        }
      }, 3000);
    });
  }

  stop() {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }
    this.alive = false;
  }

  get port(): number {
    return this.localPort;
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get gatewayUrl(): string {
    return `ws://127.0.0.1:${this.localPort}`;
  }

  private buildSshArgs(): string[] {
    const args: string[] = [
      '-N',                          // No remote command
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ExitOnForwardFailure=yes',
      '-o', `ServerAliveInterval=${this.config.keepAliveInterval}`,
      '-o', 'ServerAliveCountMax=3',
      '-p', String(this.config.sshPort),
      '-L', `${this.localPort}:${this.config.remoteGwHost}:${this.config.remoteGwPort}`,
    ];

    if (this.config.sshKey) {
      args.push('-i', this.config.sshKey);
    }

    args.push(this.config.sshHost);
    return args;
  }

  private async findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          const port = addr.port;
          server.close(() => resolve(port));
        } else {
          server.close(() => reject(new Error('Could not find free port')));
        }
      });
      server.on('error', reject);
    });
  }

  private async probePort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host: '127.0.0.1', port }, () => {
        sock.destroy();
        resolve();
      });
      sock.on('error', reject);
      sock.setTimeout(2000, () => {
        sock.destroy();
        reject(new Error('timeout'));
      });
    });
  }

  private scheduleRestart() {
    if (this.restartTimer || this.stopping) return;
    console.log('[SSH Tunnel] Will restart in 5s...');
    this.restartTimer = setTimeout(async () => {
      this.restartTimer = null;
      try {
        await this.start();
      } catch (err: any) {
        console.error('[SSH Tunnel] Restart failed:', err.message);
        this.scheduleRestart();
      }
    }, 5000);
  }
}

/**
 * Build tunnel config from environment variables.
 * Returns null if SSH tunneling is not configured.
 */
export function tunnelConfigFromEnv(): TunnelConfig | null {
  const sshHost = process.env.OPENCLAW_SSH_HOST;
  if (!sshHost) return null;

  return {
    sshHost,
    sshPort: parseInt(process.env.OPENCLAW_SSH_PORT || '22', 10),
    sshKey: process.env.OPENCLAW_SSH_KEY || undefined,
    remoteGwHost: process.env.OPENCLAW_REMOTE_GW_HOST || '127.0.0.1',
    remoteGwPort: parseInt(process.env.OPENCLAW_REMOTE_GW_PORT || '18789', 10),
    localPort: parseInt(process.env.OPENCLAW_LOCAL_GW_PORT || '0', 10),
  };
}
