import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { formatDistanceToNow } from 'date-fns';
import type { Message } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import UserAvatar from '../UserAvatar';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  streamContent?: string;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🤔', '👀'];

export default function MessageBubble({ message, isStreaming, streamContent }: MessageBubbleProps) {
  const { user, roomMembers, activeRoomId } = useAppStore();
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const members = activeRoomId ? roomMembers[activeRoomId] || [] : [];
  const sender = members.find((m) => m.id === message.userId);
  const isOwn = user?.id === message.userId;
  const isBot = sender?.isBot || message.userId === 'bot-clawchat';
  const displayContent = isStreaming ? (streamContent || '') : message.content;

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [isEditing]);

  const handleEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      socketService.editMessage(message.id, editContent);
    }
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (activeRoomId && confirm('Delete this message?')) {
      socketService.deleteMessage(message.id, activeRoomId);
    }
  };

  const handleReact = (emoji: string) => {
    if (activeRoomId) {
      socketService.reactToMessage(message.id, emoji, activeRoomId);
    }
    setShowReactions(false);
  };

  const handleStartThread = async () => {
    if (!activeRoomId) return;
    const thread = await socketService.createThread(activeRoomId, message.id);
    useAppStore.getState().setActiveThread(thread);
    const msgs = await socketService.getThreadMessages(thread.id, activeRoomId);
    useAppStore.getState().setThreadMessages(msgs);
  };

  return (
    <div
      className={clsx(
        'group flex gap-3 px-4 py-1.5 hover:bg-dark-hover/50 transition',
        message.type === 'system' && 'opacity-80'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowReactions(false); }}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 pt-0.5">
        <UserAvatar
          username={sender?.username || 'Unknown'}
          isBot={isBot}
          size="md"
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className={clsx('text-sm font-semibold', isBot ? 'text-primary-400' : 'text-white')}>
            {sender?.username || 'Unknown'}
          </span>
          {isBot && (
            <span className="text-[10px] px-1.5 py-0.5 bg-primary-600/20 text-primary-400 rounded font-medium">
              BOT
            </span>
          )}
          <span className="text-xs text-dark-muted">
            {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
          </span>
          {message.isEdited && (
            <span className="text-xs text-dark-muted">(edited)</span>
          )}
        </div>

        {/* Message body */}
        {isEditing ? (
          <div className="mt-1">
            <textarea
              ref={editRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit(); }
                if (e.key === 'Escape') setIsEditing(false);
              }}
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"
              rows={3}
            />
            <div className="flex gap-2 mt-1">
              <button onClick={handleEdit} className="text-xs text-primary-400 hover:underline">Save</button>
              <button onClick={() => setIsEditing(false)} className="text-xs text-dark-muted hover:underline">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                pre: ({ children }) => (
                  <pre className="bg-dark-bg rounded-lg p-3 overflow-x-auto border border-dark-border my-2">
                    {children}
                  </pre>
                ),
                code: ({ className, children, ...props }) => {
                  const isInline = !className;
                  if (isInline) {
                    return <code className="bg-dark-bg px-1.5 py-0.5 rounded text-primary-300 text-xs" {...props}>{children}</code>;
                  }
                  return <code className={className} {...props}>{children}</code>;
                },
              }}
            >
              {displayContent}
            </ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-primary-400 animate-pulse ml-0.5" />
            )}
          </div>
        )}

        {/* Reactions */}
        {Object.keys(message.reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {Object.entries(message.reactions).map(([emoji, userIds]) => (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                className={clsx(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition',
                  userIds.includes(user?.id || '')
                    ? 'border-primary-500 bg-primary-600/20 text-primary-300'
                    : 'border-dark-border bg-dark-bg text-dark-muted hover:border-dark-muted'
                )}
              >
                <span>{emoji}</span>
                <span>{userIds.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {showActions && !isEditing && !isStreaming && (
        <div className="flex-shrink-0 flex items-start gap-0.5 -mt-3 bg-dark-surface border border-dark-border rounded-lg shadow-lg p-0.5">
          <button
            onClick={() => setShowReactions(!showReactions)}
            className="p-1.5 text-dark-muted hover:text-white hover:bg-dark-hover rounded transition text-xs"
            title="React"
          >
            😀
          </button>
          <button
            onClick={handleStartThread}
            className="p-1.5 text-dark-muted hover:text-white hover:bg-dark-hover rounded transition text-xs"
            title="Thread"
          >
            🧵
          </button>
          {isOwn && (
            <>
              <button
                onClick={() => { setIsEditing(true); setEditContent(message.content); }}
                className="p-1.5 text-dark-muted hover:text-white hover:bg-dark-hover rounded transition text-xs"
                title="Edit"
              >
                ✏️
              </button>
              <button
                onClick={handleDelete}
                className="p-1.5 text-dark-muted hover:text-red-400 hover:bg-dark-hover rounded transition text-xs"
                title="Delete"
              >
                🗑️
              </button>
            </>
          )}
        </div>
      )}

      {/* Reaction picker */}
      {showReactions && (
        <div className="absolute mt-8 bg-dark-surface border border-dark-border rounded-lg shadow-xl p-2 flex gap-1 z-10">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReact(emoji)}
              className="p-1.5 hover:bg-dark-hover rounded transition text-lg"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
