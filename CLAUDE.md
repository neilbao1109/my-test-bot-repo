# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ClawChat — a web-based chat app for talking with AI bots, backed by an OpenClaw Gateway. npm workspaces monorepo with a React/Vite client and a Node/Express/Socket.IO server.

## Commands

Install once at the repo root: `npm install` (hoists workspaces).

Dev:
- `npm run dev` — start server + client concurrently
- `npm run dev:server` — server only (tsx watch, default port `3001`, configurable via `PORT`)
- `npm run dev:client` — client only (Vite, port `5173`)

Build / run:
- `npm run build` — builds both packages (server `tsc`, client `tsc -b && vite build`)
- `npm start` — runs the built server (`node packages/server/dist/index.js`)
- `./scripts/restart.sh` — graceful SIGTERM-then-restart for the prod server. Note: this script hard-codes `PORT=3003`, which differs from the dev default of `3001`; check before using.

There is no test runner or linter configured. Type-checking is via `tsc` as part of each package's build.

To run something inside one workspace without `cd`: `npm -w packages/server run <script>` / `npm -w packages/client run <script>`.

## Configuration

Server reads `.env` from `packages/server/`. Copy `packages/server/.env.example` to `.env`. Key variables: `OPENCLAW_AUTH_TOKEN` (without it the bot returns mock responses), `OPENCLAW_GATEWAY_URL`, `OPENCLAW_SSH_HOST` (enables auto SSH tunnel mode), `PORT`, `CLIENT_URL` (CORS). Full list in README.

## Architecture

Three-tier: **Browser (React) ⇄ Socket.IO ⇄ ClawChat Server ⇄ OpenClaw Gateway (WebSocket)**. Bot responses stream end-to-end (Gateway → server → client) chunk-by-chunk via the `bot:stream` socket event.

### Server (`packages/server/src`)

- `index.ts` — Express + Socket.IO bootstrap, graceful shutdown on SIGTERM.
- `socket/handlers.ts` — single place where all Socket.IO events are wired. The event protocol (e.g. `message:send`, `message:edit`, `message:react`, `typing:start`, `command:exec`, server-side `message:new`, `bot:stream`, `typing:update`, …) is documented in `docs/ARCHITECTURE.md` §5 and is the contract with the client.
- `routes/` — REST endpoints split by concern: `auth.ts` (JWT login/register, bcrypt), `api.ts` (rooms/messages/threads/etc.), `upload.ts` (multer file upload), `push.ts`.
- `services/` — business logic, one file per domain (`room`, `thread`, `message`, `command`, `user`, `friendship`, `invitation`, `pin`, `bot-registry`, `bot-share`, `auth`). `io.ts` exposes the shared Socket.IO server instance so services can emit without depending on the socket handler module.
- `services/bot-bridge.ts` + `openclaw-client.ts` + `ssh-tunnel.ts` — the OpenClaw adapter. Four connection modes (local, remote-direct, remote-SSH-tunnel auto-managed, mock) are selected purely by which env vars are set; the SSH tunnel manager auto-reconnects. Bot responses are exposed as an async stream that the socket handler relays as `bot:stream` chunks.
- `db/schema.ts` — better-sqlite3 schema; the DB file lives in `packages/server/data/` (gitignored). Schema is applied at startup; there is no migration tool — edit `schema.ts` and recreate the DB when changing.

### Client (`packages/client/src`)

- `main.tsx` / `App.tsx` — root, routing between login and the chat shell.
- `services/` — Socket.IO singleton client; all realtime traffic goes through here.
- `stores/` — Zustand stores, sliced by domain (rooms, messages, users, …). Components subscribe via selectors; the socket service dispatches into stores on incoming events.
- `components/` — feature-scoped folders (ChatView, ThreadPanel, Sidebar, CommandBar, BotMarketplace, BotRegistration, etc.). Markdown is rendered with `react-markdown` + `remark-gfm` + `rehype-highlight`; styling is Tailwind.
- `hooks/`, `utils/`, `types/` — shared helpers and the TS types that mirror the server protocol.

### Cross-cutting

- Slash commands (`/help`, `/clear`, `/model`, `/status`, `/system`, `/export`, `/thread`) are sent as `command:exec` and dispatched server-side in `services/command.ts`; responses come back as either normal messages or `command:result`.
- Threads are modeled as messages with a `threadId` pointing at a parent message; the parent's `replyCount`/`lastReplyAt` are maintained server-side.
- When changing socket events, update both `socket/handlers.ts` and the client `services/` socket layer + relevant store; the type definitions in `client/src/types/` and `server/src/types.ts` are the source of truth for payload shapes.

## Docs

- `docs/ARCHITECTURE.md` — authoritative architecture + WebSocket event protocol (in Chinese).
- `docs/PRD.md` — product requirements.
- `docs/clawchat-v2-plan.md`, `docs/clawchat-contacts-plan.md`, `docs/rfc-bot-deregister.md` — in-flight design notes; consult before changing the relevant subsystems.
