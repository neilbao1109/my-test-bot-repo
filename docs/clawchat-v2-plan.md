# ClawChat V2 改版方案

> 从"自带 bot 的内部工具"转型为"通用聊天平台 + bot 生态"
>
> 最后更新：2026-04-30

---

## 1. 项目概述与目标

### 现状

ClawChat 当前是一个内置 bot 的聊天工具：
- Bot 通过 `bots.json` 或环境变量配置，服务启动时全量注册
- 所有 `trigger: 'all'` 的 bot 自动加入每个新房间（`getAutoJoinBotIds()`）
- 用户无法自行注册、管理或分享 bot
- DM 没有唯一性约束，可以和同一个人创建多个 DM
- 创建 DM 时必须填写房间名称

### 目标

将 ClawChat 转变为通用聊天平台 + bot 生态：
1. **Bot 自主权** — 用户可以注册、管理、分享自己的 bot
2. **社交化** — 邀请确认机制，bot 分享，bot 市场
3. **DM 规范化** — 人与人 DM 唯一，DM 无需 title
4. **渐进式** — 每一步都不 break 现有功能

---

## 2. 已确认设计决策

| # | 决策 | 说明 |
|---|------|------|
| 1 | Bot 不再 auto-join | 移除 `getAutoJoinBotIds()` 调用，用户手动添加/移除 bot |
| 2 | 用户可注册自己的 bot | 注册前需连通测试（调用 gateway 验证），测试成功才能保存 |
| 3 | Bot 可分享 | 分享给其他用户，对方需 accept |
| 4 | 所有邀请需 accept | DM、群聊邀请、bot 分享均需对方确认 |
| 5 | 人与人 DM 唯一 | 同一对用户只能有一个 DM，通过 `dm_pairs` 表约束 |
| 6 | 用户与 bot 可多 room | 不做唯一性限制 |
| 7 | DM 无需 title | `rooms.name` 对 DM 允许空，客户端动态显示对方用户名+头像 |
| 8 | CreateRoomModal DM 模式 | 隐藏 name 输入框，选人即创建/跳转已有 DM |

---

## 3. 数据模型变更

### 3.1 新增表

```sql
-- 用户注册的 bot
CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,                -- bot user id (同时是 users 表的 FK)
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gateway_url TEXT,
  auth_token TEXT NOT NULL,
  agent_id TEXT,
  ssh_host TEXT,
  trigger TEXT NOT NULL DEFAULT 'all' CHECK(trigger IN ('all', 'mention', 'room-member')),
  is_public INTEGER NOT NULL DEFAULT 0,  -- 是否在 bot 市场可见
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bots_owner ON bots(owner_id);

-- Bot 分享
CREATE TABLE IF NOT EXISTS bot_shares (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  shared_by TEXT NOT NULL REFERENCES users(id),
  shared_to TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(bot_id, shared_to)
);
CREATE INDEX IF NOT EXISTS idx_bot_shares_to ON bot_shares(shared_to, status);

-- 通用邀请表
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('room', 'dm', 'bot_share')),
  from_user TEXT NOT NULL REFERENCES users(id),
  to_user TEXT NOT NULL REFERENCES users(id),
  resource_id TEXT NOT NULL,          -- room_id 或 bot_share_id
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invitations_to ON invitations(to_user, status);
CREATE INDEX IF NOT EXISTS idx_invitations_resource ON invitations(resource_id);

-- DM 唯一性约束表
CREATE TABLE IF NOT EXISTS dm_pairs (
  user_a TEXT NOT NULL REFERENCES users(id),
  user_b TEXT NOT NULL REFERENCES users(id),
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  PRIMARY KEY (user_a, user_b),
  CHECK(user_a < user_b)             -- 保证有序，避免重复
);
CREATE INDEX IF NOT EXISTS idx_dm_pairs_room ON dm_pairs(room_id);
```

### 3.2 现有表修改

```sql
-- rooms.name 允许空（DM 不需要名称）
-- SQLite 不支持 ALTER COLUMN，需要重建表

CREATE TABLE rooms_new (
  id TEXT PRIMARY KEY,
  name TEXT,                          -- 从 NOT NULL 改为允许 NULL
  type TEXT NOT NULL CHECK(type IN ('dm', 'group')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO rooms_new SELECT * FROM rooms;
DROP TABLE rooms;
ALTER TABLE rooms_new RENAME TO rooms;

-- 重建相关索引（如有）
```

