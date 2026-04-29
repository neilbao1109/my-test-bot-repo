import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';

const router = Router();

const CANVAS_ROOT = path.join(os.homedir(), '.openclaw', 'canvas', 'documents');

// Serve canvas document HTML
router.get('/canvas/:docId', (req, res) => {
  const { docId } = req.params;
  // Sanitize: only allow alphanumeric, dash, underscore
  if (!/^[\w-]+$/.test(docId)) {
    return res.status(400).send('Invalid document ID');
  }
  const filePath = path.join(CANVAS_ROOT, docId, 'index.html');
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Document not found');
  }
  res.type('html').sendFile(filePath);
});

export default router;
