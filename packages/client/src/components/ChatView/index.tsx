import { useEffect, useRef, useState, useCallback } from 'react';
import clsx from 'clsx';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import { uploadFile } from '../../services/upload';
import MessageBubble from '../MessageBubble';
import CommandBar from '../CommandBar';
import UserAvatar from '../UserAvatar';

export default function ChatView() {
  const {
    activeRoomId, messages, rooms, streamingMessages,
    typingUsers, showSidebar, toggleSidebar, toggleMembers,
    user, roomMembers, onlineUsers,
  } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);
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
          <h2 className="text-xl font-semibold text-white mb-2">Welcome to ClawChat</h2>
          <p className="text-dark-muted">Select a conversation to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col h-full min-h-0 bg-dark-bg relative"
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
      <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-border bg-dark-surface">
        {/* Hamburger: always on mobile, only when sidebar hidden on desktop */}
        <button
          onClick={toggleSidebar}
          className={clsx(
            'text-dark-muted hover:text-white p-1',
            showSidebar ? 'md:hidden' : ''
          )}
        >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        <span className="text-lg">{activeRoom.type === 'dm' ? '💬' : '👥'}</span>
        <div className="flex-1">
          <h2 className="font-semibold text-white text-sm">{activeRoom.name}</h2>
          <p className="text-xs text-dark-muted">
            {activeRoom.type === 'dm'
              ? 'Direct message with ClawBot'
              : `${members.length} members, ${onlineCount} online`}
          </p>
        </div>

        {/* Members button */}
        <button
          onClick={toggleMembers}
          className="flex items-center gap-1.5 text-dark-muted hover:text-white px-2 py-1 rounded-lg hover:bg-dark-hover transition"
          title="Members"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
          <span className="text-xs">{members.length}</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 min-h-0">
        {roomMessages.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🤖</div>
            <p className="text-dark-muted text-sm">
              Start a conversation! Type a message or use <code className="bg-dark-surface px-1.5 py-0.5 rounded text-primary-400">/help</code> for commands.
            </p>
          </div>
        )}

        {roomMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Streaming messages */}
        {roomStreamingMsgs.map((stream) => (
          <MessageBubble
            key={stream.messageId}
            message={{
              id: stream.messageId,
              roomId: stream.roomId,
              threadId: stream.threadId,
              userId: 'bot-clawchat',
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
        ))}

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
              {roomTyping.some((u) => u.userId === 'bot-clawchat')
                ? 'ClawBot is thinking...'
                : `${roomTyping.map((u) => u.username).join(', ')} ${roomTyping.length === 1 ? 'is' : 'are'} typing...`}
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <CommandBar roomId={activeRoomId} />
    </div>
  );
}
