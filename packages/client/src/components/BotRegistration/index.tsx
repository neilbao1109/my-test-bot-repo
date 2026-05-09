import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import './BotRegistration.css';

export default function BotRegistration() {
  const { showBotRegistration, setShowBotRegistration } = useAppStore();

  // Step flow: info → connect → pending → (auto-register)
  const [step, setStep] = useState<'info' | 'connect' | 'pending'>('info');
  const [connectMode, setConnectMode] = useState<'pair' | 'token'>('pair');

  // Bot info state (Step 1)
  const [botId, setBotId] = useState('');
  const [botIdError, setBotIdError] = useState('');

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


  // Restore flow
  const [deregisteredBot, setDeregisteredBot] = useState<any>(null);
  const [restoring, setRestoring] = useState(false);

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
  }, [showBotRegistration]);

  // Poll pair status — auto-register when approved
  useEffect(() => {
    if (step === 'pending' && pairId) {
      pollRef.current = setInterval(async () => {
        const result = await socketService.pairStatus(pairId);
        if (result.ok && result.status === 'approved') {
          if (pollRef.current) clearInterval(pollRef.current);
          setPairDeviceToken(result.deviceToken || '');
          if (result.gatewayUrl) setPairGatewayUrl(result.gatewayUrl);
          // Auto-register with the approved token
          await doRegister(result.deviceToken || '', result.gatewayUrl);
        }
      }, 5000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
  }, [step, pairId]);

  const doRegister = async (tokenOverride?: string, gwOverride?: string) => {
    setRegistering(true);
    setError('');
    try {
      const finalAuthToken = tokenOverride || (connectMode === 'pair' ? pairDeviceToken : authToken.trim());
      const finalGatewayUrl = gwOverride || (connectMode === 'pair' ? pairGatewayUrl : gatewayUrl.trim());
      const result = await socketService.registerBot({
        botId: botId.trim(),
        username: username.trim(),
        avatarUrl: avatarUrl.trim() || undefined,
        gatewayUrl: finalGatewayUrl || undefined,
        authToken: finalAuthToken,
        sshHost: connectMode === 'token' ? (sshHost.trim() || undefined) : undefined,
        trigger,

      });
      if (result.deregisteredBot) {
        setDeregisteredBot({ ...result.deregisteredBot, authToken: finalAuthToken });
        setRegistering(false);
        return;
      }
      if (result.error) {
        setError(result.error);
        // Go back to info step on error so user can fix botId
        setStep('info');
      } else {
        handleClose();
      }
    } catch {
      setError('Registration failed');
      setStep('info');
    } finally {
      setRegistering(false);
    }
  };

  if (!showBotRegistration) return null;

  const resetForm = () => {
    setStep('info'); setConnectMode('pair');
    setBotId(''); setBotIdError('');
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

  const botIdPattern = /^[a-z0-9][a-z0-9-]*$/;
  const validateBotId = (val: string) => {
    if (!val) return 'Bot ID is required';
    if (val.length < 3 || val.length > 32) return 'Must be 3-32 characters';
    if (!botIdPattern.test(val)) return 'Only lowercase letters, numbers, and hyphens (must start with letter/number)';
    return '';
  };

  const handleNextToConnect = async () => {
    const err = validateBotId(botId);
    if (err) { setBotIdError(err); return; }
    if (!username.trim()) return;
    // Check server-side availability
    try {
      const result = await socketService.checkBotId(botId.trim());
      if (!result.available) {
        setBotIdError('Bot ID already taken');
        return;
      }
    } catch {
      setBotIdError('Failed to check Bot ID');
      return;
    }
    setStep('connect');
  };

  const handlePairConnect = async () => {
    if (!setupCode.trim()) return;
    setConnecting(true);
    setPairError('');
    try {
      const result = await socketService.pairConnect(setupCode.trim(), pairGatewayUrl.trim() || undefined, `clawchat-bot-${botId}`);
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
        setTestMessage(result.model ? `Connected (${result.model})` : 'Connected');
        // Auto-register for token mode
        await doRegister();
      } else {
        setTestStatus('error');
        setTestMessage(result.error || 'Connection failed');
      }
    } catch {
      setTestStatus('error');
      setTestMessage('Connection test failed');
    }
  };


  const handleRestore = async () => {
    if (!deregisteredBot) return;
    setRestoring(true);
    try {
      const result = await socketService.restoreBot(deregisteredBot.id, deregisteredBot.authToken);
      if (result.error) {
        setError(result.error);
      } else {
        handleClose();
      }
    } catch {
      setError('Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  const handleSkipRestore = () => {
    setDeregisteredBot(null);
    // Re-register with skip flag to force create new bot
    const finalAuthToken = connectMode === 'pair' ? pairDeviceToken : authToken.trim();
    const finalGatewayUrl = connectMode === 'pair' ? pairGatewayUrl : gatewayUrl.trim();
    setRegistering(true);
    socketService.registerBot({
      botId: botId.trim(),
      username: username.trim(),
      avatarUrl: avatarUrl.trim() || undefined,
      gatewayUrl: finalGatewayUrl || undefined,
      authToken: finalAuthToken,
      sshHost: connectMode === 'token' ? (sshHost.trim() || undefined) : undefined,
      trigger,
      skipDeregisteredCheck: true,
    }).then(result => {
      if (result.error) {
        setError(result.error);
        setStep('info');
      } else {
        handleClose();
      }
    }).catch(() => {
      setError('Registration failed');
      setStep('info');
    }).finally(() => setRegistering(false));
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

        <div className="p-5 space-y-3">

          {/* Step 1: Bot Info */}
          {step === 'info' && (
            <>
              <div>
                <label className="block text-xs text-dark-muted mb-1">Bot ID *</label>
                <input type="text" value={botId} onChange={e => { setBotId(e.target.value.toLowerCase()); setBotIdError(''); }} placeholder="my-bot (lowercase, 3-32 chars)"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500 font-mono" />
                {botIdError && <p className="text-xs text-red-400 mt-1">{botIdError}</p>}
                <p className="text-xs text-dark-muted mt-1">Identity file: device-identity-clawchat-bot-{botId || '...'}.json</p>
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

              <button onClick={handleNextToConnect} disabled={!botId.trim() || !username.trim()}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-500 disabled:opacity-50 transition">
                Next →
              </button>
            </>
          )}

          {/* Step 2: Connect */}
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

          {/* Step 3: Pending (pair mode) */}
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

        </div>

        {/* Footer — show registering state */}
        {registering && (
          <div className="flex justify-center px-5 py-4 border-t border-dark-border">
            <span className="text-sm text-dark-muted">Registering...</span>
          </div>
        )}
        </div>
      {/* Restore deregistered bot dialog */}
      {deregisteredBot && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
          <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-sm font-semibold text-dark-text mb-2">检测到已注销的 Bot</h3>
            <p className="text-xs text-dark-muted mb-1">
              你之前注册过 Bot "{deregisteredBot.username}"（已注销），是否恢复？
            </p>
            <p className="text-xs text-dark-muted mb-4">
              恢复将复用旧记录并恢复你的对话历史。
            </p>
            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={handleSkipRestore} className="px-3 py-1.5 text-sm text-dark-muted hover:text-dark-text rounded-lg hover:bg-dark-hover transition">新建</button>
              <button onClick={handleRestore} disabled={restoring}
                className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-500 disabled:opacity-50 transition">
                {restoring ? '恢复中...' : '恢复'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
