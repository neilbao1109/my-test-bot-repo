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
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
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

  refreshRooms(): Promise<{ rooms: any[] }> {
    return new Promise((resolve) => {
      this.socket?.emit('room:list', resolve);
    });
  }

  leaveRoom(roomId: string) {
    this.socket?.emit('room:leave', { roomId });
  }

  createRoom(name: string | null, type: 'dm' | 'group' | 'bot', memberIds?: string[]): Promise<Room> {
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

  deleteRoom(roomId: string): Promise<{ success?: boolean; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('room:delete', { roomId }, resolve);
    });
  }

  searchUsers(query: string): Promise<User[]> {
    return new Promise((resolve) => {
      this.socket?.emit('user:search', { query }, resolve);
    });
  }

  // Messages
  sendMessage(roomId: string, content: string, threadId?: string, replyToOrType?: string, type?: string, contextIds?: string[]) {
    // Support calling as (roomId, content, threadId, type) for file messages
    let replyTo: string | undefined;
    let msgType: string | undefined;
    if (replyToOrType === 'file' || replyToOrType === 'text' || replyToOrType === 'command' || replyToOrType === 'system') {
      msgType = replyToOrType;
    } else {
      replyTo = replyToOrType;
      msgType = type;
    }
    this.socket?.emit('message:send', { roomId, content, threadId, replyTo, type: msgType, contextIds });
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

  // History pagination
  loadHistory(roomId: string, before: string, limit = 50): Promise<{ messages: Message[]; hasMore: boolean }> {
    return new Promise((resolve) => {
      this.socket?.emit('message:history', { roomId, before, limit }, resolve);
    });
  }

  // Typing
  startTyping(roomId: string, threadId?: string) {
    this.socket?.emit('typing:start', { roomId, threadId });
  }

  stopTyping(roomId: string, threadId?: string) {
    this.socket?.emit('typing:stop', { roomId, threadId });
  }

  // Pins
  pinMessage(messageId: string, roomId: string): Promise<{ success?: boolean; pin?: any; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('message:pin', { messageId, roomId }, resolve);
    });
  }

  unpinMessage(messageId: string, roomId: string): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
      this.socket?.emit('message:unpin', { messageId, roomId }, resolve);
    });
  }

  getPinnedMessages(roomId: string): Promise<any[]> {
    return new Promise((resolve) => {
      this.socket?.emit('message:pins', { roomId }, resolve);
    });
  }

  forwardMessages(messageIds: string[], sourceRoomId: string, targetRoomId: string, mode: 'individual' | 'merged'): Promise<{ success?: boolean; count?: number; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('message:forward', { messageIds, sourceRoomId, targetRoomId, mode }, resolve);
    });
  }

  getMessageContext(messageId: string, roomId: string): Promise<{ messages: Message[]; hasOlder: boolean; hasNewer: boolean; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('messages:context', { messageId, roomId }, resolve);
    });
  }

  // Bots
  addBotToRoom(roomId: string, botId: string): Promise<{ success?: boolean; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('room:add-bot', { roomId, botId }, resolve);
    });
  }

  removeBotFromRoom(roomId: string, botId: string): Promise<{ success?: boolean; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('room:remove-bot', { roomId, botId }, resolve);
    });
  }

  listAvailableBots(): Promise<{ bots: any[] }> {
    return new Promise((resolve) => {
      this.socket?.emit('bot:list', {}, resolve);
    });
  }

  testBotConnection(config: { gatewayUrl?: string; authToken: string; agentId?: string; sshHost?: string }): Promise<{ ok: boolean; error?: string; model?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('bot:test', config, resolve);
    });
  }

  registerBot(config: { username: string; avatarUrl?: string; gatewayUrl?: string; authToken: string; agentId?: string; sshHost?: string; trigger?: string }): Promise<{ bot?: any; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('bot:register', config, resolve);
    });
  }

  updateBot(botId: string, updates: Record<string, any>): Promise<{ bot?: any; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('bot:update', { botId, ...updates }, resolve);
    });
  }

  deleteBot(botId: string): Promise<{ success: boolean }> {
    return new Promise((resolve) => {
      this.socket?.emit('bot:delete', { botId }, resolve);
    });
  }

  shareBot(botId: string, userId: string): Promise<{ share?: any; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('bot:share', { botId, userId }, resolve);
    });
  }

  getBotShares(botId: string): Promise<{ shares: any[] }> {
    return new Promise((resolve) => {
      this.socket?.emit('bot:share:list', { botId }, resolve);
    });
  }

  revokeBotShare(shareId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('bot:share:revoke', { shareId }, resolve);
    });
  }

  getMarketplaceBots(): Promise<{ bots: any[] }> {
    return new Promise((resolve) => {
      this.socket?.emit('bot:marketplace', {}, resolve);
    });
  }

  addMarketplaceBot(botId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('bot:marketplace:add', { botId }, resolve);
    });
  }

  // Invitations
  getInvitations(): Promise<{ invitations: any[] }> {
    return new Promise((resolve) => {
      this.socket?.emit('invitation:list', {}, resolve);
    });
  }

  // Friends
  sendFriendRequest(toUserId: string, message?: string): Promise<{ friendship?: any; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('friend:request', { toUserId, message }, resolve);
    });
  }

  acceptFriendRequest(friendshipId: string): Promise<{ friendship?: any; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('friend:accept', { friendshipId }, resolve);
    });
  }

  rejectFriendRequest(friendshipId: string): Promise<{ success?: boolean; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('friend:reject', { friendshipId }, resolve);
    });
  }

  removeFriend(userId: string): Promise<{ success?: boolean; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('friend:remove', { userId }, resolve);
    });
  }

  getFriends(): Promise<{ friends: any[] }> {
    return new Promise((resolve) => {
      this.socket?.emit('friend:list', {}, resolve);
    });
  }

  getFriendRequests(): Promise<{ incoming: any[]; outgoing: any[] }> {
    return new Promise((resolve) => {
      this.socket?.emit('friend:requests', {}, resolve);
    });
  }

  searchFriends(query: string): Promise<{ users: any[] }> {
    return new Promise((resolve) => {
      this.socket?.emit('friend:search', { query }, resolve);
    });
  }

  acceptInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('invitation:accept', { invitationId }, resolve);
    });
  }

  rejectInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('invitation:reject', { invitationId }, resolve);
    });
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
