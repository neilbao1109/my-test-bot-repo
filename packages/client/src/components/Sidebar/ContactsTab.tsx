import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../../hooks/useT';
import { socketService } from '../../services/socket';
import UserAvatar from '../UserAvatar';
import type { User } from '../../types';

export default function ContactsTab() {
  const { friends, setFriends, friendRequests, setFriendRequests, setFriendProfileUser, onlineUsers, pendingInvitationCount } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [showRequests, setShowRequests] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showInvitations, setShowInvitations] = useState(false);
  const t = useT();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [friendsRes, requestsRes] = await Promise.all([
      socketService.getFriends(),
      socketService.getFriendRequests(),
    ]);
    setFriends(friendsRes.friends);
    setFriendRequests(requestsRes);
    setLoading(false);
  };

  // Group friends by first letter
  const grouped = useMemo(() => {
    const groups: Record<string, User[]> = {};
    for (const f of friends) {
      const first = f.username[0]?.toUpperCase() || '#';
      const key = /[A-Z]/.test(first) ? first : '#';
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    }
    return Object.entries(groups).sort(([a], [b]) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b));
  }, [friends]);

  const incomingCount = friendRequests.incoming.length;

  if (showInvitations) {
    return <InvitationPanel onBack={() => setShowInvitations(false)} />;
  }

  if (showRequests) {
    return <FriendRequestsPanel onBack={() => { setShowRequests(false); loadData(); }} />;
  }

  if (showSearch) {
    return <FriendSearchPanel onBack={() => { setShowSearch(false); loadData(); }} />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Actions */}
      <div className="p-3 space-y-1">
        <button
          onClick={() => setShowSearch(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-dark-text hover:bg-dark-hover rounded-lg transition"
        >
          <span className="text-lg">🔍</span>
          <span>{t('contacts.addFriend')}</span>
        </button>
        <button
          onClick={() => setShowRequests(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-dark-text hover:bg-dark-hover rounded-lg transition"
        >
          <span className="text-lg">📬</span>
          <span>{t('contacts.friendRequests')}</span>
          {incomingCount > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {incomingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setShowInvitations(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-dark-text hover:bg-dark-hover rounded-lg transition"
        >
          <span className="text-lg">📩</span>
          <span>{t('contacts.roomInvitations')}</span>
          {pendingInvitationCount > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {pendingInvitationCount}
            </span>
          )}
        </button>
      </div>

      {/* Friend list */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="text-center text-dark-muted py-8 text-sm">{t('contacts.loading')}</div>
        ) : friends.length === 0 ? (
          <div className="text-center text-dark-muted py-8 text-sm">{t('contacts.noFriends')}</div>
        ) : (
          grouped.map(([letter, users]) => (
            <div key={letter}>
              <div className="px-4 py-1 text-xs font-semibold text-dark-muted uppercase tracking-wider sticky top-0 bg-dark-surface">
                {letter}
              </div>
              {users.map(user => (
                <button
                  key={user.id}
                  onClick={() => setFriendProfileUser(user)}
                  className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-dark-hover/50 transition text-left"
                >
                  <UserAvatar username={user.username} isBot={false} isOnline={onlineUsers.has(user.id)} size="sm" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-dark-text truncate block">{user.username}</span>
                    {user.email && (
                      <span className="text-xs text-dark-muted truncate block">{user.email}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FriendRequestsPanel({ onBack }: { onBack: () => void }) {
  const { friendRequests, setFriendRequests } = useAppStore();
  const [loading, setLoading] = useState(false);
  const t = useT();

  const handleAccept = async (friendshipId: string) => {
    setLoading(true);
    await socketService.acceptFriendRequest(friendshipId);
    const res = await socketService.getFriendRequests();
    setFriendRequests(res);
    setLoading(false);
  };

  const handleReject = async (friendshipId: string) => {
    setLoading(true);
    await socketService.rejectFriendRequest(friendshipId);
    const res = await socketService.getFriendRequests();
    setFriendRequests(res);
    setLoading(false);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-border">
        <button onClick={onBack} className="text-dark-muted hover:text-dark-text p-1 rounded transition">
          ←
        </button>
        <h3 className="font-semibold text-dark-text text-sm">{t('contacts.friendRequests')}</h3>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {friendRequests.incoming.length > 0 && (
          <>
            <div className="px-4 py-1 text-xs font-semibold text-dark-muted uppercase">{t('contacts.incomingRequests')}</div>
            {friendRequests.incoming.map((req: any) => (
              <div key={req.id} className="flex items-center gap-2.5 px-4 py-2">
                <UserAvatar username={req.user.username} isBot={false} isOnline={false} size="sm" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-dark-text block">{req.user.username}</span>
                  {req.message && <span className="text-xs text-dark-muted">{req.message}</span>}
                </div>
                <button
                  onClick={() => handleAccept(req.id)}
                  disabled={loading}
                  className="text-xs bg-primary-600 text-white px-2 py-1 rounded hover:bg-primary-700 transition"
                >
                  {t('contacts.accept')}
                </button>
              </div>
            ))}
          </>
        )}
        {friendRequests.outgoing.length > 0 && (
          <>
            <div className="px-4 py-1 text-xs font-semibold text-dark-muted uppercase mt-2">{t('contacts.outgoingRequests')}</div>
            {friendRequests.outgoing.map((req: any) => (
              <div key={req.id} className="flex items-center gap-2.5 px-4 py-2 opacity-60">
                <UserAvatar username={req.user.username} isBot={false} isOnline={false} size="sm" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-dark-text block">{req.user.username}</span>
                </div>
                <span className="text-xs text-dark-muted">{t('contacts.waitingAccept')}</span>
              </div>
            ))}
          </>
        )}
        {friendRequests.incoming.length === 0 && friendRequests.outgoing.length === 0 && (
          <div className="text-center text-dark-muted py-8 text-sm">{t('contacts.noRequests')}</div>
        )}
      </div>
    </div>
  );
}

function FriendSearchPanel({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const { friends } = useAppStore();
  const t = useT();

  const friendIds = useMemo(() => new Set(friends.map(f => f.id)), [friends]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    const res = await socketService.searchFriends(query.trim());
    setResults(res.users);
    setSearching(false);
  };

  const handleSendRequest = async (userId: string) => {
    await socketService.sendFriendRequest(userId);
    setSentIds(prev => new Set([...prev, userId]));
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-border">
        <button onClick={onBack} className="text-dark-muted hover:text-dark-text p-1 rounded transition">
          ←
        </button>
        <h3 className="font-semibold text-dark-text text-sm">{t('contacts.addFriend')}</h3>
      </div>
      <div className="p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={t('contacts.searchPlaceholder')}
            className="flex-1 bg-dark-hover text-dark-text rounded-lg px-3 py-2 text-sm border border-dark-border focus:border-primary-500 focus:outline-none"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="bg-primary-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-primary-700 transition"
          >
                {t('contacts.search')}
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {results.map(user => (
          <div key={user.id} className="flex items-center gap-2.5 px-4 py-2">
            <UserAvatar username={user.username} isBot={false} isOnline={false} size="sm" />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-dark-text block">{user.username}</span>
              {user.email && <span className="text-xs text-dark-muted">{user.email}</span>}
            </div>
            {friendIds.has(user.id) ? (
              <span className="text-xs text-dark-muted">{t('contacts.alreadyFriend')}</span>
            ) : sentIds.has(user.id) ? (
              <span className="text-xs text-dark-muted">{t('contacts.sent')}</span>
            ) : (
              <button
                onClick={() => handleSendRequest(user.id)}
                className="text-xs bg-primary-600 text-white px-2 py-1 rounded hover:bg-primary-700 transition"
              >
                {t('contacts.add')}
              </button>
            )}
          </div>
        ))}
        {results.length === 0 && query && !searching && (
          <div className="text-center text-dark-muted py-8 text-sm">{t('contacts.noUsers')}</div>
        )}
      </div>
    </div>
  );
}

interface Invitation {
  id: string;
  type: string;
  fromUser: string;
  fromUsername?: string;
  fromAvatarUrl?: string;
  toUser: string;
  resourceId: string;
  resourceName?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}


function timeAgo(dateStr: string, t: (key: any, params?: any) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('contacts.justNow');
  if (mins < 60) return t('contacts.minutesAgo', { mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('contacts.hoursAgo', { hours });
  return t('contacts.daysAgo', { days: Math.floor(hours / 24) });
}

function InvitationPanel({ onBack }: { onBack: () => void }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const decrementCount = useAppStore((s) => s.decrementInvitationCount);
  const t = useT();

  useEffect(() => {
    socketService.getInvitations().then((result) => {
      setInvitations(result.invitations || []);
      setLoading(false);
    });
  }, []);

  const handleAccept = async (id: string) => {
    const result = await socketService.acceptInvitation(id);
    if (result.success) {
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      decrementCount();
    }
  };

  const handleReject = async (id: string) => {
    const result = await socketService.rejectInvitation(id);
    if (result.success) {
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      decrementCount();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-border">
        <button onClick={onBack} className="text-dark-muted hover:text-dark-text p-1 rounded transition">
          ←
        </button>
        <h3 className="font-semibold text-dark-text text-sm">{t('contacts.roomInvitations')}</h3>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="text-center text-dark-muted py-8 text-sm">{t('contacts.loading')}</div>
        ) : invitations.length === 0 ? (
          <div className="text-center text-dark-muted py-8 text-sm">{t('contacts.noInvitations')}</div>
        ) : (
          invitations.map((inv) => (
            <div key={inv.id} className="px-4 py-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-dark-text">{{ room: t('contacts.inviteRoom'), dm: t('contacts.inviteDm'), bot_share: t('contacts.inviteBotShare') }[inv.type] || inv.type}</span>
                <span className="text-xs text-dark-muted">{timeAgo(inv.createdAt, t)}</span>
              </div>
              {inv.resourceName && (
                <p className="text-sm text-dark-text">「{inv.resourceName}」</p>
              )}
              <p className="text-xs text-dark-muted">{t('contacts.from', { name: inv.fromUsername || inv.fromUser })}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(inv.id)}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-500 rounded-lg transition"
                >
                  {t('contacts.accept')}
                </button>
                <button
                  onClick={() => handleReject(inv.id)}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-dark-muted hover:text-dark-text bg-dark-hover hover:bg-dark-border rounded-lg transition"
                >
                  {t('contacts.reject')}
                </button>
              </div>
              <div className="border-b border-dark-border/50 mt-1" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
