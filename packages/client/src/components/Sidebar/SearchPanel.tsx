import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import UserAvatar from '../UserAvatar';
import type { Message } from '../../types';

interface RoomResult {
  roomId: string;
  roomName: string;
  matchCount: number;
  firstMatch: Message;
  messages: Message[];
}

function highlightMatch(text: string, query: string): JSX.Element {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-yellow-500/30 text-yellow-300">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export default function SearchPanel({ onClose }: { onClose: () => void }) {
  const { rooms, setActiveRoom, roomMembers } = useAppStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSelectedRoomId(null);
      return;
    }
    setLoading(true);
    setSelectedRoomId(null);
    socketService.searchMessages(q, undefined, true, 100).then(({ results }) => {
      setResults(results);
      setLoading(false);
    });
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleMessageClick = (msg: Message) => {
    setActiveRoom(msg.roomId);
    useAppStore.setState({ mobileView: 'chat' });
    onClose();
  };

  // Group results by room
  const grouped: RoomResult[] = [];
  const roomMap = new Map<string, Message[]>();
  for (const msg of results) {
    if (!roomMap.has(msg.roomId)) roomMap.set(msg.roomId, []);
    roomMap.get(msg.roomId)!.push(msg);
  }
  for (const [roomId, msgs] of roomMap) {
    const room = rooms.find(r => r.id === roomId);
    grouped.push({
      roomId,
      roomName: room?.name || 'Unknown',
      matchCount: msgs.length,
      firstMatch: msgs[0],
      messages: msgs,
    });
  }

  const getSenderName = (msg: Message): string => {
    const members = roomMembers[msg.roomId] || [];
    const member = members.find(m => m.id === msg.userId);
    return member?.username || msg.userId;
  };

  // Selected room's messages
  const selectedRoom = selectedRoomId ? grouped.find(g => g.roomId === selectedRoomId) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Search header */}
      <div className="p-3 border-b border-dark-border flex items-center gap-2">
        {selectedRoomId && (
          <button
            onClick={() => setSelectedRoomId(null)}
            className="text-dark-muted hover:text-dark-text p-1 flex-shrink-0"
            title="Back"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <svg className="w-4 h-4 text-dark-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="Search all messages..."
          className="flex-1 bg-transparent text-sm text-dark-text placeholder-dark-muted focus:outline-none"
        />
        <button
          onClick={onClose}
          className="text-dark-muted hover:text-dark-text p-1 flex-shrink-0"
        >
          ✕
        </button>
      </div>

      {/* Subtitle when viewing a room's results */}
      {selectedRoom && (
        <div className="px-3 py-2 border-b border-dark-border bg-dark-bg/50">
          <span className="text-xs font-semibold text-dark-text">{selectedRoom.roomName}</span>
          <span className="text-xs text-dark-muted ml-2">{selectedRoom.matchCount} result{selectedRoom.matchCount !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {/* Empty state */}
        {!query.trim() && (
          <div className="text-center py-12 px-4">
            <div className="text-3xl mb-2">🔍</div>
            <p className="text-sm text-dark-muted">Search across all conversations</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-4">
            <span className="text-xs text-dark-muted animate-pulse">Searching...</span>
          </div>
        )}

        {query.trim() && !loading && results.length === 0 && (
          <div className="text-center py-12 px-4">
            <p className="text-sm text-dark-muted">No results found</p>
          </div>
        )}

        {/* Layer 1: Room list */}
        {!selectedRoomId && !loading && grouped.map((group) => (
          <button
            key={group.roomId}
            onClick={() => setSelectedRoomId(group.roomId)}
            className="w-full text-left px-3 py-3 hover:bg-dark-hover transition border-b border-dark-border/50"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-dark-text truncate">
                {group.roomName}
              </span>
              <span className="text-[10px] text-dark-muted flex-shrink-0 bg-dark-hover px-1.5 py-0.5 rounded-full">
                {group.matchCount}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[11px] text-primary-400 flex-shrink-0">
                {getSenderName(group.firstMatch)}:
              </span>
              <p className="text-[11px] text-dark-muted truncate">
                {highlightMatch(group.firstMatch.content.slice(0, 80), query)}
              </p>
            </div>
          </button>
        ))}

        {/* Layer 2: Messages in selected room */}
        {selectedRoom && selectedRoom.messages.map((msg) => (
          <button
            key={msg.id}
            onClick={() => handleMessageClick(msg)}
            className="w-full text-left px-3 py-2.5 hover:bg-dark-hover transition border-b border-dark-border/50"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-primary-400 truncate">
                {getSenderName(msg)}
              </span>
              <span className="text-[10px] text-dark-muted flex-shrink-0">
                {formatTime(msg.createdAt)}
              </span>
            </div>
            <p className="text-xs text-dark-text mt-0.5 line-clamp-2">
              {highlightMatch(msg.content.slice(0, 150), query)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
