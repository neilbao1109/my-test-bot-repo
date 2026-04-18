import { io, Socket } from 'socket.io-client';
import type { Message, Room, User, Thread } from '../types';

class SocketService {
  private socket: Socket | null = null;

  connect() {
    if (this.socket?.connected) return this.socket;

    // Priority: VITE_SERVER_URL env → same origin (works with Vite proxy in dev,
    // and when client is served by the Express server in production)
    const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;

    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
    });
    return this.socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  // Auth
  auth(token: string): Promise<{ user: User; rooms: Room[]; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('auth', { token }, resolve);
    });
  }

  // Rooms
  joinRoom(roomId: string) {
    this.socket?.emit('room:join', { roomId });
  }

  leaveRoom(roomId: string) {
    this.socket?.emit('room:leave', { roomId });
  }

  createRoom(name: string, type: 'dm' | 'group', memberIds?: string[]): Promise<Room> {
    return new Promise((resolve) => {
      this.socket?.emit('room:create', { name, type, memberIds }, resolve);
    });
  }

  inviteToRoom(roomId: string, userId: string): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
      this.socket?.emit('room:invite', { roomId, userId }, resolve);
    });
  }

  getRoomMembers(roomId: string): Promise<User[]> {
    return new Promise((resolve) => {
      this.socket?.emit('room:members', { roomId }, resolve);
    });
  }

  renameRoom(roomId: string, name: string): Promise<Room | null> {
    return new Promise((resolve) => {
      this.socket?.emit('room:rename', { roomId, name }, resolve);
    });
  }

  searchUsers(query: string): Promise<User[]> {
    return new Promise((resolve) => {
      this.socket?.emit('user:search', { query }, resolve);
    });
  }

  // Messages
  sendMessage(roomId: string, content: string, threadId?: string, replyToOrType?: string, type?: string) {
    // Support calling as (roomId, content, threadId, type) for file messages
    let replyTo: string | undefined;
    let msgType: string | undefined;
    if (replyToOrType === 'file' || replyToOrType === 'text' || replyToOrType === 'command' || replyToOrType === 'system') {
      msgType = replyToOrType;
    } else {
      replyTo = replyToOrType;
      msgType = type;
    }
    this.socket?.emit('message:send', { roomId, content, threadId, replyTo, type: msgType });
  }

  editMessage(messageId: string, content: string) {
    this.socket?.emit('message:edit', { messageId, content });
  }

  deleteMessage(messageId: string, roomId: string) {
    this.socket?.emit('message:delete', { messageId, roomId });
  }

  reactToMessage(messageId: string, emoji: string, roomId: string) {
    this.socket?.emit('message:react', { messageId, emoji, roomId });
  }

  // Threads
  createThread(roomId: string, parentMessageId: string): Promise<Thread> {
    return new Promise((resolve) => {
      this.socket?.emit('thread:create', { roomId, parentMessageId }, resolve);
    });
  }

  getThreadMessages(threadId: string, roomId: string): Promise<Message[]> {
    return new Promise((resolve) => {
      this.socket?.emit('thread:messages', { threadId, roomId }, resolve);
    });
  }

  // Search
  searchMessages(query: string, roomId?: string, global?: boolean, limit?: number): Promise<{ results: Message[]; total: number }> {
    return new Promise((resolve) => {
      this.socket?.emit('message:search', { query, roomId, global, limit }, resolve);
    });
  }

  // Typing
  startTyping(roomId: string, threadId?: string) {
    this.socket?.emit('typing:start', { roomId, threadId });
  }

  stopTyping(roomId: string, threadId?: string) {
    this.socket?.emit('typing:stop', { roomId, threadId });
  }

  // Event listeners
  on(event: string, callback: (...args: any[]) => void) {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (...args: any[]) => void) {
    this.socket?.off(event, callback);
  }
}

export const socketService = new SocketService();
