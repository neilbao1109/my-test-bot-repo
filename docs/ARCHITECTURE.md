# ClawChat — 技术架构文档

## 1. 技术选型

| 层 | 技术 | 理由 |
|----|------|------|
| **前端框架** | React 18 + TypeScript | 生态成熟，组件化开发 |
| **构建工具** | Vite | 极快的 HMR，零配置 TypeScript |
| **UI 组件** | Tailwind CSS + Headless UI | 高度可定制，不引入重型 UI 库 |
| **状态管理** | Zustand | 轻量、TypeScript 友好 |
| **实时通信** | WebSocket (socket.io-client) | 双向实时通信 |
| **后端** | Node.js + Express + Socket.IO | 与前端同语言，Socket.IO 处理 WS |
| **Bot 接入** | OpenClaw WebChat API / HTTP API | 初期通过 HTTP 转发，后期可直连 |
| **数据存储** | SQLite (better-sqlite3) | MVP 轻量，无需额外数据库服务 |
| **Markdown** | react-markdown + remark-gfm + rehype-highlight | 完整 Markdown + 代码高亮 |

## 2. 系统架构

```
┌────────────────────────────────────────────────────┐
│                    Browser                          │
│  ┌──────────────────────────────────────────────┐  │
│  │           ClawChat Frontend (React)           │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │  │
│  │  │ ChatView │ │ ThreadPanel│ │ CommandBar  │  │  │
│  │  └────┬─────┘ └─────┬────┘ └──────┬───────┘  │  │
│  │       │              │             │          │  │
│  │  ┌────▼──────────────▼─────────────▼───────┐  │  │
│  │  │         WebSocket (Socket.IO)            │  │  │
│  │  └─────────────────┬───────────────────────┘  │  │
│  └────────────────────┼──────────────────────────┘  │
└───────────────────────┼─────────────────────────────┘
                        │
              ┌─────────▼─────────┐
              │   ClawChat Server  │
              │   (Node + Express) │
              │                    │
              │  ┌──────────────┐  │
              │  │ Room Manager │  │
              │  │ Thread Mgr   │  │
              │  │ Command Proc │  │
              │  │ User Session │  │
              │  └──────┬───────┘  │
              │         │          │
              │  ┌──────▼───────┐  │
              │  │   SQLite DB  │  │
              │  └──────────────┘  │
              │         │          │
              │  ┌──────▼───────┐  │
              │  │  Bot Bridge  │──┼──► OpenClaw API / WebSocket
              │  └──────────────┘  │
              └────────────────────┘
```

## 3. 目录结构

```
my-test-bot-repo/
├── docs/                    # 文档
│   ├── PRD.md
│   └── ARCHITECTURE.md
├── packages/
│   ├── client/              # 前端 React 应用
│   │   ├── src/
│   │   │   ├── components/  # UI 组件
│   │   │   │   ├── ChatView/
│   │   │   │   ├── MessageBubble/
│   │   │   │   ├── ThreadPanel/
│   │   │   │   ├── Sidebar/
│   │   │   │   ├── CommandBar/
│   │   │   │   └── UserAvatar/
│   │   │   ├── hooks/       # 自定义 Hooks
│   │   │   ├── stores/      # Zustand stores
│   │   │   ├── services/    # API / WebSocket 服务
│   │   │   ├── types/       # TypeScript 类型定义
│   │   │   ├── utils/       # 工具函数
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── tailwind.config.js
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── server/              # 后端 Node.js 服务
│       ├── src/
│       │   ├── index.ts         # 入口
│       │   ├── socket/          # Socket.IO 事件处理
│       │   ├── routes/          # REST API 路由
│       │   ├── services/        # 业务逻辑
│       │   │   ├── room.ts
│       │   │   ├── thread.ts
│       │   │   ├── message.ts
│       │   │   ├── command.ts
│       │   │   └── bot-bridge.ts
│       │   ├── db/              # 数据库
│       │   │   ├── schema.ts
│       │   │   └── migrations/
│       │   └── types/
│       ├── tsconfig.json
│       └── package.json
├── package.json             # Monorepo root (workspaces)
├── tsconfig.base.json
├── .gitignore
└── README.md
```

