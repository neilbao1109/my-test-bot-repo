import { get, set, del, clear, keys } from 'idb-keyval';

const CACHE_VERSION = 1;
const VERSION_KEY = 'cache-version';

// Check version on first access, clear if mismatch
let versionChecked = false;
async function ensureVersion(): Promise<boolean> {
  if (versionChecked) return true;
  const v = await get(VERSION_KEY);
  if (v !== CACHE_VERSION) {
    await clear();
    await set(VERSION_KEY, CACHE_VERSION);
  }
  versionChecked = true;
  return true;
}

// Messages cache
export async function getCachedMessages(roomId: string): Promise<{ messages: any[]; members: any[] } | null> {
  await ensureVersion();
  return (await get(`messages:${roomId}`)) || null;
}

export async function setCachedMessages(roomId: string, messages: any[], members: any[]): Promise<void> {
  await ensureVersion();
  await set(`messages:${roomId}`, { messages, members, cachedAt: Date.now() });
}

// Rooms cache
export async function getCachedRooms(): Promise<any[] | null> {
  await ensureVersion();
  return (await get('rooms')) || null;
}

export async function setCachedRooms(rooms: any[]): Promise<void> {
  await ensureVersion();
  await set('rooms', rooms);
}

// Clear all cache (on logout)
export async function clearCache(): Promise<void> {
  await clear();
  versionChecked = false;
}

// Append a single message to cached room messages
export async function appendCachedMessage(roomId: string, message: any): Promise<void> {
  const cached = await getCachedMessages(roomId);
  if (!cached) return;
  // Avoid duplicates
  if (cached.messages.some((m: any) => m.id === message.id)) return;
  cached.messages.push(message);
  // Keep max 200 messages in cache to avoid bloat
  if (cached.messages.length > 200) {
    cached.messages = cached.messages.slice(-200);
  }
  await setCachedMessages(roomId, cached.messages, cached.members);
}

// Update a message in cache (edit)
export async function updateCachedMessage(roomId: string, message: any): Promise<void> {
  const cached = await getCachedMessages(roomId);
  if (!cached) return;
  const idx = cached.messages.findIndex((m: any) => m.id === message.id);
  if (idx !== -1) {
    cached.messages[idx] = message;
    await setCachedMessages(roomId, cached.messages, cached.members);
  }
}

// Mark message deleted in cache
export async function deleteCachedMessage(roomId: string, messageId: string): Promise<void> {
  const cached = await getCachedMessages(roomId);
  if (!cached) return;
  const idx = cached.messages.findIndex((m: any) => m.id === messageId);
  if (idx !== -1) {
    cached.messages[idx] = { ...cached.messages[idx], isDeleted: true, content: '' };
    await setCachedMessages(roomId, cached.messages, cached.members);
  }
}
