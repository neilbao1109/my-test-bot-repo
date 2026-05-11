import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import type { User } from '../../types';

interface BotInfo {
  id: string;
  username: string;
  avatarUrl?: string;
  status: string;
  isOnline?: boolean;
}

export default function CreateRoomModal() {
  const { showCreateRoom, setShowCreateRoom, user, onlineUsers } = useAppStore();
  const [name, setName] = useState('');
  const [type, setType] = useState<'bot' | 'group'>('bot');
  const [selectedBot, setSelectedBot] = useState<BotInfo | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [filterQuery, setFilterQuery] = useState('');

  // Data lists
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch bot + user lists when modal opens
  useEffect(() => {
    if (!showCreateRoom) {
      setName('');
      setType('bot');
      setSelectedBot(null);
      setSelectedUsers([]);
      setFilterQuery('');
      setBots([]);
      setUsers([]);
      return;
    }
    setLoading(true);
    Promise.all([
      socketService.listAvailableBots(),
      socketService.listUsers(),
    ]).then(([botRes, userRes]) => {
      setBots((botRes.bots || []).filter((b: BotInfo) => b.status === 'active'));
      setUsers(userRes.users || []);
    }).finally(() => setLoading(false));
  }, [showCreateRoom]);

  // Auto-fill room name when bot selected
  useEffect(() => {
    if (type === 'bot' && selectedBot) {
      setName(`${selectedBot.username} Chat`);
    }
  }, [selectedBot, type]);

  // Filtered users for group tab
  const filteredUsers = useMemo(() => {
    if (!filterQuery.trim()) return users;
    const q = filterQuery.toLowerCase();
    return users.filter(u => u.username.toLowerCase().includes(q));
  }, [users, filterQuery]);

  if (!showCreateRoom) return null;

  const finishCreateRoom = async (room: any) => {
    const store = useAppStore.getState();
    if (!store.rooms.some(r => r.id === room.id)) {
      store.addRoom(room);
    }
    socketService.joinRoom(room.id);
    await new Promise<void>((resolve) => {
      const check = () => {
        const members = useAppStore.getState().roomMembers[room.id];
        if (members && members.length > 0) resolve();
        else setTimeout(check, 50);
      };
      check();
      setTimeout(resolve, 2000);
    });
    useAppStore.getState().setActiveRoom(room.id);
    useAppStore.setState({ mobileView: 'chat' });
    setShowCreateRoom(false);
  };

  const handleCreate = async () => {
    if (type === 'bot') {
      if (!selectedBot || !name.trim()) return;
      const room = await socketService.createRoom(name.trim(), 'bot', [selectedBot.id]);
      if (room && !('error' in room)) await finishCreateRoom(room);
    } else {
      if (!name.trim()) return;
      const memberIds = selectedUsers.map((u) => u.id);
      const room = await socketService.createRoom(name.trim(), 'group', memberIds);
      if (room && !('error' in room)) await finishCreateRoom(room);
    }
  };

  const toggleUser = (u: User) => {
    if (selectedUsers.some((s) => s.id === u.id)) {
      setSelectedUsers(selectedUsers.filter((s) => s.id !== u.id));
    } else {
      setSelectedUsers([...selectedUsers, u]);
    }
  };

  const isCreateDisabled = type === 'bot'
    ? (!selectedBot || !name.trim())
    : !name.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <h2 className="text-lg font-semibold text-dark-text">
            {type === 'bot' ? 'New Bot Chat' : 'Create Room'}
          </h2>
          <button
            onClick={() => setShowCreateRoom(false)}
            className="text-dark-muted hover:text-dark-text p-1 rounded transition"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Room type tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => { setType('bot'); setSelectedUsers([]); setFilterQuery(''); }}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                type === 'bot'
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-hover text-dark-muted hover:text-dark-text'
              }`}
            >
              🤖 Bot
            </button>
            <button
              onClick={() => { setType('group'); setSelectedBot(null); setFilterQuery(''); }}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                type === 'group'
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-hover text-dark-muted hover:text-dark-text'
              }`}
            >
              👥 Group
            </button>
          </div>

          {/* Room name */}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Room name"
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
          />

          {loading ? (
            <p className="text-xs text-dark-muted text-center py-4">Loading...</p>
          ) : type === 'bot' ? (
            /* Bot tab: radio list */
            <div className="max-h-52 overflow-y-auto border border-dark-border rounded-lg">
              {bots.length === 0 ? (
                <p className="text-xs text-dark-muted text-center py-4">No bots available</p>
              ) : bots.map((bot) => {
                const isOnline = onlineUsers.has(bot.id);
                const isSelected = selectedBot?.id === bot.id;
                return (
                  <button
                    key={bot.id}
                    onClick={() => setSelectedBot(isSelected ? null : bot)}
                    className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-3 hover:bg-dark-hover transition ${
                      isSelected ? 'bg-primary-600/10' : ''
                    }`}
                  >
                    {/* Radio indicator */}
                    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      isSelected ? 'border-primary-500' : 'border-dark-muted'
                    }`}>
                      {isSelected && <span className="w-2 h-2 rounded-full bg-primary-500" />}
                    </span>
                    {/* Avatar */}
                    <span className="relative w-7 h-7 rounded-full bg-dark-hover flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {bot.username.charAt(0).toUpperCase()}
                      {/* Online dot */}
                      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-dark-surface ${
                        isOnline ? 'bg-green-500' : 'bg-dark-muted'
                      }`} />
                    </span>
                    <span className={isSelected ? 'text-primary-400' : 'text-dark-text'}>
                      {bot.username}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            /* Group tab: filter + checkbox list */
            <>
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter users..."
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
              />

              {/* Selected chips */}
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedUsers.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-primary-600/20 text-primary-400 rounded-full text-xs"
                    >
                      {u.username}
                      <button onClick={() => toggleUser(u)} className="hover:text-dark-text">✕</button>
                    </span>
                  ))}
                </div>
              )}

              <div className="max-h-44 overflow-y-auto border border-dark-border rounded-lg">
                {filteredUsers.length === 0 ? (
                  <p className="text-xs text-dark-muted text-center py-4">No users found</p>
                ) : filteredUsers.map((u) => {
                  const isSelected = selectedUsers.some((s) => s.id === u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleUser(u)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-dark-hover transition ${
                        isSelected ? 'bg-primary-600/10' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${
                        isSelected
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-dark-muted'
                      }`}>
                        {isSelected && '✓'}
                      </span>
                      <span className="w-6 h-6 rounded-full bg-dark-hover flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {u.username.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-dark-text">{u.username}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-dark-border">
          <button
            onClick={() => setShowCreateRoom(false)}
            className="px-4 py-2 text-sm text-dark-muted hover:text-dark-text rounded-lg hover:bg-dark-hover transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreateDisabled}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {type === 'bot' ? 'Start Bot Chat' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