## 4. 核心数据模型

```typescript
// User
interface User {
  id: string;           // UUID
  username: string;
  avatarUrl?: string;
  isBot: boolean;
  isOnline: boolean;
  createdAt: Date;
}

// Room (会话/房间)
interface Room {
  id: string;
  name: string;
  type: 'dm' | 'group';  // dm = 与 Bot 单聊, group = 多人房间
  members: string[];      // user IDs
  createdAt: Date;
}

// Message
interface Message {
  id: string;
  roomId: string;
  threadId?: string;      // 所属 Thread（如果是 Thread 内消息）
  userId: string;         // 发送者
  content: string;        // Markdown 内容
  type: 'text' | 'command' | 'system' | 'file';
  replyTo?: string;       // 引用的消息 ID
  reactions: Record<string, string[]>; // emoji -> userIds
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Thread
interface Thread {
  id: string;
  roomId: string;
  parentMessageId: string;  // 发起 Thread 的消息
  replyCount: number;
  lastReplyAt: Date;
}

// Command
interface Command {
  name: string;           // e.g. "help", "clear", "model"
  description: string;
  args?: string;
  handler: (args: string, context: CommandContext) => Promise<void>;
}
```

## 5. WebSocket 事件协议

```typescript
// Client → Server
'room:join'        { roomId }
'room:leave'       { roomId }
'message:send'     { roomId, content, threadId?, replyTo? }
'message:edit'     { messageId, content }
'message:delete'   { messageId }
'message:react'    { messageId, emoji }
'typing:start'     { roomId }
'typing:stop'      { roomId }
'command:exec'     { roomId, command, args }

// Server → Client
'message:new'      { message }
'message:updated'  { message }
'message:deleted'  { messageId }
'message:reaction' { messageId, emoji, userId, action }
'bot:stream'       { messageId, chunk, done }
'typing:update'    { roomId, userId, isTyping }
'user:online'      { userId, isOnline }
'room:updated'     { room }
'command:result'   { command, result }
```

## 6. Bot Bridge 设计

Bot Bridge 是后端与 OpenClaw 通信的适配层：

```typescript
interface BotBridge {
  // 发送消息给 Bot，返回流式响应
  sendMessage(content: string, context: BotContext): AsyncGenerator<string>;
  
  // 执行命令
  executeCommand(command: string, args: string): Promise<CommandResult>;
  
  // 检查状态
  getStatus(): Promise<BotStatus>;
}

// OpenClaw 实现
class OpenClawBridge implements BotBridge {
  // 通过 OpenClaw WebChat WebSocket 或 HTTP API 通信
  // 支持流式响应转发
}
```

## 7. 开发计划

### Phase 1 — 基础骨架 (Day 1)
- [x] 项目初始化（monorepo, Vite, Express）
- [ ] 基础 UI 布局（Sidebar + ChatView + 输入框）
- [ ] WebSocket 连接建立
- [ ] 消息收发基本流程

### Phase 2 — 核心体验 (Day 2-3)
- [ ] Markdown 渲染 + 代码高亮
- [ ] 流式输出
- [ ] 命令模式
- [ ] Bot Bridge (OpenClaw 接入)

### Phase 3 — 多人 + Thread (Day 4-5)
- [ ] 多人房间
- [ ] Thread 侧边栏
- [ ] 在线状态 + 打字提示
- [ ] 消息编辑/删除/Reactions

### Phase 4 — 打磨 (Day 6-7)
- [ ] 主题切换
- [ ] 响应式移动端适配
- [ ] 文件上传
- [ ] 导出功能
