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