### 3.3 Migration 策略

1. **备份数据库**：`cp data/clawchat.db data/clawchat.db.bak.$(date +%s)`
2. **版本化 migration**：在 `schema.ts` 的 `initSchema()` 中添加 migration 块，用 `PRAGMA user_version` 跟踪版本
3. **Migration 代码模式**：

```typescript
// 在 initSchema() 末尾添加
const version = (db.prepare('PRAGMA user_version').get() as any).user_version;

if (version < 1) {
  // Phase 1: dm_pairs + rooms.name nullable
  db.exec(`
    CREATE TABLE IF NOT EXISTS dm_pairs (...);
    -- rooms 重建（name nullable）
    ...
    PRAGMA user_version = 1;
  `);
}

if (version < 2) {
  // Phase 2: bots + invitations
  db.exec(`
    CREATE TABLE IF NOT EXISTS bots (...);
    CREATE TABLE IF NOT EXISTS invitations (...);
    PRAGMA user_version = 2;
  `);
}

if (version < 3) {
  // Phase 3: bot_shares
  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_shares (...);
    PRAGMA user_version = 3;
  `);
}
```

4. **回滚**：直接恢复备份文件

---

## 4. 分阶段任务清单

### Phase 1：基础改造（~3 天）

> 移除 auto-join + 手动添加/移除 bot + DM 唯一性 + DM 无需 title

#### 4.1.1 数据库 Migration

| 文件 | 改动 | 类型 |
|------|------|------|
| `server/src/db/schema.ts` — `initSchema()` | 添加 `dm_pairs` 表创建、`rooms` 表重建（name nullable）、`PRAGMA user_version` 迁移逻辑 | 修改 |

#### 4.1.2 移除 Bot Auto-Join

| 文件 | 函数/位置 | 改动 | 类型 |
|------|-----------|------|------|
| `server/src/services/room.ts` — `createRoom()` | 删除 `getAutoJoinBotIds()` 调用和循环插入 auto-join bot 的代码（第 8-13 行） | 修改 |
| `server/src/services/room.ts` | 删除 `import { getAutoJoinBotIds }` | 修改 |
| `server/src/services/bot-registry.ts` — `getAutoJoinBotIds()` | 保留函数但标记 `@deprecated`，Phase 2 删除 | 修改 |
| `server/src/socket/handlers.ts` | 删除 `getAutoJoinBotIds` 的 import（如果只用于 room.ts 则无需改动） | 检查 |

#### 4.1.3 手动添加/移除 Bot

| 文件 | 函数/位置 | 改动 | 类型 |
|------|-----------|------|------|
| `server/src/services/room.ts` | 新增 `addBotToRoom(roomId, botId, userId)` — 校验 bot 存在 + 用户是 room 成员，然后 `addMemberToRoom` | 新增 |
| `server/src/services/room.ts` | 新增 `removeBotFromRoom(roomId, botId, userId)` — 校验权限后 `removeMemberFromRoom` | 新增 |
| `server/src/socket/handlers.ts` | 新增 `room:add-bot` 事件处理 | 新增 |
| `server/src/socket/handlers.ts` | 新增 `room:remove-bot` 事件处理 | 新增 |
| `server/src/services/bot-registry.ts` | 新增 `getAvailableBots(userId)` — 返回用户可用的 bot 列表（系统 bot + 自己注册的 + 被分享的）；Phase 1 只返回系统 bot | 新增 |
| `client/src/services/socket.ts` | 新增 `addBotToRoom(roomId, botId)` / `removeBotFromRoom(roomId, botId)` 方法 | 新增 |

前端组件见第 6 节。

#### 4.1.4 DM 唯一性

| 文件 | 函数/位置 | 改动 | 类型 |
|------|-----------|------|------|
| `server/src/services/room.ts` | 新增 `findExistingDm(userA, userB)` — 查询 `dm_pairs` 表 | 新增 |
| `server/src/services/room.ts` — `createRoom()` | 当 `type === 'dm'` 时：先调用 `findExistingDm`，已存在则返回现有 room；不存在则创建并写入 `dm_pairs`。`name` 参数对 DM 传 `null` | 修改 |
| `server/src/socket/handlers.ts` — `room:create` | 当 `type === 'dm'` 时，调用修改后的 `createRoom`，如果返回已有 room 则直接 callback 不广播 `room:added` | 修改 |

#### 4.1.5 DM 无需 Title

| 文件 | 函数/位置 | 改动 | 类型 |
|------|-----------|------|------|
| `server/src/types.ts` — `Room` | `name` 类型改为 `string | null` | 修改 |
| `server/src/services/room.ts` — `createRoom()` | `name` 参数类型改为 `string | null` | 修改 |
| `server/src/socket/handlers.ts` — `room:create` | DM 时不再要求 `data.name` | 修改 |
| `client/src/types.ts`（或内联类型） | `Room.name` 改为 `string \| null` | 修改 |
| `client/src/components/CreateRoomModal/index.tsx` | DM 模式隐藏 name 输入框；选人后直接创建/跳转；详见第 6 节 | 修改 |
| 客户端 room list / chat header | DM 时显示对方用户名+头像，不显示 room name | 修改 |

#### 4.1.6 Auth 回调中移除 auto-create DM

| 文件 | 函数/位置 | 改动 | 类型 |
|------|-----------|------|------|
| `server/src/socket/handlers.ts` — `auth` 事件 | 移除 `if (rooms.length === 0) { createRoom('Chat with ClawBot', 'dm', ...) }` 这段自动创建 DM 的逻辑 | 修改 |

---

### Phase 2：用户注册 Bot + 邀请系统（~2 周）

#### 4.2.1 Bot 注册

| 文件 | 函数/位置 | 改动 | 类型 |
|------|-----------|------|------|
| `server/src/db/schema.ts` | Migration: 创建 `bots` 表 + `invitations` 表 | 修改 |
| `server/src/services/bot-registry.ts` | 新增 `registerBot(config, ownerId)` — 写 `bots` 表 + `users` 表（is_bot=1） | 新增 |
| `server/src/services/bot-registry.ts` | 新增 `updateBot(botId, config, ownerId)` — 权限校验 + 更新 | 新增 |
| `server/src/services/bot-registry.ts` | 新增 `deleteBot(botId, ownerId)` — 级联删除 bot_shares、room_members、users | 新增 |
| `server/src/services/bot-registry.ts` | 新增 `testBotConnection(gatewayUrl, authToken, agentId?, sshHost?)` — 调用 gateway 健康检查接口，返回 `{ ok, error?, model? }` | 新增 |
| `server/src/services/bot-registry.ts` | 新增 `getUserBots(userId)` — 返回用户自己注册的 bot 列表 | 新增 |
| `server/src/services/bot-registry.ts` — `initBotRegistry()` | 除加载 `bots.json`/env 系统 bot 外，还从 `bots` 表加载用户 bot，统一注册到内存 Map | 修改 |
| `server/src/services/bot-registry.ts` — `getAvailableBots()` | 返回系统 bot + 用户自己的 bot + 被分享且 accepted 的 bot | 修改 |

**连通测试流程：**
1. 客户端提交 bot 配置（gateway_url, auth_token 等）
2. 服务端 `testBotConnection()` 尝试连接 gateway
3. 返回测试结果（连接状态、model 信息）
4. 测试成功 → 客户端确认保存 → `registerBot()`

| 文件 | 函数/位置 | 改动 | 类型 |
|------|-----------|------|------|
| `server/src/socket/handlers.ts` | 新增 `bot:test` 事件 — 调用 `testBotConnection`，回调结果 | 新增 |
| `server/src/socket/handlers.ts` | 新增 `bot:register` 事件 — 调用 `registerBot`，回调 | 新增 |
| `server/src/socket/handlers.ts` | 新增 `bot:update` 事件 | 新增 |
| `server/src/socket/handlers.ts` | 新增 `bot:delete` 事件 | 新增 |
| `server/src/socket/handlers.ts` | 新增 `bot:list` 事件 — 返回用户可用的 bot 列表 | 新增 |
| `client/src/services/socket.ts` | 新增对应 emit 方法 | 新增 |

#### 4.2.2 邀请确认系统

| 文件 | 函数/位置 | 改动 | 类型 |
|------|-----------|------|------|
| `server/src/services/invitation.ts` | 新建文件 | 新增 |
| — | `createInvitation(type, fromUser, toUser, resourceId)` — 创建邀请记录 | 新增 |
| — | `acceptInvitation(invitationId, userId)` — 接受邀请，根据 type 执行：room→addMember, dm→createRoom+dm_pairs, bot_share→更新 bot_shares.status | 新增 |
| — | `rejectInvitation(invitationId, userId)` | 新增 |
| — | `getPendingInvitations(userId)` — 返回待处理邀请列表 | 新增 |
| — | `getInvitationCount(userId)` — 返回待处理数量（用于 badge） | 新增 |
| `server/src/socket/handlers.ts` | 新增 `invitation:list` 事件 | 新增 |
| `server/src/socket/handlers.ts` | 新增 `invitation:accept` 事件 — 调用 `acceptInvitation`，成功后通知相关方 | 新增 |
| `server/src/socket/handlers.ts` | 新增 `invitation:reject` 事件 | 新增 |
| `server/src/socket/handlers.ts` — `room:create` | 群聊时：不直接 addMember，改为创建 invitation，仅创建者自动加入 | 修改 |
| `server/src/socket/handlers.ts` — `room:invite` | 改为创建 invitation 而非直接 addMember | 修改 |
| `client/src/services/socket.ts` | 新增邀请相关 emit 方法 | 新增 |

**邀请流程：**
```
发起方                      接收方
  |-- invitation:send ------->|
  |                           |<-- socket: invitation:new (实时推送)
  |                           |-- invitation:accept/reject -->|
  |<-- invitation:resolved ---|                               |
  |                           |                               |
  (如果 accept: 自动加入 room / 获得 bot 访问权)
