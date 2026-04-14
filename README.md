# ClawChat 💬

A web-based chat application for talking with AI bots, built with OpenClaw as the default backend.

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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| Realtime | Socket.IO |
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| Markdown | react-markdown + remark-gfm + rehype-highlight |

## Quick Start

```bash
# Clone
git clone https://github.com/neilbao1109/my-test-bot-repo.git
cd my-test-bot-repo

# Install dependencies
cd packages/server && npm install
cd ../client && npm install
cd ../..

# Start server (port 3001)
cd packages/server && npm run dev

# In another terminal, start client (port 5173)
cd packages/client && npm run dev
```

Open http://localhost:5173 in your browser.

## Project Structure

```
packages/
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── stores/      # Zustand state management
│   │   ├── services/    # Socket.IO service
│   │   └── types/       # TypeScript types
│   └── ...
├── server/              # Node.js backend
│   ├── src/
│   │   ├── db/          # SQLite schema
│   │   ├── routes/      # REST API
│   │   ├── services/    # Business logic
│   │   └── socket/      # WebSocket handlers
│   └── ...
docs/
├── PRD.md               # Product requirements
└── ARCHITECTURE.md      # Technical architecture
```

## Documentation

- [Product Requirements (PRD)](docs/PRD.md)
- [Technical Architecture](docs/ARCHITECTURE.md)

## License

MIT
