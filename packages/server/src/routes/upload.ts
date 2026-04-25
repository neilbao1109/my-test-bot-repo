import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../../data/uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Allowed source directories for bot file sends
const ALLOWED_PATHS = [
  path.resolve(process.env.HOME || '/home/azureuser', '.openclaw/workspace'),
  path.resolve(process.env.HOME || '/home/azureuser', '.openclaw/canvas'),
];

/**
 * Copy a local file into the uploads directory and return attachment metadata.
 * Only allows files from ALLOWED_PATHS for security.
 */
export function copyFileToUploads(filePath: string): {
  id: string; filename: string; originalName: string;
  mimeType: string; size: number; url: string;
} | null {
  const resolved = path.resolve(filePath);
  if (!ALLOWED_PATHS.some(p => resolved.startsWith(p))) {
    console.warn(`[upload] Blocked file outside allowed paths: ${resolved}`);
    return null;
  }
  if (!fs.existsSync(resolved)) return null;

  const stat = fs.statSync(resolved);
  if (stat.size > 20 * 1024 * 1024) {
    console.warn(`[upload] File too large: ${resolved} (${stat.size} bytes)`);
    return null;
  }

  const ext = path.extname(resolved);
  const destName = `${randomUUID()}${ext}`;
  fs.copyFileSync(resolved, path.join(uploadsDir, destName));

  const mimeTypes: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav', '.txt': 'text/plain', '.md': 'text/markdown',
    '.json': 'application/json', '.zip': 'application/zip',
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  };

  return {
    id: randomUUID(),
    filename: destName,
    originalName: path.basename(resolved),
    mimeType: mimeTypes[ext.toLowerCase()] || 'application/octet-stream',
    size: stat.size,
    url: `/api/uploads/${destName}`,
  };
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();

router.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  // multer decodes filenames as latin1 by default; re-decode as UTF-8
  const originalName = Buffer.from(file.originalname, 'latin1').toString('utf-8');

  const result = {
    id: randomUUID(),
    filename: file.filename,
    originalName,
    mimeType: file.mimetype,
    size: file.size,
    url: `/api/uploads/${file.filename}`,
  };

  res.json(result);
});

router.use('/uploads', (req, res, next) => {
  // Serve uploaded files statically
  const filePath = path.join(uploadsDir, path.basename(req.path));
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

export default router;
