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

export function listFilesByRoom(roomId: string, opts?: {
  mimePrefix?: string;
  mimePrefixes?: string[];
  mimeExclude?: string[];
  limit?: number;
  offset?: number;
}): Array<FileUploadRecord & { uploaderName: string; isBot: boolean }> {
  let sql = `SELECT f.*, u.username AS uploaderName, u.is_bot AS isBot
    FROM file_uploads f
    LEFT JOIN users u ON f.uploaded_by = u.id
    WHERE f.room_id = ?`;
  const params: any[] = [roomId];

  if (opts?.mimePrefix) {
    sql += ' AND f.mime_type LIKE ?';
    params.push(`${opts.mimePrefix}%`);
  } else if (opts?.mimePrefixes && opts.mimePrefixes.length > 0) {
    const clauses = opts.mimePrefixes.map(p => { params.push(`${p}%`); return 'f.mime_type LIKE ?'; });
    sql += ` AND (${clauses.join(' OR ')})`;
  } else if (opts?.mimeExclude && opts.mimeExclude.length > 0) {
    for (const ex of opts.mimeExclude) {
      sql += ' AND f.mime_type NOT LIKE ?';
      params.push(`${ex}%`);
    }
  }

  sql += ' ORDER BY f.created_at DESC';
  sql += ` LIMIT ? OFFSET ?`;
  params.push(opts?.limit || 30, opts?.offset || 0);

  return getDb().prepare(sql).all(...params) as Array<FileUploadRecord & { uploaderName: string; isBot: boolean }>;
}

export function countFilesByRoom(roomId: string, mimePrefix?: string, mimePrefixes?: string[], mimeExclude?: string[]): number {
  let sql = 'SELECT COUNT(*) AS cnt FROM file_uploads WHERE room_id = ?';
  const params: any[] = [roomId];
  if (mimePrefix) {
    sql += ' AND mime_type LIKE ?';
    params.push(`${mimePrefix}%`);
  } else if (mimePrefixes && mimePrefixes.length > 0) {
    const clauses = mimePrefixes.map(p => { params.push(`${p}%`); return 'mime_type LIKE ?'; });
    sql += ` AND (${clauses.join(' OR ')})`;
  } else if (mimeExclude && mimeExclude.length > 0) {
    for (const ex of mimeExclude) {
      sql += ' AND mime_type NOT LIKE ?';
      params.push(`${ex}%`);
    }
  }
  return (getDb().prepare(sql).get(...params) as any).cnt;
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
