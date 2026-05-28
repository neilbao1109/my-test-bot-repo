import { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import { useT } from '../../hooks/useT';
import type { Thread, Message } from '../../types';

const EMPTY_THREADS: Thread[] = [];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ThreadListPanel() {
  const showThreadList = useAppStore((s) => s.showThreadList);
  const setShowThreadList = useAppStore((s) => s.setShowThreadList);
  const activeRoomId = useAppStore((s) => s.activeRoomId);
  const threads = useAppStore((s) => (s.activeRoomId ? s.roomThreads[s.activeRoomId] : undefined) ?? EMPTY_THREADS);
  const messages = useAppStore((s) => s.activeRoomId ? s.messages[s.activeRoomId] : undefined);
  const setActiveThread = useAppStore((s) => s.setActiveThread);
  const t = useT();

  const [parentMessages, setParentMessages] = useState<Record<string, Message>>({});

  const sortedThreads = useMemo(
    () => [...threads].sort((a, b) => new Date(b.lastReplyAt).getTime() - new Date(a.lastReplyAt).getTime()),
    [threads]
  );

  // Fetch parent messages that aren't in the current message list
  useEffect(() => {
    if (!showThreadList || sortedThreads.length === 0) return;

    const loadedMsgMap: Record<string, Message> = {};
    for (const msg of messages || []) {
      loadedMsgMap[msg.id] = msg;
    }

    const missingIds = sortedThreads
      .map((th) => th.parentMessageId)
      .filter((id) => !loadedMsgMap[id] && !parentMessages[id]);

    if (missingIds.length === 0) return;

    socketService.getThreadParents(missingIds).then((res) => {
      const map: Record<string, Message> = {};
      for (const msg of res.messages) {
        map[msg.id] = msg;
      }
      setParentMessages((prev) => ({ ...prev, ...map }));
    });
  }, [showThreadList, sortedThreads, messages]);

  if (!showThreadList || !activeRoomId) return null;

  const getParentPreview = (parentMessageId: string): string => {
    // Check current room messages first
    const roomMsg = (messages || []).find((m) => m.id === parentMessageId);
    if (roomMsg) return roomMsg.content.slice(0, 80) || 'Message';
    // Check fetched parents
    const fetched = parentMessages[parentMessageId];
    if (fetched) return fetched.content.slice(0, 80) || 'Message';
    return 'Message';
  };

  const handleThreadClick = (thread: Thread) => {
    setActiveThread(thread);
    setShowThreadList(false);
    // Load thread messages
    socketService.getSocket()?.emit('thread:messages', { threadId: thread.id, roomId: thread.roomId }, (msgs: Message[]) => {
      useAppStore.getState().setThreadMessages(msgs);
    });
  };

  return (
    <div className="fixed inset-0 z-30 w-full bg-dark-surface flex flex-col h-full md:static md:inset-auto md:z-auto md:w-64 md:border-l md:border-dark-border" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-dark-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          <h3 className="font-semibold text-dark-text text-sm">{t('chat.threads')}</h3>
        </div>
        <button
          onClick={() => setShowThreadList(false)}
          className="text-dark-muted hover:text-dark-text p-1 rounded transition"
        >
          ✕
        </button>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto">
        {sortedThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-dark-muted">
            <svg className="w-10 h-10 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <p className="text-sm">{t('thread.noThreads')}</p>
          </div>
        ) : (
          sortedThreads.map((thread) => {
            const preview = getParentPreview(thread.parentMessageId);
            return (
              <button
                key={thread.id}
                onClick={() => handleThreadClick(thread)}
                className="w-full text-left px-4 py-3 hover:bg-dark-hover transition border-b border-dark-border/50"
              >
                <p className="text-sm text-dark-text truncate">{preview}</p>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-dark-muted">
                  <span>{t('thread.repliesCount', { count: thread.replyCount })}</span>
                  <span>·</span>
                  <span>{t('thread.lastReply')} {relativeTime(thread.lastReplyAt)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
