import { create } from 'zustand';
import type { User, Room, Message, Thread, StreamingMessage, TypingUser } from '../types';

interface AppState {
  // Auth
  user: User | null;
  setUser: (user: User | null) => void;

  // Rooms
  rooms: Room[];
  activeRoomId: string | null;
  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room) => void;
  setActiveRoom: (roomId: string) => void;

  // Messages
  messages: Record<string, Message[]>; // roomId -> messages
  setMessages: (roomId: string, messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (messageId: string, roomId: string) => void;
  updateReactions: (messageId: string, roomId: string, reactions: Record<string, string[]>) => void;

  // Streaming
  streamingMessages: Record<string, StreamingMessage>; // messageId -> streaming state
  startStreaming: (messageId: string, roomId: string, threadId: string | null) => void;
  appendStreamChunk: (messageId: string, chunk: string) => void;
  finishStreaming: (messageId: string, finalMessage?: Message) => void;

  // Threads
  activeThread: Thread | null;
  threadMessages: Message[];
  setActiveThread: (thread: Thread | null) => void;
  setThreadMessages: (messages: Message[]) => void;
  addThreadMessage: (message: Message) => void;

  // Members
  roomMembers: Record<string, User[]>;
  setRoomMembers: (roomId: string, members: User[]) => void;

  // Typing
  typingUsers: Record<string, TypingUser[]>; // roomId -> typing users
  setTyping: (roomId: string, userId: string, username: string, isTyping: boolean) => void;

  // UI
  showSidebar: boolean;
  showThread: boolean;
  theme: 'dark' | 'light';
  toggleSidebar: () => void;
  toggleThread: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Auth
  user: null,
  setUser: (user) => set({ user }),

  // Rooms
  rooms: [],
  activeRoomId: null,
  setRooms: (rooms) => set({ rooms }),
  addRoom: (room) => set((s) => ({ rooms: [...s.rooms, room] })),
  setActiveRoom: (roomId) => set({ activeRoomId: roomId }),

  // Messages
  messages: {},
  setMessages: (roomId, messages) =>
    set((s) => ({ messages: { ...s.messages, [roomId]: messages } })),
  addMessage: (message) =>
    set((s) => {
      const roomMessages = s.messages[message.roomId] || [];
      // Avoid duplicates
      if (roomMessages.some((m) => m.id === message.id)) return s;
      return {
        messages: {
          ...s.messages,
          [message.roomId]: [...roomMessages, message],
        },
      };
    }),
  updateMessage: (message) =>
    set((s) => {
      const roomMessages = s.messages[message.roomId] || [];
      return {
        messages: {
          ...s.messages,
          [message.roomId]: roomMessages.map((m) =>
            m.id === message.id ? message : m
          ),
        },
      };
    }),
  removeMessage: (messageId, roomId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [roomId]: (s.messages[roomId] || []).filter((m) => m.id !== messageId),
      },
    })),
  updateReactions: (messageId, roomId, reactions) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [roomId]: (s.messages[roomId] || []).map((m) =>
          m.id === messageId ? { ...m, reactions } : m
        ),
      },
    })),

  // Streaming
  streamingMessages: {},
  startStreaming: (messageId, roomId, threadId) =>
    set((s) => ({
      streamingMessages: {
        ...s.streamingMessages,
        [messageId]: { messageId, content: '', roomId, threadId },
      },
    })),
  appendStreamChunk: (messageId, chunk) =>
    set((s) => {
      const existing = s.streamingMessages[messageId];
      if (!existing) return s;
      return {
        streamingMessages: {
          ...s.streamingMessages,
          [messageId]: { ...existing, content: existing.content + chunk },
        },
      };
    }),
  finishStreaming: (messageId, finalMessage) =>
    set((s) => {
      const { [messageId]: _, ...rest } = s.streamingMessages;
      const newState: Partial<AppState> = { streamingMessages: rest };
      if (finalMessage) {
        const roomMessages = s.messages[finalMessage.roomId] || [];
        if (!roomMessages.some((m) => m.id === finalMessage.id)) {
          newState.messages = {
            ...s.messages,
            [finalMessage.roomId]: [...roomMessages, finalMessage],
          };
        }
      }
      return newState as any;
    }),

  // Threads
  activeThread: null,
  threadMessages: [],
  setActiveThread: (thread) => set({ activeThread: thread, showThread: !!thread }),
  setThreadMessages: (messages) => set({ threadMessages: messages }),
  addThreadMessage: (message) =>
    set((s) => {
      if (s.threadMessages.some((m) => m.id === message.id)) return s;
      return { threadMessages: [...s.threadMessages, message] };
    }),

  // Members
  roomMembers: {},
  setRoomMembers: (roomId, members) =>
    set((s) => ({ roomMembers: { ...s.roomMembers, [roomId]: members } })),

  // Typing
  typingUsers: {},
  setTyping: (roomId, userId, username, isTyping) =>
    set((s) => {
      const current = s.typingUsers[roomId] || [];
      if (isTyping) {
        if (current.some((u) => u.userId === userId)) return s;
        return {
          typingUsers: {
            ...s.typingUsers,
            [roomId]: [...current, { userId, username }],
          },
        };
      } else {
        return {
          typingUsers: {
            ...s.typingUsers,
            [roomId]: current.filter((u) => u.userId !== userId),
          },
        };
      }
    }),

  // UI
  showSidebar: true,
  showThread: false,
  theme: 'dark',
  toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),
  toggleThread: () => set((s) => ({ showThread: !s.showThread })),
  setTheme: (theme) => set({ theme }),
}));
