import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import BotShareModal from '../BotShareModal';
import './BotRegistration.css';

export default function BotRegistration() {
  const { showBotRegistration, setShowBotRegistration } = useAppStore();
  const [tab, setTab] = useState<'register' | 'my-bots'>('register');

  // Step flow
  const [step, setStep] = useState<'connect' | 'pending' | 'info'>('connect');
  const [connectMode, setConnectMode] = useState<'pair' | 'token'>('pair');

  // Pair mode state
  const [setupCode, setSetupCode] = useState('');
  const [pairId, setPairId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [pairGatewayUrl, setPairGatewayUrl] = useState('');
  const [pairDeviceToken, setPairDeviceToken] = useState('');
  const [pairError, setPairError] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Token mode state
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [sshHost, setSshHost] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  // Info step state
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [trigger, setTrigger] = useState<'all' | 'mention' | 'room-member'>('all');
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');

  // My bots
  const [myBots, setMyBots] = useState<any[]>([]);
  const [shareBot, setShareBot] = useState<{ id: string; name: string } | null>(null);

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (showBotRegistration && tab === 'my-bots') {
      loadMyBots();
    }
  }, [showBotRegistration, tab]);

  // Poll pair status
  useEffect(() => {
    if (step === 'pending' && pairId) {
      pollRef.current = setInterval(async () => {
        const result = await socketService.pairStatus(pairId);
        if (result.ok && result.status === 'approved') {
          if (pollRef.current) clearInterval(pollRef.current);
          setPairDeviceToken(result.deviceToken || '');
          if (result.gatewayUrl) setPairGatewayUrl(result.gatewayUrl);
          setStep('info');
        }
      }, 5000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [step, pairId]);

  const loadMyBots = async () => {
    const result = await socketService.listAvailableBots();
    setMyBots(result.bots || []);
  };

  if (!showBotRegistration) return null;

  const resetForm = () => {
    setStep('connect'); setConnectMode('pair');
    setSetupCode(''); setPairId(''); setDeviceId('');
    setPairGatewayUrl(''); setPairDeviceToken(''); setPairError('');
    setConnecting(false);
    setGatewayUrl(''); setAuthToken(''); setSshHost('');
    setTestStatus('idle'); setTestMessage('');
    setUsername(''); setAvatarUrl(''); setTrigger('all');
    setRegistering(false); setError('');
  };

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    resetForm();
    setShowBotRegistration(false);
  };

  const handlePairConnect = async () => {
    if (!setupCode.trim()) return;
    setConnecting(true);
    setPairError('');
    try {
      const result = await socketService.pairConnect(setupCode.trim(), pairGatewayUrl.trim() || undefined);
      if (result.ok) {
        setPairId(result.pairId || '');
        setDeviceId(result.deviceId || '');
        setPairGatewayUrl(result.gatewayUrl || '');
        setStep('pending');
      } else {
        setPairError(result.error || 'Connection failed');
      }
    } catch {
      setPairError('Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleTokenTest = async () => {
    if (!authToken.trim()) return;
    setTestStatus('testing');
    setTestMessage('');
    try {
      const result = await socketService.testBotConnection({
        gatewayUrl: gatewayUrl.trim() || undefined,
        authToken: authToken.trim(),
        sshHost: sshHost.trim() || undefined,
      });
      if (result.ok) {
        setTestStatus('success');
        setTestMessage(result.model ? `Connected (${result.model})` : 'Connected');
        setStep('info');
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
    if (!username.trim()) return;
    setRegistering(true);
    setError('');
    try {
      const finalAuthToken = connectMode === 'pair' ? pairDeviceToken : authToken.trim();
      const finalGatewayUrl = connectMode === 'pair' ? pairGatewayUrl : gatewayUrl.trim();
      const result = await socketService.registerBot({
        username: username.trim(),
        avatarUrl: avatarUrl.trim() || undefined,
        gatewayUrl: finalGatewayUrl || undefined,
        authToken: finalAuthToken,
        sshHost: connectMode === 'token' ? (sshHost.trim() || undefined) : undefined,
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

  const handleCancelPair = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStep('connect');
    setPairId('');
    setDeviceId('');
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

          {/* Step: Connect */}
          {step === 'connect' && (
            <>
              {/* Mode toggle */}
              <div className="flex gap-2 mb-2">
                <button onClick={() => setConnectMode('pair')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${connectMode === 'pair' ? 'bg-primary-600 text-white' : 'bg-dark-hover text-dark-muted'}`}>
                  Setup Code (推荐)
                </button>
                <button onClick={() => setConnectMode('token')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${connectMode === 'token' ? 'bg-primary-600 text-white' : 'bg-dark-hover text-dark-muted'}`}>
                  Auth Token (高级)
                </button>
              </div>

              {connectMode === 'pair' ? (
                <>
                  <div>
                    <label className="block text-xs text-dark-muted mb-1">Setup Code *</label>
                    <textarea value={setupCode} onChange={e => { setSetupCode(e.target.value); setPairError(''); }}
                      placeholder="粘贴 Gateway 生成的 Setup Code..."
                      rows={3}
                      className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500 font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-muted mb-1">Gateway URL (可选覆盖)</label>
                    <input type="text" value={pairGatewayUrl} onChange={e => setPairGatewayUrl(e.target.value)} placeholder="留空则使用 Setup Code 中的地址"
                      className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  </div>
                  {pairError && <p className="text-xs text-red-400">{pairError}</p>}
                  <button onClick={handlePairConnect} disabled={!setupCode.trim() || connecting}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-500 disabled:opacity-50 transition">
                    {connecting ? 'Connecting...' : 'Connect'}
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-dark-muted mb-1">Gateway URL</label>
                    <input type="text" value={gatewayUrl} onChange={e => setGatewayUrl(e.target.value)} placeholder="ws://127.0.0.1:18789"
                      className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-muted mb-1">Auth Token *</label>
                    <input type="password" value={authToken} onChange={e => { setAuthToken(e.target.value); setTestStatus('idle'); }} placeholder="Bearer token"
                      className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-muted mb-1">SSH Host</label>
                    <input type="text" value={sshHost} onChange={e => setSshHost(e.target.value)} placeholder="user@host (optional)"
                      className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  </div>
                  {testStatus === 'error' && <p className="text-xs text-red-400">✕ {testMessage}</p>}
                  <button onClick={handleTokenTest} disabled={!authToken.trim() || testStatus === 'testing'}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-500 disabled:opacity-50 transition">
                    {testStatus === 'testing' ? 'Testing...' : 'Connect'}
                  </button>
                </>
              )}
            </>
          )}

          {/* Step: Pending (pair mode) */}
          {step === 'pending' && (
            <div className="text-center py-6 space-y-4">
              <div className="text-4xl">⏳</div>
              <p className="text-sm text-dark-text font-medium">Waiting for approval...</p>
              <p className="text-xs text-dark-muted">请在 Gateway 端执行 <code className="bg-dark-bg px-1.5 py-0.5 rounded">/pair approve</code></p>
              {deviceId && (
                <p className="text-xs text-dark-muted font-mono">Device: {deviceId.slice(0, 12)}...</p>
              )}
              <div className="flex justify-center gap-1">
                <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-primary-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
              <button onClick={handleCancelPair} className="text-xs text-dark-muted hover:text-dark-text transition">
                Cancel
              </button>
            </div>
          )}

          {/* Step: Info */}
          {step === 'info' && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-green-400">✓</span>
                <span className="text-sm text-green-400 font-medium">Connected!</span>
                <span className="text-xs text-dark-muted">{connectMode === 'pair' ? pairGatewayUrl : gatewayUrl}</span>
              </div>

              <div>
                <label className="block text-xs text-dark-muted mb-1">Bot Name *</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="My Bot"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500" />
              </div>

              <div>
                <label className="block text-xs text-dark-muted mb-1">Avatar URL</label>
                <input type="text" value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://..."
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500" />
              </div>

              <div>
                <label className="block text-xs text-dark-muted mb-1">Trigger</label>
                <select value={trigger} onChange={e => setTrigger(e.target.value as any)}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text focus:outline-none focus:ring-1 focus:ring-primary-500">
                  <option value="all">All messages</option>
                  <option value="mention">@mention only</option>
                  <option value="room-member">Room member</option>
                </select>
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}
            </>
          )}

        </div>

        {/* Footer */}
        {step === 'info' && (
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-dark-border">
            <button onClick={handleClose} className="px-4 py-2 text-sm text-dark-muted hover:text-dark-text rounded-lg hover:bg-dark-hover transition">Cancel</button>
            <button onClick={handleRegister} disabled={!username.trim() || registering}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition">
              {registering ? 'Registering...' : 'Register'}
            </button>
          </div>
        )}
        </>)}
      </div>
      {shareBot && <BotShareModal botId={shareBot.id} botName={shareBot.name} onClose={() => setShareBot(null)} />}
    </div>
  );
}
