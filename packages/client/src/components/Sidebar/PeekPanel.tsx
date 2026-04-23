import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import type { Message } from '../../types';

interface PeekPanelProps {
  roomId: string;
  roomName: string;
  anchorTop: number;
  onEnter: () => void;
  onLeave: () => void;
  onGoToRoom: () => void;
}

export default function PeekPanel({ roomId, roomName, anchorTop, onEnter, onLeave, onGoToRoom }: PeekPanelProps) {
  const { roomMembers } = useAppStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const members = roomMembers[roomId] || [];

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Try to use cached messages first
    const cached = useAppStore.getState().messages[roomId];
    if (cached && cached.length > 0) {
      setMessages(cached.slice(-5));
      setLoading(false);
      return;
    }

    // Fetch recent messages via socket
    socketService.loadHistory(roomId, new Date().toISOString(), 5).then((result) => {
      if (!cancelled) {
        setMessages(result.messages);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [roomId]);

  const getSenderName = (userId: string) => {
    return members.find((m) => m.id === userId)?.username || 'Unknown';
  };

  // Clamp position so panel doesn't overflow viewport
  const maxTop = typeof window !== 'undefined' ? window.innerHeight - 300 : 400;
  const top = Math.min(Math.max(anchorTop, 8), maxTop);

  return (
    <div
      ref={panelRef}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="fixed z-50 bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-72 max-h-80 flex flex-col overflow-hidden"
      style={{ top, left: 'calc(16rem + 8px)' }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-dark-border flex items-center justify-between">
        <span className="text-sm font-semibold text-dark-text truncate">{roomName}</span>
        <button
          onClick={onGoToRoom}
          className="text-xs text-primary-400 hover:text-primary-300 transition whitespace-nowrap"
        >
          进入 →
        </button>
      </div>

      {/* Messages preview */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {loading ? (
          <p className="text-xs text-dark-muted animate-pulse text-center py-4">Loading...</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-dark-muted text-center py-4">No messages yet</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="min-w-0">
              <span className="text-xs text-primary-400 font-semibold">
                {getSenderName(msg.userId)}
              </span>
              <p className="text-xs text-dark-text break-words line-clamp-2">
                {msg.isDeleted
                  ? 'Message deleted'
                  : msg.type === 'file'
                    ? '📎 File'
                    : msg.content.length > 120
                      ? msg.content.slice(0, 120) + '…'
                      : msg.content}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
