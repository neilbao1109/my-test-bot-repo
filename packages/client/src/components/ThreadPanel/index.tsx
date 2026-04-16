import { useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import MessageBubble from '../MessageBubble';
import CommandBar from '../CommandBar';
import UserAvatar from '../UserAvatar';

export default function ThreadPanel() {
  const {
    activeThread, threadMessages, showThread, setActiveThread,
    activeRoomId, messages, streamingMessages, typingUsers,
  } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages, threadStreamingMsgs]);

  if (!showThread || !activeThread) return null;

  return (
    <div className="fixed inset-0 z-30 w-full bg-dark-surface flex flex-col h-full md:static md:inset-auto md:z-auto md:w-80 md:border-l md:border-dark-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧵</span>
          <h3 className="font-semibold text-white text-sm">Thread</h3>
          <span className="text-xs text-dark-muted">
            {activeThread.replyCount} {activeThread.replyCount === 1 ? 'reply' : 'replies'}
          </span>
        </div>
        <button
          onClick={() => setActiveThread(null)}
          className="text-dark-muted hover:text-white p-1 rounded transition"
        >
          ✕
        </button>
      </div>

      {/* Parent message */}
      {parentMessage && (
        <div className="border-b border-dark-border bg-dark-bg/50">
          <MessageBubble message={parentMessage} />
        </div>
      )}

      {/* Thread messages */}
      <div className="flex-1 overflow-y-auto py-2">
        {threadMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {threadStreamingMsgs.map((stream) => (
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
