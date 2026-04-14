import { io, Socket } from 'socket.io-client';
import type { Message, Room, User, Thread } from '../types';

class SocketService {
  private socket: Socket | null = null;

  connect() {
    if (this.socket?.connected) return this.socket;
    this.socket = io(window.location.origin, {
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
  auth(username: string): Promise<{ user: User; rooms: Room[] }> {
    return new Promise((resolve) => {
      this.socket?.emit('auth', { username }, resolve);
    });
  }

  // Rooms
  joinRoom(roomId: string) {
    this.socket?.emit('room:join', { roomId });
  }

  leaveRoom(roomId: string) {
    this.socket?.emit('room:leave', { roomId });
  }

  createRoom(name: string, type: 'dm' | 'group'): Promise<Room> {
    return new Promise((resolve) => {
      this.socket?.emit('room:create', { name, type }, resolve);
    });
  }

  // Messages
  sendMessage(roomId: string, content: string, threadId?: string, replyTo?: string) {
    this.socket?.emit('message:send', { roomId, content, threadId, replyTo });
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

  // Typing
  startTyping(roomId: string) {
    this.socket?.emit('typing:start', { roomId });
  }

  stopTyping(roomId: string) {
    this.socket?.emit('typing:stop', { roomId });
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
