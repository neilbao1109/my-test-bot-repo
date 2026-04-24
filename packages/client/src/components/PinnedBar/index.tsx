import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';

export default function PinnedBar() {
  const { activeRoomId, pinnedMessages, roomMembers } = useAppStore();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const pins = activeRoomId ? pinnedMessages[activeRoomId] || [] : [];
  const members = activeRoomId ? roomMembers[activeRoomId] || [] : [];
  const prevPinCount = useRef(pins.length);

  // Reset dismissed when new pins are added
  useEffect(() => {
    if (pins.length > prevPinCount.current) {
      setDismissed(false);
    }
    prevPinCount.current = pins.length;
  }, [pins.length]);

  if (pins.length === 0 || dismissed) return null;

  const getSenderName = (userId: string) => {
    return members.find((m) => m.id === userId)?.username || 'Unknown';
  };

  const scrollToMessage = (messageId: string) => {
    const el = document.querySelector(`[data-msg-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-primary-600/20');
      setTimeout(() => el.classList.remove('bg-primary-600/20'), 2000);
    }
  };

  const latestPin = pins[0];

  return (
    <div className="border-b border-dark-border bg-dark-surface/50 flex-shrink-0">
      {/* Main pinned bar — shows latest pin */}
      <div className="flex items-center gap-2 px-4 py-2">
        <span className="text-sm flex-shrink-0">📌</span>
        <button
          onClick={() => scrollToMessage(latestPin.messageId)}
          className="flex-1 min-w-0 text-left hover:bg-dark-hover/50 rounded px-1 py-0.5 transition"
        >
          <span className="text-xs text-primary-400 font-semibold">
            {getSenderName(latestPin.userId)}
          </span>
          <p className="text-xs text-dark-text truncate">
            {latestPin.type === 'file' ? '📎 File' : latestPin.content.slice(0, 100)}
          </p>
        </button>

        {pins.length > 1 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-dark-muted hover:text-dark-text px-1.5 py-0.5 rounded hover:bg-dark-hover transition flex-shrink-0"
          >
            {expanded ? '▴' : `▾ ${pins.length - 1} more`}
          </button>
        )}

        <button
          onClick={() => setDismissed(true)}
          className="text-dark-muted hover:text-dark-text p-0.5 rounded hover:bg-dark-hover transition flex-shrink-0 text-xs"
          title="Hide"
        >
          ✕
        </button>
      </div>

      {/* Expanded list */}
      {expanded && (
        <div className="px-4 pb-2 space-y-1 max-h-48 overflow-y-auto">
          {pins.slice(1).map((pin) => (
            <div key={pin.id} className="flex items-center gap-2">
              <button
                onClick={() => scrollToMessage(pin.messageId)}
                className="flex-1 min-w-0 text-left hover:bg-dark-hover/50 rounded px-2 py-1 transition"
              >
                <span className="text-xs text-primary-400 font-semibold">
                  {getSenderName(pin.userId)}
                </span>
                <p className="text-xs text-dark-text truncate">
                  {pin.type === 'file' ? '📎 File' : pin.content.slice(0, 100)}
                </p>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