```

---

### Phase 3：Bot 分享 + Bot 市场（~1 周）

#### 4.3.1 Bot 分享

| 文件 | 函数/位置 | 改动 | 类型 |
|------|-----------|------|------|
| `server/src/db/schema.ts` | Migration: 创建 `bot_shares` 表 | 修改 |
| `server/src/services/bot-share.ts` | 新建文件 | 新增 |
| — | `shareBot(botId, sharedBy, sharedTo)` — 创建 bot_shares 记录 + invitation | 新增 |
| — | `acceptBotShare(shareId, userId)` — 更新 status，将 bot 加入用户可用列表 | 新增 |
| — | `revokeBotShare(shareId, ownerId)` — owner 撤回分享 | 新增 |
| — | `getSharedBots(userId)` — 返回被分享给自己且 accepted 的 bot 列表 | 新增 |
| `server/src/socket/handlers.ts` | 新增 `bot:share` / `bot:share:revoke` 事件 | 新增 |
| `client/src/services/socket.ts` | 新增对应方法 | 新增 |

#### 4.3.2 Bot 市场

| 文件 | 函数/位置 | 改动 | 类型 |
|------|-----------|------|------|
| `server/src/services/bot-registry.ts` | 新增 `getPublicBots()` — 返回 `is_public=1` 的 bot 列表 | 新增 |
| `server/src/socket/handlers.ts` | 新增 `bot:marketplace` 事件 — 返回公开 bot 列表 | 新增 |
| `server/src/socket/handlers.ts` | 新增 `bot:marketplace:add` 事件 — 用户从市场添加 bot 到自己的可用列表（无需 owner accept） | 新增 |

---

## 5. Socket 事件清单

### 5.1 新增事件

| 事件名 | 方向 | Phase | 说明 |
|--------|------|-------|------|
| `room:add-bot` | C→S | 1 | `{ roomId, botId }` — 添加 bot 到 room |
| `room:remove-bot` | C→S | 1 | `{ roomId, botId }` — 从 room 移除 bot |
| `bot:test` | C→S | 2 | `{ gatewayUrl, authToken, agentId?, sshHost? }` → `{ ok, error?, model? }` |
| `bot:register` | C→S | 2 | `{ username, avatarUrl?, gateway, trigger }` → `{ bot }` |
| `bot:update` | C→S | 2 | `{ botId, ...updates }` → `{ bot }` |
| `bot:delete` | C→S | 2 | `{ botId }` → `{ success }` |
| `bot:list` | C→S | 2 | `{}` → `{ bots: BotConfig[] }` |
| `invitation:list` | C→S | 2 | `{}` → `{ invitations }` |
| `invitation:accept` | C→S | 2 | `{ invitationId }` → `{ success, resource? }` |
| `invitation:reject` | C→S | 2 | `{ invitationId }` → `{ success }` |
| `invitation:new` | S→C | 2 | 推送新邀请给接收方 |
| `invitation:resolved` | S→C | 2 | 通知发起方邀请被接受/拒绝 |
| `invitation:count` | S→C | 2 | `{ count }` — 待处理邀请数（auth 时返回） |
| `bot:share` | C→S | 3 | `{ botId, userId }` → `{ shareId }` |
| `bot:share:revoke` | C→S | 3 | `{ shareId }` → `{ success }` |
| `bot:marketplace` | C→S | 3 | `{}` → `{ bots }` |
| `bot:marketplace:add` | C→S | 3 | `{ botId }` → `{ success }` |

### 5.2 修改事件

| 事件名 | Phase | 变更 |
|--------|-------|------|
| `room:create` | 1 | DM 时 `name` 可为空；增加 DM 去重逻辑（返回已有 room） |
| `room:invite` | 2 | 从直接添加改为创建 invitation |
| `auth` | 1 | 移除 auto-create DM 逻辑；Phase 2 返回 `pendingInvitationCount` |

---

## 6. 前端组件清单

### 6.1 修改组件

| 组件 | Phase | 改动 |
|------|-------|------|
| `CreateRoomModal/index.tsx` | 1 | DM 模式：隐藏 name 输入框，选人后直接创建/跳转；用户搜索在 DM 和 Group 模式下都展示；DM 模式 `handleCreate` 不传 name |
| Room list (sidebar) | 1 | DM 显示对方用户名+头像而非 room.name；需根据 `room.type === 'dm'` 查找对方成员信息 |
| Chat header | 1 | DM 时显示对方用户名+在线状态，不显示 room name |
| `appStore.ts` | 1 | `Room` 类型 `name` 改为 `string \| null` |
| `appStore.ts` | 2 | 新增 `invitations` / `pendingInvitationCount` state |

### 6.2 新增组件

| 组件 | Phase | 说明 |
|------|-------|------|
| `BotManager/index.tsx` | 1 | 当前 room 的 bot 管理面板（列出 room 内 bot、可添加/移除） |
| `BotSelector.tsx` | 1 | Bot 选择器弹窗（从可用 bot 列表选择添加到 room） |
| `BotRegistration/index.tsx` | 2 | Bot 注册表单（gateway 配置 + 连通测试 + 保存） |
| `InvitationList/index.tsx` | 2 | 待处理邀请列表（accept/reject） |
| `InvitationBadge.tsx` | 2 | 侧边栏邀请数 badge |
| `BotShareModal.tsx` | 3 | 分享 bot 给其他用户 |
| `BotMarketplace/index.tsx` | 3 | Bot 市场浏览和添加 |

### 6.3 CreateRoomModal 改动详情（Phase 1）

```tsx
// 关键改动点：

