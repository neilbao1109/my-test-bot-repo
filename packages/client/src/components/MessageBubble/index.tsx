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
  const { user, roomMembers, activeRoomId, threadInfo } = useAppStore();
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const reactionRef = useRef<HTMLDivElement>(null);

  const members = activeRoomId ? roomMembers[activeRoomId] || [] : [];
  const sender = members.find((m) => m.id === message.userId);
  const isOwn = user?.id === message.userId;
  const isBot = sender?.isBot || message.userId === 'bot-clawchat';
  const displayContent = isStreaming ? (streamContent || '') : message.content;
  const msgThreadInfo = threadInfo[message.id];

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [isEditing]);

  // Close reaction picker on outside click
  useEffect(() => {
    if (!showReactions) return;
    const handler = (e: MouseEvent) => {
      if (reactionRef.current && !reactionRef.current.contains(e.target as Node)) {
        setShowReactions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showReactions]);

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

  // Deleted message placeholder
  if (message.isDeleted) {
    return (
      <div className="group flex gap-3 px-4 py-1.5 hover:bg-dark-hover/50 transition opacity-60">
        <div className="flex-shrink-0 pt-0.5">
          <UserAvatar username={sender?.username || 'Unknown'} isBot={isBot} size="md" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-sm font-semibold text-dark-muted">
              {sender?.username || 'Unknown'}
            </span>
            <span className="text-xs text-dark-muted">
              {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm text-dark-muted italic">This message was deleted</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'group flex gap-3 px-4 py-1.5 hover:bg-dark-hover/50 transition relative',
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
          <div className="flex flex-wrap gap-1 mt-1.5 items-center">
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
            {/* Add reaction button */}
            <button
              onClick={() => setShowReactions(!showReactions)}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-dark-border bg-dark-bg text-dark-muted hover:border-dark-muted hover:text-white transition text-xs"
              title="Add reaction"
            >
              +
            </button>
          </div>
        )}

        {/* Thread info / reply count */}
        {msgThreadInfo && msgThreadInfo.replyCount > 0 && (
          <button
            onClick={handleStartThread}
            className="mt-1 text-xs text-primary-400 hover:underline flex items-center gap-1"
          >
            <span>🧵</span>
            <span>{msgThreadInfo.replyCount} {msgThreadInfo.replyCount === 1 ? 'reply' : 'replies'}</span>
            <span className="text-dark-muted">— View thread</span>
          </button>
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

      {/* Reaction picker — positioned relative to parent */}
      {showReactions && (
        <div
          ref={reactionRef}
          className="absolute right-4 top-0 mt-8 bg-dark-surface border border-dark-border rounded-lg shadow-xl p-2 flex gap-1 z-50"
        >
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
