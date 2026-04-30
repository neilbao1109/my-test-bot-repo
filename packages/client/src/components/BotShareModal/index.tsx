import { useState, useEffect } from 'react';
import { socketService } from '../../services/socket';

interface BotShareModalProps {
  botId: string;
  botName: string;
  onClose: () => void;
}

export default function BotShareModal({ botId, botName, onClose }: BotShareModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [shares, setShares] = useState<any[]>([]);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadShares();
  }, [botId]);

  const loadShares = async () => {
    const result = await socketService.getBotShares(botId);
    setShares(result.shares || []);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) { setSearchResults([]); return; }
    const users = await socketService.searchUsers(query.trim());
    setSearchResults(users);
  };

  const handleShare = async (userId: string) => {
    setSharing(true);
    setMessage('');
    const result = await socketService.shareBot(botId, userId);
    if (result.error) {
      setMessage(result.error);
    } else {
      setMessage('Shared successfully!');
      setSearchQuery('');
      setSearchResults([]);
      loadShares();
    }
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
          <h2 className="text-lg font-semibold text-dark-text">🔗 Share "{botName}"</h2>
          <button onClick={onClose} className="text-dark-muted hover:text-dark-text p-1 rounded transition">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Search users */}
          <div>
            <label className="block text-xs text-dark-muted mb-1">Search user to share with</label>
            <input
              type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)}
              placeholder="Type username..."
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {searchResults.map(user => (
                <div key={user.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-dark-hover">
                  <span className="text-sm text-dark-text">{user.username}</span>
                  <button onClick={() => handleShare(user.id)} disabled={sharing}
                    className="text-xs px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-500 disabled:opacity-50 transition">
                    Share
                  </button>
                </div>
              ))}
            </div>
          )}

          {message && <p className="text-xs text-dark-muted">{message}</p>}

          {/* Current shares */}
          {shares.length > 0 && (
            <div>
              <h3 className="text-xs text-dark-muted mb-2 uppercase tracking-wide">Current Shares</h3>
              <div className="space-y-1">
                {shares.map(share => (
                  <div key={share.id} className="flex items-center justify-between px-3 py-2 bg-dark-bg rounded-lg">
                    <div>
                      <span className="text-sm text-dark-text">{share.sharedToName}</span>
                      <span className="text-xs text-dark-muted ml-2">({share.status})</span>
                    </div>
                    <button onClick={() => handleRevoke(share.id)}
                      className="text-xs px-2 py-1 text-red-400 hover:bg-red-400/10 rounded transition">
                      Revoke
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
