import clsx from 'clsx';
import { useAppStore } from '../../stores/appStore';
import UserAvatar from '../UserAvatar';

export default function Sidebar() {
  const { rooms, activeRoomId, setActiveRoom, user, showSidebar, toggleSidebar } = useAppStore();

  if (!showSidebar) return null;

  return (
    <div className="w-64 bg-dark-surface border-r border-dark-border flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-dark-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <span className="text-sm font-bold text-white">CC</span>
          </div>
          <span className="font-semibold text-white">ClawChat</span>
        </div>
        <button
          onClick={toggleSidebar}
          className="text-dark-muted hover:text-white p-1 rounded lg:hidden"
        >
          ✕
        </button>
      </div>

      {/* User info */}
      {user && (
        <div className="px-4 py-3 border-b border-dark-border flex items-center gap-2">
          <UserAvatar username={user.username} isOnline={true} size="sm" />
          <span className="text-sm text-dark-text truncate">{user.username}</span>
        </div>
      )}

      {/* Room list */}
      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-3 py-1">
          <span className="text-xs font-semibold text-dark-muted uppercase tracking-wider">
            Conversations
          </span>
        </div>
        {rooms.map((room) => (
          <button
            key={room.id}
            onClick={() => setActiveRoom(room.id)}
            className={clsx(
              'w-full text-left px-3 py-2.5 mx-1 rounded-lg flex items-center gap-2.5 transition',
              activeRoomId === room.id
                ? 'bg-primary-600/20 text-primary-400'
                : 'text-dark-text hover:bg-dark-hover'
            )}
            style={{ width: 'calc(100% - 8px)' }}
          >
            <span className="text-lg">{room.type === 'dm' ? '💬' : '👥'}</span>
            <span className="text-sm truncate">{room.name}</span>
          </button>
        ))}
      </div>

      {/* New room button */}
      <div className="p-3 border-t border-dark-border">
        <button
          onClick={() => {
            const name = prompt('Room name:');
            if (name) {
              // Will be handled via socket
              import('../../services/socket').then(({ socketService }) => {
                socketService.createRoom(name, 'group').then((room) => {
                  useAppStore.getState().addRoom(room);
                  useAppStore.getState().setActiveRoom(room.id);
                });
              });
            }
          }}
          className="w-full py-2 px-3 text-sm text-dark-muted hover:text-white hover:bg-dark-hover rounded-lg transition flex items-center gap-2"
        >
          <span>＋</span>
          <span>New Room</span>
        </button>
      </div>
    </div>
  );
}
