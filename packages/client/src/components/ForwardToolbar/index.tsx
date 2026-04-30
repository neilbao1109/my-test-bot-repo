import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import RoomPicker from '../RoomPicker';

export default function ForwardToolbar() {
  const { selectionMode, selectedMessages, activeRoomId, clearSelection, toggleMessageSelection, messages: allMessages, roomMembers: allRoomMembers } = useAppStore();
  const [showPicker, setShowPicker] = useState(false);
  const [mode, setMode] = useState<'individual' | 'merged'>('merged');
  const [expanded, setExpanded] = useState(false);

  if (!selectionMode) return null;

  const count = selectedMessages.size;
  const messages = activeRoomId ? allMessages[activeRoomId] || [] : [];
  const roomMembers = activeRoomId ? allRoomMembers[activeRoomId] || [] : [];

  // Get selected message objects sorted by time
  const selectedMsgs = messages
    .filter(m => selectedMessages.has(m.id))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const getSenderName = (userId: string) => {
    const member = roomMembers.find(m => m.id === userId);
    return member?.username || userId;
  };

  const visibleMsgs = expanded ? selectedMsgs : selectedMsgs.slice(0, 3);
  const hasMore = selectedMsgs.length > 3;

  const handleForward = async (targetRoomId: string) => {
    if (!activeRoomId || count === 0) return;
    const ids = Array.from(selectedMessages);
    await socketService.forwardMessages(ids, activeRoomId, targetRoomId, mode);
    setShowPicker(false);
    clearSelection();
  };

  return (
    <>
      <div className="border-b border-primary-500/20 flex-shrink-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-primary-600/10">
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

        {/* Selected messages summary */}
        {selectedMsgs.length > 0 && (
          <div className="bg-dark-surface/50 max-h-32 overflow-y-auto">
            {visibleMsgs.map(msg => (
              <div key={msg.id} className="flex items-center gap-2 px-4 py-1.5 hover:bg-dark-hover/30 transition">
                <button
                  onClick={() => toggleMessageSelection(msg.id)}
                  className="flex-shrink-0 text-dark-muted hover:text-dark-text text-xs p-0.5 rounded hover:bg-dark-hover transition"
                  title="移除"
                >
                  ✕
                </button>
                <span className="text-xs text-primary-400 font-semibold flex-shrink-0">
                  {getSenderName(msg.userId)}
                </span>
                <span className="text-xs text-dark-muted truncate">
                  {msg.type === 'file' ? '📎 File' : msg.content.length > 60 ? msg.content.slice(0, 60) + '...' : msg.content}
                </span>
              </div>
            ))}
            {hasMore && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full text-center text-xs text-dark-muted hover:text-dark-text py-1 hover:bg-dark-hover/30 transition"
              >
                {expanded ? '▴ 收起' : `▾ 还有 ${selectedMsgs.length - 3} 条`}
              </button>
            )}
          </div>
        )}
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
