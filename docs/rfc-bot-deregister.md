# RFC: Bot 注销与恢复功能

## 背景

ClawChat 支持用户注册和分享 Bot，但缺少注销和生命周期管理。本 RFC 定义完整的注销、暂停、恢复流程。

---

## 功能概览

| 功能 | 说明 |
|---|---|
| 暂停 (Pause) | Bot 暂时不响应，保留所有数据和 share 关系，可随时恢复 |
| 注销 (Deregister) | 软删除 Bot，撤销所有 share，归档相关 Room |
| 恢复 (Restore) | 重新注册时检测到已注销的同一 Bot，可选择恢复旧记录 |

### 状态机

```
active ──→ paused ──→ active        （暂停/恢复，可反复）
active ──→ deregistered              （注销）
deregistered ──→ active              （恢复注册）
paused ──→ deregistered              （暂停状态也可直接注销）
```

---

## 注销流程

### 触发入口
- 设置 → Bot 管理：每个 Bot 卡片「注销」按钮（红色）
- Bot 注册页：已注册 Bot 列表「注销」操作

### 确认弹窗
- 标题：「确认注销 Bot "xxx"？」
- 正文：显示影响范围——「该 Bot 已分享给 N 位用户，注销后所有分享将被撤销，相关对话将被归档。此操作不可撤销（但可通过重新注册恢复）。」
- 按钮：「取消」+「确认注销」（红色）
- 不需要输入名称确认

### 数据处理（按顺序）

```
1. BotBridge 断开 WebSocket（运行时，立即生效）
2. bot_shares → DELETE（所有 share 记录）
3. invitations → DELETE（type='bot_share' 且 resource_id 匹配）
4. 相关 bot rooms → SET archived_at = now()
5. 在受影响的 rooms 中插入系统消息：「Bot "xxx" 已停用」
6. bots → UPDATE status = 'deregistered'
7. users 表 Bot 记录 → 保留不动
```

### Share 处理
- accepted 的 share → 撤销，Room 中插系统消息通知
- pending 的 share → 直接删除 invitation，不通知

### Room 处理
- Room 保留，不删除（保留历史消息）
- Room 灰显，排到 Sidebar 底部
- 输入框禁用，Bot 不再响应
- Socket 事件 `bot:deregistered` 实时推送，前端即时更新

---

## 暂停流程

- UI：Bot 卡片上的 toggle 开关
- 暂停时：BotBridge 断开连接，Bot 显示「离线/维护中」
- Share 关系保留，Room 保留，消息发过去不响应
- 恢复时：BotBridge 重新连接，状态恢复正常

---

## 恢复注册流程

### 触发条件
注册新 Bot 时，系统用 `owner_id + gateway_url` 匹配已注销的 Bot 记录。

### 匹配到旧 Bot 时
弹窗提示：「检测到你之前注册过 Bot "xxx"（已注销），是否恢复？」
- **恢复**：复用旧记录，更新 auth_token 等字段，status → active
- **新建**：创建全新 Bot，与旧 Bot 无关联

### 恢复范围
- ✅ 恢复 bots 记录（status → active）
- ✅ 恢复 owner 自己的归档 Room（解除归档，历史消息保留）
- ✅ 在 Room 中插入系统消息：「Bot "xxx" 已恢复服务」
- ❌ 不恢复 share 关系（需要 owner 重新 share）
- ❌ 不恢复被 share 用户的 Room（保持归档）

### 重新 Share 给旧用户
- 检测该用户是否有旧的归档 Bot Room
- 如果有 → 解除归档，复用旧 Room（保留历史消息）
- 如果没有 → 创建新 Room

---

## API 设计

```
PATCH  /api/bots/:botId          { status: 'paused' | 'active' }
DELETE /api/bots/:botId          注销（软删除）
```

- 鉴权：仅 Bot owner 可操作
- DELETE 返回：`{ affected: { shares: N, rooms: N } }`
- 所有数据操作在事务中完成

### Socket 事件

| 事件 | 接收者 | 携带数据 |
|---|---|---|
| `bot:status-changed` | owner + shared_to users | botId, status |
| `bot:deregistered` | owner + shared_to users | botId, roomIds |

---

## DB 变更

```sql
-- bots 表增加 status 字段
ALTER TABLE bots ADD COLUMN status TEXT NOT NULL DEFAULT 'active' 
  CHECK(status IN ('active', 'paused', 'deregistered'));

-- rooms 表增加 archived_at 字段
ALTER TABLE rooms ADD COLUMN archived_at TEXT DEFAULT NULL;
```

---

## 工期预估

| 角色 | 工作量 |
|---|---|
| Backend | ~2 天（DB migration + API + socket + 恢复检测 + 数据清理）|
| Frontend | ~1.5 天（toggle + 注销弹窗 + 恢复弹窗 + 归档 UI + socket 监听）|
| Design | ~0.5 天（确认弹窗 + 归档/暂停状态视觉）|
| 联调测试 | ~0.5 天 |
| **合计** | **~3-4 天** |