// 1. DM 模式下隐藏 name 输入框
{type === 'group' && (
  <input placeholder="Room name" ... />
)}

// 2. DM 和 Group 模式都显示用户搜索
<input placeholder="Search users..." ... />

// 3. DM 模式 handleCreate 改为：
const handleCreateDm = async () => {
  if (selectedUsers.length !== 1) return;
  const targetUser = selectedUsers[0];
  // createRoom 会在后端处理去重
  const room = await socketService.createRoom(null, 'dm', [targetUser.id]);
  // ... 跳转到 room
};

// 4. 按钮文案
// DM: "Start Chat"  |  Group: "Create"
// DM: disabled={selectedUsers.length !== 1}
// Group: disabled={!name.trim()}
```

---

## 7. 开发规范与流程

### 7.1 分支策略

```
main (production)
  └── feat/clawchat-v2-phase1
        ├── feat/remove-auto-join
        ├── feat/dm-unique
        ├── feat/dm-no-title
        └── feat/bot-manual-manage
  └── feat/clawchat-v2-phase2
  └── feat/clawchat-v2-phase3
```

- 每个小功能从 phase 分支切子分支
- 子分支完成验证后 merge 回 phase 分支
- Phase 分支全部验证后 merge 回 main
- **改完立刻 commit + push**

### 7.2 数据库备份

```bash
# 每次 migration 前
cp data/clawchat.db data/clawchat.db.bak.$(date +%s)

