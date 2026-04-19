import { useEffect } from 'react';
import { socketService } from '../services/socket';
import { useAppStore } from '../stores/appStore';
import type { Message, Room, User, Thread } from '../types';

export function useSocket() {
  const store = useAppStore();
  const user = useAppStore((s) => s.user);

  useEffect(() => {
    if (!user) return; // Don't set up listeners until logged in

    const socket = socketService.getSocket();
    if (!socket) return;

    socket.on('room:history', (data: { roomId: string; messages: Message[]; members: User[] }) => {
      store.setMessages(data.roomId, data.messages);
      store.setRoomMembers(data.roomId, data.members);
    });

    socket.on('message:new', (message: Message) => {
      if (message.threadId) {
        const activeThread = useAppStore.getState().activeThread;
        if (activeThread && message.threadId === activeThread.id) {
          store.addThreadMessage(message);
        }
      } else {
        store.addMessage(message);
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

    socket.on('room:updated', (room: Room) => {
      store.updateRoom(room);
    });

    socket.on('room:added', (room: Room) => {
      store.addRoom(room);
    });

    socket.on('command:result', (data: { command: string; result: { data?: { action: string } } }) => {
      if (data.result.data?.action === 'clear') {
        const activeRoomId = useAppStore.getState().activeRoomId;
        if (activeRoomId) {
          store.setMessages(activeRoomId, []);
        }
      }
    });

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
      socket.off('room:updated');
      socket.off('room:added');
      socket.off('command:result');
    };
  }, [user]);
}
