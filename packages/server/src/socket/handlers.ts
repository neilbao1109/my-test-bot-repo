import { Server, Socket } from 'socket.io';
import { createMessage, getMessages, editMessage, deleteMessage, addReaction } from '../services/message.js';
import { createRoom, getRooms, getRoomMembers, addMemberToRoom, removeMemberFromRoom, renameRoom, searchUsers, getRoom } from '../services/room.js';
import { createThread, getThread, getThreadByMessage } from '../services/thread.js';
import { parseCommand, executeCommand } from '../services/command.js';
import { streamBotResponse } from '../services/bot-bridge.js';
import { createOrGetUser, setOnline, getOnlineUsers } from '../services/user.js';
import { v4 as uuid } from 'uuid';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

// Track connected sockets per user for accurate presence
const userSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>

function updateThreadReplyCount(threadId: string, io: Server, roomId: string) {
  const thread = getThread(threadId);
  if (thread) {
    io.to(roomId).emit('thread:updated', {
      threadId: thread.id,
      parentMessageId: thread.parentMessageId,
      replyCount: thread.replyCount,
      lastReplyAt: thread.lastReplyAt,
    });
  }
}

export function setupSocketHandlers(io: Server) {
  io.on('connection', (rawSocket: Socket) => {
    const socket = rawSocket as AuthenticatedSocket;
    console.log(`[Socket] Connected: ${socket.id}`);

    // --- Auth ---
    socket.on('auth', (data: { username: string }, callback) => {
      const user = createOrGetUser(data.username);
      socket.userId = user.id;
      socket.username = user.username;

      // Track socket for presence
      if (!userSockets.has(user.id)) {
        userSockets.set(user.id, new Set());
      }
      userSockets.get(user.id)!.add(socket.id);

      setOnline(user.id, true);

      // Auto-create a DM room if none exists
      const rooms = getRooms(user.id);
      if (rooms.length === 0) {
        const dm = createRoom(`Chat with ClawBot`, 'dm', [user.id]);
        rooms.push(dm);
      }

      // Send presence snapshot
      const onlineUsers = getOnlineUsers();
      socket.emit('presence:snapshot', { onlineUsers });

      io.emit('user:online', { userId: user.id, isOnline: true });
      callback({ user, rooms });
    });

    // --- Rooms ---
    socket.on('room:join', (data: { roomId: string }) => {
      socket.join(data.roomId);
      const messages = getMessages(data.roomId, { limit: 50 });
      const members = getRoomMembers(data.roomId);
      socket.emit('room:history', { roomId: data.roomId, messages, members });
    });

    socket.on('room:leave', (data: { roomId: string }) => {
      socket.leave(data.roomId);
    });

    socket.on('room:create', (data: { name: string; type: 'dm' | 'group'; memberIds?: string[] }, callback) => {
      if (!socket.userId) return;
      const memberIds = data.memberIds ? [socket.userId, ...data.memberIds] : [socket.userId];
      const room = createRoom(data.name, data.type, memberIds);
      callback(room);
      socket.join(room.id);

      // Notify invited members
      if (data.memberIds) {
        for (const memberId of data.memberIds) {
          const memberSocketIds = userSockets.get(memberId);
          if (memberSocketIds) {
            for (const sid of memberSocketIds) {
              const memberSocket = io.sockets.sockets.get(sid);
              if (memberSocket) {
                memberSocket.join(room.id);
                memberSocket.emit('room:added', room);
              }
            }
          }
        }
      }
    });

    socket.on('room:invite', (data: { roomId: string; userId: string }, callback?) => {
      if (!socket.userId) return;
      const added = addMemberToRoom(data.roomId, data.userId);
      if (added) {
        const room = getRoom(data.roomId);
        const members = getRoomMembers(data.roomId);
        io.to(data.roomId).emit('room:member-joined', { roomId: data.roomId, members });

        // Join the invited user's sockets to the room
        const memberSocketIds = userSockets.get(data.userId);
        if (memberSocketIds) {
          for (const sid of memberSocketIds) {
            const memberSocket = io.sockets.sockets.get(sid);
            if (memberSocket) {
              memberSocket.join(data.roomId);
              if (room) memberSocket.emit('room:added', room);
            }
          }
        }
      }
      if (callback) callback({ success: added });
    });

    socket.on('room:members', (data: { roomId: string }, callback) => {
      const members = getRoomMembers(data.roomId);
      callback(members);
    });

    socket.on('room:rename', (data: { roomId: string; name: string }, callback?) => {
      const room = renameRoom(data.roomId, data.name);
      if (room) {
        io.to(data.roomId).emit('room:updated', room);
      }
      if (callback) callback(room);
    });

    socket.on('user:search', (data: { query: string }, callback) => {
      const users = searchUsers(data.query);
      callback(users);
    });

    // --- Messages ---
    socket.on('message:send', async (data: { roomId: string; content: string; threadId?: string; replyTo?: string; type?: string }) => {
      if (!socket.userId) return;

      // Check if it's a command
      const cmd = parseCommand(data.content);
      if (cmd) {
        const userMsg = createMessage({
          roomId: data.roomId,
          userId: socket.userId,
          content: data.content,
          type: 'command',
          threadId: data.threadId,
        });
        io.to(data.roomId).emit('message:new', userMsg);

        const result = executeCommand(cmd.command, cmd.args, data.roomId);
        const botMsg = createMessage({
          roomId: data.roomId,
          userId: 'bot-clawchat',
          content: result.output,
          type: 'system',
          threadId: data.threadId,
        });
        io.to(data.roomId).emit('message:new', botMsg);

        // Update thread reply count if in a thread
        if (data.threadId) {
          updateThreadReplyCount(data.threadId, io, data.roomId);
        }

        if (result.data && (result.data as any).action === 'clear') {
          socket.emit('command:result', { command: cmd.command, result });
        }
        if (result.data && (result.data as any).action === 'thread') {
          const msgs = getMessages(data.roomId, { limit: 2 });
          if (msgs.length >= 2) {
            const parentMsg = msgs[msgs.length - 2];
            const thread = createThread(data.roomId, parentMsg.id);
            io.to(data.roomId).emit('thread:created', { thread, parentMessage: parentMsg });
          }
        }
        return;
      }

      // Regular message
      const message = createMessage({
        roomId: data.roomId,
        userId: socket.userId,
        content: data.content,
        type: (data.type as 'text' | 'file') || undefined,
        threadId: data.threadId,
        replyTo: data.replyTo,
      });
      io.to(data.roomId).emit('message:new', message);

      // Update thread reply count if in a thread
      if (data.threadId) {
        updateThreadReplyCount(data.threadId, io, data.roomId);
      }

      // Bot streaming response
      const botMessageId = uuid();
      const now = new Date().toISOString();
      let fullContent = '';

      // Send start of stream
      io.to(data.roomId).emit('bot:stream:start', {
        messageId: botMessageId,
        roomId: data.roomId,
        threadId: data.threadId || null,
      });

      const context = {
        roomId: data.roomId,
        userId: socket.userId,
        threadId: data.threadId,
        history: [],
      };

      for await (const chunk of streamBotResponse(data.content, context)) {
        fullContent += chunk;
        io.to(data.roomId).emit('bot:stream', {
          messageId: botMessageId,
          chunk,
          done: false,
        });
      }

      // Save complete message
      const botMsg = createMessage({
        roomId: data.roomId,
        userId: 'bot-clawchat',
        content: fullContent,
        threadId: data.threadId,
      });

      // Send done with the real saved message
      io.to(data.roomId).emit('bot:stream', {
        messageId: botMessageId,
        chunk: '',
        done: true,
        finalMessage: botMsg,
      });

      // Update thread reply count if bot replied in a thread
      if (data.threadId) {
        updateThreadReplyCount(data.threadId, io, data.roomId);
      }
    });

    socket.on('message:edit', (data: { messageId: string; content: string }) => {
      const message = editMessage(data.messageId, data.content);
      if (message) {
        io.to(message.roomId).emit('message:updated', message);
      }
    });

    socket.on('message:delete', (data: { messageId: string; roomId: string }) => {
      deleteMessage(data.messageId);
      io.to(data.roomId).emit('message:deleted', { messageId: data.messageId });
    });

    socket.on('message:react', (data: { messageId: string; emoji: string; roomId: string }) => {
      if (!socket.userId) return;
      const reactions = addReaction(data.messageId, data.emoji, socket.userId);
      io.to(data.roomId).emit('message:reaction', {
        messageId: data.messageId,
        reactions,
      });
    });

    // --- Threads ---
    socket.on('thread:create', (data: { roomId: string; parentMessageId: string }, callback) => {
      const existing = getThreadByMessage(data.parentMessageId);
      if (existing) {
        callback(existing);
        return;
      }
      const thread = createThread(data.roomId, data.parentMessageId);
      io.to(data.roomId).emit('thread:created', { thread });
      callback(thread);
    });

    socket.on('thread:messages', (data: { threadId: string; roomId: string }, callback) => {
      const messages = getMessages(data.roomId, { threadId: data.threadId, limit: 100 });
      callback(messages);
    });

    // --- Typing ---
    socket.on('typing:start', (data: { roomId: string; threadId?: string }) => {
      if (!socket.userId) return;
      socket.to(data.roomId).emit('typing:update', {
        roomId: data.roomId,
        userId: socket.userId,
        username: socket.username,
        isTyping: true,
        threadId: data.threadId || null,
      });
    });

    socket.on('typing:stop', (data: { roomId: string; threadId?: string }) => {
      if (!socket.userId) return;
      socket.to(data.roomId).emit('typing:update', {
        roomId: data.roomId,
        userId: socket.userId,
        username: socket.username,
        isTyping: false,
        threadId: data.threadId || null,
      });
    });

    // --- Disconnect ---
    socket.on('disconnect', () => {
      if (socket.userId) {
        const sockets = userSockets.get(socket.userId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            userSockets.delete(socket.userId);
            setOnline(socket.userId, false);
            io.emit('user:online', { userId: socket.userId, isOnline: false });
          }
        }
      }
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });
}
