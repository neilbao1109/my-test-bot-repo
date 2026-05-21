import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useT } from '../../hooks/useT';
import { useAppStore } from '../../stores/appStore';
import UserAvatar from '../UserAvatar';
import { formatDistanceToNow } from 'date-fns';
import type { Message } from '../../types';

type ActionType = 'react' | 'copy' | 'reply' | 'thread' | 'pin' | 'edit' | 'delete' | 'forward' | 'speak';

interface MessageActionOverlayProps {
  message: Message;
  senderName: string;
  isBot: boolean;
  isOwnMessage: boolean;
  isPinned: boolean;
  copied: boolean;
  speaking: boolean;
  onClose: () => void;
  onAction: (action: ActionType) => void;
}

export default function MessageActionOverlay({
  message,
  senderName,
  isBot,
  isOwnMessage,
  isPinned,
  copied,
  speaking,
  onClose,
  onAction,
}: MessageActionOverlayProps) {
  const t = useT();
  const { tts: ttsEnabled } = useAppStore(s => s.capabilities);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 150);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleClose]);

  const handleAction = (action: ActionType) => {
    onAction(action);
    if (action !== 'react') {
      handleClose();
    }
  };

  // Truncate content for preview
  const previewContent = (() => {
    if (message.type === 'file') {
      try {
        const att = JSON.parse(message.content);
        return att.originalName || '[file]';
      } catch {
        return '[file]';
      }
    }
    const text = message.content;
    const lines = text.split('\n').slice(0, 3);
    const joined = lines.join('\n');
    return joined.length > 200 ? joined.slice(0, 200) + '…' : joined + (text.split('\n').length > 3 ? '…' : '');
  })();

  const isFileImage = (() => {
    if (message.type !== 'file') return null;
    try {
      const att = JSON.parse(message.content);
      if (att.mimeType?.startsWith('image/')) return att;
    } catch {}
    return null;
  })();

  return createPortal(
    <div
      className={clsx(
        'fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-150',
        visible ? 'opacity-100' : 'opacity-0'
      )}
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Card */}
      <div
        className={clsx(
          'relative w-[calc(100vw-32px)] max-w-sm bg-dark-surface border border-dark-border rounded-2xl shadow-2xl transition-all duration-200',
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Message preview */}
        <div className="p-4 border-b border-dark-border">
          <div className="flex items-center gap-2 mb-2">
            <UserAvatar username={senderName} isBot={isBot} size="sm" />
            <span className={clsx('text-sm font-semibold', isBot ? 'text-primary-400' : 'text-dark-text')}>
              {senderName}
            </span>
            {isBot && (
              <span className="text-[10px] px-1.5 py-0.5 bg-primary-600/20 text-primary-400 rounded font-medium">
                BOT
              </span>
            )}
            <span className="text-xs text-dark-muted ml-auto">
              {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
            </span>
          </div>
          {isFileImage ? (
            <img
              src={isFileImage.url}
              alt={isFileImage.originalName}
              className="max-h-32 rounded-lg border border-dark-border"
            />
          ) : (
            <p className="text-sm text-dark-muted line-clamp-3 whitespace-pre-wrap break-words">
              {previewContent}
            </p>
          )}
        </div>

        {/* Action menu */}
        <div className="p-2">
          {/* Primary group */}
          <button
            onClick={() => handleAction('react')}
            className="w-full flex items-center gap-3 px-3 py-3 md:py-2.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-xl transition text-sm"
          >
            <span className="text-base w-5 text-center">😀</span>
            <span>{t('message.react')}</span>
          </button>
          <button
            onClick={() => handleAction('copy')}
            className="w-full flex items-center gap-3 px-3 py-3 md:py-2.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-xl transition text-sm"
          >
            <span className="text-base w-5 text-center">{copied ? '✅' : '📋'}</span>
            <span>{t('message.copy')}</span>
          </button>
          <button
            onClick={() => handleAction('reply')}
            className="w-full flex items-center gap-3 px-3 py-3 md:py-2.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-xl transition text-sm"
          >
            <span className="text-base w-5 text-center">↩️</span>
            <span>{t('message.reply')}</span>
          </button>

          {/* Divider */}
          <div className="h-px bg-dark-border mx-2 my-1" />

          {/* Extended group */}
          <button
            onClick={() => handleAction('thread')}
            className="w-full flex items-center gap-3 px-3 py-3 md:py-2.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-xl transition text-sm"
          >
            <span className="text-base w-5 text-center">🧵</span>
            <span>{t('message.thread')}</span>
          </button>
          <button
            onClick={() => handleAction('pin')}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-3 md:py-2.5 hover:bg-dark-hover rounded-xl transition text-sm',
              isPinned ? 'text-primary-400' : 'text-dark-muted hover:text-dark-text'
            )}
          >
            <span className="text-base w-5 text-center">{isPinned ? '📍' : '📌'}</span>
            <span>{isPinned ? t('message.unpin') : t('message.pin')}</span>
          </button>
          <button
            onClick={() => handleAction('forward')}
            className="w-full flex items-center gap-3 px-3 py-3 md:py-2.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-xl transition text-sm"
          >
            <span className="text-base w-5 text-center">↗️</span>
            <span>{t('message.forward')}</span>
          </button>
          {message.type !== 'file' && ttsEnabled && (
            <button
              onClick={() => handleAction('speak')}
              className="w-full flex items-center gap-3 px-3 py-3 md:py-2.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-xl transition text-sm"
            >
              <span className="text-base w-5 text-center">{speaking ? '⏹️' : '🔊'}</span>
              <span>{speaking ? t('message.stop') : t('message.read')}</span>
            </button>
          )}

          {isOwnMessage && (
            <>
              <div className="h-px bg-dark-border mx-2 my-1" />
              <button
                onClick={() => handleAction('edit')}
                className="w-full flex items-center gap-3 px-3 py-3 md:py-2.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-xl transition text-sm"
              >
                <span className="text-base w-5 text-center">✏️</span>
                <span>{t('message.edit')}</span>
              </button>
              <button
                onClick={() => handleAction('delete')}
                className="w-full flex items-center gap-3 px-3 py-3 md:py-2.5 text-red-400 hover:bg-dark-hover rounded-xl transition text-sm"
              >
                <span className="text-base w-5 text-center">🗑️</span>
                <span>{t('message.delete')}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
