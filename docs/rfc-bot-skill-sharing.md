# RFC: Bot Skill Sharing

> Status: Draft
> Author: Agent007
> Date: 2026-05-12
> Decision: 权限模型 MVP 采用简单公开模式（is_shared flag），后续再做精细授权

## 1. 背景与动机

ClawChat 已支持多 bot 模式：用户可以注册多个 bot，每个 bot 连接独立的 OpenClaw Gateway agent。每个 agent 有自己的 skills（能力），但目前各 bot 之间能力完全隔离。

**需求**：让不同 bot 之间可以 share 各自的 skill，实现能力互补。

## 2. 核心设计决策

### 2.1 Delegation 而非 Replication

**选择 Delegation（委托执行）模式**，而非复制 skill 文件到其他 bot：

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Replication（复制 skill）** | bot 本地执行，延迟低 | 需要复制执行环境（MCP server、API token、工具权限），安全风险大，同步复杂 |
| **Delegation（委托执行）** ✅ | 不需要复制环境，权限边界清晰，天然审计 | 多一跳延迟，依赖目标 bot 在线 |

### 2.2 权限模型

**MVP：简单公开模式**
- Bot owner 将某个 skill 标记为 `is_shared = true`，即对所有 bot 公开可用
- 任何 bot 都可以 delegate 调用该 skill
- 不需要逐 bot 授权

**后续演进（P2+）：精细授权**
- 引入 `bot_skill_grants` 表，支持逐 bot 授权/撤销
- 支持 skill 分组和批量授权

## 3. 数据模型

### 3.1 新增表

```sql
-- 技能注册表
CREATE TABLE IF NOT EXISTS bot_skills (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,
  name TEXT NOT NULL,              -- 技能标识符，如 "schedule-query"
  display_name TEXT,               -- 显示名称，如 "日程查询"
  description TEXT,                -- 给 LLM 看的技能描述（用于 delegation prompt）
  parameters_schema TEXT,          -- JSON Schema，描述输入参数格式（可选）
  is_shared INTEGER DEFAULT 0,    -- MVP: 1=公开可用, 0=仅自己
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(bot_id, name)
);
CREATE INDEX IF NOT EXISTS idx_bot_skills_bot ON bot_skills(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_skills_shared ON bot_skills(is_shared) WHERE is_shared = 1;

-- Delegation 执行记录（兼审计日志）
CREATE TABLE IF NOT EXISTS skill_delegations (
  id TEXT PRIMARY KEY,
  from_bot_id TEXT NOT NULL,       -- 发起方 bot
  to_bot_id TEXT NOT NULL,         -- 目标 bot（skill 所有者）
  skill_id TEXT NOT NULL REFERENCES bot_skills(id) ON DELETE CASCADE,
  room_id TEXT,                    -- 发起 delegation 的房间上下文
  input TEXT,                      -- JSON: 传给 skill 的参数
  output TEXT,                     -- JSON: skill 返回的结果
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'running', 'completed', 'failed', 'timeout')),
  error TEXT,                      -- 失败原因
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  duration_ms INTEGER              -- 执行耗时
);
CREATE INDEX IF NOT EXISTS idx_delegations_from ON skill_delegations(from_bot_id);
CREATE INDEX IF NOT EXISTS idx_delegations_to ON skill_delegations(to_bot_id);
CREATE INDEX IF NOT EXISTS idx_delegations_status ON skill_delegations(status) WHERE status = 'pending';
```

### 3.2 预留表（P2 精细授权）

```sql
-- 技能授权（后续启用）
CREATE TABLE IF NOT EXISTS bot_skill_grants (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES bot_skills(id) ON DELETE CASCADE,
  granted_to TEXT NOT NULL REFERENCES bots(bot_id) ON DELETE CASCADE,
  granted_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(skill_id, granted_to)
);
```

## 4. Server 端设计

### 4.1 新增 Service

#### `services/skill-registry.ts` — 技能注册与查询

