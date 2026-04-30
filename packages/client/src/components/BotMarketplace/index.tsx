import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';

export default function BotMarketplace() {
  const { showBotMarketplace, setShowBotMarketplace } = useAppStore();
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [addedBots, setAddedBots] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (showBotMarketplace) {
      loadBots();
    }
  }, [showBotMarketplace]);

  const loadBots = async () => {
    setLoading(true);
    const result = await socketService.getMarketplaceBots();
    setBots(result.bots || []);
    setLoading(false);
  };

  const handleAdd = async (botId: string) => {
    const result = await socketService.addMarketplaceBot(botId);
    if (result.success) {
      setAddedBots(prev => new Set(prev).add(botId));
    }
  };

  if (!showBotMarketplace) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <h2 className="text-lg font-semibold text-dark-text">🏪 Bot Marketplace</h2>
          <button onClick={() => setShowBotMarketplace(false)} className="text-dark-muted hover:text-dark-text p-1 rounded transition">✕</button>
        </div>

        <div className="p-5">
          {loading ? (
            <p className="text-sm text-dark-muted text-center py-8">Loading...</p>
          ) : bots.length === 0 ? (
            <p className="text-sm text-dark-muted text-center py-8">No public bots available yet.</p>
          ) : (
            <div className="space-y-3">
              {bots.map(bot => (
                <div key={bot.id} className="flex items-center justify-between px-4 py-3 bg-dark-bg rounded-lg border border-dark-border">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{bot.avatarUrl ? '🤖' : '🤖'}</span>
                    <div>
                      <p className="text-sm font-medium text-dark-text">{bot.username}</p>
                      <p className="text-xs text-dark-muted">Trigger: {bot.trigger}</p>
                    </div>
                  </div>
                  {addedBots.has(bot.id) ? (
                    <span className="text-xs text-green-400 px-3 py-1">✓ Added</span>
                  ) : (
                    <button onClick={() => handleAdd(bot.id)}
                      className="text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition">
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
