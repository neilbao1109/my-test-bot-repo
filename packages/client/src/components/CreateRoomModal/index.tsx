import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import type { User } from '../../types';

export default function CreateRoomModal() {
  const { showCreateRoom, setShowCreateRoom, user } = useAppStore();
  const [name, setName] = useState('');
  const [type, setType] = useState<'dm' | 'group'>('group');
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
      setSearchResults(results.filter((u) => u.id !== user?.id && !u.isBot));
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, user?.id]);

  if (!showCreateRoom) return null;

  const handleCreate = async () => {
    if (!name.trim()) return;
    const memberIds = selectedUsers.map((u) => u.id);
    const room = await socketService.createRoom(name.trim(), type, memberIds);
    useAppStore.getState().addRoom(room);
    useAppStore.getState().setActiveRoom(room.id);
    setShowCreateRoom(false);
  };

  const toggleUser = (u: User) => {
    if (selectedUsers.some((s) => s.id === u.id)) {
      setSelectedUsers(selectedUsers.filter((s) => s.id !== u.id));
    } else {
      setSelectedUsers([...selectedUsers, u]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <h2 className="text-lg font-semibold text-white">Create Room</h2>
          <button
            onClick={() => setShowCreateRoom(false)}
            className="text-dark-muted hover:text-white p-1 rounded transition"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Room type */}
          <div className="flex gap-2">
            <button
              onClick={() => setType('dm')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                type === 'dm'
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-hover text-dark-muted hover:text-white'
              }`}
            >
              💬 Direct Message
            </button>
            <button
              onClick={() => setType('group')}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
                type === 'group'
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-hover text-dark-muted hover:text-white'
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
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
            autoFocus
          />

          {/* User search for group */}
          {type === 'group' && (
            <>
              <div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users to invite..."
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-dark-muted focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                        className="hover:text-white"
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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-dark-border">
          <button
            onClick={() => setShowCreateRoom(false)}
            className="px-4 py-2 text-sm text-dark-muted hover:text-white rounded-lg hover:bg-dark-hover transition"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
