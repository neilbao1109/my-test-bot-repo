# ClawChat 💬

A web-based chat application for talking with AI bots, powered by OpenClaw.

## Features

- **💬 Single & Multi-user Chat** — DM with a bot or invite multiple people to a room
- **🧵 Threads** — Open threads on any message for focused discussion
- **⚡ Streaming Responses** — Bot replies stream in real-time, character by character
- **📝 Markdown + Code Highlighting** — Rich message rendering with syntax highlighting
- **🎯 Slash Commands** — `/help`, `/clear`, `/model`, `/status`, `/system`, `/export`, `/thread`
- **😀 Reactions** — Emoji reactions on any message
- **✏️ Edit & Delete** — Edit or delete your own messages
- **⌨️ Typing Indicators** — See when others are typing
- **🌙 Dark Theme** — Modern dark UI, responsive for desktop and mobile
- **🤖 OpenClaw Integration** — Real AI responses via OpenClaw Gateway (with mock fallback)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| Realtime | Socket.IO |
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| AI | OpenClaw Gateway (WebSocket) |
| Markdown | react-markdown + remark-gfm + rehype-highlight |

## Quick Start

```bash
# Clone
git clone https://github.com/neilbao1109/my-test-bot-repo.git
cd my-test-bot-repo

# Install dependencies
npm install

# Configure OpenClaw (required for real AI responses)
cp packages/server/.env.example packages/server/.env
# Edit .env and set OPENCLAW_AUTH_TOKEN (see below)

# Start server (port 3001)
cd packages/server && npm run dev

# In another terminal, start client (port 5173)
cd packages/client && npm run dev
```

Open http://localhost:5173 in your browser.

## OpenClaw Integration

ClawChat connects to an OpenClaw Gateway for real AI responses. Three connection modes are supported:

### Mode 1 — Local (simplest)

Run ClawChat on the same machine as OpenClaw Gateway.

```bash
# .env
OPENCLAW_AUTH_TOKEN=your_token
```

Get your token: `openclaw config get gateway.auth.token`

### Mode 2 — Remote (direct URL)

Connect to a remote Gateway directly. Requires the Gateway port to be reachable (via Tailscale, VPN, or exposed port).

```bash
# .env
OPENCLAW_GATEWAY_URL=ws://your-server:18789
OPENCLAW_AUTH_TOKEN=your_token
```

### Mode 3 — Remote (auto SSH tunnel)

ClawChat automatically creates an SSH tunnel to the remote Gateway. No need to manually manage tunnels or expose ports.

```bash
# .env
OPENCLAW_SSH_HOST=user@your-server
OPENCLAW_AUTH_TOKEN=your_token

# Optional:
# OPENCLAW_SSH_KEY=~/.ssh/id_ed25519
# OPENCLAW_SSH_PORT=22
# OPENCLAW_REMOTE_GW_PORT=18789
```

The SSH tunnel auto-reconnects if the connection drops.

### Mode 4 — Mock (no token)

Without `OPENCLAW_AUTH_TOKEN`, the bot returns demo responses. Useful for frontend development.

### How It Works

```
┌──────────┐     Socket.IO     ┌───────────────┐     WS      ┌──────────────────┐
│ Browser  │ ◄──────────────── │ ClawChat      │ ◄────────── │ OpenClaw Gateway │
│ (React)  │ ──────────────▶   │ Server        │ ──────────▶ │ (local/remote)   │
└──────────┘                   │               │             └──────────────────┘
                               │  SSH tunnel?  │──── ssh ───▶ (auto if Mode 3)
                               └───────────────┘
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_AUTH_TOKEN` | _(none)_ | Gateway auth token (required for AI) |
| `OPENCLAW_GATEWAY_URL` | `ws://127.0.0.1:18789` | Direct Gateway URL (Mode 2) |
| `OPENCLAW_SSH_HOST` | _(none)_ | SSH host for tunnel (Mode 3) |
| `OPENCLAW_SSH_PORT` | `22` | SSH port |
| `OPENCLAW_SSH_KEY` | _(default)_ | Path to SSH private key |
| `OPENCLAW_REMOTE_GW_PORT` | `18789` | Gateway port on remote host |
| `OPENCLAW_LOCAL_GW_PORT` | `0` (auto) | Local port for SSH tunnel |
| `OPENCLAW_AGENT_ID` | `default` | Which OpenClaw agent to use |
| `PORT` | `3001` | ClawChat server port |
| `CLIENT_URL` | `http://localhost:5173` | Client URL for CORS |

## Project Structure

```
packages/
├── client/                  # React frontend
│   └── src/
│       ├── components/      # UI components
│       ├── hooks/           # Custom React hooks
│       ├── stores/          # Zustand state management
│       ├── services/        # Socket.IO service
│       └── types/           # TypeScript types
├── server/                  # Node.js backend
│   └── src/
│       ├── db/              # SQLite schema
│       ├── routes/          # REST API
│       ├── services/        # Business logic
│       │   ├── bot-bridge.ts      # OpenClaw Bot Bridge (4 modes)
│       │   ├── openclaw-client.ts # Gateway WS client
│       │   └── ssh-tunnel.ts      # Auto SSH tunnel manager
│       └── socket/          # WebSocket handlers
docs/
├── PRD.md                   # Product requirements
└── ARCHITECTURE.md          # Technical architecture
```

## Documentation

- [Product Requirements (PRD)](docs/PRD.md)
- [Technical Architecture](docs/ARCHITECTURE.md)

## License

MIT
