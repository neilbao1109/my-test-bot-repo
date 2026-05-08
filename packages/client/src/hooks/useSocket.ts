import { useEffect } from 'react';
import { socketService } from '../services/socket';
import { useAppStore } from '../stores/appStore';
import { getToken } from '../services/auth';
import type { Message, Room, User, Thread, PinnedMessage } from '../types';

export function useSocket() {
  const user = useAppStore((s) => s.user);

  useEffect(() => {
    if (!user) return; // Don't set up listeners until logged in

    const socket = socketService.getSocket();
    if (!socket) return;

    // Use getState() for actions to avoid subscribing to entire store
    const store = useAppStore.getState();

    socket.on('room:history', (data: { roomId: string; messages: Message[]; members: User[]; hasMore?: boolean }) => {
      // Skip update if we already have messages cached and the latest message matches
      const existing = useAppStore.getState().messages[data.roomId];
      if (existing && existing.length > 0 && data.messages.length > 0) {
        const existingLatest = existing[existing.length - 1].id;
        const newLatest = data.messages[data.messages.length - 1].id;
        if (existingLatest === newLatest) {
          // Same data, just update members
          store.setRoomMembers(data.roomId, data.members);
          store.setHasMore(data.roomId, data.hasMore ?? false);
          return;
        }
      }
      store.setMessages(data.roomId, data.messages);
      store.setRoomMembers(data.roomId, data.members);
      store.setHasMore(data.roomId, data.hasMore ?? false);
      // Load pinned messages for this room
      socketService.getPinnedMessages(data.roomId).then((pins) => {
        store.setPinnedMessages(data.roomId, pins);
      });
    });

    socket.on('message:new', (message: Message) => {
      if (message.threadId) {
        const activeThread = useAppStore.getState().activeThread;
        if (activeThread && message.threadId === activeThread.id) {
          store.addThreadMessage(message);
        }
      } else {
        store.addMessage(message);
        // Update room's lastMessage for sidebar preview
        const state = useAppStore.getState();
        const room = state.rooms.find(r => r.id === message.roomId);
        if (room) {
          const members = state.roomMembers[message.roomId] || [];
          const sender = members.find(m => m.id === message.userId);
          useAppStore.setState({
            rooms: state.rooms.map(r => r.id === message.roomId ? {
              ...r,
              lastMessage: {
                content: message.content,
                type: message.type,
                senderName: sender?.username || 'Unknown',
                createdAt: message.createdAt,
              },
            } : r),
          });
        }
      }
    });

    socket.on('message:updated', (message: Message) => {
      store.updateMessage(message);
    });

    socket.on('message:deleted', (data: { messageId: string }) => {
      const activeRoomId = useAppStore.getState().activeRoomId;
      if (activeRoomId) {
        store.markMessageDeleted(data.messageId, activeRoomId);
      }
    });

    socket.on('message:reaction', (data: { messageId: string; reactions: Record<string, string[]> }) => {
      const activeRoomId = useAppStore.getState().activeRoomId;
      if (activeRoomId) {
        store.updateReactions(data.messageId, activeRoomId, data.reactions);
      }
    });

    socket.on('bot:stream:start', (data: { messageId: string; roomId: string; threadId: string | null; botId?: string }) => {
      store.startStreaming(data.messageId, data.roomId, data.threadId, data.botId);
    });

    socket.on('bot:stream', (data: { messageId: string; chunk: string; done: boolean; finalMessage?: Message }) => {
      if (data.done) {
        store.finishStreaming(data.messageId, data.finalMessage);
      } else {
        store.appendStreamChunk(data.messageId, data.chunk);
      }
    });

    socket.on('typing:update', (data: { roomId: string; userId: string; username: string; isTyping: boolean; threadId?: string | null }) => {
      store.setTyping(data.roomId, data.userId, data.username, data.isTyping, data.threadId);
    });

    socket.on('user:online', (data: { userId: string; isOnline: boolean }) => {
      store.setUserOnline(data.userId, data.isOnline);
      // Update member online status in all rooms
      const state = useAppStore.getState();
      Object.entries(state.roomMembers).forEach(([roomId, members]) => {
        const updated = members.map((m) =>
          m.id === data.userId ? { ...m, isOnline: data.isOnline } : m
        );
        store.setRoomMembers(roomId, updated);
      });
    });

    socket.on('presence:snapshot', (data: { onlineUsers: string[] }) => {
      store.setOnlineUsers(data.onlineUsers);
    });

    socket.on('thread:created', (data: { thread: Thread }) => {
      store.updateThreadInfo(data.thread.parentMessageId, {
        replyCount: data.thread.replyCount,
        lastReplyAt: data.thread.lastReplyAt,
      });
    });

    socket.on('thread:updated', (data: { threadId: string; parentMessageId: string; replyCount: number; lastReplyAt: string }) => {
      store.updateThreadInfo(data.parentMessageId, {
        replyCount: data.replyCount,
        lastReplyAt: data.lastReplyAt,
      });
    });

    socket.on('room:member-joined', (data: { roomId: string; members: User[] }) => {
      store.setRoomMembers(data.roomId, data.members);
    });

    socket.on('room:member-left', (data: { roomId: string; userId: string; members: User[] }) => {
      store.setRoomMembers(data.roomId, data.members);
    });

    socket.on('room:updated', (room: Room) => {
      store.updateRoom(room);
    });

    socket.on('room:added', (room: Room) => {
      store.addRoom(room);
    });

    socket.on('room:deleted', (data: { roomId: string }) => {
      store.removeRoom(data.roomId);
    });

    socket.on('message:pinned', (pin: PinnedMessage) => {
      store.addPinnedMessage(pin.roomId, pin);
    });

    socket.on('message:unpinned', (data: { messageId: string; roomId: string }) => {
      store.removePinnedMessage(data.roomId, data.messageId);
    });

    socket.on('command:result', (data: { command: string; result: { data?: { action: string } } }) => {
      if (data.result.data?.action === 'clear') {
        const activeRoomId = useAppStore.getState().activeRoomId;
        if (activeRoomId) {
          store.setMessages(activeRoomId, []);
        }
      }
    });

    socket.on('invitation:new', () => {
      store.incrementInvitationCount();
    });

    socket.on('invitation:resolved', () => {
      store.decrementInvitationCount();
    });

    // Friend events
    socket.on('friend:new', (data: { friendship: any; user: any }) => {
      const reqs = store.friendRequests;
      store.setFriendRequests({
        ...reqs,
        incoming: [...reqs.incoming, { ...data.friendship, user: data.user }],
      });
    });

    socket.on('friend:accepted', (data: { friendship: any; user: any }) => {
      store.addFriend(data.user);
      // Remove from outgoing
      const reqs = store.friendRequests;
      store.setFriendRequests({
        ...reqs,
        outgoing: reqs.outgoing.filter((r: any) => r.id !== data.friendship.id),
      });
    });

    socket.on('friend:removed', (data: { userId: string }) => {
      store.removeFriendFromList(data.userId);
    });

    // Bot lifecycle events
    socket.on('bot:status-changed', (data: { botId: string; status: string }) => {
      // Refresh rooms to get updated archived_at states
      socketService.refreshRooms().then((result) => {
        if (result?.rooms) store.setRooms(result.rooms);
      });
    });

    socket.on('bot:deregistered', (data: { botId: string; roomIds: string[] }) => {
      // Refresh rooms to get archived states
      socketService.refreshRooms().then((result) => {
        if (result?.rooms) store.setRooms(result.rooms);
      });
    });

    // Re-auth and rejoin room on reconnect
    const handleReconnect = () => {
      const token = getToken();
      if (token) {
        socketService.auth(token).then((result) => {
          if (!result.error) {
            const state = useAppStore.getState();
            if (state.activeRoomId) {
              socketService.joinRoom(state.activeRoomId);
            }
          }
        });
      }
    };
    socket.io.on('reconnect', handleReconnect);

    return () => {
      socket.off('room:history');
      socket.off('message:new');
      socket.off('message:updated');
      socket.off('message:deleted');
      socket.off('message:reaction');
      socket.off('bot:stream:start');
      socket.off('bot:stream');
      socket.off('typing:update');
      socket.off('user:online');
      socket.off('presence:snapshot');
      socket.off('thread:created');
      socket.off('thread:updated');
      socket.off('room:member-joined');
      socket.off('room:member-left');
      socket.off('room:updated');
      socket.off('room:added');
      socket.off('room:deleted');
      socket.off('command:result');
      socket.off('message:pinned');
      socket.off('message:unpinned');
      socket.off('invitation:new');
      socket.off('invitation:resolved');
      socket.off('friend:new');
      socket.off('friend:accepted');
      socket.off('friend:removed');
      socket.off('bot:status-changed');
      socket.off('bot:deregistered');
      socket.io.off('reconnect', handleReconnect);
    };
  }, [user]);
}
