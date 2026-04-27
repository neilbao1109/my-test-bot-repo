import { useAppStore } from '../../stores/appStore';
import UserAvatar from '../UserAvatar';

interface AccountPanelProps {
  onBack: () => void;
}

export default function AccountPanel({ onBack }: AccountPanelProps) {
  const { user, logout } = useAppStore();

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
        <span className="font-semibold text-dark-text">Account</span>
      </div>

      {/* Profile */}
      <div className="flex-1 overflow-y-auto">
        {user && (
          <div className="px-4 py-6 flex flex-col items-center gap-3 border-b border-dark-border">
            <UserAvatar username={user.username} isOnline={true} size="lg" />
            <span className="text-lg font-semibold text-dark-text">{user.username}</span>
          </div>
        )}

        {/* Account info placeholder */}
        <div className="px-4 py-4">
          <p className="text-xs text-dark-muted text-center">More account settings coming soon</p>
        </div>
      </div>

      {/* Logout at bottom */}
      <div
        className="p-4 border-t border-dark-border"
        style={{ paddingBottom: `max(0.75rem, var(--safe-area-bottom))` }}
      >
        <button
          onClick={logout}
          className="w-full py-2.5 px-3 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition flex items-center justify-center gap-2"
        >
          <span>⏻</span>
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
