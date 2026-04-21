import { create } from 'zustand';
import type { User, Room, Message, Thread, StreamingMessage, TypingUser } from '../types';
import { clearToken } from '../services/auth';
import { socketService } from '../services/socket';
import type { ImageQuality } from '../services/upload';
import { setDefaultImageQuality } from '../services/upload';

interface ThreadInfo {
  replyCount: number;
  lastReplyAt: string;
}

interface AppState {
  // Auth
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;

  // Rooms
  rooms: Room[];
  activeRoomId: string | null;
  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room) => void;
  updateRoom: (room: Room) => void;
  setActiveRoom: (roomId: string) => void;

  // Messages
  messages: Record<string, Message[]>;
  setMessages: (roomId: string, messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (messageId: string, roomId: string) => void;
  markMessageDeleted: (messageId: string, roomId: string) => void;
  updateReactions: (messageId: string, roomId: string, reactions: Record<string, string[]>) => void;

  // Streaming
  streamingMessages: Record<string, StreamingMessage>;
  startStreaming: (messageId: string, roomId: string, threadId: string | null, botId?: string) => void;
  appendStreamChunk: (messageId: string, chunk: string) => void;
  finishStreaming: (messageId: string, finalMessage?: Message) => void;

  // Threads
  activeThread: Thread | null;
  threadMessages: Message[];
  threadInfo: Record<string, ThreadInfo>;
  setActiveThread: (thread: Thread | null) => void;
  setThreadMessages: (messages: Message[]) => void;
  addThreadMessage: (message: Message) => void;
  updateThreadInfo: (parentMessageId: string, info: ThreadInfo) => void;

  // Pagination
  hasMore: Record<string, boolean>;
  loadingHistory: Record<string, boolean>;
  setHasMore: (roomId: string, hasMore: boolean) => void;
  setLoadingHistory: (roomId: string, loading: boolean) => void;
  prependMessages: (roomId: string, messages: Message[]) => void;

  // Members
  roomMembers: Record<string, User[]>;
  setRoomMembers: (roomId: string, members: User[]) => void;

  // Online / Users
  onlineUsers: Set<string>;
  setOnlineUsers: (userIds: string[]) => void;
  setUserOnline: (userId: string, isOnline: boolean) => void;
  allUsers: User[];
  setAllUsers: (users: User[]) => void;

  // Typing
  typingUsers: Record<string, TypingUser[]>;
  setTyping: (roomId: string, userId: string, username: string, isTyping: boolean, threadId?: string | null) => void;

  // Search
  searchQuery: string | null;
  searchResults: Message[];
  searchTotal: number;
  searchActiveIdx: number;
  searchGlobal: boolean;
  setSearchQuery: (query: string | null) => void;
  setSearchResults: (results: Message[], total: number) => void;
  setSearchActiveIdx: (idx: number) => void;
  setSearchGlobal: (global: boolean) => void;
  showSearch: boolean;
  toggleSearch: () => void;

  // Reply
  replyToMessage: Message | null;
  setReplyTo: (message: Message | null) => void;

  // UI
  showSidebar: boolean;
  showThread: boolean;
  showMembers: boolean;
  showCreateRoom: boolean;
  showSettings: boolean;
  theme: 'dark' | 'light';
  imageQuality: ImageQuality;
  toggleSidebar: () => void;
  toggleThread: () => void;
  toggleMembers: () => void;
  setShowCreateRoom: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setImageQuality: (q: ImageQuality) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Auth
  user: null,
  setUser: (user) => set({ user }),
  logout: () => {
    clearToken();
    socketService.disconnect();
    set({ user: null, rooms: [], activeRoomId: null, messages: {}, roomMembers: {}, threadInfo: {}, streamingMessages: {}, typingUsers: {}, onlineUsers: new Set<string>() });
  },

  // Rooms
  rooms: [],
  activeRoomId: null,
  setRooms: (rooms) => set({ rooms }),
  addRoom: (room) => set((s) => {
    if (s.rooms.some((r) => r.id === room.id)) return s;
    return { rooms: [...s.rooms, room] };
  }),
  updateRoom: (room) => set((s) => ({
    rooms: s.rooms.map((r) => r.id === room.id ? room : r),
  })),
  setActiveRoom: (roomId) => set({ activeRoomId: roomId }),

  // Messages
  messages: {},
  setMessages: (roomId, messages) =>
    set((s) => ({ messages: { ...s.messages, [roomId]: messages } })),
  addMessage: (message) =>
    set((s) => {
      const roomMessages = s.messages[message.roomId] || [];
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
  markMessageDeleted: (messageId, roomId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [roomId]: (s.messages[roomId] || []).map((m) =>
          m.id === messageId ? { ...m, isDeleted: true, content: '' } : m
        ),
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
  startStreaming: (messageId, roomId, threadId, botId) =>
    set((s) => ({
      streamingMessages: {
        ...s.streamingMessages,
        [messageId]: { messageId, content: '', roomId, threadId, botId },
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
  threadInfo: {},
  setActiveThread: (thread) => set({ activeThread: thread, showThread: !!thread }),
  setThreadMessages: (messages) => set({ threadMessages: messages }),
  addThreadMessage: (message) =>
    set((s) => {
      if (s.threadMessages.some((m) => m.id === message.id)) return s;
      return { threadMessages: [...s.threadMessages, message] };
    }),
  updateThreadInfo: (parentMessageId, info) =>
    set((s) => ({
      threadInfo: { ...s.threadInfo, [parentMessageId]: info },
    })),

  // Pagination
  hasMore: {},
  loadingHistory: {},
  setHasMore: (roomId, hasMore) => set((s) => ({ hasMore: { ...s.hasMore, [roomId]: hasMore } })),
  setLoadingHistory: (roomId, loading) => set((s) => ({ loadingHistory: { ...s.loadingHistory, [roomId]: loading } })),
  prependMessages: (roomId, messages) => set((s) => ({
    messages: {
      ...s.messages,
      [roomId]: [...messages, ...(s.messages[roomId] || [])],
    },
  })),

  // Members
  roomMembers: {},
  setRoomMembers: (roomId, members) =>
    set((s) => ({ roomMembers: { ...s.roomMembers, [roomId]: members } })),

  // Online / Users
  onlineUsers: new Set<string>(),
  setOnlineUsers: (userIds) => set({ onlineUsers: new Set(userIds) }),
  setUserOnline: (userId, isOnline) =>
    set((s) => {
      const next = new Set(s.onlineUsers);
      if (isOnline) next.add(userId); else next.delete(userId);
      return { onlineUsers: next };
    }),
  allUsers: [],
  setAllUsers: (users) => set({ allUsers: users }),

  // Typing
  typingUsers: {},
  setTyping: (roomId, userId, username, isTyping, threadId) =>
    set((s) => {
      const key = threadId ? `thread:${threadId}` : roomId;
      const current = s.typingUsers[key] || [];
      if (isTyping) {
        if (current.some((u) => u.userId === userId)) return s;
        return {
          typingUsers: {
            ...s.typingUsers,
            [key]: [...current, { userId, username }],
          },
        };
      } else {
        return {
          typingUsers: {
            ...s.typingUsers,
            [key]: current.filter((u) => u.userId !== userId),
          },
        };
      }
    }),

  // Search
  searchQuery: null,
  searchResults: [],
  searchTotal: 0,
  searchActiveIdx: 0,
  searchGlobal: false,
  setSearchQuery: (query) => set({ searchQuery: query, searchActiveIdx: 0 }),
  setSearchResults: (results, total) => set({ searchResults: results, searchTotal: total }),
  setSearchActiveIdx: (idx) => set({ searchActiveIdx: idx }),
  setSearchGlobal: (global) => set({ searchGlobal: global }),
  showSearch: false,
  toggleSearch: () => set((s) => {
    if (s.showSearch) {
      return { showSearch: false, searchQuery: null, searchResults: [], searchTotal: 0, searchActiveIdx: 0 };
    }
    return { showSearch: true };
  }),

  // Reply
  replyToMessage: null,
  setReplyTo: (message) => set({ replyToMessage: message }),

  // UI
  showSidebar: window.innerWidth >= 768,
  showThread: false,
  showMembers: false,
  showCreateRoom: false,
  showSettings: false,
  theme: (localStorage.getItem('clawchat-theme') as 'dark' | 'light') || 'dark',
  imageQuality: (localStorage.getItem('clawchat-image-quality') as ImageQuality) || 'medium',
  toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),
  toggleThread: () => set((s) => ({ showThread: !s.showThread })),
  toggleMembers: () => set((s) => ({ showMembers: !s.showMembers })),
  setShowCreateRoom: (show) => set({ showCreateRoom: show }),
  setShowSettings: (show) => set({ showSettings: show }),
  setTheme: (theme) => {
    localStorage.setItem('clawchat-theme', theme);
    document.documentElement.className = `theme-${theme}`;
    set({ theme });
  },
  setImageQuality: (q) => {
    localStorage.setItem('clawchat-image-quality', q);
    setDefaultImageQuality(q);
    set({ imageQuality: q });
  },
}));

// Sync image quality on load
const savedQuality = localStorage.getItem('clawchat-image-quality') as ImageQuality;
if (savedQuality) setDefaultImageQuality(savedQuality);
