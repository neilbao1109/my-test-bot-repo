import { useEffect, useRef, useState, useCallback } from 'react';
import clsx from 'clsx';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import { uploadFile } from '../../services/upload';
import MessageBubble from '../MessageBubble';
import CommandBar from '../CommandBar';
import SearchBar from '../SearchBar';
import PinnedBar from '../PinnedBar';
import UserAvatar from '../UserAvatar';

function exportMessages(roomMessages: any[], roomName: string, members: any[]) {
  const getMemberName = (userId: string) => members.find(m => m.id === userId)?.username || userId;
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' ');
  };

  let md = `# ClawChat Export — ${roomName}\nExported: ${new Date().toISOString()}\n\n---\n\n`;

  for (const msg of roomMessages) {
    if (msg.isDeleted) continue;
    const name = getMemberName(msg.userId);
    const time = formatTime(msg.createdAt);

    // Reply quote
    if (msg.replyTo) {
      const quoted = roomMessages.find((m: any) => m.id === msg.replyTo);
      if (quoted) {
        const qName = getMemberName(quoted.userId);
        const qText = quoted.content.slice(0, 100) + (quoted.content.length > 100 ? '…' : '');
        md += `> **${qName}**: ${qText}\n\n`;
      }
    }

    if (msg.type === 'file') {
      try {
        const att = JSON.parse(msg.content);
        md += `**${name}** (${time}):\n[📎 ${att.originalName}](${att.url})\n\n`;
      } catch {
        md += `**${name}** (${time}):\n${msg.content}\n\n`;
      }
    } else {
      md += `**${name}** (${time}):\n${msg.content}\n\n`;
    }
  }

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clawchat-${roomName.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ChatView() {
  const {
    activeRoomId, messages, rooms, streamingMessages,
    typingUsers, showSidebar, toggleSidebar, toggleMembers,
    user, roomMembers, onlineUsers, toggleSearch, searchResults, searchActiveIdx, searchQuery,
    hasMore, loadingHistory, setLoadingHistory, setHasMore, prependMessages,
  } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [dragOver, setDragOver] = useState(false);

  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const roomMessages = activeRoomId ? messages[activeRoomId] || [] : [];
  const roomTyping = activeRoomId ? typingUsers[activeRoomId] || [] : [];
  const members = activeRoomId ? roomMembers[activeRoomId] || [] : [];
  const onlineCount = members.filter((m) => onlineUsers.has(m.id) || m.isOnline).length;

  // Get streaming messages for this room (not in threads)
  const roomStreamingMsgs = Object.values(streamingMessages).filter(
    (s) => s.roomId === activeRoomId && !s.threadId
  );

  // Load older messages on scroll
  const loadMoreMessages = useCallback(async () => {
    if (!activeRoomId || loadingHistory[activeRoomId] || !hasMore[activeRoomId]) return;
    const roomMsgs = messages[activeRoomId] || [];
    if (roomMsgs.length === 0) return;

    const oldestCreatedAt = roomMsgs[0].createdAt;
    setLoadingHistory(activeRoomId, true);

    const el = messageListRef.current;
    const prevScrollHeight = el?.scrollHeight || 0;

    try {
      const result = await socketService.loadHistory(activeRoomId, oldestCreatedAt, 50);
      prependMessages(activeRoomId, result.messages);
      setHasMore(activeRoomId, result.hasMore);

      requestAnimationFrame(() => {
        if (el) {
          el.scrollTop = el.scrollHeight - prevScrollHeight;
        }
      });
    } finally {
      setLoadingHistory(activeRoomId, false);
    }
  }, [activeRoomId, messages, loadingHistory, hasMore]);

  const handleScroll = useCallback(() => {
    const el = messageListRef.current;
    if (!el || !activeRoomId) return;
    if (el.scrollTop < 100) {
      loadMoreMessages();
    }
  }, [activeRoomId, loadMoreMessages]);

  // Join room on selection
  useEffect(() => {
    if (activeRoomId) {
      socketService.joinRoom(activeRoomId);
    }
  }, [activeRoomId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomMessages, roomStreamingMsgs]);

  // Mobile keyboard: scroll to bottom when viewport resizes
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // Scroll to active search result
  const activeSearchMsg = searchResults[searchActiveIdx];
  useEffect(() => {
    if (activeSearchMsg && messageRefs.current[activeSearchMsg.id]) {
      messageRefs.current[activeSearchMsg.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeSearchMsg?.id, searchActiveIdx]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!activeRoomId) return;
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      try {
        const attachment = await uploadFile(file);
        socketService.sendMessage(activeRoomId, JSON.stringify(attachment), undefined, 'file');
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
  }, [activeRoomId]);

  if (!activeRoomId || !activeRoom) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-bg">
        <div className="text-center">
          <div className="text-6xl mb-4">💬</div>
          <h2 className="text-xl font-semibold text-dark-text mb-2">Welcome to ClawChat</h2>
          <p className="text-dark-muted">Select a conversation to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col h-full min-h-0 min-w-0 bg-dark-bg relative overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="absolute inset-0 bg-primary-600/20 border-2 border-dashed border-primary-400 rounded-lg z-50 flex items-center justify-center">
          <p className="text-primary-400 text-lg font-semibold">Drop files to upload</p>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-border bg-dark-surface flex-shrink-0">
        {/* Hamburger: toggle sidebar on all screen sizes */}
        <button
          onClick={toggleSidebar}
          className="text-dark-muted hover:text-dark-text p-1"
        >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        <span className="text-lg">{activeRoom.type === 'dm' ? '💬' : '👥'}</span>
        <div className="flex-1 min-w-0">
          <RoomNameHeader room={activeRoom} userId={user?.id} />
          <p className="text-xs text-dark-muted">
            {activeRoom.type === 'dm'
              ? 'Direct Message'
              : `${members.length} members, ${onlineCount} online`}
          </p>
        </div>

        {/* Search button */}
        <button
          onClick={toggleSearch}
          className="text-dark-muted hover:text-dark-text px-2 py-1 rounded-lg hover:bg-dark-hover transition"
          title="Search"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        {/* Members button */}
        <button
          onClick={toggleMembers}
          className="flex items-center gap-1.5 text-dark-muted hover:text-dark-text px-2 py-1 rounded-lg hover:bg-dark-hover transition"
          title="Members"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
          <span className="text-xs">{members.length}</span>
        </button>

        {/* Room menu */}
        <RoomMenu room={activeRoom} userId={user?.id} />
      </div>

      {/* Search bar */}
      <SearchBar />

      {/* Pinned messages bar */}
      <PinnedBar />

      {/* Messages */}
      <div ref={messageListRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-4 min-h-0 overscroll-contain">
        {activeRoomId && loadingHistory[activeRoomId] && (
          <div className="text-center py-2">
            <span className="text-xs text-dark-muted animate-pulse">Loading...</span>
          </div>
        )}

        {activeRoomId && !hasMore[activeRoomId] && roomMessages.length > 0 && (
          <div className="text-center py-2">
            <span className="text-xs text-dark-muted">Beginning of conversation</span>
          </div>
        )}

        {roomMessages.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🤖</div>
            <p className="text-dark-muted text-sm">
              Start a conversation! Type a message or use <code className="bg-dark-surface px-1.5 py-0.5 rounded text-primary-400">/help</code> for commands.
            </p>
          </div>
        )}

        {roomMessages.map((msg) => {
          const isSearchHit = searchQuery && searchResults.some(r => r.id === msg.id);
          const isActiveHit = activeSearchMsg?.id === msg.id;
          return (
            <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el; }}>
              <MessageBubble
                message={msg}
                highlight={isSearchHit ? searchQuery : undefined}
                isSearchActive={!!isActiveHit}
              />
            </div>
          );
        })}

        {/* Streaming messages */}
        {roomStreamingMsgs.map((stream) => {
          // Determine bot userId from the stream (botId field or fallback)
          const streamBotId = stream.botId || members.find(m => m.isBot)?.id || 'bot-clawchat';
          return (
          <MessageBubble
            key={stream.messageId}
            message={{
              id: stream.messageId,
              roomId: stream.roomId,
              threadId: stream.threadId,
              userId: streamBotId,
              content: stream.content,
              type: 'text',
              replyTo: null,
              reactions: {},
              isEdited: false,
              isDeleted: false,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }}
            isStreaming={true}
            streamContent={stream.content}
          />
          );
        })}

        {/* Typing indicator with avatars */}
        {roomTyping.length > 0 && (
          <div className="px-4 py-1.5 flex items-center gap-2">
            <div className="flex -space-x-1">
              {roomTyping.slice(0, 3).map((u) => (
                <UserAvatar
                  key={u.userId}
                  username={u.username}
                  isBot={u.userId === 'bot-clawchat'}
                  size="sm"
                />
              ))}
            </div>
            <span className="text-xs text-dark-muted animate-pulse">
              {roomTyping.some((u) => members.find(m => m.id === u.userId)?.isBot)
                ? `${roomTyping.filter(u => members.find(m => m.id === u.userId)?.isBot).map(u => u.username).join(', ')} ${roomTyping.filter(u => members.find(m => m.id === u.userId)?.isBot).length === 1 ? 'is' : 'are'} thinking...`
                : `${roomTyping.map((u) => u.username).join(', ')} ${roomTyping.length === 1 ? 'is' : 'are'} typing...`}
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <CommandBar roomId={activeRoomId} onExport={() => exportMessages(roomMessages, activeRoom.name, members)} />
    </div>
  );
}

// ── Inline room rename component ──

import type { Room } from '../../types';

function RoomNameHeader({ room, userId }: { room: Room; userId?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(room.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const canRename = !room.createdBy || room.createdBy === userId;

  useEffect(() => {
    if (editing) {
      setDraft(room.name);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing]);

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === room.name) {
      setEditing(false);
      return;
    }
    const result = await socketService.renameRoom(room.id, trimmed);
    if (result && (result as any).error) {
      console.warn('Rename failed:', (result as any).error);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={save}
          className="bg-dark-bg border border-primary-500 rounded px-2 py-0.5 text-sm text-dark-text font-semibold outline-none w-full max-w-[200px]"
          maxLength={50}
        />
      </div>
    );
  }

  return (
    <h2
      className={`font-semibold text-dark-text text-sm truncate ${
        canRename ? 'cursor-pointer hover:text-primary-400 transition' : ''
      }`}
      onClick={() => canRename && setEditing(true)}
      title={canRename ? 'Click to rename' : undefined}
    >
      {room.name}
      {canRename && (
        <span className="ml-1.5 text-dark-muted text-xs opacity-0 group-hover:opacity-100 transition">✏️</span>
      )}
    </h2>
  );
}

// ── Room menu with delete ──

function RoomMenu({ room, userId }: { room: Room; userId?: string }) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const canDelete = !room.createdBy || room.createdBy === userId;

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const handleDelete = async () => {
    const result = await socketService.deleteRoom(room.id);
    if ((result as any)?.error) {
      console.warn('Delete failed:', (result as any).error);
    }
    setConfirmDelete(false);
    setOpen(false);
  };

  if (!canDelete) return null;

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen(!open)}
          className="text-dark-muted hover:text-dark-text px-2 py-1 rounded-lg hover:bg-dark-hover transition"
          title="Room options"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 bg-dark-surface border border-dark-border rounded-lg shadow-lg py-1 z-50 min-w-[140px]">
            <button
              onClick={() => { setConfirmDelete(true); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-dark-hover transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete Room
            </button>
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setConfirmDelete(false)}>
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6 max-w-sm mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-dark-text mb-2">Delete "{room.name}"?</h3>
            <p className="text-sm text-dark-muted mb-6">
              All messages will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm text-dark-muted hover:text-dark-text rounded-lg hover:bg-dark-hover transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
