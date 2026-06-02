import { Router } from 'express';
import { getFile } from '../services/file-store.js';

const router = Router();

router.get('/files/:hash', async (req, res) => {
  const { hash } = req.params;

  // Validate hash format
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    res.status(400).json({ error: 'Invalid hash' });
    return;
  }

  try {
    const { body, contentType, size } = await getFile(hash);

    // ?name= sets Content-Disposition filename; ?download=1 forces attachment (save dialog)
    const filename = req.query.name as string | undefined;
    const isDownload = req.query.download === '1';
    res.set({
      'Content-Type': contentType,
      'Content-Length': String(size),
      'ETag': `"${hash}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      ...(filename ? {
        'Content-Disposition': `${isDownload ? 'attachment' : 'inline'}; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      } : {}),
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
