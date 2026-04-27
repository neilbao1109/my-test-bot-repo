import { useAppStore } from '../../stores/appStore';
import type { ImageQuality } from '../../services/upload';

const IMAGE_QUALITY_OPTIONS: { value: ImageQuality; label: string; desc: string }[] = [
  { value: 'original', label: '原图', desc: '不压缩，保留完整分辨率' },
  { value: 'high', label: '高清', desc: '最长边 2048px' },
  { value: 'medium', label: '标准', desc: '最长边 1280px（推荐）' },
  { value: 'low', label: '省流', desc: '最长边 800px' },
];

interface SettingsPanelProps {
  onBack: () => void;
}

export default function SettingsPanel({ onBack }: SettingsPanelProps) {
  const { theme, setTheme, imageQuality, setImageQuality, user, logout } = useAppStore();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="p-4 border-b border-dark-border flex items-center gap-3"
        style={{ paddingTop: `max(1rem, var(--safe-area-top))` }}
      >
        <button
          onClick={onBack}
          className="p-1 text-dark-muted hover:text-dark-text rounded transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="font-semibold text-dark-text">Settings</span>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto">
        {/* Theme */}
        <Section title="🎨 Appearance">
          <div className="flex gap-2">
            <ThemeButton
              active={theme === 'dark'}
              onClick={() => setTheme('dark')}
              icon="🌙"
              label="Dark"
            />
            <ThemeButton
              active={theme === 'light'}
              onClick={() => setTheme('light')}
              icon="☀️"
              label="Light"
            />
          </div>
        </Section>

        {/* Image Upload Quality */}
        <Section title="📷 Image Upload">
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
                  imageQuality === opt.value
                    ? 'border-primary-500'
                    : 'border-dark-muted'
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
        </Section>
      </div>

      {/* Account & Footer */}
      <div
        className="p-4 border-t border-dark-border space-y-3"
        style={{ paddingBottom: `max(0.75rem, var(--safe-area-bottom))` }}
      >
        {user && (
          <button
            onClick={logout}
            className="w-full py-2.5 px-3 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition flex items-center justify-center gap-2"
          >
            <span>⏻</span>
            <span>Logout ({user.username})</span>
          </button>
        )}
        <p className="text-[10px] text-dark-muted text-center">ClawChat • Settings are saved locally</p>
        <p className="text-[10px] text-dark-muted/50 text-center mt-1">Build: {__BUILD_HASH__} • {__BUILD_TIME__}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 border-b border-dark-border">
      <h3 className="text-xs font-semibold text-dark-muted uppercase tracking-wider mb-3">{title}</h3>
      {children}
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
