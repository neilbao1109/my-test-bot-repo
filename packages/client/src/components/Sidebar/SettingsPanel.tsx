import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import BotShareModal from '../BotShareModal';
import UserAvatar from '../UserAvatar';
import type { ImageQuality } from '../../services/upload';

const IMAGE_QUALITY_OPTIONS: { value: ImageQuality; label: string; desc: string }[] = [
  { value: 'original', label: '原图', desc: '不压缩，保留完整分辨率' },
  { value: 'high', label: '高清', desc: '最长边 2048px' },
  { value: 'medium', label: '标准', desc: '最长边 1280px（推荐）' },
  { value: 'low', label: '省流', desc: '最长边 800px' },
];

const QUALITY_LABELS: Record<ImageQuality, string> = {
  original: '原图',
  high: '高清',
  medium: '标准',
  low: '省流',
};

interface SettingsPanelProps {
  onShowAccount: () => void;
}

export default function SettingsPanel({ onShowAccount }: SettingsPanelProps) {
  const { theme, setTheme, imageQuality, setImageQuality, user } = useAppStore();
  const [subPage, setSubPage] = useState<null | 'appearance' | 'imageUpload' | 'bots'>(null);

  // Sub-page: Bots
  if (subPage === 'bots') {
    return <BotsSubPage onBack={() => setSubPage(null)} />;
  }

  // Sub-page: Appearance
  if (subPage === 'appearance') {
    return (
      <div className="flex flex-col h-full">
        <SubPageHeader title="外观" onBack={() => setSubPage(null)} />
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex gap-2">
            <ThemeButton active={theme === 'dark'} onClick={() => setTheme('dark')} icon="🌙" label="Dark" />
            <ThemeButton active={theme === 'light'} onClick={() => setTheme('light')} icon="☀️" label="Light" />
          </div>
        </div>
      </div>
    );
  }

  // Sub-page: Image Upload
  if (subPage === 'imageUpload') {
    return (
      <div className="flex flex-col h-full">
        <SubPageHeader title="图片上传" onBack={() => setSubPage(null)} />
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="text-xs text-dark-muted mb-3">
            Compress images before uploading to save bandwidth
          </p>
          <div className="space-y-1.5">
            {IMAGE_QUALITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setImageQuality(opt.value)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition flex items-center gap-3 ${
                  imageQuality === opt.value
                    ? 'bg-primary-600/20 text-primary-400 ring-1 ring-primary-500/30'
                    : 'text-dark-text hover:bg-dark-hover'
                }`}
              >
                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  imageQuality === opt.value ? 'border-primary-500' : 'border-dark-muted'
                }`}>
                  {imageQuality === opt.value && (
                    <span className="w-2 h-2 rounded-full bg-primary-500" />
                  )}
                </span>
                <div>
                  <span className="text-sm font-medium">{opt.label}</span>
                  <span className="text-xs text-dark-muted ml-2">{opt.desc}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Main settings page
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {/* Account row */}
        {user && (
          <SettingsRow
            icon={<UserAvatar username={user.username} isOnline={true} size="sm" />}
            label={user.username}
            onClick={onShowAccount}
          />
        )}

        {/* Bots row */}
        <SettingsRow
          icon={<span className="text-lg">🤖</span>}
          label="Bots"
          onClick={() => setSubPage('bots')}
        />

        {/* Appearance row */}
        <SettingsRow
          icon={<span className="text-lg">🎨</span>}
          label="外观"
          value={theme === 'dark' ? 'Dark' : 'Light'}
          onClick={() => setSubPage('appearance')}
        />

        {/* Image Upload row */}
        <SettingsRow
          icon={<span className="text-lg">📷</span>}
          label="图片上传"
          value={QUALITY_LABELS[imageQuality]}
          onClick={() => setSubPage('imageUpload')}
        />
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-dark-border">
        <p className="text-[10px] text-dark-muted text-center">ClawChat • Settings are saved locally</p>
        <p className="text-[10px] text-dark-muted/50 text-center mt-1">Build: {__BUILD_HASH__} • {__BUILD_TIME__}</p>
      </div>
    </div>
  );
}

function SettingsRow({ icon, label, value, onClick }: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 border-b border-dark-border flex items-center gap-3 hover:bg-dark-hover transition text-left"
    >
      <div className="flex-shrink-0">{icon}</div>
      <span className="text-sm font-medium text-dark-text flex-1 truncate">{label}</span>
      {value && (
        <span className="text-xs text-dark-muted mr-1">{value}</span>
      )}
      <svg className="w-4 h-4 text-dark-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

function SubPageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-border">
      <button onClick={onBack} className="text-dark-muted hover:text-dark-text p-1 rounded transition">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h3 className="font-semibold text-dark-text text-sm">{title}</h3>
    </div>
  );
}

