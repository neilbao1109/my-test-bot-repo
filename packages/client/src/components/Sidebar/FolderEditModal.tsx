import { useState } from 'react';
import clsx from 'clsx';
import { useAppStore } from '../../stores/appStore';
import type { ChatFolder } from '../../types';

function generateId() {
  return 'folder-' + Math.random().toString(36).slice(2, 10);
}

interface FolderEditModalProps {
  folder?: ChatFolder | null; // null = create mode
  onClose: () => void;
}

export default function FolderEditModal({ folder, onClose }: FolderEditModalProps) {
  const { rooms, addFolder, updateFolder, removeFolder } = useAppStore();
  const [name, setName] = useState(folder?.name || '');
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(
    new Set(folder?.roomIds || [])
  );

  const isEdit = !!folder;

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    if (isEdit && folder) {
      updateFolder({ ...folder, name: trimmed, roomIds: Array.from(selectedRoomIds) });
    } else {
      addFolder({
        id: generateId(),
        name: trimmed,
        filter: 'custom',
        roomIds: Array.from(selectedRoomIds),
      });
    }
    onClose();
  };

  const handleDelete = () => {
    if (folder && confirm(`Delete folder "${folder.name}"?`)) {
      removeFolder(folder.id);
      onClose();
    }
  };

  const toggleRoom = (roomId: string) => {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-dark-surface border border-dark-border rounded-xl p-5 w-80 max-h-[80vh] flex flex-col shadow-xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-dark-text mb-3">
          {isEdit ? 'Edit Folder' : 'New Folder'}
        </h3>

        {/* Name input */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Folder name"
          className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text focus:outline-none focus:ring-1 focus:ring-primary-500 mb-3"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
        />

        {/* Room selection */}
        <p className="text-xs text-dark-muted mb-2">Select conversations:</p>
        <div className="flex-1 overflow-y-auto space-y-1 mb-3 max-h-48">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => toggleRoom(room.id)}
              className={clsx(
                'w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition',
                selectedRoomIds.has(room.id)
                  ? 'bg-primary-600/20 text-primary-400'
                  : 'text-dark-text hover:bg-dark-hover'
              )}
            >
              <span className="text-xs">{selectedRoomIds.has(room.id) ? '✅' : '⬜'}</span>
              <span>{room.type === 'dm' ? '💬' : '👥'}</span>
              <span className="truncate">{room.name}</span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isEdit && folder && !['all', 'dms', 'groups'].includes(folder.id) && (
            <button
              onClick={handleDelete}
              className="text-xs text-red-400 hover:text-red-300 transition"
            >
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-dark-muted hover:text-white rounded-lg hover:bg-dark-hover transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-3 py-1.5 text-xs text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition disabled:opacity-50"
          >
            {isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
