import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import UserAvatar from '../UserAvatar';
import { useState, useEffect, useMemo } from 'react';
import type { User } from '../../types';

const EMPTY_MEMBERS: User[] = [];

interface BotInfo {
  id: string;
  username: string;
  avatarUrl?: string;
  status: string;
  isOnline?: boolean;
}

export default function MemberPanel() {
  const showMembers = useAppStore(s => s.showMembers);
  const toggleMembers = useAppStore(s => s.toggleMembers);
  const activeRoomId = useAppStore(s => s.activeRoomId);
  const rooms = useAppStore(s => s.rooms);
  const onlineUsers = useAppStore(s => s.onlineUsers);
  const user = useAppStore(s => s.user);
  const friends = useAppStore(s => s.friends);
  const members = useAppStore(s => (s.activeRoomId && s.roomMembers[s.activeRoomId]) || EMPTY_MEMBERS);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [inviteView, setInviteView] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  const memberIds = members.map(m => m.id).join(',');
  const friendIds = useMemo(() => new Set(friends.map(f => f.id)), [friends]);
  const existingMemberIds = useMemo(() => new Set(memberIds.split(',').filter(Boolean)), [memberIds]);

  const availableBots = useMemo(() => {
    const filtered = bots.filter(b => !existingMemberIds.has(b.id));
    if (!filterQuery.trim()) return filtered;
    const q = filterQuery.toLowerCase();
    return filtered.filter(b => b.username.toLowerCase().includes(q));
  }, [bots, filterQuery, existingMemberIds]);

  const availableUsers = useMemo(() => {
    const filtered = users.filter(u => !existingMemberIds.has(u.id) && u.id !== user?.id);
    if (!filterQuery.trim()) return filtered;
    const q = filterQuery.toLowerCase();
    return filtered.filter(u => u.username.toLowerCase().includes(q));
  }, [users, filterQuery, existingMemberIds, user]);

  if (!showMembers || !activeRoomId) return null;

  const activeRoom = rooms.find((r) => r.id === activeRoomId);
  const isGroup = activeRoom?.type === 'group';

  const handleAddFriend = async (userId: string) => {
    await socketService.sendFriendRequest(userId);
    setSentRequests(prev => new Set([...prev, userId]));
  };

  const openInviteView = () => {
    setInviteView(true);
    setFilterQuery('');
    setSelectedIds(new Set());
    setLoading(true);
    Promise.all([
      socketService.listAvailableBots(),
      socketService.getFriends(),
    ]).then(([botRes, friendRes]) => {
      setBots((botRes.bots || []).filter((b: BotInfo) => b.status === 'active'));
      setUsers(friendRes.friends || []);
    }).finally(() => setLoading(false));
  };

  const closeInviteView = () => {
    setInviteView(false);
    setFilterQuery('');
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filter out existing members — computed above (before early return)

  const handleConfirmInvite = async () => {
    if (selectedIds.size === 0 || inviting) return;
    setInviting(true);

    try {
      if (isGroup) {
        // Group room: add bots directly, invite humans
        const promises: Promise<any>[] = [];
        for (const id of selectedIds) {
          const bot = bots.find(b => b.id === id);
          if (bot) {
            promises.push(socketService.addBotToRoom(activeRoomId, id));
          } else {
            promises.push(socketService.inviteToRoom(activeRoomId, id));
          }
        }
        await Promise.all(promises);
        // Refresh members by re-joining
        socketService.joinRoom(activeRoomId);
        closeInviteView();
      } else {
        // DM/Bot room: create a new group
        const currentMembers = members.map(m => ({ id: m.id, username: m.username }));
        const newSelectedMembers: { id: string; username: string }[] = [];
        for (const id of selectedIds) {
          const bot = bots.find(b => b.id === id);
          const usr = users.find(u => u.id === id);
          if (bot) newSelectedMembers.push({ id: bot.id, username: bot.username });
          else if (usr) newSelectedMembers.push({ id: usr.id, username: usr.username });
        }

        const allMembers = [...currentMembers, ...newSelectedMembers];
        const roomName = allMembers.map(m => m.username).join(', ').slice(0, 30);

        // Current members (excluding self) join directly; new members get invited
        const currentNonSelfIds = currentMembers.filter(m => m.id !== user?.id).map(m => m.id);
        const newMemberIds = newSelectedMembers.map(m => m.id);
        const allMemberIds = [...currentNonSelfIds, ...newMemberIds];

        const room = await socketService.createRoom(roomName, 'group', allMemberIds);
        if (room && !('error' in room)) {
          socketService.joinRoom(room.id);
          const store = useAppStore.getState();
          store.addRoom(room);
          store.setActiveRoom(room.id);
          useAppStore.setState({ mobileView: 'chat' });
          toggleMembers();
        }
      }
    } finally {
      setInviting(false);
    }
  };

  // Invite view
  if (inviteView) {
    return (
      <div className="fixed inset-0 z-30 w-full bg-dark-surface flex flex-col h-full md:static md:inset-auto md:z-auto md:w-64 md:border-l md:border-dark-border" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <div className="flex items-center gap-2">
            <button onClick={closeInviteView} className="text-dark-muted hover:text-dark-text p-1 rounded transition text-sm">←</button>
            <h3 className="font-semibold text-dark-text text-sm">Invite Members</h3>
          </div>
          <button onClick={toggleMembers} className="text-dark-muted hover:text-dark-text p-1 rounded transition">✕</button>
        </div>

        {/* Filter */}
        <div className="px-3 py-2">
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter..."
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-dark-muted text-center py-4">Loading...</p>
          ) : (
            <>
              {/* Bots section */}
              {availableBots.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-medium text-dark-muted uppercase tracking-wider bg-dark-bg/50 sticky top-0">🤖 Bots</div>
                  {availableBots.map((bot) => {
                    const isSelected = selectedIds.has(bot.id);
                    const isOnline = onlineUsers.has(bot.id);
                    return (
                      <button
                        key={bot.id}
                        onClick={() => toggleSelected(bot.id)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-dark-hover transition ${isSelected ? 'bg-primary-600/10' : ''}`}
                      >
                        <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${isSelected ? 'bg-primary-600 border-primary-600 text-white' : 'border-dark-muted'}`}>{isSelected && '✓'}</span>
                        <span className="relative w-6 h-6 rounded-full bg-dark-hover flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {bot.username.charAt(0).toUpperCase()}
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-dark-surface ${isOnline ? 'bg-green-500' : 'bg-dark-muted'}`} />
                        </span>
                        <span className="text-dark-text truncate">{bot.username}</span>
                      </button>
                    );
                  })}
                </>
              )}
              {/* Members section */}
              {availableUsers.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[10px] font-medium text-dark-muted uppercase tracking-wider bg-dark-bg/50 sticky top-0">👥 Members</div>
                  {availableUsers.map((u) => {
                    const isSelected = selectedIds.has(u.id);
                    const isOnline = onlineUsers.has(u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleSelected(u.id)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-dark-hover transition ${isSelected ? 'bg-primary-600/10' : ''}`}
                      >
                        <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${isSelected ? 'bg-primary-600 border-primary-600 text-white' : 'border-dark-muted'}`}>{isSelected && '✓'}</span>
                        <span className="relative w-6 h-6 rounded-full bg-dark-hover flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {u.username.charAt(0).toUpperCase()}
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-dark-surface ${isOnline ? 'bg-green-500' : 'bg-dark-muted'}`} />
                        </span>
                        <span className="text-dark-text truncate">{u.username}</span>
                      </button>
                    );
                  })}
                </>
              )}
              {availableBots.length === 0 && availableUsers.length === 0 && (
                <p className="text-xs text-dark-muted text-center py-4">No available members</p>
              )}
            </>
          )}
        </div>

        {/* Confirm button */}
        <div className="px-3 py-3 border-t border-dark-border">
          <button
            onClick={handleConfirmInvite}
            disabled={selectedIds.size === 0 || inviting}
            className="w-full py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {inviting ? 'Inviting...' : `Confirm Invite (${selectedIds.size})`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-30 w-full bg-dark-surface flex flex-col h-full md:static md:inset-auto md:z-auto md:w-64 md:border-l md:border-dark-border" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
        <div className="flex items-center gap-2">
          <span className="text-lg">👥</span>
          <h3 className="font-semibold text-dark-text text-sm">Members</h3>
          <span className="text-xs text-dark-muted">{members.length}</span>
        </div>
        <button
          onClick={toggleMembers}
          className="text-dark-muted hover:text-dark-text p-1 rounded transition"
        >
          ✕
        </button>
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto py-2">
        {(() => {
          const online = members.filter((m) => onlineUsers.has(m.id) || m.isOnline);
          const offline = members.filter((m) => !onlineUsers.has(m.id) && !m.isOnline);
          return (
            <>
              {online.length > 0 && (
                <div className="px-3 py-1">
                  <span className="text-xs font-semibold text-dark-muted uppercase tracking-wider">
                    Online — {online.length}
                  </span>
                </div>
              )}
              {online.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-dark-hover/50 transition"
                >
                  <UserAvatar username={m.username} isBot={m.isBot} isOnline={true} size="sm" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-dark-text truncate block">{m.username}</span>
                    {m.isBot && (
                      <span className="text-[10px] text-primary-400">BOT</span>
                    )}
                  </div>
                  {isGroup && !m.isBot && m.id !== user?.id && !friendIds.has(m.id) && (
                    sentRequests.has(m.id) ? (
                      <span className="text-[10px] text-dark-muted">已发送</span>
                    ) : (
                      <button
                        onClick={() => handleAddFriend(m.id)}
                        className="text-[10px] bg-primary-600/20 text-primary-400 px-1.5 py-0.5 rounded hover:bg-primary-600/40 transition"
                      >
                        加好友
                      </button>
                    )
                  )}
                </div>
              ))}

              {offline.length > 0 && (
                <div className="px-3 py-1 mt-2">
                  <span className="text-xs font-semibold text-dark-muted uppercase tracking-wider">
                    Offline — {offline.length}
                  </span>
                </div>
              )}
              {offline.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-dark-hover/50 transition opacity-60"
                >
                  <UserAvatar username={m.username} isBot={m.isBot} isOnline={false} size="sm" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-dark-text truncate block">{m.username}</span>
                    {m.isBot && (
                      <span className="text-[10px] text-primary-400">BOT</span>
                    )}
                  </div>
                  {isGroup && !m.isBot && m.id !== user?.id && !friendIds.has(m.id) && (
                    sentRequests.has(m.id) ? (
                      <span className="text-[10px] text-dark-muted">已发送</span>
                    ) : (
                      <button
                        onClick={() => handleAddFriend(m.id)}
                        className="text-[10px] bg-primary-600/20 text-primary-400 px-1.5 py-0.5 rounded hover:bg-primary-600/40 transition"
                      >
                        加好友
                      </button>
                    )
                  )}
                </div>
              ))}
            </>
          );
        })()}
      </div>

      {/* Invite button */}
      <div className="px-3 py-3 border-t border-dark-border">
        <button
          onClick={openInviteView}
          className="w-full py-2 text-sm font-medium text-primary-400 bg-primary-600/10 rounded-lg hover:bg-primary-600/20 transition flex items-center justify-center gap-1"
        >
          ＋ Invite Members
        </button>
      </div>

      {/* Leave group button */}
      {isGroup && (
        <div className="p-3 border-t border-dark-border">
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="w-full py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg transition"
          >
            🚪 离开群聊
          </button>
        </div>
      )}

      {/* Leave confirm modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <h3 className="text-sm font-semibold text-dark-text mb-2">确定离开群聊？</h3>
            <p className="text-xs text-dark-muted mb-4">离开后将不再接收该群的消息，但可以被重新邀请加入。</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="px-3 py-1.5 text-sm text-dark-muted hover:text-dark-text rounded-lg hover:bg-dark-hover transition"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  await socketService.leaveRoom(activeRoomId);
                  setShowLeaveConfirm(false);
                  toggleMembers();
                  useAppStore.getState().removeRoom(activeRoomId);
                  useAppStore.getState().setActiveRoom('');
                }}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-500 transition"
              >
                确定离开
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
