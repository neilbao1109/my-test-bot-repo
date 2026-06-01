import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { createReadStream, statSync, createWriteStream } from 'fs';

// --- Config ---
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

// --- Internal ---
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

/** Check if CAS object exists */
export async function exists(hash: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: hashToKey(hash) }));
    return true;
  } catch {
    return false;
  }
}

/** Upload file to CAS (auto-dedup) */
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

/** Get file stream (for proxy download) */
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

/** Download to temp file (for STT etc.) */
export async function downloadToTemp(hash: string): Promise<string> {
  const { body } = await getFile(hash);
  const tmpPath = `/tmp/clawchat-cas-${hash}`;
  const ws = createWriteStream(tmpPath);
  await new Promise<void>((resolve, reject) => {
    (body as any).pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
  return tmpPath;
}
