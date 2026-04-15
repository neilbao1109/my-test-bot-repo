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

ClawChat connects to your local OpenClaw Gateway for real AI responses.

### Setup

1. Make sure OpenClaw Gateway is running:
   ```bash
   openclaw gateway status
   ```

2. Get your auth token:
   ```bash
   openclaw config get gateway.auth.token
   ```

3. Set it in `packages/server/.env`:
   ```
   OPENCLAW_AUTH_TOKEN=your_token_here
   ```

### How It Works

The Bot Bridge (`packages/server/src/services/bot-bridge.ts`) connects to the OpenClaw Gateway via WebSocket:

1. **Handshake** — Authenticates with the Gateway using ed25519 device identity
2. **Session Management** — Creates a dedicated OpenClaw session per ClawChat room
3. **Message Streaming** — Sends user messages via `sessions.send` and subscribes to `session.message` events for real-time streaming
4. **Fallback** — If the Gateway is unavailable, falls back to demo mode with mock responses

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_GATEWAY_URL` | `ws://127.0.0.1:18789` | Gateway WebSocket URL |
| `OPENCLAW_AUTH_TOKEN` | _(none)_ | Gateway auth token (required) |
| `OPENCLAW_AGENT_ID` | `default` | Which agent to use |
| `PORT` | `3001` | Server port |
| `CLIENT_URL` | `http://localhost:5173` | Client URL for CORS |

> Without `OPENCLAW_AUTH_TOKEN`, the bot runs in demo mode with mock responses.

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
│       │   ├── bot-bridge.ts      # OpenClaw Bot Bridge
│       │   └── openclaw-client.ts # Gateway WS client
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
