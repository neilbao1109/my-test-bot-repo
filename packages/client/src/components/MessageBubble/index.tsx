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
import FilePreviewModal from '../FilePreviewModal';

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
  const { user, roomMembers, activeRoomId, threadInfo, setReplyContext, addReplyContext, removeReplyContext, contextSelectionMode: ctxSelectMode, replyContext, messages: allMessages } = useAppStore();
  const isPinned = useAppStore((s) => activeRoomId ? (s.pinnedMessages[activeRoomId] || []).some((p) => p.messageId === message.id) : false);
  const selectionMode = useAppStore((s) => s.selectionMode);
  const isSelected = useAppStore((s) => s.selectedMessages.has(message.id));
  const toggleMessageSelection = useAppStore((s) => s.toggleMessageSelection);
  const isCtxSelected = ctxSelectMode && replyContext.some(m => m.id === message.id);
  const [showActions, setShowActions] = useState(false);
  const [showHoverDots, setShowHoverDots] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<FileAttachment | null>(null);
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

  // Close reaction picker / actions on outside click
  useEffect(() => {
    if (!showReactions && !showActions) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (reactionRef.current && !reactionRef.current.contains(e.target as Node)) {
        setShowReactions(false);
      }
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
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
        selectionMode && isSelected && 'bg-primary-600/15',
        isCtxSelected && 'bg-primary-500/15',
      )}
      onClick={ctxSelectMode ? (e) => { e.stopPropagation(); if (isCtxSelected) { removeReplyContext(message.id); } else if (replyContext.length < 5) { addReplyContext(message); } } : selectionMode ? (e) => { e.stopPropagation(); toggleMessageSelection(message.id); } : undefined}
      onMouseEnter={() => !isMobile && !selectionMode && setShowHoverDots(true)}
      onMouseLeave={() => { if (!isMobile) { setShowHoverDots(false); setShowActions(false); setShowReactions(false); } }}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <div className="flex-shrink-0 flex items-center pt-1">
          <div className={clsx(
            'w-5 h-5 rounded border-2 flex items-center justify-center transition cursor-pointer',
            isSelected ? 'bg-primary-500 border-primary-500 text-white' : 'border-dark-muted'
          )}>
            {isSelected && <span className="text-xs">✓</span>}
          </div>
        </div>
      )}
      {/* Context selection checkbox */}
      {ctxSelectMode && (
        <div className="flex-shrink-0 flex items-center pt-1 cursor-pointer">
          <div className={clsx(
            'w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition',
            isCtxSelected ? 'bg-primary-500 border-primary-500 text-white' : 'border-dark-muted'
          )}>
            {isCtxSelected && (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      )}
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

        {/* Reply quote blocks (multi-context or single replyTo) */}
        {(() => {
          const roomMsgs = activeRoomId ? allMessages[activeRoomId] || [] : [];
          const contextIds = message.contextIds && message.contextIds.length > 0 ? message.contextIds : (message.replyTo ? [message.replyTo] : []);
          if (contextIds.length === 0) return null;
          return (
            <div className="space-y-0.5">
              {contextIds.map(cid => {
                const quoted = roomMsgs.find(m => m.id === cid);
                if (!quoted) return null;
                const quotedSender = members.find(m => m.id === quoted.userId);
                return (
                  <button
                    key={cid}
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
                      {quoted.content.length > 80 ? quoted.content.slice(0, 80) + '...' : quoted.content}
                    </p>
                  </button>
                );
              })}
            </div>
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
                <div className="block mt-1 cursor-pointer" onClick={() => setPreviewAttachment(attachment)}>
                  <img
                    src={attachment.url}
                    alt={attachment.originalName}
                    className="max-w-[70vw] md:max-w-xs max-h-64 rounded-lg border border-dark-border hover:opacity-90 transition"
                  />
                  <span className="text-xs text-dark-muted mt-1 block">{attachment.originalName} · {formatFileSize(attachment.size)}</span>
                </div>
              );
            }
            return (
              <div
                onClick={() => setPreviewAttachment(attachment)}
                className="flex items-center gap-3 mt-1 p-3 bg-dark-bg border border-dark-border rounded-lg hover:bg-dark-hover transition max-w-xs cursor-pointer"
              >
                <span className="text-2xl flex-shrink-0">{isText ? '📄' : isPdf ? '📄' : '📁'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-dark-text truncate">{attachment.originalName}</p>
                  <p className="text-xs text-dark-muted">{formatFileSize(attachment.size)}</p>
                </div>
                <span className="text-primary-400 text-xs flex-shrink-0">预览</span>
              </div>
            );
          })() 
        ) : message.type === 'forward' ? (
          (() => {
            let fwd: { sourceRoom?: string; messages?: Array<{ username: string; content: string; createdAt: string }> } | null = null;
            try { fwd = JSON.parse(displayContent); } catch {}
            if (!fwd?.messages?.length) return <p className="text-sm text-dark-muted italic">Invalid forward</p>;
            return (
              <div className="bg-dark-hover/30 border border-dark-border rounded-lg overflow-hidden mt-1 max-w-md">
                <div className="px-3 py-2 border-b border-dark-border bg-dark-bg/50 flex items-center gap-2">
                  <span className="text-sm">📨</span>
                  <span className="text-xs text-dark-muted">聊天记录来自 #{fwd.sourceRoom || 'unknown'} ({fwd.messages.length}条)</span>
                </div>
                <div className="px-3 py-2 space-y-1.5 max-h-48 overflow-y-auto">
                  {fwd.messages.map((m, i) => (
                    <div key={i}>
                      <span className="text-xs font-semibold text-primary-400">{m.username}</span>
                      <p className="text-xs text-dark-text">{m.content.length > 200 ? m.content.slice(0, 200) + '…' : m.content}</p>
                    </div>
                  ))}
                </div>
              </div>
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
            <span className="text-dark-muted">- View thread</span>
          </button>
        )}
      </div>

      {/* ⋮ menu button - mobile always, desktop on hover */}
      {(isMobile || showHoverDots || showActions) && !isStreaming && !message.isDeleted && (
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
        <div ref={actionsRef} className="absolute right-4 -top-3 grid grid-cols-3 gap-1 bg-dark-surface border border-dark-border rounded-xl shadow-lg p-1.5 z-40 min-w-[210px]">
          <button
            onClick={() => setShowReactions(!showReactions)}
            className="flex items-center gap-1.5 px-2 py-2 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-lg transition text-xs"
          >
            <span className="text-sm w-4 text-center flex-shrink-0">😀</span><span>React</span>
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
            className="flex items-center gap-1.5 px-2 py-2 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-lg transition text-xs"
          >
            <span className="text-sm w-4 text-center flex-shrink-0">{copied ? '✅' : '📋'}</span><span>Copy</span>
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
              className="flex items-center gap-1.5 px-2 py-2 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-lg transition text-xs"
            >
              <span className="text-sm w-4 text-center flex-shrink-0">{speaking ? '⏹️' : '🔊'}</span><span>{speaking ? 'Stop' : 'Read'}</span>
            </button>
          )}
          <button
            onClick={() => { setReplyContext([message]); setShowActions(false); setTimeout(() => document.querySelector<HTMLTextAreaElement>('.command-bar-input')?.focus(), 50); }}
            className="flex items-center gap-1.5 px-2 py-2 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-lg transition text-xs"
          >
            <span className="text-sm w-4 text-center flex-shrink-0">↩️</span><span>Reply</span>
          </button>
          <button
            onClick={handleStartThread}
            className="flex items-center gap-1.5 px-2 py-2 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-lg transition text-xs"
          >
            <span className="text-sm w-4 text-center flex-shrink-0">🧵</span><span>Thread</span>
          </button>
          <button
            onClick={handlePin}
            className={clsx('flex items-center gap-1.5 px-2 py-2 hover:bg-dark-hover rounded-lg transition text-xs', isPinned ? 'text-primary-400' : 'text-dark-muted hover:text-dark-text')}
          >
            <span className="text-sm w-4 text-center flex-shrink-0">{isPinned ? '📍' : '📌'}</span><span>{isPinned ? 'Unpin' : 'Pin'}</span>
          </button>
          <button
            onClick={() => { useAppStore.getState().toggleSelectionMode(); useAppStore.getState().toggleMessageSelection(message.id); }}
            className="flex items-center gap-1.5 px-2 py-2 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-lg transition text-xs"
          >
            <span className="text-sm w-4 text-center flex-shrink-0">↗️</span><span>Forward</span>
          </button>
          {isOwn && (
            <>
              <div className="col-span-3 h-px bg-dark-border mx-0.5 my-0.5" />
              <button
                onClick={() => { setIsEditing(true); setEditContent(message.content); }}
                className="flex items-center gap-1.5 px-2 py-2 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-lg transition text-xs"
              >
                <span className="text-sm w-4 text-center flex-shrink-0">✏️</span><span>Edit</span>
              </button>
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-2 py-2 text-dark-muted hover:text-red-400 hover:bg-dark-hover rounded-lg transition text-xs"
              >
                <span className="text-sm w-4 text-center flex-shrink-0">🗑️</span><span>Delete</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Reaction picker - positioned relative to parent */}
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
      {previewAttachment && (
        <FilePreviewModal
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </div>
  );
}
