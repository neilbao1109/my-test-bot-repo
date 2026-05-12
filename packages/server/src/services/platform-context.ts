import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const CONTEXT_FILE = path.join(DATA_DIR, 'platform-context.md');
const EXAMPLE_FILE = path.join(DATA_DIR, 'platform-context.md.example');

/**
 * Initialize: copy example file if context file doesn't exist yet.
 */
export function initPlatformContext(): void {
  if (!fs.existsSync(CONTEXT_FILE) && fs.existsSync(EXAMPLE_FILE)) {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.copyFileSync(EXAMPLE_FILE, CONTEXT_FILE);
      console.log('[PlatformContext] Initialized from example file');
    } catch (err: any) {
      console.warn('[PlatformContext] Failed to init from example:', err.message);
    }
  }
}

/**
 * Read the platform-wide shared context.
 * Returns empty string if file doesn't exist.
 */
export function getPlatformContext(): string {
  try {
    if (fs.existsSync(CONTEXT_FILE)) {
      return fs.readFileSync(CONTEXT_FILE, 'utf-8').trim();
    }
  } catch (err: any) {
    console.error('[PlatformContext] Failed to read:', err.message);
  }
  return '';
}

/**
 * Update the platform-wide shared context.
 */
export function setPlatformContext(content: string): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CONTEXT_FILE, content, 'utf-8');
    console.log(`[PlatformContext] Updated (${content.length} chars)`);
  } catch (err: any) {
    console.error('[PlatformContext] Failed to write:', err.message);
    throw err;
  }
}

/**
 * Get the file path (for admin reference).
 */
export function getPlatformContextPath(): string {
  return CONTEXT_FILE;
}
