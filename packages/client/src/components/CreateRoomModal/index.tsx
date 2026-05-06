import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import type { User } from '../../types';

export default function CreateRoomModal() {
  const { showCreateRoom, setShowCreateRoom, user } = useAppStore();
  const [name, setName] = useState('');
  const [type, setType] = useState<'dm' | 'group' | 'bot'>('group');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!showCreateRoom) {
      setName('');
      setType('group');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedUsers([]);
    }
  }, [showCreateRoom]);

  useEffect(() => {
    if (searchQuery.length < 1) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const results = await socketService.searchUsers(searchQuery);
      setSearchResults(type === 'bot'
        ? results.filter((u) => u.id !== user?.id && u.isBot)
        : results.filter((u) => u.id !== user?.id && !u.isBot)
      );
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, user?.id]);

  if (!showCreateRoom) return null;

  const finishCreateRoom = async (room: any) => {
    const store = useAppStore.getState();
    if (!store.rooms.some(r => r.id === room.id)) {
      store.addRoom(room);
    }
    // Pre-join and wait for members to load
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
      if (selectedUsers.length !== 1 || !name.trim()) return;
      const memberIds = selectedUsers.map((u) => u.id);
      const room = await socketService.createRoom(name.trim(), 'bot', memberIds);
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
      if (type === 'dm') {
        // DM: only one user
        setSelectedUsers([u]);
      } else {
        setSelectedUsers([...selectedUsers, u]);
      }
    }
  };

  const isCreateDisabled = type === 'bot' ? (selectedUsers.length !== 1 || !name.trim()) : !name.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <h2 className="text-lg font-semibold text-dark-text">{type === 'bot' ? 'New Bot Chat' : 'Create Room'}</h2>
          <button
            onClick={() => setShowCreateRoom(false)}
            className="text-dark-muted hover:text-dark-text p-1 rounded transition"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Room type */}
          <div className="flex gap-2">
            <button
              onClick={() => { setType('bot'); setSelectedUsers([]); setSearchQuery(''); }}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                type === 'bot'
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-hover text-dark-muted hover:text-dark-text'
              }`}
            >
              🤖 Bot
            </button>
            <button
              onClick={() => { setType('group'); setSelectedUsers([]); setSearchQuery(''); }}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                type === 'group'
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-hover text-dark-muted hover:text-dark-text'
              }`}
            >
              👥 Group
            </button>
          </div>

          {/* Room name - for group and bot */}
          {(type === 'group' || type === 'bot') && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Room name"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
              autoFocus
            />
          )}

          {/* User search - shown for both DM and Group */}
          <div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={type === 'bot' ? 'Search bot...' : 'Search users to invite...'}
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-dark-text placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* Selected users */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedUsers.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-primary-600/20 text-primary-400 rounded-full text-xs"
                >
                  {u.username}
                  <button
                    onClick={() => toggleUser(u)}
                    className="hover:text-dark-text"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="max-h-36 overflow-y-auto border border-dark-border rounded-lg">
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggleUser(u)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-dark-hover transition ${
                    selectedUsers.some((s) => s.id === u.id)
                      ? 'text-primary-400 bg-primary-600/10'
                      : 'text-dark-text'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-dark-hover flex items-center justify-center text-xs font-semibold">
                    {u.username.charAt(0).toUpperCase()}
                  </span>
                  {u.username}
                  {selectedUsers.some((s) => s.id === u.id) && (
                    <span className="ml-auto text-primary-400">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {searching && (
            <p className="text-xs text-dark-muted">Searching...</p>
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
