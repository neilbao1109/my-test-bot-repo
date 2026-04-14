import clsx from 'clsx';

interface UserAvatarProps {
  username: string;
  isBot?: boolean;
  isOnline?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const colors = [
  'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-teal-500', 'bg-cyan-500', 'bg-blue-500', 'bg-indigo-500',
  'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500',
];

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const sizes = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
};

export default function UserAvatar({ username, isBot, isOnline, size = 'md' }: UserAvatarProps) {
  const initial = username.charAt(0).toUpperCase();

  return (
    <div className="relative inline-flex">
      <div
        className={clsx(
          'rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0',
          sizes[size],
          isBot ? 'bg-primary-600' : hashColor(username)
        )}
      >
        {isBot ? '🤖' : initial}
      </div>
      {typeof isOnline === 'boolean' && (
        <span
          className={clsx(
            'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-dark-surface',
            isOnline ? 'bg-green-500' : 'bg-gray-500'
          )}
        />
      )}
    </div>
  );
}
