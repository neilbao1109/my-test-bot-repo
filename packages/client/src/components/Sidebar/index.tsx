import { useState, useMemo } from 'react';
import clsx from 'clsx';
import { useAppStore } from '../../stores/appStore';
import SettingsPanel from './SettingsPanel';
import AccountPanel from './AccountPanel';
import FolderTabs from './FolderTabs';
import FolderEditModal from './FolderEditModal';
import SearchPanel from './SearchPanel';
import type { ChatFolder } from '../../types';

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (isYesterday) return '昨天';
  if (diffDays < 7) {
    return ['周日','周一','周二','周三','周四','周五','周六'][date.getDay()];
  }
  return `${date.getMonth()+1}/${date.getDate()}`;
}

function previewText(content: string, type: string): string {
  if (type === 'file') return '📎 文件';
  if (type === 'system') return '⚙️ 系统消息';
  // Strip markdown
  return content.replace(/[*_~`#>\[\]]/g, '').replace(/\n/g, ' ').slice(0, 60);
}

export default function Sidebar() {
  const { rooms, activeRoomId, setActiveRoom, showSidebar, roomMembers, onlineUsers, setShowCreateRoom, theme, setTheme, showSettings, setShowSettings, folders, activeFolderId } = useAppStore();
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ChatFolder | null>(null);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);

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
  };

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

  // Sort rooms by last message time (most recent first)
  const sortedRooms = useMemo(() => {
    return [...filteredRooms].sort((a, b) => {
      const timeA = a.lastMessage?.createdAt || a.createdAt;
      const timeB = b.lastMessage?.createdAt || b.createdAt;
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });
  }, [filteredRooms]);

  const sidebar = (
    <div className={clsx(
      'bg-dark-surface border-r border-dark-border flex flex-col h-full overflow-hidden transition-all duration-200 ease-in-out',
      isMobile
        ? 'w-full h-full'
        : showSidebar
          ? 'w-64 min-w-[16rem] opacity-100'
          : 'w-0 min-w-0 opacity-0 border-r-0 overflow-hidden'
    )}>
      {/* Three-layer container for slide transitions */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Main sidebar content */}
        <div className={clsx(
          'absolute inset-0 flex flex-col transition-transform duration-200 ease-in-out',
          showSettings ? '-translate-x-full' : 'translate-x-0'
        )}>
      {/* Header */}
      <div className="p-4 border-b border-dark-border flex items-center justify-between"
           >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSearchPanel(true)}
            className="text-dark-muted hover:text-dark-text p-1.5 rounded-lg hover:bg-dark-hover transition"
            title="Search"
          >
            <svg className="w-4 h-4 text-dark-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <span className="font-semibold text-dark-text">ClawChat</span>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowQuickMenu(!showQuickMenu)}
            className="text-dark-muted hover:text-dark-text p-1.5 rounded-lg hover:bg-dark-hover transition"
            title="Menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
            </svg>
          </button>
          {showQuickMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowQuickMenu(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-dark-surface border border-dark-border rounded-lg shadow-lg py-1 min-w-[160px]">
                <button
                  onClick={() => { setShowCreateRoom(true); setShowQuickMenu(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-dark-text hover:bg-dark-hover flex items-center gap-2 transition"
                >
                  <span>＋</span>
                  <span>New Room</span>
                </button>
                <button
                  onClick={() => { setShowSettings(true); setShowQuickMenu(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-dark-text hover:bg-dark-hover flex items-center gap-2 transition"
                >
                  <span>⚙️</span>
                  <span>Settings</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>


      {/* Folder tabs - hidden during search */}
      {!showSearchPanel && <FolderTabs onCreateFolder={() => setShowFolderModal(true)} />}

      {/* Search panel or Room list */}
      {showSearchPanel ? (
        <SearchPanel onClose={() => setShowSearchPanel(false)} />
      ) : (
      <div className="flex-1 overflow-y-auto py-2">
        {sortedRooms.map((room) => {
          const memberCount = (roomMembers[room.id] || []).length;
          const online = isRoomOnline(room.id);
          const lm = room.lastMessage;
          return (
            <button
              key={room.id}
              onClick={() => handleRoomSelect(room.id)}
              className={clsx(
                'w-full text-left px-3 py-2.5 mx-1 rounded-lg flex items-start gap-2.5 transition',
                activeRoomId === room.id
                  ? 'bg-primary-600/20 text-primary-400'
                  : 'text-dark-text hover:bg-dark-hover'
              )}
              style={{ width: 'calc(100% - 8px)' }}
            >
              <div className="relative mt-0.5 flex-shrink-0">
                <span className="text-lg">{room.type === 'dm' ? '💬' : '👥'}</span>
                {online && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-dark-surface" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate font-medium">{room.name}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {room.type === 'group' && memberCount > 0 && (
                      <span className="text-[10px] text-dark-muted bg-dark-hover px-1.5 py-0.5 rounded-full">
                        {memberCount}
                      </span>
                    )}
                    {lm && (
                      <span className="text-[10px] text-dark-muted">{formatTime(lm.createdAt)}</span>
                    )}
                  </div>
                </div>
                {lm && (
                  <p className="text-xs text-dark-muted truncate mt-0.5">
                    <span className="font-medium">{lm.senderName}:</span>{' '}
                    {previewText(lm.content, lm.type)}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
      )}


        </div>

        {/* Settings panel (slides in from right) */}
        <div className={clsx(
          'absolute inset-0 flex flex-col transition-transform duration-200 ease-in-out',
          showSettings ? (showAccount ? '-translate-x-full' : 'translate-x-0') : 'translate-x-full'
        )}>
          <SettingsPanel onBack={() => setShowSettings(false)} onShowAccount={() => setShowAccount(true)} />
        </div>

        {/* Account panel (slides in from right of settings) */}
        <div className={clsx(
          'absolute inset-0 flex flex-col transition-transform duration-200 ease-in-out',
          showAccount ? 'translate-x-0' : 'translate-x-full'
        )}>
          <AccountPanel onBack={() => setShowAccount(false)} />
        </div>
      </div>
    </div>
  );

  // On mobile, no backdrop needed — App.tsx handles display:none switching
  if (isMobile) {
    return (
      <>
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
      {(showFolderModal || editingFolder) && (
        <FolderEditModal
          folder={editingFolder}
          onClose={() => { setShowFolderModal(false); setEditingFolder(null); }}
        />
      )}
    </>
  );
}
