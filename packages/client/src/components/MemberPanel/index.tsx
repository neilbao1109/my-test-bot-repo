import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import UserAvatar from '../UserAvatar';

export default function MemberPanel() {
  const { showMembers, toggleMembers, activeRoomId, roomMembers, rooms, onlineUsers, user } = useAppStore();

  if (!showMembers || !activeRoomId) return null;

  const members = roomMembers[activeRoomId] || [];
  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const isGroup = activeRoom?.type === 'group';

  const handleRemove = async (userId: string) => {
    if (!confirm('Remove this member from the room?')) return;
    // Could add room:kick event — for now just a placeholder
  };

  return (
    <div className="w-64 border-l border-dark-border bg-dark-surface flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <div className="flex items-center gap-2">
          <span className="text-lg">👥</span>
          <h3 className="font-semibold text-white text-sm">Members</h3>
          <span className="text-xs text-dark-muted">{members.length}</span>
        </div>
        <button
          onClick={toggleMembers}
          className="text-dark-muted hover:text-white p-1 rounded transition"
        >
          ✕
        </button>
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Online members */}
        {(() => {
          const online = members.filter((m) => onlineUsers.has(m.id) || m.isOnline);
          const offline = members.filter((m) => !onlineUsers.has(m.id) && !m.isOnline);
          return (
            <>
              {online.length > 0 && (
                <div className="px-3 py-1">
                  <span className="text-xs font-semibold text-dark-muted uppercase tracking-wider">
                    Online — {online.length}
                  </span>
                </div>
              )}
              {online.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-dark-hover/50 transition"
                >
                  <UserAvatar username={m.username} isBot={m.isBot} isOnline={true} size="sm" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-white truncate block">{m.username}</span>
                    {m.isBot && (
                      <span className="text-[10px] text-primary-400">BOT</span>
                    )}
                  </div>
                </div>
              ))}

              {offline.length > 0 && (
                <div className="px-3 py-1 mt-2">
                  <span className="text-xs font-semibold text-dark-muted uppercase tracking-wider">
                    Offline — {offline.length}
                  </span>
                </div>
              )}
              {offline.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-dark-hover/50 transition opacity-60"
                >
                  <UserAvatar username={m.username} isBot={m.isBot} isOnline={false} size="sm" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-dark-text truncate block">{m.username}</span>
                    {m.isBot && (
                      <span className="text-[10px] text-primary-400">BOT</span>
                    )}
                  </div>
                </div>
              ))}
            </>
          );
        })()}
      </div>
    </div>
  );
}
