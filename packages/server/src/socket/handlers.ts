import { Server, Socket } from 'socket.io';
import { createMessage, getMessages, getLastMessage, getLastMessageByUser, getMessagesSince, getMessageById, getMessagesAroundId, editMessage, deleteMessage, addReaction, searchMessages, getReplyChain } from '../services/message.js';
import { createRoom, getRooms, getRoomMembers, addMemberToRoom, removeMemberFromRoom, addBotToRoom, removeBotFromRoom, renameRoom, deleteRoom, searchUsers, getRoom } from '../services/room.js';
import { createThread, getThread, getThreadByMessage } from '../services/thread.js';
import { parseCommand, executeCommand } from '../services/command.js';
import { initBotRegistry, getRespondingBots, isBotUser, getAllBots, getBot, getAvailableBots, streamBotResponse as registryStreamBotResponse, registerBot, updateBot, deleteBot, testBotConnection } from '../services/bot-registry.js';
import { shareBot, acceptBotShare, revokeBotShare, getBotShares, getPublicBots, addPublicBotToUser } from '../services/bot-share.js';
import { pinMessage, unpinMessage, getPinnedMessages } from '../services/pin.js';
import { createInvitation, acceptInvitation, rejectInvitation, getPendingInvitations, getInvitationCount } from '../services/invitation.js';
import { copyFileToUploads } from '../routes/upload.js';
import { getUser, setOnline, getOnlineUsers } from '../services/user.js';
import { verifyToken } from '../services/auth.js';
import { v4 as uuid } from 'uuid';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

// Track connected sockets per user for accurate presence
const userSockets = new Map<string, Set<string>>(); // userId -> Set<socketId>

// Track active bot streams for graceful shutdown
const activeBotStreams = new Map<string, { roomId: string; botId: string; content: string; threadId?: string }>();
let isShuttingDown = false;

/** Signal handlers to stop accepting new bot work */
export function signalShutdown(): void {
  isShuttingDown = true;
}

/**
 * Wait for active bot streams to finish, or save partial content on timeout.
 * Returns when all streams are done or timeout expires.
 */
