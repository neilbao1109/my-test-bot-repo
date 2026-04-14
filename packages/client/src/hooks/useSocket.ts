import { useEffect } from 'react';
import { socketService } from '../services/socket';
import { useAppStore } from '../stores/appStore';
import type { Message, User, Thread } from '../types';

export function useSocket() {
  const store = useAppStore();

  useEffect(() => {
    const socket = socketService.connect();

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
        store.removeMessage(data.messageId, activeRoomId);
      }
    });

    socket.on('message:reaction', (data: { messageId: string; reactions: Record<string, string[]> }) => {
      const activeRoomId = useAppStore.getState().activeRoomId;
      if (activeRoomId) {
        store.updateReactions(data.messageId, activeRoomId, data.reactions);
      }
    });

    socket.on('bot:stream:start', (data: { messageId: string; roomId: string; threadId: string | null }) => {
      store.startStreaming(data.messageId, data.roomId, data.threadId);
    });

    socket.on('bot:stream', (data: { messageId: string; chunk: string; done: boolean; finalMessage?: Message }) => {
      if (data.done) {
        store.finishStreaming(data.messageId, data.finalMessage);
      } else {
        store.appendStreamChunk(data.messageId, data.chunk);
      }
    });

    socket.on('typing:update', (data: { roomId: string; userId: string; username: string; isTyping: boolean }) => {
      store.setTyping(data.roomId, data.userId, data.username, data.isTyping);
    });

    socket.on('user:online', (data: { userId: string; isOnline: boolean }) => {
      // Update member online status in all rooms
      const state = useAppStore.getState();
      Object.entries(state.roomMembers).forEach(([roomId, members]) => {
        const updated = members.map((m) =>
          m.id === data.userId ? { ...m, isOnline: data.isOnline } : m
        );
        store.setRoomMembers(roomId, updated);
      });
    });

    socket.on('thread:created', (data: { thread: Thread }) => {
      // Notification only; user opens thread explicitly
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
      socket.off('thread:created');
      socket.off('command:result');
    };
  }, []);
}
