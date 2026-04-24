import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import { uploadFile } from '../../services/upload';
import MessageBubble from '../MessageBubble';
import CommandBar from '../CommandBar';
import UserAvatar from '../UserAvatar';

export default function ThreadPanel() {
  const {
    activeThread, threadMessages, setActiveThread,
    activeRoomId, messages, streamingMessages, typingUsers,
    rooms, roomMembers, onlineUsers,
  } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  // Find the parent message
  const parentMessage = activeThread && activeRoomId
    ? (messages[activeRoomId] || []).find((m) => m.id === activeThread.parentMessageId)
    : null;

  // Get streaming messages for this thread
  const threadStreamingMsgs = activeThread
    ? Object.values(streamingMessages).filter((s) => s.threadId === activeThread.id)
    : [];

  // Get typing users for this thread
  const threadTyping = activeThread ? typingUsers[`thread:${activeThread.id}`] || [] : [];

  const members = activeRoomId ? roomMembers[activeRoomId] || [] : [];

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages, threadStreamingMsgs]);

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
    if (!activeRoomId || !activeThread) return;
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      try {
        const attachment = await uploadFile(file);
        socketService.sendMessage(activeRoomId, JSON.stringify(attachment), activeThread.id, 'file');
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
  }, [activeRoomId, activeThread]);

  // Truncate parent message content for subtitle
  const parentPreview = parentMessage
    ? parentMessage.content.length > 60
      ? parentMessage.content.slice(0, 60) + '…'
      : parentMessage.content
    : '';

  if (!activeThread) return null;

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
        {/* Back button */}
        <button
          onClick={() => setActiveThread(null)}
          className="text-dark-muted hover:text-dark-text p-1 rounded transition"
          title="Back to chat"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <span className="text-lg">🧵</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-dark-text text-sm">Thread</h2>
            <span className="text-xs text-dark-muted">
              {activeThread.replyCount} {activeThread.replyCount === 1 ? 'reply' : 'replies'}
            </span>
          </div>
          {parentPreview && (
            <p className="text-xs text-dark-muted truncate">{parentPreview}</p>
          )}
        </div>

        {/* Room name badge */}
        {activeRoom && (
          <span className="text-xs text-dark-muted bg-dark-hover px-2 py-0.5 rounded hidden sm:inline-block">
            {activeRoom.name}
          </span>
        )}
      </div>

      {/* Thread messages (parent + replies in one scrollable area) */}
      <div className="flex-1 overflow-y-auto min-h-0 overscroll-contain">
        {/* Parent message */}
        {parentMessage && (
          <div className="border-b border-dark-border bg-dark-bg/50">
            <MessageBubble message={parentMessage} />
          </div>
        )}
        {threadMessages.length === 0 && !threadStreamingMsgs.length && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🧵</div>
            <p className="text-dark-muted text-sm">No replies yet. Start the conversation!</p>
          </div>
        )}

        {threadMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {threadStreamingMsgs.map((stream) => {
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

        {/* Thread typing indicator */}
        {threadTyping.length > 0 && (
          <div className="px-4 py-1.5 flex items-center gap-2">
            <div className="flex -space-x-1">
              {threadTyping.slice(0, 3).map((u) => (
                <UserAvatar
                  key={u.userId}
                  username={u.username}
                  isBot={u.userId === 'bot-clawchat'}
                  size="sm"
                />
              ))}
            </div>
            <span className="text-xs text-dark-muted animate-pulse">
              {threadTyping.some((u) => u.userId === 'bot-clawchat')
                ? 'ClawBot is thinking...'
                : `${threadTyping.map((u) => u.username).join(', ')} ${threadTyping.length === 1 ? 'is' : 'are'} typing...`}
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Thread input */}
      {activeRoomId && (
        <CommandBar roomId={activeRoomId} threadId={activeThread.id} />
      )}
    </div>
  );
}
