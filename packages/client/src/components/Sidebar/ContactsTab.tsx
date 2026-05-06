import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import UserAvatar from '../UserAvatar';
import type { User } from '../../types';

export default function ContactsTab() {
  const { friends, setFriends, friendRequests, setFriendRequests, setFriendProfileUser, onlineUsers } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [showRequests, setShowRequests] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

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
          <span>添加好友</span>
        </button>
        <button
          onClick={() => setShowRequests(true)}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-dark-text hover:bg-dark-hover rounded-lg transition"
        >
          <span className="text-lg">📬</span>
          <span>好友请求</span>
          {incomingCount > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {incomingCount}
            </span>
          )}
        </button>
      </div>

      <div className="border-b border-dark-border" />

      {/* Friend list */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="text-center text-dark-muted py-8 text-sm">加载中...</div>
        ) : friends.length === 0 ? (
          <div className="text-center text-dark-muted py-8 text-sm">暂无好友</div>
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
        <h3 className="font-semibold text-dark-text text-sm">好友请求</h3>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {friendRequests.incoming.length > 0 && (
          <>
            <div className="px-4 py-1 text-xs font-semibold text-dark-muted uppercase">收到的请求</div>
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
                  接受
                </button>
                <button
                  onClick={() => handleReject(req.id)}
                  disabled={loading}
                  className="text-xs bg-dark-hover text-dark-muted px-2 py-1 rounded hover:bg-dark-border transition"
                >
                  拒绝
                </button>
              </div>
            ))}
          </>
        )}
        {friendRequests.outgoing.length > 0 && (
          <>
            <div className="px-4 py-1 text-xs font-semibold text-dark-muted uppercase mt-2">发出的请求</div>
            {friendRequests.outgoing.map((req: any) => (
              <div key={req.id} className="flex items-center gap-2.5 px-4 py-2 opacity-60">
                <UserAvatar username={req.user.username} isBot={false} isOnline={false} size="sm" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-dark-text block">{req.user.username}</span>
                </div>
                <span className="text-xs text-dark-muted">等待接受</span>
              </div>
            ))}
          </>
        )}
        {friendRequests.incoming.length === 0 && friendRequests.outgoing.length === 0 && (
          <div className="text-center text-dark-muted py-8 text-sm">暂无好友请求</div>
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
        <h3 className="font-semibold text-dark-text text-sm">添加好友</h3>
      </div>
      <div className="p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="输入 email 搜索..."
            className="flex-1 bg-dark-hover text-dark-text rounded-lg px-3 py-2 text-sm border border-dark-border focus:border-primary-500 focus:outline-none"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="bg-primary-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-primary-700 transition"
          >
            搜索
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
              <span className="text-xs text-dark-muted">已是好友</span>
            ) : sentIds.has(user.id) ? (
              <span className="text-xs text-dark-muted">已发送</span>
            ) : (
              <button
                onClick={() => handleSendRequest(user.id)}
                className="text-xs bg-primary-600 text-white px-2 py-1 rounded hover:bg-primary-700 transition"
              >
                添加
              </button>
            )}
          </div>
        ))}
        {results.length === 0 && query && !searching && (
          <div className="text-center text-dark-muted py-8 text-sm">未找到用户</div>
        )}
      </div>
    </div>
  );
}
