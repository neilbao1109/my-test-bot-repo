import { useState, useCallback, useEffect } from 'react';
import { socketService } from './services/socket';
import { useSocket } from './hooks/useSocket';
import { useAppStore } from './stores/appStore';
import { getToken, getMe, clearToken, saveToken } from './services/auth';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import ThreadPanel from './components/ThreadPanel';
import MemberPanel from './components/MemberPanel';
import CreateRoomModal from './components/CreateRoomModal';
import BotRegistration from './components/BotRegistration';
import type { User } from './types';

function MainContent() {
  const { showThread, activeThread } = useAppStore();
  if (showThread && activeThread) {
    return <ThreadPanel />;
  }
  return <ChatView />;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
}

export default function App() {
  const { user, setUser, setRooms, setActiveRoom, mobileView } = useAppStore();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  // Set up socket listeners
  useSocket();

  // Auto-login from saved token
  useEffect(() => {
    const savedToken = getToken();
    if (savedToken) {
      getMe(savedToken)
        .then((u) => {
          setToken(savedToken);
          connectWithToken(savedToken, u);
        })
        .catch(() => {
          clearToken();
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const connectWithToken = useCallback(async (t: string, u: User) => {
    try {
      socketService.connect();
      const result = await socketService.auth(t);
      if (result.error) {
        clearToken();
        setLoading(false);
        return;
      }
      setUser(result.user);
      setRooms(result.rooms);
      // Set pending invitation count from auth
      if ((result as any).pendingInvitationCount !== undefined) {
        useAppStore.getState().setPendingInvitationCount((result as any).pendingInvitationCount);
      }
      // Store room members from auth response (includes members for DM display)
      for (const room of result.rooms) {
        if ((room as any).members) {
          useAppStore.getState().setRoomMembers(room.id, (room as any).members);
        }
      }
      if (result.rooms.length > 0) {
        const lastRoomId = localStorage.getItem('clawchat-active-room');
        const validRoom = lastRoomId && result.rooms.find((r: any) => r.id === lastRoomId);
        setActiveRoom(validRoom ? lastRoomId : result.rooms[0].id);
      }
    } catch (err) {
      console.error('Auth failed:', err);
      clearToken();
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogin = useCallback(async (u: User, t: string) => {
    setLoading(true);
    setToken(t);
    await connectWithToken(t, u);
  }, [connectWithToken]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-bg">
        <div className="text-dark-muted">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <>
      <div className="h-screen flex overflow-hidden bg-dark-bg max-w-[100vw]" id="app-shell">
        <div style={{ display: isMobile && mobileView !== 'list' ? 'none' : undefined }} className={isMobile ? 'w-full h-full' : 'contents'}>
          <Sidebar />
        </div>
        <div style={{ display: isMobile && mobileView !== 'chat' ? 'none' : undefined }} className={isMobile ? 'w-full h-full flex' : 'contents'}>
          <MainContent />
          <MemberPanel />
        </div>
      </div>
      <CreateRoomModal />
      <BotRegistration />
    </>
  );
}