```typescript
// 核心接口
interface SkillDescriptor {
  id: string;
  botId: string;
  name: string;
  displayName?: string;
  description?: string;
  parametersSchema?: object;
  isShared: boolean;
  createdAt: string;
}

// 注册技能
registerSkill(botId: string, skill: Partial<SkillDescriptor>, ownerId: string): SkillDescriptor

// 更新技能
updateSkill(skillId: string, updates: Partial<SkillDescriptor>, ownerId: string): SkillDescriptor | null

// 删除技能
deleteSkill(skillId: string, ownerId: string): boolean

// 列出 bot 自己的技能
listBotSkills(botId: string): SkillDescriptor[]

// 列出所有公开共享的技能（排除自己的）
listSharedSkills(excludeBotId?: string): SkillDescriptor[]

// 查询某 bot 可用的所有技能（自己的 + 公开的）
getAvailableSkills(botId: string): SkillDescriptor[]

// 切换 skill 共享状态
toggleSkillSharing(skillId: string, isShared: boolean, ownerId: string): boolean
```

#### `services/skill-delegation.ts` — 委托执行引擎

```typescript
interface DelegationRequest {
  fromBotId: string;     // 发起方
  skillId: string;       // 目标 skill
  input: string;         // 自然语言或 JSON 格式的输入
  roomId?: string;       // 房间上下文（仅用于记录，不传给目标 bot）
}

interface DelegationResult {
  id: string;
  status: 'completed' | 'failed' | 'timeout';
  output?: string;
  error?: string;
  durationMs: number;
}

// 发起 delegation
async delegateSkill(req: DelegationRequest): Promise<DelegationResult>

// 查询 delegation 历史
listDelegations(botId: string, limit?: number): DelegationLog[]
```

**Delegation 执行流程：**

```
delegateSkill(req)
  │
  ├─ 1. 验证 skill 存在且 is_shared=1（或属于 fromBot 自己）
  ├─ 2. 检查递归深度（max 2 层，防止 A→B→A 死循环）
  ├─ 3. 获取目标 bot 的 BotBridge
  ├─ 4. 构造 delegation prompt（见 §4.3）
  ├─ 5. 写入 skill_delegations 表 status='running'
  ├─ 6. 通过 BotBridge 发送消息，收集完整响应
  ├─ 7. 更新记录 status='completed'/'failed'
  └─ 8. 返回结果
```

**超时与错误处理：**
- 单次 delegation 最大超时：60 秒
- 超时后 status='timeout'，返回错误信息
- 目标 bot 离线 → 立即 fail，不排队等待

### 4.2 API Routes

```
# 技能管理（bot owner 操作）
GET    /api/bots/:botId/skills          → listBotSkills
POST   /api/bots/:botId/skills          → registerSkill
PUT    /api/bots/:botId/skills/:skillId → updateSkill
DELETE /api/bots/:botId/skills/:skillId → deleteSkill
PATCH  /api/bots/:botId/skills/:skillId/share → toggleSkillSharing

# 技能发现
GET    /api/skills/shared               → listSharedSkills (所有公开技能)
GET    /api/skills/available/:botId     → getAvailableSkills (该 bot 可用的所有技能)

# Delegation
POST   /api/skills/delegate             → delegateSkill
GET    /api/skills/delegations/:botId   → listDelegations (执行历史)
```

### 4.3 Delegation Prompt 协议

发给目标 bot 的消息格式：

```
[SKILL_DELEGATION]
Skill: {skill.name}
Description: {skill.description}
Input: {request.input}

Execute this skill and return the result. Respond with the result only, no additional commentary.
If the skill requires tool calls, execute them and return the final output.
```

**安全约束：**
- 不传 room context / 聊天历史给目标 bot
- 只传 skill 描述 + input 参数
- 结果原样返回给发起方 bot，由发起方决定如何整合

### 4.4 BotBridge 扩展

在 `BotBridge` 类新增方法：

```typescript
/**
 * Execute a delegation request: send a special prompt and collect full response.
 * Unlike streamResponse which yields chunks, this collects the complete output.
 */
async executeDelegation(skillName: string, input: string): Promise<string>
```

实现：复用现有 `streamResponse`，但收集所有 chunk 拼成完整文本返回。

### 4.5 Socket 事件

```typescript
// Server → Client（通知 UI）
'skill:delegation:start'   { delegationId, fromBotId, toBotId, skillName }
'skill:delegation:complete' { delegationId, status, output?, error? }
```

