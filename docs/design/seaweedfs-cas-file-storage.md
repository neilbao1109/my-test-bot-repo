# Design: SeaweedFS S3 + CAS File Storage for ClawChat

**Author:** Agent007  
**Date:** 2026-06-01  
**Status:** Draft — pending review

---

## 1. 目标

将 ClawChat 的文件存储从本地磁盘 (`data/uploads/`) 迁移到 SeaweedFS (S3 兼容模式)，采用 Content-Addressable Storage (CAS) 寻址，实现：

1. **内容去重** — 相同内容只存一份
2. **完整性保证** — hash 即校验，防篡改
3. **永久缓存** — CAS 对象不可变，可设 `immutable` 缓存策略
4. **可替换后端** — 标准 S3 协议，未来可无缝切换 AWS S3 / R2 / MinIO
5. **文件管理查询** — 支持按用户、按 room 查询文件列表

---

## 2. 现状

### 2.1 文件流

```
用户上传:  Client POST /api/upload → multer 写入 data/uploads/<uuid>.<ext>
Bot文件:   copyFileToUploads(localPath) → 复制到 data/uploads/<uuid>.<ext>
下载:      GET /api/uploads/<filename> → express.static 直接返回
```

### 2.2 消息格式

`messages` 表中 `type='file'` 的 `content` 字段存 JSON:

```json
{
  "id": "uuid",
  "filename": "uuid.png",
  "originalName": "截图.png",
  "mimeType": "image/png",
  "size": 12345,
  "url": "/api/uploads/uuid.png"
}
```

### 2.3 涉及文件清单

| 文件 | 职责 |
|------|------|
| `server/src/routes/upload.ts` | multer 上传 + `copyFileToUploads()` + 静态文件服务 |
| `server/src/socket/handlers.ts` | 调用 `copyFileToUploads` (MEDIA行/TTS)、读取 audio 文件做 STT |
| `server/src/index.ts` | 注册 upload router |
| `server/src/db/schema.ts` | 数据库 schema，需新增 migration |
| `client/src/services/upload.ts` | 客户端上传 + 图片压缩 |
| `client/src/types/index.ts` | `FileAttachment` 类型 |
| `client/src/components/MessageBubble/index.tsx` | 文件消息渲染 |
| `client/src/components/ChatView/index.tsx` | 拖拽上传、导出消息 |

---

## 3. 架构设计

### 3.1 整体架构

```
                    ┌────────────────────────────────────────────┐
                    │               ClawChat Server              │
                    │                                            │
 Client ──────────▶ │  upload route ──▶ file-store.ts ──────────▶│──▶ SeaweedFS S3
 (POST /api/upload) │     │               (CAS logic)            │    127.0.0.1:8333
                    │     │                   │                  │    Bucket: clawchat-cas
                    │     ▼                   ▼                  │
                    │  multer tmp        SHA-256 hash            │
                    │  (临时目录)         HEAD → PUT (去重)       │
                    │                        │                   │
                    │                        ▼                   │
 Client ──────────▶ │  files route ◀── file_uploads (SQLite)     │
 (GET /api/files/)  │     │                                      │
                    │     ▼                                      │
                    │  S3 GetObject ──▶ stream to response       │
                    └────────────────────────────────────────────┘
```

### 3.2 CAS 寻址规则

```
hash     = SHA-256(file_content)   // 64 hex chars
s3_key   = {hash[0:2]}/{hash[2:4]}/{hash}
例:        ab/cd/abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
```

两级目录分片避免单前缀下 key 过多。

### 3.3 SeaweedFS 部署

```bash
weed server \
  -dir=/data/seaweedfs \
  -filer -s3 \
  -ip=127.0.0.1 \
  -s3.port=8333 \
  -master.port=9333 \
  -volume.port=8080
```

- 所有端口绑定 `127.0.0.1`，外部不可达
- 单机模式，不配置副本（开发/小规模足够）
- 生产可选 `-master.replicationAsMin` 加副本

### 3.4 S3 连接配置

通过环境变量，默认值兼容本地开发：

