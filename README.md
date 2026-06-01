# ClawChat 💬

A self-hosted web chat app for talking with AI bots, powered by [OpenClaw](https://github.com/openclaw/openclaw). Register multiple bots, share them with friends, and chat in real-time.

## Features

### 💬 Chat
- **Real-time messaging** — Socket.IO with streaming bot responses
- **Threads** — focused side-conversations on any message
- **Reactions** — emoji reactions on messages
- **Reply / Quote** — reply to specific messages with context
- **Edit & Delete** — edit or delete your own messages
- **Message forwarding** — forward individual or merged messages to other rooms
- **Pin messages** — pin important messages for quick reference
- **Typing indicators** — see when others are typing
- **Markdown rendering** — rich text with syntax-highlighted code blocks

### 🤖 Bot Management
- **Multi-bot support** — register multiple OpenClaw bots, each with its own Gateway connection
- **UI-based registration** — register bots via the app (OpenClaw Pair protocol + token mode)
- **Bot lifecycle** — pause, resume, deregister, and restore bots
- **Bot sharing** — share your registered bots with other users via invitation
- **Skill deployment** — deploy custom skills to bots through the UI
- **Platform context** — inject system-level context into bot conversations

### 👥 Social
- **User auth** — email/password registration and login (JWT)
- **Friend system** — send/accept friend requests, manage friend list
- **Invitations** — room invites, bot share invites with accept/reject flow
- **Group chat** — create rooms and invite multiple users + bots

### 🔍 Search
- **Global search** — two-layer search: rooms first, then messages within a room
- **Search highlighting** — matched keywords highlighted with context snippets
- **Jump to message** — click a search result to scroll to and highlight the original message

### 🎤 Voice
- **Speech-to-text** — voice input via Azure Speech Service
- **Text-to-speech** — bot messages read aloud via Azure Speech Service

### 📎 Files
- **Content-Addressable Storage (CAS)** — files stored by SHA-256 hash, automatic deduplication
- **SeaweedFS S3 backend** — S3-compatible object storage, swappable to AWS S3 / R2 / MinIO
- **File & image upload** — drag-and-drop or click to upload (up to 50MB)
- **Client-side image compression** — 4 quality tiers (original / high / medium / low)
- **File preview** — inline image preview and file download
- **Immutable caching** — CAS objects are content-addressed, enabling permanent CDN/browser caching

### 🌐 Internationalization
- **Chinese & English** — full i18n coverage with `zh` and `en` locales
- **Switchable in settings** — no restart needed

### 📱 Mobile & PWA
- **Responsive layout** — optimized for desktop and mobile
- **iOS/Android touch** — long-press menus, touch-friendly interactions
- **Dark / Light theme** — toggle in settings

### 📣 Push Notifications
- **HTTP webhook** — `POST /api/push` endpoint for external integrations (cron jobs, CI, etc.)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| Realtime | Socket.IO |
| Backend | Node.js + Express + TypeScript |
| Database | SQLite (better-sqlite3) |
| Auth | JWT (jsonwebtoken + bcrypt) |
| File Upload | Multer + SeaweedFS S3 (CAS) |
| AI Backend | OpenClaw Gateway (WebSocket, ed25519 device auth) |
| Voice | Azure Speech Service (STT + TTS) |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| i18n | Custom locale system (zh / en) |

## Quick Start

```bash
# Clone
git clone https://github.com/neilbao1109/my-test-bot-repo.git
cd my-test-bot-repo

# Install dependencies
npm install

# Configure server
cp packages/server/.env.example packages/server/.env
# Edit .env — see Environment Variables below

# Start both server and client
npm run dev
# Or separately:
#   npm run dev:server   → server on port 3001
#   npm run dev:client   → client on port 5173
```

Open http://localhost:5173, register an account, then register a bot to start chatting.

## Bot Registration

ClawChat uses a **multi-bot architecture** — each user can register their own bots, each connecting to an OpenClaw Gateway independently.

### How to Register a Bot

1. Open **Settings** → **Bots** → **Register Bot**
2. Enter the Gateway URL and auth credentials
3. The app initiates the OpenClaw Pair protocol (ed25519 device auth)
4. Once paired, the bot appears in your bot list and is ready to chat

### Bot Features

- **Pause / Resume** — temporarily disable a bot without losing its config
- **Deregister / Restore** — soft-delete with option to restore later
- **Share** — invite other users to use your registered bot
- **Skills** — deploy custom skills to a bot through the UI

### Without a Gateway

If you don't have an OpenClaw Gateway, you can still use the app for group messaging between users — just skip bot registration.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |
| `JWT_SECRET` | _(random)_ | Secret for signing JWT tokens. Set this to persist sessions across restarts |
| `PUBLIC_URL` | _(none)_ | Public URL of the server (for remote bot connections) |
| `CORS_ORIGIN` | `*` | Allowed CORS origin for Socket.IO |
| `AZURE_SPEECH_KEY` | _(none)_ | Azure Speech Service key (for STT + TTS) |
| `AZURE_SPEECH_REGION` | _(none)_ | Azure Speech Service region |
| `CLAWCHAT_PUSH_SECRET` | _(none)_ | Optional secret for push webhook auth |
| `BOTS_CONFIG` | _(none)_ | JSON array of pre-configured system bots (optional) |
| `S3_ENDPOINT` | `http://127.0.0.1:8333` | SeaweedFS S3 endpoint |
| `S3_BUCKET` | `clawchat-cas` | S3 bucket for CAS file storage |
| `S3_ACCESS_KEY` | `clawchat_access` | S3 access key |
| `S3_SECRET_KEY` | _(none)_ | S3 secret key |
| `S3_REGION` | `us-east-1` | S3 region (SeaweedFS ignores this) |

> **Note:** Gateway connection settings (URL, auth token) are per-bot and configured through the UI, not via environment variables.

## Project Structure

```
packages/
├── client/                        # React frontend
│   └── src/
│       ├── components/
│       │   ├── ChatView/          # Main chat area
│       │   ├── MessageBubble/     # Message rendering + action overlay
│       │   ├── ThreadPanel/       # Thread side panel
│       │   ├── Sidebar/           # Room list, contacts, settings, search, folders
│       │   ├── BotRegistration/   # Bot registration UI
│       │   ├── BotMarketplace/    # Browse available bots
│       │   ├── BotShareModal/     # Share bot with users
│       │   ├── ForwardToolbar/    # Message forwarding UI
│       │   ├── SearchBar/         # Global search
│       │   ├── PinnedBar/        # Pinned messages bar
│       │   ├── MemberPanel/       # Room member list
│       │   ├── CreateRoomModal/   # Create group room
│       │   ├── LoginScreen/       # Auth UI
│       │   ├── InvitationList/    # Pending invitations
│       │   ├── FriendProfile/     # Friend details
│       │   ├── FilePreviewModal/  # File/image preview
│       │   ├── CommandBar/        # Command input
│       │   └── UserAvatar/        # Avatar component
│       ├── hooks/
│       │   ├── useSocket.ts       # Socket.IO event handling
│       │   └── useT.ts           # i18n translation hook
│       ├── locales/               # zh + en translations
│       ├── stores/appStore.ts     # Zustand global state
│       ├── services/
│       │   ├── socket.ts          # Socket.IO client
│       │   ├── auth.ts            # Auth API calls
│       │   ├── upload.ts          # File upload + compression
│       │   └── skill-api.ts       # Skill deployment API
│       └── types/                 # TypeScript types
│
├── server/                        # Node.js backend
│   └── src/
│       ├── db/schema.ts           # SQLite schema + migrations
│       ├── routes/
│       │   ├── api.ts             # REST API (rooms, messages, users)
│       │   ├── auth.ts            # Register / login / token verify
│       │   ├── upload.ts          # File upload endpoint (CAS)
│       │   ├── files.ts           # CAS file download proxy
│       │   └── push.ts           # Webhook push endpoint
│       ├── services/
│       │   ├── bot-bridge.ts      # OpenClaw bot ↔ chat bridge
│       │   ├── bot-registry.ts    # Multi-bot registration & lifecycle
│       │   ├── bot-share.ts       # Bot sharing between users
│       │   ├── openclaw-client.ts # Gateway WS client (ed25519 + pair protocol)
│       │   ├── ssh-tunnel.ts      # Auto SSH tunnel manager
│       │   ├── auth.ts            # JWT auth logic
│       │   ├── user.ts            # User management
│       │   ├── room.ts            # Room CRUD
│       │   ├── message.ts         # Message CRUD
│       │   ├── thread.ts          # Thread management
│       │   ├── pin.ts             # Message pinning
│       │   ├── friendship.ts      # Friend system
│       │   ├── invitation.ts      # Invitation system
│       │   ├── skill-deploy.ts    # Skill deployment to bots
│       │   ├── speech-to-text.ts  # Azure STT
│       │   ├── text-to-speech.ts  # Azure TTS
│       │   ├── platform-context.ts # Bot platform context
│       │   ├── io.ts              # Shared Socket.IO instance
│       │   └── command.ts         # Slash command definitions
│       │   ├── file-store.ts      # CAS file storage (S3 client)
│       │   ├── file-upload-db.ts  # File upload index (SQLite)
│       ├── socket/handlers.ts     # Socket.IO event handlers
│       └── types.ts               # Shared TypeScript types
│
docs/
├── PRD.md                         # Product requirements
├── ARCHITECTURE.md                # Technical architecture
├── clawchat-contacts-plan.md      # Contacts feature plan
├── clawchat-v2-plan.md            # V2 roadmap
├── rfc-bot-deregister.md          # Bot deregister RFC
├── rfc-bot-skill-sharing.md       # Skill sharing RFC
└── design/
    └── seaweedfs-cas-file-storage.md  # CAS file storage design doc
```

## Architecture

```
┌──────────────┐    Socket.IO     ┌─────────────────┐     WS (ed25519)     ┌──────────────────┐
│   Browser    │ ◄──────────────► │  ClawChat       │ ◄──────────────────► │ OpenClaw Gateway │
│   (React)    │                  │  Server          │                      │ (per bot)        │
└──────────────┘                  │                  │                      └──────────────────┘
                                  │  Bot Registry    │──── manages N bots
                                  │  SQLite DB       │──── users, rooms, messages, bots, friends
                                  │  File Storage    │──── SeaweedFS S3 (CAS)
                                  └─────────────────┘
                                          │
                                          ▼
                                  ┌─────────────────┐
                                  │  SeaweedFS       │
                                  │  S3 Gateway      │──── 127.0.0.1:8333
                                  │  (CAS objects)   │──── /data/seaweedfs
                                  └─────────────────┘
```

Each registered bot maintains its own WebSocket connection to an OpenClaw Gateway with persistent ed25519 device identity. The Bot Registry manages lifecycle (connect, pause, resume, deregister) and the Bot Bridge routes messages between chat rooms and bot sessions.

File storage uses **Content-Addressable Storage (CAS)** backed by SeaweedFS in S3-compatible mode. Files are addressed by SHA-256 hash, providing automatic deduplication and immutable caching. The S3 backend is swappable — change the `S3_ENDPOINT` to point to AWS S3, Cloudflare R2, or MinIO with zero code changes.

### SeaweedFS Setup

```bash
# Install SeaweedFS binary
curl -L https://github.com/seaweedfs/seaweedfs/releases/download/4.30/linux_amd64.tar.gz | tar xz
sudo mv weed /usr/local/bin/

# Create data directory
sudo mkdir -p /data/seaweedfs

# Start (development)
weed server -dir=/data/seaweedfs -filer -s3 -ip=127.0.0.1 -s3.port=8333

# Or use systemd (production)
sudo systemctl enable --now weed-server
```

After starting, configure S3 credentials:

```bash
weed shell -master=127.0.0.1:9333 <<< \
  's3.configure -apply -user clawchat -actions Read,Write,List,Tagging,Admin -access_key clawchat_access -secret_key <your_secret>'
```

## Documentation

- [Product Requirements (PRD)](docs/PRD.md)
- [Technical Architecture](docs/ARCHITECTURE.md)

## License

MIT
