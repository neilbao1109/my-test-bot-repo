import { getDb } from '../db/schema.js';

export function getRoomAutoThread(roomId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT auto_thread FROM room_settings WHERE room_id = ?').get(roomId) as { auto_thread: number } | undefined;
  // Default to true if no row exists
  return row ? row.auto_thread === 1 : true;
}

export function setRoomAutoThread(roomId: string, enabled: boolean): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO room_settings (room_id, auto_thread) VALUES (?, ?)
     ON CONFLICT(room_id) DO UPDATE SET auto_thread = excluded.auto_thread`
  ).run(roomId, enabled ? 1 : 0);
}