```env
S3_ENDPOINT=http://127.0.0.1:8333
S3_BUCKET=clawchat-cas
S3_ACCESS_KEY=any
S3_SECRET_KEY=any
S3_REGION=us-east-1
```

SeaweedFS 默认不启用认证，`any/any` 即可。生产环境可配置 `s3.config.json` 启用 IAM。

---

## 4. 数据模型

### 4.1 新增表: `file_uploads` (migration v10)

```sql
CREATE TABLE IF NOT EXISTS file_uploads (
  id TEXT PRIMARY KEY,                              -- UUID
  hash TEXT NOT NULL,                               -- SHA-256 hex, 指向 S3 CAS 对象
  original_name TEXT NOT NULL,                      -- 用户可见文件名
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,                            -- bytes
  uploaded_by TEXT NOT NULL REFERENCES users(id),   -- 上传者 (用户或 bot)
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,  -- 关联 room (可选)
  message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,  -- 关联消息 (可选)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_file_uploads_user ON file_uploads(uploaded_by, created_at);
CREATE INDEX IF NOT EXISTS idx_file_uploads_room ON file_uploads(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_file_uploads_hash ON file_uploads(hash);
```

**设计要点：**
- `hash` 不是 UNIQUE — 同内容文件可被多人上传，每人各有一条记录
- `room_id` / `message_id` 用 `SET NULL` 而非 `CASCADE` — room/消息删除不影响文件记录
- 物理存储由 SeaweedFS 管理，此表只是**查询索引**
- 下载链路**不查此表**，直接用 URL 中的 hash 访问 S3

### 4.2 消息格式变化

```jsonc
// 旧格式 (兼容保留)
{
  "id": "uuid",
  "filename": "uuid.png",
  "originalName": "截图.png",
  "mimeType": "image/png",
  "size": 12345,
  "url": "/api/uploads/uuid.png"
}

// 新格式
{
  "id": "uuid",          // file_uploads.id
  "hash": "abcdef...",   // CAS hash
  "originalName": "截图.png",
  "mimeType": "image/png",
  "size": 12345,
  "url": "/api/files/abcdef..."
}
```

**兼容规则：** 新旧格式共存，Client 通过 `url` 前缀 (`/api/uploads/` vs `/api/files/`) 区分，无需迁移旧消息。

---

## 5. Server 端实现

### 5.1 新增: `services/file-store.ts`

CAS 核心模块，封装 S3 交互：

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { createReadStream, statSync, unlinkSync } from 'fs';

// --- 配置 ---
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://127.0.0.1:8333',
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'any',
    secretAccessKey: process.env.S3_SECRET_KEY || 'any',
  },
  forcePathStyle: true,
});

const BUCKET = process.env.S3_BUCKET || 'clawchat-cas';

// --- 内部工具 ---
function hashToKey(hash: string): string {
  return `${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}`;
}

/** Streaming SHA-256 */
export async function computeHash(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

/** 检查 CAS 对象是否已存在 */
export async function exists(hash: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: hashToKey(hash) }));
    return true;
  } catch {
    return false;
  }
}

/** 上传文件到 CAS (自动去重) */
export async function putFile(
  filePath: string,
  mimeType: string
): Promise<{ hash: string; size: number; deduplicated: boolean }> {
  const hash = await computeHash(filePath);
  const size = statSync(filePath).size;

  if (await exists(hash)) {
    return { hash, size, deduplicated: true };
  }

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: hashToKey(hash),
    Body: createReadStream(filePath),
    ContentType: mimeType,
    ContentLength: size,
  }));

  return { hash, size, deduplicated: false };
}

/** 获取文件流 (用于代理下载) */
export async function getFile(hash: string): Promise<{
  body: NodeJS.ReadableStream;
  contentType: string;
  size: number;
}> {
  const resp = await s3.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key: hashToKey(hash),
  }));
  return {
    body: resp.Body as NodeJS.ReadableStream,
    contentType: resp.ContentType || 'application/octet-stream',
    size: resp.ContentLength || 0,
  };
}