export async function drainBotStreams(timeoutMs = 5000): Promise<void> {
  if (activeBotStreams.size === 0) return;

  console.log(`[Shutdown] Waiting for ${activeBotStreams.size} active bot stream(s)...`);

  const deadline = Date.now() + timeoutMs;
  while (activeBotStreams.size > 0 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Save any remaining partial streams
  if (activeBotStreams.size > 0) {
    console.log(`[Shutdown] Saving ${activeBotStreams.size} partial bot response(s)...`);
    for (const [streamId, stream] of activeBotStreams) {
      if (stream.content.trim()) {
        try {
          const partialMsg = createMessage({
            roomId: stream.roomId,
            userId: stream.botId,
            content: stream.content + '\n\n⚠️ _Response interrupted by server shutdown_',
            threadId: stream.threadId,
          });
          console.log(`[Shutdown] Saved partial response: ${partialMsg.id} (${stream.content.length} chars)`);
        } catch (err: any) {
          console.error(`[Shutdown] Failed to save partial response:`, err.message);
        }
      }
      activeBotStreams.delete(streamId);
    }
  }
}

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
    socket.on('auth', (data: { token: string }, callback) => {
      const payload = verifyToken(data.token);
      if (!payload) {
        callback({ error: 'Invalid token' });
        return;
      }
      const user = getUser(payload.userId);
      if (!user) {
        callback({ error: 'User not found' });
        return;
      }
      socket.userId = user.id;
      socket.username = user.username;

      // Track socket for presence
      if (!userSockets.has(user.id)) {
        userSockets.set(user.id, new Set());
      }
      userSockets.get(user.id)!.add(socket.id);

      setOnline(user.id, true);

      const rooms = getRooms(user.id);

      // Send presence snapshot
      const onlineUsers = getOnlineUsers();
      socket.emit('presence:snapshot', { onlineUsers });

      io.emit('user:online', { userId: user.id, isOnline: true });

      // Auto-join all rooms' socket.io channels for push notifications
      for (const room of rooms) {
        socket.join(room.id);
      }

      const pendingInvitationCount = getInvitationCount(user.id);

      callback({ user, pendingInvitationCount, rooms: rooms.map(r => {
        const lastMsg = getLastMessage(r.id);
        const members = getRoomMembers(r.id);
        const sender = lastMsg ? members.find(m => m.id === lastMsg.userId) : null;
        return {
          ...r,
          members,
          lastMessage: lastMsg ? {
            content: lastMsg.content,
            type: lastMsg.type,
            senderName: sender?.username || 'Unknown',
            createdAt: lastMsg.createdAt,
          } : null,
        };
      }) });
    });

    // --- Rooms ---
    socket.on('room:join', (data: { roomId: string }) => {
      socket.join(data.roomId);
      const messages = getMessages(data.roomId, { limit: 50 });
      const members = getRoomMembers(data.roomId);
      const hasMore = messages.length === 50;
      socket.emit('room:history', { roomId: data.roomId, messages, members, hasMore });
    });

    socket.on('room:leave', (data: { roomId: string }) => {
      socket.leave(data.roomId);
    });

    socket.on('room:create', (data: { name?: string | null; type: 'dm' | 'group' | 'bot'; memberIds?: string[] }, callback) => {
      if (!socket.userId) return;

      if (data.type === 'dm') {
        // DM: directly add both users (uniqueness handled by createRoom)
        const memberIds = data.memberIds ? [socket.userId, ...data.memberIds] : [socket.userId];
        const room = createRoom(null, 'dm', memberIds, socket.userId);
        callback(room);
        socket.join(room.id);

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
      } else if (data.type === 'bot') {
        // Bot: like DM but no uniqueness constraint, requires name
        const memberIds = data.memberIds ? [socket.userId, ...data.memberIds] : [socket.userId];
        const room = createRoom(data.name || 'Bot Chat', 'bot', memberIds, socket.userId);
        callback(room);
        socket.join(room.id);

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
      } else {
        // Group: creator is added directly, others get invitations
        const room = createRoom(data.name || 'Unnamed Room', 'group', [socket.userId], socket.userId);
        callback(room);
        socket.join(room.id);

        if (data.memberIds) {
          for (const memberId of data.memberIds) {
            const invitation = createInvitation('room', socket.userId, memberId, room.id);
            const memberSocketIds = userSockets.get(memberId);
            if (memberSocketIds) {
              for (const sid of memberSocketIds) {
                io.sockets.sockets.get(sid)?.emit('invitation:new', invitation);
              }
            }
          }
        }
      }
    });

    socket.on('room:invite', (data: { roomId: string; userId: string }, callback?) => {
      if (!socket.userId) return;
      const invitation = createInvitation('room', socket.userId, data.userId, data.roomId);

      // Push notification to invited user
      const memberSocketIds = userSockets.get(data.userId);
      if (memberSocketIds) {
        for (const sid of memberSocketIds) {
          io.sockets.sockets.get(sid)?.emit('invitation:new', invitation);
        }
      }

      if (callback) callback({ success: true, invitation });
    });

    // --- Invitations ---
    socket.on('invitation:list', (_data: any, callback) => {
      if (!socket.userId) return;
      const invitations = getPendingInvitations(socket.userId);
      callback({ invitations });
    });

    socket.on('invitation:accept', (data: { invitationId: string }, callback) => {
      if (!socket.userId) return;
      const result = acceptInvitation(data.invitationId, socket.userId);
      if (!result.success) { callback(result); return; }

      if (result.type === 'room' && result.resourceId) {
        addMemberToRoom(result.resourceId, socket.userId);
        const room = getRoom(result.resourceId);
        const members = getRoomMembers(result.resourceId);

        socket.join(result.resourceId);
        if (room) socket.emit('room:added', room);

        io.to(result.resourceId).emit('room:member-joined', { roomId: result.resourceId, members });
      }

      if (result.type === 'bot_share' && result.resourceId) {
        acceptBotShare(result.resourceId, socket.userId);
      }

      // Notify invitation sender
      if (result.fromUser) {
        const senderSockets = userSockets.get(result.fromUser);
        if (senderSockets) {
          for (const sid of senderSockets) {
            io.sockets.sockets.get(sid)?.emit('invitation:resolved', { invitationId: data.invitationId, status: 'accepted' });
          }
        }
      }

      callback({ success: true });
    });

    socket.on('invitation:reject', (data: { invitationId: string }, callback) => {
      if (!socket.userId) return;
      const result = rejectInvitation(data.invitationId, socket.userId);
      callback(result);
    });

    socket.on('room:members', (data: { roomId: string }, callback) => {
      const members = getRoomMembers(data.roomId);
      callback(members);
    });

    socket.on('room:rename', (data: { roomId: string; name: string }, callback?) => {
      const { room, error } = renameRoom(data.roomId, data.name, socket.userId);
      if (error) {
        if (callback) callback({ error });
        return;
      }
      if (room) {
        io.to(data.roomId).emit('room:updated', room);
      }
      if (callback) callback(room);
    });

    socket.on('room:delete', (data: { roomId: string }, callback?) => {
      // Get members before deleting so we can notify them
      const members = getRoomMembers(data.roomId);
      const { success, error } = deleteRoom(data.roomId, socket.userId);
      if (error) {
        if (callback) callback({ error });
        return;
      }
      if (success) {
        // Notify all members (they may not be in the socket room anymore)
        for (const member of members) {
          const memberSocketIds = userSockets.get(member.id);
          if (memberSocketIds) {
            for (const sid of memberSocketIds) {
              io.sockets.sockets.get(sid)?.emit('room:deleted', { roomId: data.roomId });
            }
          }
        }
      }
      if (callback) callback({ success });
    });

    // --- Bot Management ---
    socket.on('room:add-bot', (data: { roomId: string; botId: string }, callback?) => {
      if (!socket.userId) return;
      const members = getRoomMembers(data.roomId);
      if (!members.some(m => m.id === socket.userId)) {
        if (callback) callback({ error: 'Not a member of this room' });
        return;
      }
      if (!getBot(data.botId)) {
        if (callback) callback({ error: 'Bot not found' });
        return;
      }
      const added = addBotToRoom(data.roomId, data.botId);
      if (added) {
        const updatedMembers = getRoomMembers(data.roomId);
        io.to(data.roomId).emit('room:member-joined', { roomId: data.roomId, members: updatedMembers });
      }
      if (callback) callback({ success: added });
    });

    socket.on('room:remove-bot', (data: { roomId: string; botId: string }, callback?) => {
      if (!socket.userId) return;
      const members = getRoomMembers(data.roomId);
      if (!members.some(m => m.id === socket.userId)) {
        if (callback) callback({ error: 'Not a member of this room' });
        return;
      }
      const removed = removeBotFromRoom(data.roomId, data.botId);
      if (removed) {
        const updatedMembers = getRoomMembers(data.roomId);
        io.to(data.roomId).emit('room:member-left', { roomId: data.roomId, userId: data.botId, members: updatedMembers });
      }
      if (callback) callback({ success: removed });
    });

    socket.on('bot:list', (_data: any, callback) => {
      if (!socket.userId) return;
      const bots = getAvailableBots(socket.userId);
      callback({ bots });
    });

    // bot:test - test connection before registering
    socket.on('bot:test', async (data, callback) => {
      if (!socket.userId) return;
      const result = await testBotConnection(data);
      callback(result);
    });

    // bot:register - register a new bot
    socket.on('bot:register', (data, callback) => {
      if (!socket.userId) return;
      try {
        const bot = registerBot(data, socket.userId);
        callback({ bot });
      } catch (err: any) {
        callback({ error: err.message });
      }
    });

    // bot:update - update bot config
    socket.on('bot:update', (data: { botId: string; [key: string]: any }, callback) => {
      if (!socket.userId) return;
      const { botId, ...updates } = data;
      const bot = updateBot(botId, updates, socket.userId);
      if (!bot) {
        callback({ error: 'Bot not found or not owned by you' });
        return;
      }
      callback({ bot });
    });

    // bot:delete - delete a bot
    socket.on('bot:delete', (data: { botId: string }, callback) => {
      if (!socket.userId) return;
      const success = deleteBot(data.botId, socket.userId);
      callback({ success });
    });

    // bot:share - share a bot with another user
    socket.on('bot:share', (data: { botId: string; userId: string }, callback) => {
      if (!socket.userId) return;
      const result = shareBot(data.botId, socket.userId, data.userId);
      if (result.share) {
        // Notify target user
        const targetSockets = userSockets.get(data.userId);
        if (targetSockets) {
          for (const sid of targetSockets) {
            const targetSocket = io.sockets.sockets.get(sid);
            if (targetSocket) {
              // The invitation was created inside shareBot, fetch pending invitations
              targetSocket.emit('invitation:new', {
                id: result.share.id,
                type: 'bot_share',
                fromUser: socket.userId,
                toUser: data.userId,
                resourceId: result.share.id,
                status: 'pending',
              });
            }
          }
        }
      }
      if (callback) callback(result);
    });

    // bot:share:list - list shares for a bot
    socket.on('bot:share:list', (data: { botId: string }, callback) => {
      if (!socket.userId) return;
      const shares = getBotShares(data.botId, socket.userId);
      callback({ shares });
    });

    // bot:share:revoke - revoke a bot share
    socket.on('bot:share:revoke', (data: { shareId: string }, callback) => {
      if (!socket.userId) return;
      const result = revokeBotShare(data.shareId, socket.userId);
      if (callback) callback(result);
    });

    // bot:marketplace - list public bots
    socket.on('bot:marketplace', (_data: any, callback) => {
      const bots = getPublicBots();
      callback({ bots });
    });

    // bot:marketplace:add - add a public bot to user's available list
    socket.on('bot:marketplace:add', (data: { botId: string }, callback) => {
      if (!socket.userId) return;
      const result = addPublicBotToUser(data.botId, socket.userId);
      if (callback) callback(result);
    });

    socket.on('user:search', (data: { query: string }, callback) => {
      const users = searchUsers(data.query);
      callback(users);
    });

    socket.on('message:history', (data: { roomId: string; before: string; limit?: number }, callback) => {
      if (!socket.userId) return;
      const limit = data.limit || 50;
      const messages = getMessages(data.roomId, { limit, before: data.before });
      const hasMore = messages.length === limit;
      callback({ messages, hasMore });
    });

    // --- Messages ---
    socket.on('message:send', async (data: { roomId: string; content: string; threadId?: string; replyTo?: string; type?: string; contextIds?: string[] }) => {
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

        const firstBot = getAllBots()[0];
        const result = executeCommand(cmd.command, cmd.args, data.roomId);
        const botMsg = createMessage({
          roomId: data.roomId,
          userId: firstBot?.id || 'bot-clawchat',
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
        contextIds: data.contextIds,
      });
      io.to(data.roomId).emit('message:new', message);

      // Update thread reply count if in a thread
      if (data.threadId) {
        updateThreadReplyCount(data.threadId, io, data.roomId);
      }

      // Build reply context if replying to a message (use contextIds or fall back to replyTo)
      let botContent = data.content;
      const ctxIds = data.contextIds && data.contextIds.length > 0 ? data.contextIds : (message.replyTo ? [message.replyTo] : []);
      if (ctxIds.length > 0) {
        const contextMsgs = ctxIds.map(id => getMessageById(id)).filter((m): m is NonNullable<typeof m> => m !== null);
        if (contextMsgs.length > 0) {
          const contextLines = contextMsgs.map(m => {
            const u = getUser(m.userId);
            const name = u?.username || m.userId;
            const body = m.type === 'file' ? '[file]' : m.content.slice(0, 300);
            return `[${name}]: ${body}`;
          });
          botContent = `--- Reply Context ---\n${contextLines.join('\n')}\n--- End Reply Context ---\n\n[${getUser(socket.userId)?.username || socket.userId}]: ${data.content}`;
        }
      }

      // Bot streaming responses — determine which bots should respond
      const currentRoom = getRoom(data.roomId);
      const roomType = currentRoom?.type as 'dm' | 'group' | 'bot' | undefined;
      const respondingBots = getRespondingBots(data.content, data.roomId, socket.userId, roomType);

      // In group rooms, prepend recent chat history so the bot has context
      if (roomType === 'group' && respondingBots.length > 0) {
        const MAX_GROUP_HISTORY = 50;
        const FALLBACK_HISTORY = 30;

        // Find the bot's last reply in this room (= anchor for "what's new")
        const lastBotMsg = getLastMessageByUser(data.roomId, respondingBots[0].id);

        let recentMessages;
        let historyLabel: string;

        if (lastBotMsg) {
          // Get everything since the bot's last reply (inclusive, so bot sees its own last response)
          recentMessages = getMessagesSince(data.roomId, lastBotMsg.createdAt, MAX_GROUP_HISTORY);
          historyLabel = `${recentMessages.length} messages since last bot interaction`;
        } else {
          // First mention ever — fallback to recent N
          recentMessages = getMessages(data.roomId, { limit: FALLBACK_HISTORY });
          historyLabel = `recent ${recentMessages.length} messages (first interaction)`;
        }

        // Exclude the current message (already in botContent) 
        const historyLines = recentMessages
          .filter(m => m.id !== message.id)
          .map(m => {
            const u = getUser(m.userId);
            const name = u?.username || m.userId;
            const isBot = isBotUser(m.userId);
            const tag = isBot ? ' [bot]' : '';
            const body = m.type === 'file' ? '[file]'
              : m.type === 'forward' ? '[forwarded messages]'
              : m.content.slice(0, 500);
            return `[${name}${tag}] ${body}`;
          });

        if (historyLines.length > 0) {
          botContent = `--- Group Chat History (${historyLabel}) ---\n${historyLines.join('\n')}\n--- End History ---\n\n[${getUser(socket.userId)?.username || socket.userId}]: ${data.content}`;
        }
      }

      // Process bots sequentially to avoid interleaving
      for (const bot of respondingBots) {
        if (isShuttingDown) break; // Don't start new bot responses during shutdown

        const botMessageId = uuid();
        let fullContent = '';

        // Track this stream for graceful shutdown
        const streamId = `${data.roomId}:${botMessageId}`;
        activeBotStreams.set(streamId, {
          roomId: data.roomId,
          botId: bot.id,
          content: '',
          threadId: data.threadId,
        });

        io.to(data.roomId).emit('bot:stream:start', {
          messageId: botMessageId,
          roomId: data.roomId,
          threadId: data.threadId || null,
          botId: bot.id,
        });

        const context = {
          roomId: data.roomId,
          userId: socket.userId,
          threadId: data.threadId,
          history: [],
        };

        try {
          for await (const chunk of registryStreamBotResponse(bot.id, botContent, context)) {
            fullContent += chunk;
            // Update tracked content for graceful shutdown
            const tracked = activeBotStreams.get(streamId);
            if (tracked) tracked.content = fullContent;

            io.to(data.roomId).emit('bot:stream', {
              messageId: botMessageId,
              chunk,
              done: false,
            });
          }

          // Parse MEDIA:<path> lines from bot response
          const mediaRegex = /^MEDIA:(.+)$/gm;
          const mediaMatches = [...fullContent.matchAll(mediaRegex)];
          const cleanContent = fullContent.replace(/^MEDIA:.+\n?/gm, '').trim();

          // Send file messages for each MEDIA line
          for (const match of mediaMatches) {
            const filePath = match[1].trim();
            const attachment = copyFileToUploads(filePath);
            if (attachment) {
              const fileMsg = createMessage({
                roomId: data.roomId,
                userId: bot.id,
                content: JSON.stringify(attachment),
                type: 'file',
                threadId: data.threadId,
              });
              io.to(data.roomId).emit('message:new', fileMsg);
            }
          }

          // Save text content (with MEDIA lines stripped)
          const botMsg = cleanContent ? createMessage({
            roomId: data.roomId,
            userId: bot.id,
            content: cleanContent,
            threadId: data.threadId,
          }) : null;

          io.to(data.roomId).emit('bot:stream', {
            messageId: botMessageId,
            chunk: '',
            done: true,
            finalMessage: botMsg || createMessage({
              roomId: data.roomId,
              userId: bot.id,
              content: fullContent,
              threadId: data.threadId,
            }),
          });

          if (data.threadId) {
            updateThreadReplyCount(data.threadId, io, data.roomId);
          }
        } finally {
          // Stream completed or errored — remove from tracking
          activeBotStreams.delete(streamId);
        }
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

    // --- Search ---
    socket.on('message:search', (data: { query: string; roomId?: string; global?: boolean; limit?: number }, callback) => {
      if (!socket.userId || !data.query?.trim()) {
        if (callback) callback({ results: [], total: 0 });
        return;
      }

      let searchOpts: { roomId?: string; roomIds?: string[]; limit?: number };

      if (data.global) {
        // Search across all rooms the user has joined
        const rooms = getRooms(socket.userId);
        searchOpts = { roomIds: rooms.map(r => r.id), limit: data.limit };
      } else if (data.roomId) {
        searchOpts = { roomId: data.roomId, limit: data.limit };
      } else {
        if (callback) callback({ results: [], total: 0 });
        return;
      }

      const result = searchMessages(data.query.trim(), searchOpts);
      if (callback) callback(result);
    });

    // --- Pins ---
    socket.on('message:pin', (data: { messageId: string; roomId: string }, callback?) => {
      if (!socket.userId) return;
      const pin = pinMessage(data.messageId, data.roomId, socket.userId);
      if (pin) {
        io.to(data.roomId).emit('message:pinned', pin);
      }
      if (callback) callback(pin ? { success: true, pin } : { error: 'Failed to pin' });
    });

    socket.on('message:unpin', (data: { messageId: string; roomId: string }, callback?) => {
      if (!socket.userId) return;
      const success = unpinMessage(data.messageId, data.roomId);
      // Always broadcast unpin to ensure frontend stays in sync
      io.to(data.roomId).emit('message:unpinned', { messageId: data.messageId, roomId: data.roomId });
      if (callback) callback({ success });
    });

    socket.on('message:pins', (data: { roomId: string }, callback) => {
      const pins = getPinnedMessages(data.roomId);
      callback(pins);
    });

    // --- Message Context (for jumping to old messages) ---
    socket.on('messages:context', (data: { messageId: string; roomId: string; around?: number }, callback) => {
      if (!socket.userId) return;
      const members = getRoomMembers(data.roomId);
      if (!members.some(m => m.id === socket.userId)) {
        if (callback) callback({ error: 'Not a member of this room' });
        return;
      }
      const result = getMessagesAroundId(data.messageId, data.roomId, data.around);
      if (!result) {
        if (callback) callback({ error: 'Message not found' });
        return;
      }
      if (callback) callback(result);
    });

    // --- Forward ---
    socket.on('message:forward', (data: { messageIds: string[]; sourceRoomId: string; targetRoomId: string; mode: 'individual' | 'merged' }, callback?) => {
      if (!socket.userId) return;
      if (!data.messageIds?.length || !data.sourceRoomId || !data.targetRoomId) {
        if (callback) callback({ error: 'Missing required fields' });
        return;
      }

      // Check membership in both rooms
      const sourceMembers = getRoomMembers(data.sourceRoomId);
      const targetMembers = getRoomMembers(data.targetRoomId);
      if (!sourceMembers.some(m => m.id === socket.userId) || !targetMembers.some(m => m.id === socket.userId)) {
        if (callback) callback({ error: 'Not a member of source or target room' });
        return;
      }

      // Fetch all messages, preserve order
      const messages = data.messageIds
        .map(id => getMessageById(id))
        .filter((m): m is NonNullable<typeof m> => m !== null && m.roomId === data.sourceRoomId);

      if (messages.length === 0) {
        if (callback) callback({ error: 'No valid messages found' });
        return;
      }

      // Sort by createdAt
      messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const sourceRoom = getRoom(data.sourceRoomId);
      const sourceName = sourceRoom?.name || 'unknown';

      if (data.mode === 'individual') {
        // Forward each message individually
        const forwarded = messages.map(m => {
          const sender = getUser(m.userId);
          const senderName = sender?.username || 'Unknown';
          const prefix = `📨 转发自 #${sourceName}\n[${senderName}]:\n`;
          const body = m.type === 'file' ? m.content : m.content;
          return createMessage({
            roomId: data.targetRoomId,
            userId: socket.userId!,
            content: prefix + body,
            type: m.type === 'file' ? 'file' : 'text',
          });
        });
        forwarded.forEach(msg => io.to(data.targetRoomId).emit('message:new', msg));
        if (callback) callback({ success: true, count: forwarded.length });
      } else {
        // Merge into one forward card
        const forwardPayload = {
          sourceRoom: sourceName,
          sourceRoomId: data.sourceRoomId,
          messages: messages.map(m => {
            const sender = getUser(m.userId);
            return {
              userId: m.userId,
              username: sender?.username || 'Unknown',
              content: m.type === 'file' ? '[文件]' : m.content,
              type: m.type,
              createdAt: m.createdAt,
            };
          }),
        };
        const msg = createMessage({
          roomId: data.targetRoomId,
          userId: socket.userId,
          content: JSON.stringify(forwardPayload),
          type: 'forward',
        });
        io.to(data.targetRoomId).emit('message:new', msg);
        if (callback) callback({ success: true, count: 1 });
      }
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
