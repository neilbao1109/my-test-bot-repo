import { useState, useCallback } from 'react';
import { socketService } from './services/socket';
import { useSocket } from './hooks/useSocket';
import { useAppStore } from './stores/appStore';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import ThreadPanel from './components/ThreadPanel';
import MemberPanel from './components/MemberPanel';
import CreateRoomModal from './components/CreateRoomModal';

export default function App() {
  const { user, setUser, setRooms, setActiveRoom } = useAppStore();
  const [loading, setLoading] = useState(false);

  // Set up socket listeners
  useSocket();

  const handleLogin = useCallback(async (username: string) => {
    setLoading(true);
    try {
      socketService.connect();
      const result = await socketService.auth(username);
      setUser(result.user);
      setRooms(result.rooms);
      if (result.rooms.length > 0) {
        setActiveRoom(result.rooms[0].id);
      }
    } catch (err) {
      console.error('Auth failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="h-screen flex overflow-hidden bg-dark-bg">
      <Sidebar />
      <ChatView />
      <ThreadPanel />
      <MemberPanel />
      <CreateRoomModal />
    </div>
  );
}
