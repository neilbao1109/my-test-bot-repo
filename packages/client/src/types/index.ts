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
  name: string;
  type: 'dm' | 'group';
  createdBy?: string;
  createdAt: string;
}

export interface Message {
  id: string;
  roomId: string;
  threadId: string | null;
  userId: string;
  content: string;
  type: 'text' | 'command' | 'system' | 'file';
  replyTo: string | null;
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

export interface TypingUser {
  userId: string;
  username: string;
}

export interface StreamingMessage {
  messageId: string;
  content: string;
  roomId: string;
  threadId: string | null;
  botId?: string;
}

export interface FileAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface PinnedMessage {
  id: string;
  messageId: string;
  roomId: string;
  pinnedBy: string;
  pinnedAt: string;
  content: string;
  userId: string;
  type: string;
  createdAt: string;
}