/** 获取本地临时文件路径 (用于 STT 等需要本地文件的场景) */
export async function downloadToTemp(hash: string): Promise<string> {
  const { body } = await getFile(hash);
  const tmpPath = `/tmp/clawchat-cas-${hash}`;
  const { createWriteStream } = await import('fs');
  const ws = createWriteStream(tmpPath);
  await new Promise<void>((resolve, reject) => {
    (body as any).pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
  return tmpPath;
}
```

### 5.2 改造: `routes/upload.ts`

```typescript
// 变化要点:
// 1. multer 改为写入系统 tmp 目录 (不再写 data/uploads)
// 2. 上传后调用 file-store.putFile()
// 3. 创建 file_uploads 记录
// 4. 返回新格式 JSON
// 5. copyFileToUploads → ingestLocalFile (改名, 走 CAS)
// 6. 旧的 /api/uploads/:filename 保留做兼容 (读本地 data/uploads)

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import { putFile } from '../services/file-store.js';
import { insertFileUpload } from '../services/file-upload-db.js';

// multer 写临时目录
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `clawchat-upload-${randomUUID()}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

// --- 新上传路由 ---
router.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file provided' });

  try {
    const { hash, size, deduplicated } = await putFile(file.path, file.mimetype);
    fs.unlinkSync(file.path); // 清理临时文件

    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf-8');
    const id = randomUUID();

    // 写 file_uploads 索引 (room_id / message_id 稍后由 socket handler 补全)
    insertFileUpload({
      id,
      hash,
      originalName,
      mimeType: file.mimetype,
      size,
      uploadedBy: (req as any).userId || 'unknown',
    });

    res.json({ id, hash, originalName, mimeType: file.mimetype, size, url: `/api/files/${hash}`, deduplicated });
  } catch (err: any) {
    console.error('[upload] CAS upload failed:', err);
    // 清理临时文件
    try { fs.unlinkSync(file.path); } catch {}
    res.status(500).json({ error: 'Upload failed' });
  }
});

// --- 兼容旧文件 ---
const legacyDir = path.join(path.dirname(new URL(import.meta.url).pathname), '../../data/uploads');
router.use('/uploads', (req, res) => {
  const filePath = path.join(legacyDir, path.basename(req.path));
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

export default router;

// --- ingestLocalFile: 替代 copyFileToUploads ---
const ALLOWED_PATHS = [
  path.resolve(process.env.HOME || '/home/azureuser', '.openclaw/workspace'),
  path.resolve(process.env.HOME || '/home/azureuser', '.openclaw/canvas'),
  '/tmp/clawchat-tts',
];

export async function ingestLocalFile(
  filePath: string,
  uploadedBy: string,
  roomId?: string
): Promise<{ id: string; hash: string; originalName: string; mimeType: string; size: number; url: string } | null> {
  const resolved = path.resolve(filePath);
  if (!ALLOWED_PATHS.some(p => resolved.startsWith(p))) {
    console.warn(`[upload] Blocked: ${resolved}`);
    return null;
  }
  if (!fs.existsSync(resolved)) return null;

  const stat = fs.statSync(resolved);
  if (stat.size > 50 * 1024 * 1024) return null;

  const ext = path.extname(resolved).toLowerCase();
  const MIME: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
    '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
  };
  const mimeType = MIME[ext] || 'application/octet-stream';

  const { hash, size } = await putFile(resolved, mimeType);
  const id = randomUUID();

  insertFileUpload({ id, hash, originalName: path.basename(resolved), mimeType, size, uploadedBy, roomId });

  return { id, hash, originalName: path.basename(resolved), mimeType, size, url: `/api/files/${hash}` };
}
```

### 5.3 新增: `routes/files.ts`

CAS 文件下载路由：

```typescript
import { Router } from 'express';
import { getFile } from '../services/file-store.js';

const router = Router();

router.get('/files/:hash', async (req, res) => {
  const { hash } = req.params;

  // 校验 hash 格式
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return res.status(400).json({ error: 'Invalid hash' });
  }

  try {
    const { body, contentType, size } = await getFile(hash);
    res.set({
      'Content-Type': contentType,
      'Content-Length': String(size),
      'ETag': `"${hash}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    (body as any).pipe(res);
  } catch (err: any) {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'File not found' });
    } else {
      console.error('[files] Download error:', err);
      res.status(500).json({ error: 'Download failed' });
    }
  }
});

