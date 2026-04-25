import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfmSafe from '../../utils/remarkGfmSafe';
import rehypeHighlight from 'rehype-highlight';
import rehypeAutolink from '../../utils/rehypeAutolink';
import { formatDistanceToNow } from 'date-fns';
import type { Message, FileAttachment } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import { formatFileSize } from '../../utils/format';
import UserAvatar from '../UserAvatar';

function CodeBlockPre({ text, children }: { text: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative group/code my-2">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 px-1.5 py-0.5 rounded text-xs bg-dark-surface border border-dark-border text-dark-muted hover:text-dark-text opacity-0 group-hover/code:opacity-100 md:opacity-0 max-md:opacity-60 transition z-10"
        title="Copy code"
      >
        {copied ? '✅' : '📋'}
      </button>
      <pre className="bg-dark-bg rounded-lg p-3 overflow-x-auto border border-dark-border">
        {children}
      </pre>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  streamContent?: string;
  highlight?: string | null;
  isSearchActive?: boolean;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🤔', '👀'];

export default function MessageBubble({ message, isStreaming, streamContent, highlight, isSearchActive }: MessageBubbleProps) {
  const { user, roomMembers, activeRoomId, threadInfo, setReplyTo, messages: allMessages } = useAppStore();
  const isPinned = useAppStore((s) => activeRoomId ? (s.pinnedMessages[activeRoomId] || []).some((p) => p.messageId === message.id) : false);
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const reactionRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const members = activeRoomId ? roomMembers[activeRoomId] || [] : [];
  const sender = members.find((m) => m.id === message.userId);
  const isOwn = user?.id === message.userId;
  const isBot = sender?.isBot || false;
  const displayContent = isStreaming ? (streamContent || '') : message.content;
  const msgThreadInfo = threadInfo[message.id];

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [isEditing]);

  // Close reaction picker / mobile actions on outside click
  useEffect(() => {
    if (!showReactions && !(isMobile && showActions)) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (reactionRef.current && !reactionRef.current.contains(e.target as Node)) {
        setShowReactions(false);
      }
      if (isMobile && actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showReactions, showActions]);

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

  const handlePin = () => {
    if (!activeRoomId) return;
    if (isPinned) {
      // Optimistic update: remove from store immediately
      useAppStore.getState().removePinnedMessage(activeRoomId, message.id);
      socketService.unpinMessage(message.id, activeRoomId);
    } else {
      socketService.pinMessage(message.id, activeRoomId);
    }
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
      data-msg-id={message.id}
      className={clsx(
        'msg-bubble group flex gap-3 px-4 py-1.5 hover:bg-dark-hover/50 transition relative',
        message.type === 'system' && 'opacity-80',
        isSearchActive && 'bg-primary-600/20 ring-1 ring-primary-500/40',
        highlight && !isSearchActive && 'bg-yellow-500/5',
      )}
      onMouseEnter={() => !isMobile && setShowActions(true)}
      onMouseLeave={() => { !isMobile && setShowActions(false); setShowReactions(false); }}
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
          <span className={clsx('text-sm font-semibold', isBot ? 'text-primary-400' : 'text-dark-text')}>
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
          {isPinned && (
            <span className="text-xs text-primary-400">📌</span>
          )}
        </div>

        {/* Reply quote block */}
        {message.replyTo && (() => {
          const roomMsgs = activeRoomId ? allMessages[activeRoomId] || [] : [];
          const quoted = roomMsgs.find(m => m.id === message.replyTo);
          if (!quoted) return null;
          const quotedSender = members.find(m => m.id === quoted.userId);
          return (
            <button
              onClick={() => {
                const el = document.querySelector(`[data-msg-id="${quoted.id}"]`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('bg-primary-600/20');
                  setTimeout(() => el.classList.remove('bg-primary-600/20'), 2000);
                }
              }}
              className="mt-1 mb-1 w-full text-left border-l-2 border-primary-500/50 pl-2 py-1 rounded-r bg-dark-hover/30 hover:bg-dark-hover/50 transition"
            >
              <p className="text-xs text-primary-400 font-semibold truncate">
                {quotedSender?.username || 'Unknown'}
              </p>
              <p className="text-xs text-dark-muted truncate">
                {quoted.content.length > 80 ? quoted.content.slice(0, 80) + '…' : quoted.content}
              </p>
            </button>
          );
        })()}

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
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"
              rows={3}
            />
            <div className="flex gap-2 mt-1">
              <button onClick={handleEdit} className="text-xs text-primary-400 hover:underline">Save</button>
              <button onClick={() => setIsEditing(false)} className="text-xs text-dark-muted hover:underline">Cancel</button>
            </div>
          </div>
        ) : message.type === 'file' ? (
          (() => {
            let attachment: FileAttachment | null = null;
            try { attachment = JSON.parse(displayContent); } catch {}
            if (!attachment) return <p className="text-sm text-dark-muted italic">Invalid file</p>;
            const isImage = attachment.mimeType.startsWith('image/');
            const isPdf = attachment.mimeType === 'application/pdf';
            const isText = /^(text\/|application\/json|application\/javascript)/.test(attachment.mimeType)
              || /\.(md|txt|json|js|ts|tsx|jsx|py|sh|css|html|yml|yaml|toml|csv|xml|sql|log|env|cfg|ini|conf)$/i.test(attachment.originalName);
            if (isImage) {
              return (
                <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block mt-1">
                  <img
                    src={attachment.url}
                    alt={attachment.originalName}
                    className="max-w-[70vw] md:max-w-xs max-h-64 rounded-lg border border-dark-border hover:opacity-90 transition cursor-pointer"
                  />
                  <span className="text-xs text-dark-muted mt-1 block">{attachment.originalName} · {formatFileSize(attachment.size)}</span>
                </a>
              );
            }
            if (isText) {
              return <TextFilePreview attachment={attachment} />;
            }
            return (
              <a
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 mt-1 p-3 bg-dark-bg border border-dark-border rounded-lg hover:bg-dark-hover transition max-w-xs"
              >
                <span className="text-2xl flex-shrink-0">{isPdf ? '📄' : '📁'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-dark-text truncate">{attachment.originalName}</p>
                  <p className="text-xs text-dark-muted">{formatFileSize(attachment.size)}</p>
                </div>
                <span className="text-dark-muted text-sm flex-shrink-0">⬇</span>
              </a>
            );
          })()
        ) : (
          <div className="prose prose-invert prose-sm max-w-none break-words overflow-hidden">
            <ReactMarkdown
              remarkPlugins={[remarkGfmSafe]}
              rehypePlugins={[rehypeHighlight, rehypeAutolink]}
              components={{
                pre: ({ children }) => {
                  const textContent = (() => {
                    const extractText = (node: any): string => {
                      if (typeof node === 'string') return node;
                      if (!node) return '';
                      if (node.props?.children) {
                        return Array.isArray(node.props.children)
                          ? node.props.children.map(extractText).join('')
                          : extractText(node.props.children);
                      }
                      return '';
                    };
                    return extractText({ props: { children } });
                  })();

                  return <CodeBlockPre text={textContent}>{children}</CodeBlockPre>;
                },
                code: ({ className, children, ...props }) => {
                  const isInline = !className;
                  if (isInline) {
                    return <code className="bg-dark-bg px-1.5 py-0.5 rounded text-primary-300 text-xs" {...props}>{children}</code>;
                  }
                  return <code className={className} {...props}>{children}</code>;
                },
                table: ({ children, ...props }) => (
                  <div className="table-wrapper">
                    <table {...props}>{children}</table>
                  </div>
                ),
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
              className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-dark-border bg-dark-bg text-dark-muted hover:border-dark-muted hover:text-dark-text transition text-xs"
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

      {/* Mobile: ⋮ menu button */}
      {isMobile && !isStreaming && !message.isDeleted && (
        <button
          onClick={() => setShowActions(!showActions)}
          className="flex-shrink-0 self-start mt-1 p-1 text-dark-muted/40 hover:text-dark-muted rounded transition"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <circle cx="10" cy="4" r="1.5" />
            <circle cx="10" cy="10" r="1.5" />
            <circle cx="10" cy="16" r="1.5" />
          </svg>
        </button>
      )}

      {/* Action buttons */}
      {showActions && !isEditing && !isStreaming && (
        <div ref={actionsRef} className="absolute right-4 -top-3 flex items-center gap-0.5 bg-dark-surface border border-dark-border rounded-lg shadow-lg p-0.5 z-40">
          <button
            onClick={() => setShowReactions(!showReactions)}
            className="p-1.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded transition text-xs"
            title="React"
          >
            😀
          </button>
          <button
            onClick={() => {
              const text = message.type === 'file'
                ? (() => { try { return JSON.parse(message.content).url || message.content; } catch { return message.content; } })()
                : message.content;
              if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(text);
              } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
              }
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="p-1.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded transition text-xs"
            title="Copy"
          >
            {copied ? '✅' : '📋'}
          </button>
          {message.type !== 'file' && (
            <button
              onClick={() => {
                if (speaking) {
                  speechSynthesis.cancel();
                  setSpeaking(false);
                  return;
                }
                // Strip markdown syntax for cleaner speech
                const text = message.content
                  .replace(/```[\s\S]*?```/g, ' code block ')
                  .replace(/`([^`]+)`/g, '$1')
                  .replace(/[#*_~>\[\]()!|-]/g, '')
                  .replace(/\n+/g, '. ')
                  .trim();
                if (!text) return;
                speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US';
                utterance.onend = () => setSpeaking(false);
                utterance.onerror = () => setSpeaking(false);
                setSpeaking(true);
                speechSynthesis.speak(utterance);
              }}
              className="p-1.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded transition text-xs"
              title={speaking ? 'Stop' : 'Read aloud'}
            >
              {speaking ? '⏹️' : '🔊'}
            </button>
          )}
          <button
            onClick={() => { setReplyTo(message); setShowActions(false); setTimeout(() => document.querySelector<HTMLTextAreaElement>('.command-bar-input')?.focus(), 50); }}
            className="p-1.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded transition text-xs"
            title="Reply"
          >
            ↩️
          </button>
          <button
            onClick={handleStartThread}
            className="p-1.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded transition text-xs"
            title="Thread"
          >
            🧵
          </button>
          <button
            onClick={handlePin}
            className={clsx('p-1.5 hover:bg-dark-hover rounded transition text-xs', isPinned ? 'text-primary-400' : 'text-dark-muted hover:text-dark-text')}
            title={isPinned ? 'Unpin' : 'Pin'}
          >
            {isPinned ? '📍' : '📌'}
          </button>
          {isOwn && (
            <>
              <button
                onClick={() => { setIsEditing(true); setEditContent(message.content); }}
                className="p-1.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded transition text-xs"
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

// --- Text file preview component ---

function TextFilePreview({ attachment }: { attachment: FileAttachment }) {
  const [showPreview, setShowPreview] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const isMd = /\.md$/i.test(attachment.originalName);

  const loadPreview = () => {
    setShowPreview(true);
    if (content !== null) return;
    fetch(attachment.url)
      .then(r => r.text())
      .then(text => setContent(text.slice(0, 5000)))
      .catch(() => setContent(null));
  };

  return (
    <div className="mt-1 max-w-[70vw] md:max-w-md border border-dark-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-bg">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm">📄</span>
          <span className="text-xs text-dark-text font-medium truncate">{attachment.originalName}</span>
          <span className="text-[10px] text-dark-muted flex-shrink-0">{formatFileSize(attachment.size)}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <button
            onClick={() => showPreview ? setShowPreview(false) : loadPreview()}
            className="text-[10px] text-primary-400 hover:text-primary-300 transition"
          >
            {showPreview ? '收起' : '预览'}
          </button>
          <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-400 hover:text-primary-300">⬇</a>
        </div>
      </div>
      {/* Preview content */}
      {showPreview && (
        <>
          <div className="border-t border-dark-border">
            {content === null ? (
              <div className="px-3 py-4 text-xs text-dark-muted animate-pulse">Loading...</div>
            ) : (
              <div className={clsx('overflow-hidden transition-all', expanded ? 'max-h-[600px]' : 'max-h-48')}>
                <div className="px-3 py-2 overflow-y-auto" style={{ maxHeight: expanded ? '600px' : '192px' }}>
                  {isMd ? (
                    <div className="prose prose-invert prose-xs max-w-none text-xs">
                      <ReactMarkdown>{content}</ReactMarkdown>
                    </div>
                  ) : (
                    <pre className="text-xs text-dark-text whitespace-pre-wrap break-words font-mono leading-relaxed">{content}</pre>
                  )}
                </div>
              </div>
            )}
          </div>
          {content && content.length > 500 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full px-3 py-1.5 text-[10px] text-dark-muted hover:text-dark-text bg-dark-bg border-t border-dark-border transition"
            >
              {expanded ? '▴ 收起' : '▾ 展开全部'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
