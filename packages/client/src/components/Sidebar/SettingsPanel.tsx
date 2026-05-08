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

  useEffect(() => {
    socketService.listAvailableBots().then((res) => {
      setBots(res.bots || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

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
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-dark-hover transition"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-dark-text font-medium truncate block">{bot.username || bot.name}</span>
                  {(bot.trigger || bot.triggerType) && (
                    <span className="text-[10px] text-dark-muted">{bot.trigger || bot.triggerType}</span>
                  )}
                </div>
                <button
                  onClick={() => setShareBot(bot)}
                  className="text-dark-muted hover:text-dark-text text-sm p-1 rounded transition"
                  title="Share"
                >
                  🔗
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {shareBot && (
        <BotShareModal botId={shareBot.id} botName={shareBot.name} onClose={() => setShareBot(null)} />
      )}
    </div>
  );
}
