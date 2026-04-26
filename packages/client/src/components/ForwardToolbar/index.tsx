import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import RoomPicker from '../RoomPicker';

export default function ForwardToolbar() {
  const { selectionMode, selectedMessages, activeRoomId, clearSelection } = useAppStore();
  const [showPicker, setShowPicker] = useState(false);
  const [mode, setMode] = useState<'individual' | 'merged'>('merged');

  if (!selectionMode) return null;

  const count = selectedMessages.size;

  const handleForward = async (targetRoomId: string) => {
    if (!activeRoomId || count === 0) return;
    const ids = Array.from(selectedMessages);
    await socketService.forwardMessages(ids, activeRoomId, targetRoomId, mode);
    setShowPicker(false);
    clearSelection();
  };

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 bg-primary-600/10 border-b border-primary-500/20 flex-shrink-0">
        <span className="text-sm text-primary-400">
          已选 {count} 条消息
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setMode('individual'); setShowPicker(true); }}
            disabled={count === 0}
            className="text-xs px-3 py-1.5 bg-dark-hover text-dark-text rounded-lg hover:bg-dark-surface transition disabled:opacity-40"
          >
            逐条转发
          </button>
          <button
            onClick={() => { setMode('merged'); setShowPicker(true); }}
            disabled={count === 0}
            className="text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition disabled:opacity-40"
          >
            合并转发
          </button>
          <button
            onClick={clearSelection}
            className="text-xs px-3 py-1.5 text-dark-muted hover:text-dark-text transition"
          >
            取消
          </button>
        </div>
      </div>
      {showPicker && (
        <RoomPicker
          onSelect={handleForward}
          onClose={() => setShowPicker(false)}
          excludeRoomId={activeRoomId || undefined}
        />
      )}
    </>
  );
}
