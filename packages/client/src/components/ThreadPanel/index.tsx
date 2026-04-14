import { useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import MessageBubble from '../MessageBubble';
import CommandBar from '../CommandBar';

export default function ThreadPanel() {
  const {
    activeThread, threadMessages, showThread, setActiveThread,
    activeRoomId, messages, streamingMessages,
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

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages, threadStreamingMsgs]);

  if (!showThread || !activeThread) return null;

  return (
    <div className="w-80 border-l border-dark-border bg-dark-surface flex flex-col h-full">
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

        <div ref={bottomRef} />
      </div>

      {/* Thread input */}
      {activeRoomId && (
        <CommandBar roomId={activeRoomId} threadId={activeThread.id} />
      )}
    </div>
  );
}
