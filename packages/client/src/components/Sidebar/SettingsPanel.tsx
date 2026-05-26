import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../../hooks/useT';
import { socketService } from '../../services/socket';
import { deploySkill, listSkills, removeSkill, type SkillDeployment } from '../../services/skill-api';
import BotShareModal from '../BotShareModal';
import UserAvatar from '../UserAvatar';
import type { ImageQuality } from '../../services/upload';

const IMAGE_QUALITY_KEYS: { value: ImageQuality; labelKey: string; descKey: string }[] = [
  { value: 'original', labelKey: 'settings.qualityOriginal', descKey: 'settings.qualityOriginalDesc' },
  { value: 'high', labelKey: 'settings.qualityHigh', descKey: 'settings.qualityHighDesc' },
  { value: 'medium', labelKey: 'settings.qualityMedium', descKey: 'settings.qualityMediumDesc' },
  { value: 'low', labelKey: 'settings.qualityLow', descKey: 'settings.qualityLowDesc' },
];

const QUALITY_LABEL_KEYS: Record<ImageQuality, string> = {
  original: 'settings.qualityOriginal',
  high: 'settings.qualityHigh',
  medium: 'settings.qualityMedium',
  low: 'settings.qualityLow',
};

interface SettingsPanelProps {
  onShowAccount: () => void;
}

