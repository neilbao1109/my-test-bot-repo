import { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import InvitationList from '../InvitationList';

export default function InvitationBadge() {
  const count = useAppStore((s) => s.pendingInvitationCount);
  const [showList, setShowList] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowList(true)}
        className="relative text-dark-muted hover:text-dark-text p-1.5 rounded-lg hover:bg-dark-hover transition"
        title="Invitations"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {showList && <InvitationList onClose={() => setShowList(false)} />}
    </>
  );
}