export default router;
```

### 5.4 新增: `services/file-upload-db.ts`

file_uploads 表的 DB 操作：

```typescript
import { getDb } from '../db/schema.js';

export interface FileUploadRecord {
  id: string;
  hash: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  roomId?: string;
  messageId?: string;
}

export function insertFileUpload(record: FileUploadRecord): void {
  getDb().prepare(`
    INSERT INTO file_uploads (id, hash, original_name, mime_type, size, uploaded_by, room_id, message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(record.id, record.hash, record.originalName, record.mimeType,
         record.size, record.uploadedBy, record.roomId || null, record.messageId || null);
}

export function updateFileUploadContext(id: string, roomId: string, messageId: string): void {
  getDb().prepare(`
    UPDATE file_uploads SET room_id = ?, message_id = ? WHERE id = ?
  `).run(roomId, messageId, id);
}

export function listFilesByUser(userId: string, opts?: {
  roomId?: string;
  mimePrefix?: string;
  limit?: number;
  offset?: number;
}): FileUploadRecord[] {
  let sql = 'SELECT * FROM file_uploads WHERE uploaded_by = ?';
  const params: any[] = [userId];

  if (opts?.roomId) {
    sql += ' AND room_id = ?';
    params.push(opts.roomId);
  }
  if (opts?.mimePrefix) {
    sql += ' AND mime_type LIKE ?';
    params.push(`${opts.mimePrefix}%`);
  }

  sql += ' ORDER BY created_at DESC';
  sql += ` LIMIT ? OFFSET ?`;
  params.push(opts?.limit || 50, opts?.offset || 0);

  return getDb().prepare(sql).all(...params) as FileUploadRecord[];
}
```

### 5.5 改造: `socket/handlers.ts`

三处改动：

```
1. import { copyFileToUploads } → import { ingestLocalFile } from '../routes/upload.js'
   copyFileToUploads 调用改为 await ingestLocalFile(filePath, bot.id, data.roomId)

2. STT 音频读取路径:
   旧: path.join(process.cwd(), 'data', 'uploads', attachment.filename)
   新: 判断 attachment.hash 存在时，用 downloadToTemp(attachment.hash) 获取临时文件

3. file_uploads 上下文补全:
   消息创建后，如果是 file 类型，调用 updateFileUploadContext(attachment.id, roomId, messageId)
```

### 5.6 改造: `index.ts`

注册新路由：

```typescript
import filesRouter from './routes/files.js';
// ...
app.use('/api', filesRouter);
```

---

## 6. Client 端改动

### 6.1 `types/index.ts`

```typescript
export interface FileAttachment {
  id: string;
  hash?: string;           // 新增: CAS hash (新文件必有)
  filename?: string;        // 旧字段: 保留兼容
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  duration?: number;
  deduplicated?: boolean;   // 新增: 上传时是否去重命中
}
```

### 6.2 `services/upload.ts`

无需改动 — `uploadFile()` 只关心 POST `/api/upload` 返回 JSON，新旧返回格式都满足 `FileAttachment` 接口。

### 6.3 `components/MessageBubble/index.tsx`

无需改动 — 渲染逻辑使用 `attachment.url`、`attachment.originalName`、`attachment.mimeType`、`attachment.size`，这些字段新旧格式都有。

### 6.4 `components/ChatView/index.tsx`

无需改动 — 拖拽上传调用 `uploadFile()` 返回 `FileAttachment`，传给 `socketService.sendMessage()`。

### 6.5 新增: 文件管理页面 (Future)

```
GET /api/files?userId=xxx&roomId=xxx&type=image&limit=50&offset=0
→ 返回 file_uploads 列表
```

此 API 和 UI 作为后续 feature，不在本次实现范围。本次只建好索引表和查询函数。

---

## 7. 兼容与迁移策略

### 7.1 双轨并行

| 场景 | 处理 |
|------|------|
| 新上传的文件 | 走 CAS → `/api/files/<hash>` |
| 旧消息中的文件 | 继续从 `data/uploads/` 读取 → `/api/uploads/<filename>` |
| Client 渲染 | 统一用 `attachment.url`，自动路由到新/旧路径 |

**不做历史数据迁移** — 旧文件原地保留，自然淘汰。如果后续需要统一，可以写迁移脚本把 `data/uploads/` 批量导入 CAS。

### 7.2 STT 兼容

语音消息 STT 需要本地文件路径：
- **旧格式** (`attachment.filename`): 从 `data/uploads/` 读取 (不变)
- **新格式** (`attachment.hash`): 调用 `downloadToTemp(hash)` → 临时文件 → STT → 删除临时文件

---

## 8. 安全设计

| 层面 | 措施 |
|------|------|
| **SeaweedFS 网络** | 绑定 `127.0.0.1`，外部完全不可达 |
| **下载鉴权** | 通过 ClawChat Server 代理，遵循 Express 中间件鉴权 |
| **Hash 枚举** | SHA-256 空间 2^256，暴力枚举不可行 |
| **上传限制** | multer 50MB 限制 + 登录鉴权 |
| **路径穿越** | `ingestLocalFile` 保留 `ALLOWED_PATHS` 白名单 |
| **Hash 格式校验** | `/api/files/:hash` 路由严格校验 `/^[a-f0-9]{64}$/` |
| **临时文件清理** | 上传后立即 `unlinkSync`，STT 用完即删 |

---

## 9. 实施步骤

按顺序执行，每步可独立验证：

| # | 步骤 | 涉及文件 | 验证方式 |
|---|------|----------|----------|
| 1 | 安装并启动 SeaweedFS | systemd / docker | `curl http://127.0.0.1:8333` 返回 200 |
| 2 | 创建 S3 Bucket | AWS CLI 或 SeaweedFS shell | `aws s3 ls --endpoint http://127.0.0.1:8333` |
| 3 | `npm install @aws-sdk/client-s3` | package.json | - |
| 4 | 新增 `services/file-store.ts` | 新文件 | 单元测试: putFile + getFile |
| 5 | 新增 `services/file-upload-db.ts` | 新文件 | - |
| 6 | DB migration v10: `file_uploads` 表 | `db/schema.ts` | 启动后检查表存在 |
| 7 | 新增 `routes/files.ts` | 新文件 | `curl /api/files/<hash>` |
| 8 | 改造 `routes/upload.ts` | 现有文件 | 上传文件 → 检查 S3 存在 + JSON 返回 hash |
| 9 | 改造 `socket/handlers.ts` | 现有文件 | Bot MEDIA/TTS → 检查走 CAS |
| 10 | 注册路由 `index.ts` | 现有文件 | - |
| 11 | Client `FileAttachment` 类型扩展 | `types/index.ts` | TypeScript 编译通过 |
| 12 | `.env` 添加 S3 配置项 | `.env` | - |
| 13 | 端到端测试 | - | 上传 → 下载 → 去重验证 → STT 验证 |

---

## 10. 依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| SeaweedFS | ≥ 3.x | 文件存储后端 |
| `@aws-sdk/client-s3` | ^3.x | S3 协议客户端 |

---

## 11. 未来扩展

| Feature | 基础设施 | 状态 |
|---------|----------|------|
| 文件管理 UI (按用户/room 浏览) | `file_uploads` 表 + API | 本次建好索引，UI 后续 |
| Pre-signed URL (Client 直传 S3) | S3 API 原生支持 | 可选优化，减少 Server 中转 |
| 缩略图生成 | 上传时生成多尺寸，存不同 key | 可选 |
| 存储配额 | `file_uploads` 按用户 SUM(size) | 可选 |
| GC 清理孤儿 CAS 对象 | 扫描 S3 keys vs file_uploads.hash | 低优先级，存储成本低 |
| 切换到 AWS S3 / Cloudflare R2 | 改环境变量即可 | 零代码改动 |

---

## 12. Decisions (Resolved)

1. **SeaweedFS 安装方式** — systemd + 二进制 ✅
2. **上传鉴权** — 借此机会加上，`/api/upload` 要求已登录用户 ✅
3. **文件大小限制** — 调整为 **50MB** ✅
