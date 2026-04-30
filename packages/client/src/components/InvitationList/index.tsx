import { useState, useEffect } from 'react';
import { socketService } from '../../services/socket';
import { useAppStore } from '../../stores/appStore';

interface Invitation {
  id: string;
  type: string;
  fromUser: string;
  toUser: string;
  resourceId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const typeLabels: Record<string, string> = {
  room: '👥 Group Room',
  dm: '💬 DM',
  bot_share: '🤖 Bot Share',
};

export default function InvitationList({ onClose }: { onClose: () => void }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const decrementCount = useAppStore((s) => s.decrementInvitationCount);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h2 className="text-lg font-semibold text-dark-text">Invitations</h2>
          <button onClick={onClose} className="text-dark-muted hover:text-dark-text text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-dark-muted text-center py-8">Loading...</p>
          ) : invitations.length === 0 ? (
            <p className="text-dark-muted text-center py-8">No pending invitations</p>
          ) : (
            invitations.map((inv) => (
              <div key={inv.id} className="bg-dark-hover rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-dark-text">{typeLabels[inv.type] || inv.type}</span>
                  <span className="text-xs text-dark-muted">{timeAgo(inv.createdAt)}</span>
                </div>
                <p className="text-xs text-dark-muted">From: {inv.fromUser}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(inv.id)}
                    className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 rounded-lg transition"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleReject(inv.id)}
                    className="flex-1 px-3 py-1.5 text-sm font-medium text-dark-muted hover:text-dark-text bg-dark-surface hover:bg-dark-border rounded-lg transition"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
