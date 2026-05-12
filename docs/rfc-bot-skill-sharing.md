# RFC: Bot Skill Sharing

> Status: Draft → **Revised**
> Author: Agent007
> Date: 2026-05-12
> Revised: 2026-05-12 — 重新定义需求优先级，从 delegation 模式调整为分层实现

## 1. 背景与动机

ClawChat 已支持多 bot 模式：用户可以注册多个 bot，每个 bot 连接独立的 OpenClaw Gateway agent。当前存在两个实际痛点：

1. **平台级知识缺失** — 与执行环境无关的通用规范（如 ClawChat cron job 注意事项）无法让所有 bot 自动知晓，每个 bot 需要单独配置
2. **Skill 部署不便** — 用户在外部编写或获取的 skill，没有通道推送到 bot 的 OpenClaw agent 上

## 2. 分层设计

| 层级 | 需求 | 本质 | 优先级 |
|------|------|------|--------|
| **L1** | 所有 bot 共享平台规范/知识 | System prompt 注入 | **P0 — 本轮实现** |
| **L2** | 外部 skill 上传推送到 bot | BotBridge 管理通道 + 文件写入 | **P1** |
| **L3** | Bot 之间委托执行能力 | Delegation 模式 | **P2（暂缓）** |

---

## 3. L1：平台共享知识注入（P0）

### 3.1 概念

ClawChat 维护一份 **平台级共享上下文（Platform Context）**，每个 bot 通过 BotBridge 与 agent 通信时，自动注入这段上下文。

内容示例：
- ClawChat 平台使用规范
- Cron job 创建注意事项
- 消息格式约定
- 通用工具使用技巧

### 3.2 实现方案

#### 存储

```
packages/server/data/platform-skills/
├── _platform-context.md    ← 聚合文件，BotBridge 注入用
├── clawchat-cron.md        ← 各个知识片段
├── clawchat-conventions.md
└── ...
```

或使用单文件 `data/platform-context.md`（MVP 更简单）。

#### BotBridge 注入点

在 `BotBridge.streamResponse()` 发送消息给 agent 时，将 platform context 作为前缀注入：

```typescript
// bot-bridge.ts
async *streamResponse(content: string, context: BotContext) {
  const platformContext = getPlatformContext(); // 读取 platform-context.md
  const enrichedContent = platformContext
    ? `[PLATFORM_CONTEXT]\n${platformContext}\n[/PLATFORM_CONTEXT]\n\n${content}`
    : content;
  // ... 发送 enrichedContent 给 agent
}
```

**优化：不是每条消息都注入**，而是：
- 在 WebSocket 连接建立时（agent session 初始化）注入一次
- 或在每个 "对话开始" 时注入一次（首条消息）
- 避免 token 浪费

#### 管理 API

```
GET    /api/platform/context          → 获取当前 platform context
PUT    /api/platform/context          → 更新 platform context（管理员）
```

#### 管理 UI

Bot 管理页面（或设置页面）增加 "Platform Context" 编辑器：
- Markdown 编辑框
- 保存后所有 bot 新对话自动生效
- 无需重启

### 3.3 注入策略

| 策略 | Token 开销 | 时效性 | 推荐 |
|------|-----------|--------|------|
| 每条消息都注入 | 高 | 最强 | ❌ |
| 首条消息注入 | 低 | 好（session 内有效）| ✅ MVP |
| 连接建立时注入 | 最低 | 依赖 agent 记忆 | 后续优化 |

**MVP 采用「首条消息注入」策略**：每个房间的第一条 bot 消息带 platform context，后续消息不带。

### 3.4 实现清单

- [ ] 创建 `data/platform-context.md`，写入初始内容
- [ ] `services/platform-context.ts` — 读取/更新 platform context
- [ ] `bot-bridge.ts` — 首条消息注入逻辑
- [ ] `routes/api.ts` — GET/PUT platform context API
- [ ] 可选：管理 UI 编辑器

---

## 4. L2：外部 Skill 上传推送（P1）

### 4.1 概念

用户通过 ClawChat 上传 SKILL.md 文件，ClawChat 通过 BotBridge 将文件写入目标 bot 的 OpenClaw agent workspace。

### 4.2 流程

```
用户 → ClawChat UI 上传 SKILL.md
         ↓
ClawChat Server 接收文件
         ↓
BotBridge 发送管理指令给 Agent:
  "[SKILL_INSTALL] name=weather\n<file content>"
         ↓
Agent 写入 ~/.openclaw/workspace/skills/weather/SKILL.md
         ↓
下次对话 Agent 自动发现新 skill
```

### 4.3 前置条件

- BotBridge 需要支持 **管理指令协议**（区分普通聊天 vs 管理操作）
- Agent 侧需要能解析并执行文件写入指令
- 安全：限制写入路径只能是 skills 目录

### 4.4 数据模型

```sql
-- 记录通过 ClawChat 推送的 skill
CREATE TABLE IF NOT EXISTS skill_deployments (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  content TEXT NOT NULL,           -- SKILL.md 内容
  deployed_by TEXT NOT NULL REFERENCES users(id),
  status TEXT DEFAULT 'pending'    -- pending/deployed/failed
    CHECK(status IN ('pending', 'deployed', 'failed')),
  created_at TEXT DEFAULT (datetime('now')),
  deployed_at TEXT
);
```

### 4.5 实现清单（P1 阶段）

- [ ] BotBridge 管理指令协议设计
- [ ] `services/skill-deploy.ts` — skill 上传 + 部署逻辑
- [ ] `routes/api.ts` — POST /api/bots/:botId/skills/deploy
- [ ] 前端：bot 详情页 "Deploy Skill" 按钮 + 文件上传
- [ ] Agent 侧：识别 `[SKILL_INSTALL]` 指令并写入文件

---

## 5. L3：Bot 间 Delegation（P2 暂缓）

> 详见本文件 git 历史中的初版设计（commit a3cdcef）。
> 核心思路：Bot B 委托 Bot A 执行绑定执行环境的 skill，通过 ClawChat server 中转。
> 待 L1/L2 落地后，根据实际使用场景决定是否启动。

---

## 6. 实现计划

| Phase | 内容 | 预估 | 状态 |
|-------|------|------|------|
| **P0** | Platform context 文件 + 注入逻辑 + API | 1d | 🔴 待开始 |
| **P0** | 管理 UI（可选，先用 API 管理） | 0.5d | 🟡 |
| **P1** | BotBridge 管理指令协议 | 1d | ⚪ |
| **P1** | Skill 上传部署流程 | 1.5d | ⚪ |
| **P2** | Delegation 模式 | 3-4d | ⚪ 暂缓 |

## 7. 开放问题

1. **Platform context 大小限制** — 建议不超过 2000 tokens，避免挤占 bot 的上下文窗口
2. **注入格式** — 用 XML 标签包裹（`[PLATFORM_CONTEXT]...[/PLATFORM_CONTEXT]`）还是作为 system message？取决于 BotBridge 协议支持
3. **多租户** — 如果 ClawChat 以后支持多 workspace/团队，platform context 是否按团队隔离？MVP 先单一全局
