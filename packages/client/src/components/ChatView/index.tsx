import { useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import MessageBubble from '../MessageBubble';
import CommandBar from '../CommandBar';

export default function ChatView() {
  const {
    activeRoomId, messages, rooms, streamingMessages,
    typingUsers, showSidebar, toggleSidebar, user,
  } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const roomMessages = activeRoomId ? messages[activeRoomId] || [] : [];
  const roomTyping = activeRoomId ? typingUsers[activeRoomId] || [] : [];

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
    <div className="flex-1 flex flex-col h-full bg-dark-bg">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-dark-border bg-dark-surface">
        {!showSidebar && (
          <button
            onClick={toggleSidebar}
            className="text-dark-muted hover:text-white p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        <span className="text-lg">{activeRoom.type === 'dm' ? '💬' : '👥'}</span>
        <div>
          <h2 className="font-semibold text-white text-sm">{activeRoom.name}</h2>
          <p className="text-xs text-dark-muted">
            {activeRoom.type === 'dm' ? 'Direct message with ClawBot' : 'Group room'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4">
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

        {/* Typing indicator */}
        {roomTyping.length > 0 && (
          <div className="px-4 py-1">
            <span className="text-xs text-dark-muted animate-pulse">
              {roomTyping.map((u) => u.username).join(', ')} {roomTyping.length === 1 ? 'is' : 'are'} typing...
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
