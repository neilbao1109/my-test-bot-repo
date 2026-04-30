import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../stores/appStore';

interface RoomPickerProps {
  onSelect: (roomId: string) => void;
  onClose: () => void;
  excludeRoomId?: string;
}

export default function RoomPicker({ onSelect, onClose, excludeRoomId }: RoomPickerProps) {
  const rooms = useAppStore((s) => s.rooms);
  const [search, setSearch] = useState('');

  const filtered = rooms
    .filter(r => r.id !== excludeRoomId)
    .filter(r => !search || (r.name || '').toLowerCase().includes(search.toLowerCase()));

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-sm max-h-[60vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
          <span className="text-sm font-semibold text-dark-text">选择目标频道</span>
          <button onClick={onClose} className="text-dark-muted hover:text-dark-text text-lg">✕</button>
        </div>
        <div className="px-4 py-2 border-b border-dark-border flex-shrink-0">
          <input
            type="text"
            placeholder="搜索频道..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-sm text-dark-muted text-center py-8">没有可用的频道</p>
          ) : (
            filtered.map(room => (
              <button
                key={room.id}
                onClick={() => onSelect(room.id)}
                className="w-full text-left px-4 py-3 hover:bg-dark-hover transition flex items-center gap-3"
              >
                <span className="text-base">{room.type === 'dm' ? '💬' : '#'}</span>
                <span className="text-sm text-dark-text">{room.name}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
