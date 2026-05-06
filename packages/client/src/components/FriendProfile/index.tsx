import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import UserAvatar from '../UserAvatar';

export default function FriendProfile() {
  const { friendProfileUser, setFriendProfileUser, onlineUsers, setActiveRoom, addRoom, rooms, removeFriendFromList } = useAppStore();
  const [removing, setRemoving] = useState(false);

  if (!friendProfileUser) return null;

  const user = friendProfileUser;
  const isOnline = onlineUsers.has(user.id);

  const handleSendMessage = async () => {
    const room = await socketService.createRoom(null, 'dm', [user.id]);
    if (room && !('error' in room)) {
      // Add room to store if not already present
      if (!rooms.find(r => r.id === room.id)) {
        addRoom(room);
      }
      setActiveRoom(room.id);
      useAppStore.setState({ mobileView: 'chat', sidebarTab: 'chat' });
      setFriendProfileUser(null);
    }
  };

  const handleRemoveFriend = async () => {
    if (!confirm(`确定删除好友 ${user.username}？`)) return;
    setRemoving(true);
    const result = await socketService.removeFriend(user.id);
    if (result.success) {
      removeFriendFromList(user.id);
      setFriendProfileUser(null);
    }
    setRemoving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setFriendProfileUser(null)}>
      <div className="bg-dark-surface rounded-xl border border-dark-border p-6 w-80 max-w-[90vw]" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col items-center gap-3">
          <UserAvatar username={user.username} isBot={false} isOnline={isOnline} size="lg" />
          <div className="text-center">
            <h3 className="text-lg font-semibold text-dark-text">{user.username}</h3>
            {user.email && <p className="text-sm text-dark-muted">{user.email}</p>}
            <p className="text-xs text-dark-muted mt-1">
              {isOnline ? '🟢 在线' : '⚫ 离线'}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-2">
          <button
            onClick={handleSendMessage}
            className="w-full bg-primary-600 text-white py-2 rounded-lg text-sm hover:bg-primary-700 transition"
          >
            💬 发消息
          </button>
          <button
            onClick={handleRemoveFriend}
            disabled={removing}
            className="w-full bg-dark-hover text-red-400 py-2 rounded-lg text-sm hover:bg-red-500/10 transition"
          >
            删除好友
          </button>
        </div>
      </div>
    </div>
  );
}