# 出问题时恢复
cp data/clawchat.db.bak.<timestamp> data/clawchat.db
```

- Migration 代码中也可自动备份
- WAL 文件也需一并备份：`cp data/clawchat.db-wal ...`

### 7.3 测试验证

每个功能点的验证清单：

**Phase 1 验证：**
- [ ] 新建 room 不再自动包含 bot
- [ ] 可以手动添加 bot 到 room，bot 能正常响应
- [ ] 可以从 room 移除 bot，移除后不再响应
- [ ] 同一对用户只能创建一个 DM
- [ ] 再次创建同一 DM 时跳转到已有 DM
- [ ] DM 列表显示对方用户名而非 room name
- [ ] CreateRoomModal DM 模式无 name 输入框
- [ ] 已有的 room 和消息正常工作（不 break）

**Phase 2 验证：**
- [ ] 可以注册新 bot（连通测试通过才能保存）
- [ ] 连通测试失败时给出明确错误信息
- [ ] 注册的 bot 出现在可用 bot 列表
- [ ] 群聊邀请需要对方 accept 才能加入
- [ ] 邀请列表显示待处理邀请
- [ ] Accept 后自动加入 room
- [ ] Reject 后不加入

**Phase 3 验证：**
- [ ] 可以分享 bot 给其他用户
- [ ] 对方 accept 后可以使用该 bot
- [ ] 公开 bot 出现在市场
- [ ] 可以从市场添加 bot

### 7.4 渐进式原则

1. 每个 commit 都应该是可运行的完整状态
2. 先做 migration（向后兼容），再改逻辑
3. 新增功能不影响已有功能路径
4. Bot Registry 保留 `bots.json` 兜底：系统 bot 走文件，用户 bot 走 DB，两者合并

---

## 8. 风险与 Mitigation

| 风险 | 影响 | Mitigation |
|------|------|------------|
| SQLite 重建 rooms 表丢数据 | 致命 | 备份数据库；migration 在事务中执行；migration 前后 count 校验 |
| 移除 auto-join 后用户找不到 bot | 高 | 首次启动引导提示用户添加 bot；提供默认 bot 推荐列表 |
| DM 去重逻辑并发竞争 | 中 | `dm_pairs` 表有 PRIMARY KEY 约束，INSERT OR IGNORE + 查询在事务中完成 |
| 用户注册恶意 bot | 中 | 连通测试只验证连通性；Phase 2 限制每用户 bot 数量；Phase 3 添加举报机制 |
| 邀请系统增加操作步骤 | 低 | DM 创建不需要对方 accept（Phase 1），仅群聊和 bot 分享需要 accept |
| 现有 room 的 bot 被移除 | 中 | Migration 不删除已有 room_members 记录，只是新 room 不再 auto-join |
| Gateway 连通测试超时 | 低 | 设置合理超时（5s）；前端显示 loading 状态和重试按钮 |

---

## 附录：关键文件索引

| 文件路径 | 作用 |
|----------|------|
| `server/src/db/schema.ts` | 数据库 schema 和 migration |
| `server/src/services/room.ts` | Room CRUD + 成员管理 |
| `server/src/services/bot-registry.ts` | Bot 配置加载、注册、响应判断 |
| `server/src/services/bot-bridge.ts` | Bot gateway 通信桥接 |
| `server/src/services/invitation.ts` | 邀请系统（Phase 2 新增） |
| `server/src/services/bot-share.ts` | Bot 分享（Phase 3 新增） |
| `server/src/socket/handlers.ts` | Socket 事件处理 |
| `server/src/types.ts` | 服务端类型定义 |
| `client/src/components/CreateRoomModal/` | 创建房间弹窗 |
| `client/src/stores/appStore.ts` | 前端全局状态 |
| `client/src/services/socket.ts` | Socket 客户端封装 |
| `server/data/bots.json` | 系统 bot 配置文件 |
