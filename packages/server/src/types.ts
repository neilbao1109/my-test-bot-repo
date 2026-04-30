export interface User {
  id: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  isBot: boolean;
  isOnline: boolean;
  createdAt: string;
}

export interface Room {
  id: string;
  name: string | null;
  type: 'dm' | 'group';
  createdBy?: string;
  createdAt: string;
}

export interface RoomMember {
  roomId: string;
  userId: string;
  joinedAt: string;
}

export interface Message {
  id: string;
  roomId: string;
  threadId: string | null;
  userId: string;
  content: string;
  type: 'text' | 'command' | 'system' | 'file' | 'forward';
  replyTo: string | null;
  contextIds?: string[];
  reactions: Record<string, string[]>;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Thread {
  id: string;
  roomId: string;
  parentMessageId: string;
  replyCount: number;
  lastReplyAt: string;
}

export interface FileAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface BotContext {
  roomId: string;
  userId: string;
  threadId?: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface CommandResult {
  success: boolean;
  output: string;
  data?: unknown;
}

export interface BotStatus {
  connected: boolean;
  model: string;
  uptime: number;
}
