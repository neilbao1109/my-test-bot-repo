# ClawChat 通讯录 & 加好友功能方案

> 最后更新：2026-05-06

## 决策记录

| # | 决策 | 结论 |
|---|------|------|
| 1 | DM 与好友关系 | 强制好友才能发起 DM，后续可放开 |
| 2 | 已有 DM | migration 自动补建好友关系 |
| 3 | 群聊加好友 | 支持，点击群成员头像可加好友 |
| 4 | 好友上限 | 暂不限制 |
| 5 | Block 功能 | 不做，留后续 |
| 6 | 好友标识 | 用户 ID（即 email），用户名可变不可作为唯一标识 |
| 7 | 数据库备份 | 改动前必须备份 |

## 数据模型

```sql
CREATE TABLE friendships (
  id TEXT PRIMARY KEY,
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'accepted')),
  requester TEXT NOT NULL REFERENCES users(id),
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at TEXT,
  UNIQUE(user_a, user_b),
  CHECK(user_a < user_b)
);
CREATE INDEX idx_friendships_status ON friendships(status);
CREATE INDEX idx_friendships_a ON friendships(user_a, status);
CREATE INDEX idx_friendships_b ON friendships(user_b, status);
```

## Migration 策略

1. 备份数据库
2. 创建 friendships 表
3. 扫描 dm_pairs，为每对用户自动创建 status='accepted' 的好友关系
4. PRAGMA user_version 递增

## Socket 事件

| 事件 | 方向 | Payload |
|------|------|---------|
| `friend:request` | C→S | `{ toUserId, message? }` |
| `friend:accept` | C→S | `{ friendshipId }` |
| `friend:reject` | C→S | `{ friendshipId }` |
| `friend:remove` | C→S | `{ userId }` |
| `friend:list` | C→S | `{}` → `{ friends: User[] }` |
| `friend:requests` | C→S | `{}` → `{ incoming, outgoing }` |
| `friend:search` | C→S | `{ query }` — 按 email 搜索 |
| `friend:new` | S→C | 推送新好友请求 |
| `friend:accepted` | S→C | 对方接受了请求 |
| `friend:removed` | S→C | 被删好友通知 |

## DM 权限

- `room:create` 当 `type === 'dm'` 时校验好友关系，非好友返回错误
- 群聊不受影响

## 前端组件

| 组件 | 说明 |
|------|------|
| Sidebar 改造 | 底部加 Tab 栏：聊天 / 通讯录 |
| ContactsTab.tsx | 好友列表（按首字母分组）+ 顶部好友请求入口（红点） |
| FriendRequests.tsx | 好友请求列表（incoming + outgoing） |
| FriendSearch.tsx | 输入 email 搜索用户 → 发送好友请求 |
| FriendProfile.tsx | 好友详情（头像/用户名/email/发消息/删除好友） |
| MemberPanel 改造 | 群成员列表中非好友显示「加好友」按钮 |

## 后端文件

| 文件 | 说明 |
|------|------|
| services/friendship.ts | 新建，好友关系 CRUD |
| socket/handlers.ts | 新增 friend:* 事件 |
| db/schema.ts | migration：friendships 表 + dm_pairs 补建 |

## 执行顺序

1. 备份数据库
2. Migration（建表 + 补建好友关系）
3. 后端 friendship service + socket 事件
4. DM 创建加好友校验
5. 前端通讯录 Tab + 好友请求 + 搜索
6. MemberPanel 加好友按钮
7. 构建 + 测试验证
8. commit + push
