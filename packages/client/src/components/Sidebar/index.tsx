import { useState, useRef, useCallback } from 'react';
import clsx from 'clsx';
import { useAppStore } from '../../stores/appStore';
import UserAvatar from '../UserAvatar';
import SettingsPanel from './SettingsPanel';
import FolderTabs from './FolderTabs';
import FolderEditModal from './FolderEditModal';
import PeekPanel from './PeekPanel';
import type { ChatFolder } from '../../types';

export default function Sidebar() {
  const { rooms, activeRoomId, setActiveRoom, user, showSidebar, toggleSidebar, roomMembers, onlineUsers, setShowCreateRoom, logout, theme, setTheme, showSettings, setShowSettings, folders, activeFolderId } = useAppStore();
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ChatFolder | null>(null);
  const [peekRoomId, setPeekRoomId] = useState<string | null>(null);
  const [peekTop, setPeekTop] = useState(0);
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekingRef = useRef(false); // true when mouse is over peek panel

  const isMobile = window.innerWidth < 768;

  // On mobile, hide completely when collapsed (overlay mode)
  if (isMobile && !showSidebar) return null;

  const getRoomOnlineCount = (roomId: string): number => {
    const members = roomMembers[roomId] || [];
    return members.filter((m) => onlineUsers.has(m.id) || m.isOnline).length;
  };

  const isRoomOnline = (roomId: string): boolean => {
    return getRoomOnlineCount(roomId) > 0;
  };

  const handleRoomSelect = (roomId: string) => {
    setActiveRoom(roomId);
    setPeekRoomId(null);
    if (isMobile) toggleSidebar();
  };

  // Peek hover handlers (desktop only)
  const handleRoomHoverEnter = useCallback((roomId: string, e: React.MouseEvent) => {
    if (isMobile || roomId === activeRoomId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
    peekTimerRef.current = setTimeout(() => {
      setPeekRoomId(roomId);
      setPeekTop(rect.top);
    }, 300);
  }, [isMobile, activeRoomId]);

  const handleRoomHoverLeave = useCallback(() => {
    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
    // Delay close to allow mouse to enter peek panel
    peekTimerRef.current = setTimeout(() => {
      if (!peekingRef.current) setPeekRoomId(null);
    }, 150);
  }, []);

  const handlePeekEnter = useCallback(() => {
    peekingRef.current = true;
    if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
  }, []);

  const handlePeekLeave = useCallback(() => {
    peekingRef.current = false;
    setPeekRoomId(null);
  }, []);

  // Filter rooms by active folder
  const activeFolder = folders.find((f) => f.id === activeFolderId) || folders[0];
  const filteredRooms = rooms.filter((room) => {
    if (!activeFolder) return true;
    if (activeFolder.filter === 'all') return true;
    if (activeFolder.filter === 'dm') return room.type === 'dm';
    if (activeFolder.filter === 'group') return room.type === 'group';
    if (activeFolder.filter === 'custom') return activeFolder.roomIds?.includes(room.id) ?? false;
    return true;
  });

  const sidebar = (
    <div className={clsx(
      'bg-dark-surface border-r border-dark-border flex flex-col h-full overflow-hidden transition-all duration-200 ease-in-out',
      isMobile
        ? 'fixed inset-0 z-40 w-full'
        : showSidebar
          ? 'w-64 min-w-[16rem] opacity-100'
          : 'w-0 min-w-0 opacity-0 border-r-0 overflow-hidden'
    )}>
      {/* Two-layer container for slide transition */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Main sidebar content */}
        <div className={clsx(
          'absolute inset-0 flex flex-col transition-transform duration-200 ease-in-out',
          showSettings ? '-translate-x-full' : 'translate-x-0'
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
          className="text-dark-muted hover:text-dark-text p-1 rounded md:hidden"
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

      {/* Folder tabs */}
      <FolderTabs onCreateFolder={() => setShowFolderModal(true)} />

      {/* Room list */}
      <div className="flex-1 overflow-y-auto py-2">
        {filteredRooms.map((room) => {
          const memberCount = (roomMembers[room.id] || []).length;
          const online = isRoomOnline(room.id);
          return (
            <button
              key={room.id}
              onClick={() => handleRoomSelect(room.id)}
              onMouseEnter={(e) => handleRoomHoverEnter(room.id, e)}
              onMouseLeave={handleRoomHoverLeave}
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
          onClick={() => setShowSettings(true)}
          className="py-2 px-3 text-sm text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-lg transition"
          title="Settings"
        >
          ⚙️
        </button>
        <button
          onClick={() => setShowCreateRoom(true)}
          className="flex-1 py-2 px-3 text-sm text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-lg transition flex items-center gap-2"
        >
          <span>＋</span>
          <span>New Room</span>
        </button>
      </div>
        </div>

        {/* Settings panel (slides in from right) */}
        <div className={clsx(
          'absolute inset-0 flex flex-col transition-transform duration-200 ease-in-out',
          showSettings ? 'translate-x-0' : 'translate-x-full'
        )}>
          <SettingsPanel onBack={() => setShowSettings(false)} />
        </div>
      </div>
    </div>
  );

  const peekRoom = peekRoomId ? rooms.find((r) => r.id === peekRoomId) : null;

  // On mobile, wrap with backdrop
  if (isMobile) {
    return (
      <>
        <div className="fixed inset-0 z-30 bg-black/50" onClick={toggleSidebar} />
        {sidebar}
        {(showFolderModal || editingFolder) && (
          <FolderEditModal
            folder={editingFolder}
            onClose={() => { setShowFolderModal(false); setEditingFolder(null); }}
          />
        )}
      </>
    );
  }

  return (
    <>
      {sidebar}
      {peekRoom && peekRoomId && (
        <PeekPanel
          roomId={peekRoomId}
          roomName={peekRoom.name}
          anchorTop={peekTop}
          onEnter={handlePeekEnter}
          onLeave={handlePeekLeave}
          onGoToRoom={() => { handleRoomSelect(peekRoomId); setPeekRoomId(null); }}
        />
      )}
      {(showFolderModal || editingFolder) && (
        <FolderEditModal
          folder={editingFolder}
          onClose={() => { setShowFolderModal(false); setEditingFolder(null); }}
        />
      )}
    </>
  );
}
