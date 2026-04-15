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

  const result = {
    id: randomUUID(),
    filename: file.filename,
    originalName: file.originalname,
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