## 5. Client 端设计

### 5.1 Bot 详情 — Skills Tab（P0 MVP）

在现有 bot 详情/编辑页面新增 "Skills" tab：

```
┌──────────────────────────────────────────┐
│ 🤖 BotName              [Info] [Skills] │
├──────────────────────────────────────────┤
│ My Skills                    [+ Add]     │
│                                          │
│ ┌─ schedule-query ──────── 🔗 Shared ─┐ │
│ │ 日程查询                             │ │
│ │ 查询指定时间范围内的日程             │ │
│ └────────────────── [Edit] [Delete] ──┘ │
│                                          │
│ ┌─ weather ─────────────── 🔒 Private ┐ │
│ │ 天气查询                             │ │
│ │ 获取指定城市的天气预报               │ │
│ └────────────────── [Edit] [Delete] ──┘ │
├──────────────────────────────────────────┤
│ Available Shared Skills                  │
│                                          │
│ ┌─ code-review ── by @CodeBot ────────┐ │
│ │ 代码审查                             │ │
│ │ 审查代码并提供改进建议               │ │
│ └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### 5.2 聊天界面 Delegation 提示（P1）

当 bot 执行 delegation 时，在消息流中显示：

```
🔗 正在调用 @ScheduleBot 的「日程查询」技能...
```

结果返回后消息更新为正常 bot 回复。

### 5.3 Zustand Store

```typescript
// stores/skillStore.ts
interface SkillStore {
  botSkills: Record<string, SkillDescriptor[]>;  // botId → skills
  sharedSkills: SkillDescriptor[];
  activeDelegations: Record<string, DelegationStatus>;

  fetchBotSkills: (botId: string) => Promise<void>;
  fetchSharedSkills: () => Promise<void>;
  registerSkill: (botId: string, skill: ...) => Promise<void>;
  deleteSkill: (botId: string, skillId: string) => Promise<void>;
  toggleSharing: (botId: string, skillId: string, shared: boolean) => Promise<void>;
}
```

⚠️ **Zustand 规范提醒**（参考 MEMORY.md）：
- selector 中 fallback 必须用模块级常量：`const EMPTY: Skill[] = []; useSkillStore(s => s.botSkills[id] ?? EMPTY)`
- 不要 `useSkillStore()` 全量订阅

## 6. 递归防护

防止 delegation 死循环（A→B→A）：

```typescript
// 每个 delegation 请求携带 depth 计数
const MAX_DELEGATION_DEPTH = 2;

function delegateSkill(req: DelegationRequest, depth = 0) {
  if (depth >= MAX_DELEGATION_DEPTH) {
    return { status: 'failed', error: 'Max delegation depth exceeded' };
  }
  // ... execute with depth+1 passed to any nested delegation
}
```

## 7. 实现计划

| Phase | 内容 | 预估 | 优先级 |
|-------|------|------|--------|
| **P0** | DB migration (bot_skills + skill_delegations) | 0.5d | 🔴 |
| **P0** | skill-registry service + REST API | 1d | 🔴 |
| **P0** | Bot 详情 Skills tab UI（注册/删除/共享切换） | 1.5d | 🔴 |
| **P1** | skill-delegation service + BotBridge.executeDelegation | 1.5d | 🟡 |
| **P1** | Delegation socket 事件 + 聊天界面提示 | 1d | 🟡 |
| **P2** | 自动 skill 发现（通过 agent `/skills list` query） | 1d | 🟢 |
| **P2** | 精细授权模型（bot_skill_grants） | 1d | 🟢 |
| **P3** | Skill Marketplace UI | 2d | 🔵 |

**MVP（P0）总计：~3 天**

## 8. 开放问题

1. **Skill 的 input/output 格式** — MVP 先用自然语言，还是上来就定义 JSON Schema？
   - 建议：MVP 自然语言，P2 加 schema 验证
2. **Delegation 的计费/限流** — 是否需要？
   - 建议：MVP 只记录不限制，后续按需加
3. **目标 bot 离线时的行为** — 直接失败还是排队？
   - 建议：直接失败，返回 "Bot offline" 错误
4. **Delegation 结果缓存** — 相同输入是否缓存？
   - 建议：MVP 不缓存，每次实时执行
