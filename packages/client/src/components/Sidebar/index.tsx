import clsx from 'clsx';
import { useAppStore } from '../../stores/appStore';
import UserAvatar from '../UserAvatar';

export default function Sidebar() {
  const { rooms, activeRoomId, setActiveRoom, user, showSidebar, toggleSidebar, roomMembers, onlineUsers, setShowCreateRoom, logout, theme, setTheme } = useAppStore();

  if (!showSidebar) return null;

  const isMobile = window.innerWidth < 768;

  const getRoomOnlineCount = (roomId: string): number => {
    const members = roomMembers[roomId] || [];
    return members.filter((m) => onlineUsers.has(m.id) || m.isOnline).length;
  };

  const isRoomOnline = (roomId: string): boolean => {
    return getRoomOnlineCount(roomId) > 0;
  };

  const handleRoomSelect = (roomId: string) => {
    setActiveRoom(roomId);
    if (isMobile) toggleSidebar();
  };

  const sidebar = (
    <div className={clsx(
      'bg-dark-surface border-r border-dark-border flex flex-col h-full',
      'fixed inset-0 z-40 w-full md:static md:w-64 md:z-auto'
    )}>
      {/* Header */}
      <div className="p-4 border-b border-dark-border flex items-center justify-between"
           style={{ paddingTop: `max(1rem, var(--safe-area-top))` }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <span className="text-sm font-bold text-dark-text">CC</span>
          </div>
          <span className="font-semibold text-dark-text">ClawChat</span>
        </div>
        <button
          onClick={toggleSidebar}
          className="text-dark-muted hover:text-white p-1 rounded md:hidden"
        >
          ✕
        </button>
      </div>

      {/* User info */}
      {user && (
        <div className="px-4 py-3 border-b border-dark-border flex items-center gap-2">
          <UserAvatar username={user.username} isOnline={true} size="sm" />
          <span className="text-sm text-dark-text truncate flex-1">{user.username}</span>
          <button onClick={logout} className="text-xs text-dark-muted hover:text-red-400 transition" title="Logout">⏻</button>
        </div>
      )}

      {/* Room list */}
      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-3 py-1">
          <span className="text-xs font-semibold text-dark-muted uppercase tracking-wider">
            Conversations
          </span>
        </div>
        {rooms.map((room) => {
          const memberCount = (roomMembers[room.id] || []).length;
          const online = isRoomOnline(room.id);
          return (
            <button
              key={room.id}
              onClick={() => handleRoomSelect(room.id)}
              className={clsx(
                'w-full text-left px-3 py-2.5 mx-1 rounded-lg flex items-center gap-2.5 transition',
                activeRoomId === room.id
                  ? 'bg-primary-600/20 text-primary-400'
                  : 'text-dark-text hover:bg-dark-hover'
              )}
              style={{ width: 'calc(100% - 8px)' }}
            >
              <div className="relative">
                <span className="text-lg">{room.type === 'dm' ? '💬' : '👥'}</span>
                {online && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-dark-surface" />
                )}
              </div>
              <span className="text-sm truncate flex-1">{room.name}</span>
              {room.type === 'group' && memberCount > 0 && (
                <span className="text-[10px] text-dark-muted bg-dark-hover px-1.5 py-0.5 rounded-full">
                  {memberCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* New room button */}
      <div className="p-3 border-t border-dark-border flex items-center gap-2"
           style={{ paddingBottom: `max(0.75rem, var(--safe-area-bottom))` }}>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="py-2 px-3 text-sm text-dark-muted hover:text-white hover:bg-dark-hover rounded-lg transition"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button
          onClick={() => setShowCreateRoom(true)}
          className="flex-1 py-2 px-3 text-sm text-dark-muted hover:text-white hover:bg-dark-hover rounded-lg transition flex items-center gap-2"
        >
          <span>＋</span>
          <span>New Room</span>
        </button>
      </div>
    </div>
  );

  // On mobile, wrap with backdrop
  if (isMobile) {
    return (
      <>
        <div className="fixed inset-0 z-30 bg-black/50" onClick={toggleSidebar} />
        {sidebar}
      </>
    );
  }

  return sidebar;
}