function ThemeButton({ active, onClick, icon, label }: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 rounded-lg text-center transition ${
        active
          ? 'bg-primary-600/20 text-primary-400 ring-1 ring-primary-500/30'
          : 'bg-dark-hover text-dark-muted hover:text-dark-text'
      }`}
    >
      <span className="text-lg block">{icon}</span>
      <span className="text-xs mt-1 block">{label}</span>
    </button>
  );
}

function BotsSubPage({ onBack }: { onBack: () => void }) {
  const [bots, setBots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareBot, setShareBot] = useState<any>(null);
  const [deregisterTarget, setDeregisterTarget] = useState<any>(null);
  const [deregistering, setDeregistering] = useState(false);

  const loadBots = () => {
    socketService.listAvailableBots().then((res) => {
      setBots(res.bots || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    loadBots();
  }, []);

  const handleTogglePause = async (bot: any) => {
    if (bot.status === 'paused') {
      await socketService.resumeBot(bot.id);
    } else {
      await socketService.pauseBot(bot.id);
    }
    loadBots();
  };

  const handleDeregister = async () => {
    if (!deregisterTarget) return;
    setDeregistering(true);
    await socketService.deregisterBot(deregisterTarget.id);
    setDeregisterTarget(null);
    setDeregistering(false);
    loadBots();
  };

  return (
    <div className="flex flex-col h-full">
      <SubPageHeader title="Bots" onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Action buttons */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => useAppStore.getState().setShowBotRegistration(true)}
            className="flex-1 py-2.5 rounded-lg bg-primary-600/20 text-primary-400 text-sm font-medium hover:bg-primary-600/30 transition"
          >
            ＋ 注册 Bot
          </button>
          <button
            onClick={() => useAppStore.getState().setShowBotMarketplace(true)}
            className="flex-1 py-2.5 rounded-lg bg-dark-hover text-dark-text text-sm font-medium hover:bg-dark-border transition"
          >
            🏪 Bot 市场
          </button>
        </div>

        {/* My Bots */}
        <h4 className="text-xs text-dark-muted font-medium mb-2">My Bots</h4>
        {loading ? (
          <p className="text-xs text-dark-muted">加载中...</p>
        ) : bots.length === 0 ? (
          <p className="text-xs text-dark-muted">暂无自定义 Bot</p>
        ) : (
          <div className="space-y-1">
            {bots.map((bot: any) => (
              <div
                key={bot.id || bot.name}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-dark-hover transition ${
                  bot.status === 'paused' ? 'opacity-60' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-dark-text font-medium truncate block">{bot.username || bot.name}</span>
                  <span className="text-[10px] text-dark-muted">
                    {bot.status === 'paused' ? '❘❘ 已暂停' : (bot.trigger || bot.triggerType || '')}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {/* Pause/Resume toggle */}
                  <button
                    onClick={() => handleTogglePause(bot)}
                    className={`text-xs px-2 py-1 rounded transition ${
                      bot.status === 'paused'
                        ? 'text-green-400 hover:bg-green-400/10'
                        : 'text-yellow-400 hover:bg-yellow-400/10'
                    }`}
                    title={bot.status === 'paused' ? '恢复' : '暂停'}
                  >
                    {bot.status === 'paused' ? '▶' : '❘❘'}
                  </button>
                  {/* Share */}
                  <button
                    onClick={() => setShareBot(bot)}
                    className="text-dark-muted hover:text-dark-text text-sm p-1 rounded transition"
                    title="Share"
                  >
                    🔗
                  </button>
                  {/* Deregister */}
                  <button
                    onClick={() => setDeregisterTarget(bot)}
                    className="text-red-400/60 hover:text-red-400 text-xs p-1 rounded transition"
                    title="注销"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {shareBot && (
        <BotShareModal botId={shareBot.id} botName={shareBot.username || shareBot.name} onClose={() => setShareBot(null)} />
      )}
      {/* Deregister confirmation modal */}
      {deregisterTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-sm font-semibold text-dark-text mb-2">确认注销 Bot "{deregisterTarget.username || deregisterTarget.name}"？</h3>
            <p className="text-xs text-dark-muted mb-4">
              注销后所有分享将被撤销，相关对话将被归档。此操作不可撤销（但可通过重新注册恢复）。
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeregisterTarget(null)} className="px-3 py-1.5 text-sm text-dark-muted hover:text-dark-text rounded-lg hover:bg-dark-hover transition">取消</button>
              <button onClick={handleDeregister} disabled={deregistering}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-500 disabled:opacity-50 transition">
                {deregistering ? '注销中...' : '确认注销'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
