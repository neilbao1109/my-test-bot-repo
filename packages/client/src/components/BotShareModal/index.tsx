import { useState, useEffect, useMemo } from 'react';
import { socketService } from '../../services/socket';
import { useT } from '../../hooks/useT';
import { useAppStore } from '../../stores/appStore';
import type { User } from '../../types';

interface BotShareModalProps {
  botId: string;
  botName: string;
  onClose: () => void;
}

export default function BotShareModal({ botId, botName, onClose }: BotShareModalProps) {
  const friends = useAppStore(s => s.friends);
  const [shares, setShares] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterQuery, setFilterQuery] = useState('');
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState('');
  const t = useT();

  useEffect(() => {
    loadShares();
    // Load friends if not already loaded
    socketService.getFriends().then(res => {
      useAppStore.getState().setFriends(res.friends);
    });
  }, [botId]);

  const loadShares = async () => {
    const result = await socketService.getBotShares(botId);
    setShares(result.shares || []);
  };

  const sharedUserIds = useMemo(() => new Set(shares.map(s => s.sharedTo)), [shares]);

  const availableFriends = useMemo(() => {
    const filtered = friends.filter(f => !sharedUserIds.has(f.id));
    if (!filterQuery.trim()) return filtered;
    const q = filterQuery.toLowerCase();
    return filtered.filter(f => f.username.toLowerCase().includes(q));
  }, [friends, sharedUserIds, filterQuery]);

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleShare = async () => {
    if (selectedIds.size === 0 || sharing) return;
    setSharing(true);
    setMessage('');
    let successCount = 0;
    for (const userId of selectedIds) {
      const result = await socketService.shareBot(botId, userId);
      if (!result.error) successCount++;
    }
    setMessage(t('botShare.shareSuccess', { count: successCount }));
    setSelectedIds(new Set());
    loadShares();
    setSharing(false);
  };

  const handleRevoke = async (shareId: string) => {
    const result = await socketService.revokeBotShare(shareId);
    if (result.success) {
      loadShares();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <h2 className="text-lg font-semibold text-dark-text">{t('botShare.title', { name: botName })}</h2>
          <button onClick={onClose} className="text-dark-muted hover:text-dark-text p-1 rounded transition">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Filter */}
          <input
            type="text"
            value={filterQuery}
            onChange={e => setFilterQuery(e.target.value)}
            placeholder={t('botShare.searchPlaceholder')}
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
          />

          {/* Friend list */}
          <div className="max-h-44 overflow-y-auto border border-dark-border rounded-lg">
            {availableFriends.length === 0 ? (
              <p className="text-xs text-dark-muted text-center py-4">
                {friends.length === 0 ? t('botShare.noFriends') : t('botShare.allShared')}
              </p>
            ) : (
              availableFriends.map(f => {
                const isSelected = selectedIds.has(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleSelected(f.id)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-dark-hover transition ${
                      isSelected ? 'bg-primary-600/10' : ''
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${
                      isSelected ? 'bg-primary-600 border-primary-600 text-white' : 'border-dark-muted'
                    }`}>{isSelected && '✓'}</span>
                    <span className="w-6 h-6 rounded-full bg-dark-hover flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {f.username.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-dark-text">{f.username}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Share button */}
          {availableFriends.length > 0 && (
            <button
              onClick={handleShare}
              disabled={selectedIds.size === 0 || sharing}
              className="w-full py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {sharing ? t('botShare.sharing') : t('botShare.share', { count: selectedIds.size })}
            </button>
          )}

          {message && <p className="text-xs text-primary-400 text-center">{message}</p>}

          {/* Current shares */}
          {shares.length > 0 && (
            <div>
              <h3 className="text-xs text-dark-muted mb-2 uppercase tracking-wide">{t('botShare.sharedSection')}</h3>
              <div className="space-y-1">
                {shares.map(share => (
                  <div key={share.id} className="flex items-center justify-between px-3 py-2 bg-dark-bg rounded-lg">
                    <div>
                      <span className="text-sm text-dark-text">{share.sharedToName}</span>
                      <span className="text-xs text-dark-muted ml-2">({share.status === 'accepted' ? t('botShare.statusAccepted') : share.status === 'pending' ? t('botShare.statusPending') : share.status})</span>
                    </div>
                    <button onClick={() => handleRevoke(share.id)}
                      className="text-xs px-2 py-1 text-red-400 hover:bg-red-400/10 rounded transition">
                      {t('botShare.revoke')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
