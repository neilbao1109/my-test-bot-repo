import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import BotShareModal from '../BotShareModal';
import './BotRegistration.css';

export default function BotRegistration() {
  const { showBotRegistration, setShowBotRegistration } = useAppStore();
  const [tab, setTab] = useState<'register' | 'my-bots'>('register');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [agentId, setAgentId] = useState('');
  const [sshHost, setSshHost] = useState('');
  const [trigger, setTrigger] = useState<'all' | 'mention' | 'room-member'>('all');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');
  const [myBots, setMyBots] = useState<any[]>([]);
  const [shareBot, setShareBot] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (showBotRegistration && tab === 'my-bots') {
      loadMyBots();
    }
  }, [showBotRegistration, tab]);

  const loadMyBots = async () => {
    const result = await socketService.listAvailableBots();
    setMyBots(result.bots || []);
  };

  if (!showBotRegistration) return null;

  const resetForm = () => {
    setUsername(''); setAvatarUrl(''); setGatewayUrl(''); setAuthToken('');
    setAgentId(''); setSshHost(''); setTrigger('all');
    setTestStatus('idle'); setTestMessage(''); setError('');
  };

  const handleClose = () => {
    resetForm();
    setShowBotRegistration(false);
  };

  const handleTest = async () => {
    if (!authToken.trim()) return;
    setTestStatus('testing');
    setTestMessage('');
    try {
      const result = await socketService.testBotConnection({
        gatewayUrl: gatewayUrl.trim() || undefined,
        authToken: authToken.trim(),
        agentId: agentId.trim() || undefined,
        sshHost: sshHost.trim() || undefined,
      });
      if (result.ok) {
        setTestStatus('success');
        setTestMessage(result.model ? `Connected (${result.model})` : 'Connected');
      } else {
        setTestStatus('error');
        setTestMessage(result.error || 'Connection failed');
      }
    } catch {
      setTestStatus('error');
      setTestMessage('Connection test failed');
    }
  };

  const handleRegister = async () => {
    if (!username.trim() || !authToken.trim() || testStatus !== 'success') return;
    setRegistering(true);
    setError('');
    try {
      const result = await socketService.registerBot({
        username: username.trim(),
        avatarUrl: avatarUrl.trim() || undefined,
        gatewayUrl: gatewayUrl.trim() || undefined,
        authToken: authToken.trim(),
        agentId: agentId.trim() || undefined,
        sshHost: sshHost.trim() || undefined,
        trigger,
      });
      if (result.error) {
        setError(result.error);
      } else {
        handleClose();
      }
    } catch {
      setError('Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <h2 className="text-lg font-semibold text-dark-text">🤖 Bots</h2>
          <button onClick={handleClose} className="text-dark-muted hover:text-dark-text p-1 rounded transition">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-dark-border">
          <button onClick={() => setTab('register')} className={`flex-1 py-2 text-sm font-medium transition ${tab === 'register' ? 'text-primary-400 border-b-2 border-primary-400' : 'text-dark-muted hover:text-dark-text'}`}>Register</button>
          <button onClick={() => setTab('my-bots')} className={`flex-1 py-2 text-sm font-medium transition ${tab === 'my-bots' ? 'text-primary-400 border-b-2 border-primary-400' : 'text-dark-muted hover:text-dark-text'}`}>My Bots</button>
        </div>

        {tab === 'my-bots' ? (
          <div className="p-5 space-y-2">
            {myBots.length === 0 ? (
              <p className="text-sm text-dark-muted text-center py-4">No bots yet</p>
            ) : myBots.map(bot => (
              <div key={bot.id} className="flex items-center justify-between px-3 py-2.5 bg-dark-bg rounded-lg border border-dark-border">
                <div>
                  <p className="text-sm font-medium text-dark-text">{bot.username}</p>
                  <p className="text-xs text-dark-muted">{bot.trigger}</p>
                </div>
                <button onClick={() => setShareBot({ id: bot.id, name: bot.username })}
                  className="text-xs px-3 py-1 bg-dark-hover text-dark-text rounded hover:bg-dark-border transition">
                  🔗 Share
                </button>
              </div>
            ))}
          </div>
        ) : (
        <>

        <div className="p-5 space-y-3">
          {/* Bot Name */}
          <div>
            <label className="block text-xs text-dark-muted mb-1">Bot Name *</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="My Bot"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </div>

          {/* Avatar URL */}
          <div>
            <label className="block text-xs text-dark-muted mb-1">Avatar URL</label>
            <input type="text" value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://..."
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </div>

          {/* Gateway URL */}
          <div>
            <label className="block text-xs text-dark-muted mb-1">Gateway URL</label>
            <input type="text" value={gatewayUrl} onChange={e => setGatewayUrl(e.target.value)} placeholder="ws://127.0.0.1:18789"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </div>

          {/* Auth Token */}
          <div>
            <label className="block text-xs text-dark-muted mb-1">Auth Token *</label>
            <input type="password" value={authToken} onChange={e => { setAuthToken(e.target.value); setTestStatus('idle'); }} placeholder="Bearer token"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </div>

          {/* Agent ID */}
          <div>
            <label className="block text-xs text-dark-muted mb-1">Agent ID</label>
            <input type="text" value={agentId} onChange={e => setAgentId(e.target.value)} placeholder="Optional"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </div>

          {/* SSH Host */}
          <div>
            <label className="block text-xs text-dark-muted mb-1">SSH Host</label>
            <input type="text" value={sshHost} onChange={e => setSshHost(e.target.value)} placeholder="user@host (optional)"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500" />
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-xs text-dark-muted mb-1">Trigger</label>
            <select value={trigger} onChange={e => setTrigger(e.target.value as any)}
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text focus:outline-none focus:ring-1 focus:ring-primary-500">
              <option value="all">All messages</option>
              <option value="mention">@mention only</option>
              <option value="room-member">Room member</option>
            </select>
          </div>

          {/* Test Connection */}
          <div className="flex items-center gap-2">
            <button onClick={handleTest} disabled={!authToken.trim() || testStatus === 'testing'}
              className="px-4 py-2 text-sm font-medium text-white bg-dark-hover rounded-lg hover:bg-dark-border disabled:opacity-50 transition">
              {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            {testStatus === 'success' && <span className="text-xs text-green-400">✓ {testMessage}</span>}
            {testStatus === 'error' && <span className="text-xs text-red-400">✕ {testMessage}</span>}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-dark-border">
          <button onClick={handleClose} className="px-4 py-2 text-sm text-dark-muted hover:text-dark-text rounded-lg hover:bg-dark-hover transition">Cancel</button>
          <button onClick={handleRegister} disabled={!username.trim() || !authToken.trim() || testStatus !== 'success' || registering}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition">
            {registering ? 'Registering...' : 'Register'}
          </button>
        </div>
        </>)}
      </div>
      {shareBot && <BotShareModal botId={shareBot.id} botName={shareBot.name} onClose={() => setShareBot(null)} />}
    </div>
  );
}