function BotActionMenu({ bot, onTogglePause, onShare, onDeregister, onUnshare, onSkills }: {
  bot: any;
  onTogglePause: () => void;
  onShare: () => void;
  onDeregister: () => void;
  onUnshare: () => void;
  onSkills: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isOwner = bot.isOwner !== false; // default true for backwards compat

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-dark-muted hover:text-dark-text hover:bg-dark-hover transition text-sm"
        title={t('settings.actions')}
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-dark-surface border border-dark-border rounded-lg shadow-xl py-1 min-w-[120px]">
          {isOwner ? (
            <>
              <button
                onClick={() => { onSkills(); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm text-dark-text hover:bg-dark-hover transition flex items-center gap-2"
              >
                📦 Skills
              </button>
              <button
                onClick={() => { onTogglePause(); setOpen(false); }}
                className={`w-full text-left px-3 py-2.5 text-sm hover:bg-dark-hover transition flex items-center gap-2 ${
                  bot.status === 'paused' ? 'text-green-400' : 'text-yellow-400'
                }`}
              >
                {bot.status === 'paused' ? t('settings.resume') : t('settings.pause')}
              </button>
              <button
                onClick={() => { onShare(); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm text-dark-text hover:bg-dark-hover transition flex items-center gap-2"
              >
                {t('settings.share')}
              </button>
              <div className="border-t border-dark-border my-1" />
              <button
                onClick={() => { onDeregister(); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm text-red-400 hover:bg-red-400/10 transition flex items-center gap-2"
              >
                {t('settings.deregister')}
              </button>
            </>
          ) : (
            <button
              onClick={() => { onUnshare(); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm text-red-400 hover:bg-red-400/10 transition flex items-center gap-2"
            >
              {t('settings.remove')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function SettingsPanel({ onShowAccount }: SettingsPanelProps) {
  const { theme, setTheme, imageQuality, setImageQuality, user, language, setLanguage } = useAppStore();
  const [subPage, setSubPage] = useState<null | 'appearance' | 'imageUpload' | 'bots' | 'language'>(null);
  const t = useT();

  // Sub-page: Language
  if (subPage === 'language') {
    return (
      <div className="flex flex-col h-full">
        <SubPageHeader title={t('settings.language')} onBack={() => setSubPage(null)} />
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-1.5">
            {([['zh', '中文'], ['en', 'English']] as const).map(([code, label]) => (
              <button
                key={code}
                onClick={() => setLanguage(code)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition flex items-center gap-3 ${
                  language === code
                    ? 'bg-primary-600/20 text-primary-400 ring-1 ring-primary-500/30'
                    : 'text-dark-text hover:bg-dark-hover'
                }`}
              >
                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  language === code ? 'border-primary-500' : 'border-dark-muted'
                }`}>
                  {language === code && (
                    <span className="w-2 h-2 rounded-full bg-primary-500" />
                  )}
                </span>
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Sub-page: Bots
  if (subPage === 'bots') {
    return <BotsSubPage onBack={() => setSubPage(null)} />;
  }

  // Sub-page: Appearance
  if (subPage === 'appearance') {
    return (
      <div className="flex flex-col h-full">
        <SubPageHeader title={t('settings.appearance')} onBack={() => setSubPage(null)} />
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex gap-2">
            <ThemeButton active={theme === 'dark'} onClick={() => setTheme('dark')} icon="🌙" label={t('settings.themeDark')} />
            <ThemeButton active={theme === 'light'} onClick={() => setTheme('light')} icon="☀️" label={t('settings.themeLight')} />
          </div>
        </div>
      </div>
    );
  }

  // Sub-page: Image Upload
  if (subPage === 'imageUpload') {
    return (
      <div className="flex flex-col h-full">
        <SubPageHeader title={t('settings.imageUpload')} onBack={() => setSubPage(null)} />
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="text-xs text-dark-muted mb-3">
            {t('settings.imageCompressHint')}
          </p>
          <div className="space-y-1.5">
            {IMAGE_QUALITY_KEYS.map((opt) => (
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
                  <span className="text-sm font-medium">{t(opt.labelKey as any)}</span>
                  <span className="text-xs text-dark-muted ml-2">{t(opt.descKey as any)}</span>
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
          label={t('settings.bots')}
          onClick={() => setSubPage('bots')}
        />

        {/* Appearance row */}
        <SettingsRow
          icon={<span className="text-lg">🎨</span>}
          label={t('settings.appearance')}
          value={theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}
          onClick={() => setSubPage('appearance')}
        />

        {/* Language row */}
        <SettingsRow
          icon={<span className="text-lg">🌐</span>}
          label={t('settings.language')}
          value={language === 'zh' ? '中文' : 'English'}
          onClick={() => setSubPage('language')}
        />

        {/* Image Upload row */}
        <SettingsRow
          icon={<span className="text-lg">📷</span>}
          label={t('settings.imageUpload')}
          value={t(QUALITY_LABEL_KEYS[imageQuality] as any)}
          onClick={() => setSubPage('imageUpload')}
        />
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-dark-border">
        <p className="text-[10px] text-dark-muted text-center">{t('settings.footer')}</p>
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
  const [unshareTarget, setUnshareTarget] = useState<any>(null);
  const [unsharing, setUnsharing] = useState(false);
  const [skillsBot, setSkillsBot] = useState<any>(null);
  const t = useT();

  const loadBots = () => {
    socketService.listAvailableBots().then((res) => {
      setBots(res.bots || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => {
    loadBots();
    // Refresh bot list when a new bot is registered
    const socket = socketService.getSocket();
    const onBotChanged = () => loadBots();
    socket?.on('bot:registered', onBotChanged);
    socket?.on('bot:restored', onBotChanged);
    return () => {
      socket?.off('bot:registered', onBotChanged);
      socket?.off('bot:restored', onBotChanged);
    };
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

  const handleUnshare = async () => {
    if (!unshareTarget) return;
    setUnsharing(true);
    const result = await socketService.unshareBotFromMe(unshareTarget.id);
    // Remove archived rooms from sidebar
    if (result.archivedRoomIds?.length) {
      const store = useAppStore.getState();
      for (const roomId of result.archivedRoomIds) {
        store.removeRoom(roomId);
      }
    }
    setUnshareTarget(null);
    setUnsharing(false);
    loadBots();
  };

  if (skillsBot) {
    return <BotSkillsPage bot={skillsBot} onBack={() => setSkillsBot(null)} />;
  }

  return (
    <div className="flex flex-col h-full">
      <SubPageHeader title={t('settings.bots')} onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Action buttons */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => useAppStore.getState().setShowBotRegistration(true)}
            className="flex-1 py-2.5 rounded-lg bg-primary-600/20 text-primary-400 text-sm font-medium hover:bg-primary-600/30 transition"
          >
            {t('settings.registerBot')}
          </button>
          <button
            onClick={() => useAppStore.getState().setShowBotMarketplace(true)}
            className="flex-1 py-2.5 rounded-lg bg-dark-hover text-dark-text text-sm font-medium hover:bg-dark-border transition"
          >
            {t('settings.botMarketplace')}
          </button>
        </div>

        {/* My Bots */}
        <h4 className="text-xs text-dark-muted font-medium mb-2">{t('settings.myBots')}</h4>
        {loading ? (
          <p className="text-xs text-dark-muted">{t('settings.botsLoading')}</p>
        ) : bots.length === 0 ? (
          <p className="text-xs text-dark-muted">{t('settings.noBots')}</p>
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
                  <span className="text-sm text-dark-text font-medium truncate block">
                    {bot.username || bot.name}
                    {bot.isOwner === false && <span className="ml-1 text-[10px] text-primary-400 bg-primary-600/15 px-1.5 py-0.5 rounded-full">{t('settings.shared')}</span>}
                  </span>
                  <span className="text-[10px] text-dark-muted">
                    {bot.status === 'paused' ? t('settings.paused') : (bot.trigger || bot.triggerType || '')}
                  </span>
                </div>
                <BotActionMenu
                  bot={bot}
                  onTogglePause={() => handleTogglePause(bot)}
                  onShare={() => setShareBot(bot)}
                  onDeregister={() => setDeregisterTarget(bot)}
                  onUnshare={() => setUnshareTarget(bot)}
                  onSkills={() => setSkillsBot(bot)}
                />
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
            <h3 className="text-sm font-semibold text-dark-text mb-2">{t('settings.deregisterConfirm', { name: deregisterTarget.username || deregisterTarget.name })}</h3>
            <p className="text-xs text-dark-muted mb-4">
              {t('settings.deregisterDescription')}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeregisterTarget(null)} className="px-3 py-1.5 text-sm text-dark-muted hover:text-dark-text rounded-lg hover:bg-dark-hover transition">{t('settings.deregisterCancel')}</button>
              <button onClick={handleDeregister} disabled={deregistering}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-500 disabled:opacity-50 transition">
                {deregistering ? t('settings.deregistering') : t('settings.deregisterConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unshare confirmation modal */}
      {unshareTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-sm font-semibold text-dark-text mb-2">{t('settings.removeConfirm', { name: unshareTarget.username || unshareTarget.name })}</h3>
            <p className="text-xs text-dark-muted mb-4">
              {t('settings.removeDescription')}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setUnshareTarget(null)} className="px-3 py-1.5 text-sm text-dark-muted hover:text-dark-text rounded-lg hover:bg-dark-hover transition">{t('settings.removeCancel')}</button>
              <button onClick={handleUnshare} disabled={unsharing}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-500 disabled:opacity-50 transition">
                {unsharing ? t('settings.removing') : t('settings.removeConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BotSkillsPage({ bot, onBack }: { bot: any; onBack: () => void }) {
  const [skills, setSkills] = useState<SkillDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeploy, setShowDeploy] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [skillContent, setSkillContent] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState('');
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [agentSkills, setAgentSkills] = useState<any[]>([]);
  const [agentSkillsLoading, setAgentSkillsLoading] = useState(true);
  const [agentSkillsError, setAgentSkillsError] = useState('');
  const t = useT();

  const loadSkills = async () => {
    try {
      const list = await listSkills(bot.id);
      setSkills(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadAgentSkills = async () => {
    setAgentSkillsLoading(true);
    setAgentSkillsError('');
    try {
      const result = await socketService.getBotSkills(bot.id);
      if (result.error) {
        setAgentSkillsError(result.error);
        setAgentSkills([]);
      } else {
        setAgentSkills(result.skills || []);
      }
    } catch {
      setAgentSkillsError(t('settings.agentSkillsError'));
      setAgentSkills([]);
    } finally {
      setAgentSkillsLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
    loadAgentSkills();
    // Listen for real-time updates
    const socket = socketService.getSocket();
    const handler = (data: any) => {
      if (data.botId === bot.id) loadSkills();
    };
    socket?.on('skill:status', handler);
    return () => { socket?.off('skill:status', handler); };
  }, [bot.id]);

  const handleDeploy = async () => {
    if (!skillName.trim() || !skillContent.trim()) return;
    setDeploying(true);
    setError('');
    try {
      await deploySkill(bot.id, skillName.trim(), skillContent);
      setShowDeploy(false);
      setSkillName('');
      setSkillContent('');
      loadSkills();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeploying(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeSkill(bot.id, removeTarget);
      setRemoveTarget(null);
      loadSkills();
    } catch {
      // ignore
    } finally {
      setRemoving(false);
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      deployed: 'bg-green-500/20 text-green-400',
      failed: 'bg-red-500/20 text-red-400',
    };
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${colors[status] || 'bg-dark-hover text-dark-muted'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <SubPageHeader title={`${t('settings.skills')} — ${bot.username || bot.name}`} onBack={onBack} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Agent Skills from Gateway */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-dark-muted uppercase tracking-wide">{t('settings.agentSkills')}</span>
            <button
              onClick={loadAgentSkills}
              className="text-[10px] text-primary-400 hover:text-primary-300 transition"
            >
              {t('settings.agentSkillsRefresh')}
            </button>
          </div>
          {agentSkillsLoading ? (
            <p className="text-xs text-dark-muted">{t('settings.skillsLoading')}</p>
          ) : agentSkillsError ? (
            <p className="text-xs text-red-400">{agentSkillsError}</p>
          ) : agentSkills.length === 0 ? (
            <p className="text-xs text-dark-muted">{t('settings.noAgentSkills')}</p>
          ) : (
            <div className="space-y-1">
              {agentSkills.map((skill: any) => (
                <div
                  key={skill.name}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-dark-hover transition"
                >
                  <span className="text-xs">{skill.eligible === false ? '🔴' : '🟢'}</span>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-dark-text font-medium truncate block">{skill.name}</span>
                    {skill.description && (
                      <span className="text-[10px] text-dark-muted truncate block">{skill.description}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-dark-border my-4" />

        {/* Deployed Skills */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-dark-muted uppercase tracking-wide">{t('settings.deployedSkills')}</span>
        </div>

        <button
          onClick={() => setShowDeploy(true)}
          className="w-full py-2.5 rounded-lg bg-primary-600/20 text-primary-400 text-sm font-medium hover:bg-primary-600/30 transition mb-4"
        >
          {t('settings.deploySkill')}
        </button>

        {loading ? (
          <p className="text-xs text-dark-muted">{t('settings.skillsLoading')}</p>
        ) : skills.length === 0 ? (
          <p className="text-xs text-dark-muted">{t('settings.noSkills')}</p>
        ) : (
          <div className="space-y-1">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-dark-hover transition"
              >
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-dark-text font-medium truncate block">
                    {skill.skillName} {statusBadge(skill.status)}
                  </span>
                  <span className="text-[10px] text-dark-muted">
                    {skill.deployedAt ? new Date(skill.deployedAt).toLocaleString() : skill.createdAt ? new Date(skill.createdAt).toLocaleString() : ''}
                    {skill.errorMessage && <span className="text-red-400 ml-1">{skill.errorMessage}</span>}
                  </span>
                </div>
                <button
                  onClick={() => setRemoveTarget(skill.skillName)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-dark-muted hover:text-red-400 hover:bg-red-400/10 transition text-sm"
                  title={t('settings.removeSkill')}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deploy modal */}
      {showDeploy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-5">
            <h3 className="text-sm font-semibold text-dark-text mb-3">{t('settings.deploySkill')}</h3>
            <input
              type="text"
              placeholder={t('settings.skillNamePlaceholder')}
              value={skillName}
              onChange={(e) => setSkillName(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''))}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-dark-text mb-2 outline-none focus:border-primary-500"
            />
            <textarea
              placeholder={t('settings.skillContentPlaceholder')}
              value={skillContent}
              onChange={(e) => setSkillContent(e.target.value)}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm text-dark-text mb-2 outline-none focus:border-primary-500 h-48 resize-none font-mono text-xs"
            />
            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowDeploy(false); setError(''); }} className="px-3 py-1.5 text-sm text-dark-muted hover:text-dark-text rounded-lg hover:bg-dark-hover transition">{t('settings.cancelDeploy')}</button>
              <button
                onClick={handleDeploy}
                disabled={deploying || !skillName.trim() || !skillContent.trim()}
                className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-500 disabled:opacity-50 transition"
              >
                {deploying ? t('settings.deploying') : t('settings.deploy')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove confirmation */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-sm font-semibold text-dark-text mb-2">{t('settings.removeSkillConfirm', { name: removeTarget })}</h3>
            <p className="text-xs text-dark-muted mb-4">{t('settings.removeSkillDescription')}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRemoveTarget(null)} className="px-3 py-1.5 text-sm text-dark-muted hover:text-dark-text rounded-lg hover:bg-dark-hover transition">{t('settings.cancelRemoveSkill')}</button>
              <button onClick={handleRemove} disabled={removing}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-500 disabled:opacity-50 transition">
                {removing ? t('settings.removingSkill') : t('settings.removeSkill')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
