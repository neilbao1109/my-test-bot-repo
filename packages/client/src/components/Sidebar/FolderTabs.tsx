import clsx from 'clsx';
import { useAppStore } from '../../stores/appStore';

export default function FolderTabs({ onCreateFolder }: { onCreateFolder: () => void }) {
  const { folders, activeFolderId, setActiveFolderId } = useAppStore();

  return (
    <div className="flex items-center gap-0.5 px-3 py-2 border-b border-dark-border overflow-x-auto scrollbar-none">
      {folders.map((folder) => (
        <button
          key={folder.id}
          onClick={() => setActiveFolderId(folder.id)}
          className={clsx(
            'px-2.5 py-1 text-xs rounded-md whitespace-nowrap transition font-medium',
            activeFolderId === folder.id
              ? 'bg-primary-600/20 text-primary-400'
              : 'text-dark-muted hover:text-dark-text hover:bg-dark-hover'
          )}
        >
          {folder.name}
        </button>
      ))}
      <button
        onClick={onCreateFolder}
        className="px-1.5 py-1 text-xs text-dark-muted hover:text-dark-text hover:bg-dark-hover rounded-md transition flex-shrink-0"
        title="New folder"
      >
        ＋
      </button>
    </div>
  );
}
