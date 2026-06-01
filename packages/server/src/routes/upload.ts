import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { randomUUID } from 'crypto';
import { putFile } from '../services/file-store.js';
import { insertFileUpload } from '../services/file-upload-db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../../data/uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Allowed source directories for bot file sends
const ALLOWED_PATHS = [
  path.resolve(process.env.HOME || '/home/azureuser', '.openclaw/workspace'),
  path.resolve(process.env.HOME || '/home/azureuser', '.openclaw/canvas'),
  '/tmp/clawchat-tts',
];

/**
 * Ingest a local file into CAS storage.
 * Replaces the old copyFileToUploads — now goes through SeaweedFS S3.
 */
export async function ingestLocalFile(
  filePath: string,
  uploadedBy: string,
  roomId?: string
): Promise<{ id: string; hash: string; originalName: string; mimeType: string; size: number; url: string } | null> {
  const resolved = path.resolve(filePath);
  if (!ALLOWED_PATHS.some(p => resolved.startsWith(p))) {
    console.warn(`[upload] Blocked file outside allowed paths: ${resolved}`);
    return null;
  }
  if (!fs.existsSync(resolved)) return null;

  const stat = fs.statSync(resolved);
  if (stat.size > 50 * 1024 * 1024) {
    console.warn(`[upload] File too large: ${resolved} (${stat.size} bytes)`);
    return null;
  }

  const ext = path.extname(resolved).toLowerCase();
  const MIME: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav', '.txt': 'text/plain', '.md': 'text/markdown',
    '.json': 'application/json', '.zip': 'application/zip',
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  };
  const mimeType = MIME[ext] || 'application/octet-stream';

  const { hash, size } = await putFile(resolved, mimeType);
  const id = randomUUID();

  insertFileUpload({ id, hash, originalName: path.basename(resolved), mimeType, size, uploadedBy, roomId });

  return { id, hash, originalName: path.basename(resolved), mimeType, size, url: `/api/files/${hash}` };
}

// multer writes to system tmp directory (not data/uploads)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `clawchat-upload-${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

const router = Router();

// --- New upload route (CAS) ---
router.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  // Auth check: require logged-in user
  const userId = (req as any).userId;
  if (!userId) {
    try { fs.unlinkSync(file.path); } catch {}
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const { hash, size, deduplicated } = await putFile(file.path, file.mimetype);
    fs.unlinkSync(file.path); // Clean up temp file

    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf-8');
    const id = randomUUID();

    insertFileUpload({
      id,
      hash,
      originalName,
      mimeType: file.mimetype,
      size,
      uploadedBy: userId,
    });

    res.json({ id, hash, originalName, mimeType: file.mimetype, size, url: `/api/files/${hash}`, deduplicated });
  } catch (err: any) {
    console.error('[upload] CAS upload failed:', err);
    try { fs.unlinkSync(file.path); } catch {}
    res.status(500).json({ error: 'Upload failed' });
  }
});

// --- Legacy file serving (backward compat) ---
router.use('/uploads', (req, res) => {
  const filePath = path.join(uploadsDir, path.basename(req.path));
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

export default router;
