import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { getToken } from '../../services/auth';
import { useT } from '../../hooks/useT';

interface FileItem {
  id: string;
  hash: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploaderName: string;
  isBot: boolean;
  url: string;
  createdAt: string;
}

type FilterType = 'all' | 'image' | 'document' | 'other';

const FILTERS: FilterType[] = ['all', 'image', 'document', 'other'];

const EMPTY_FILES: FileItem[] = [];
const PAGE_SIZE = 30;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📄';
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('gz')) return '📦';
  if (mime.includes('json') || mime.includes('javascript') || mime.includes('css') || mime.includes('html')) return '💻';
  if (mime.startsWith('text/')) return '📝';
  return '📎';
}

export default function FilesPanel() {
  const showFilesPanel = useAppStore((s) => s.showFilesPanel);
  const setShowFilesPanel = useAppStore((s) => s.setShowFilesPanel);
  const activeRoomId = useAppStore((s) => s.activeRoomId);
  const t = useT();

  const [filter, setFilter] = useState<FilterType>('all');
  const [files, setFiles] = useState<FileItem[]>(EMPTY_FILES);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchFiles = useCallback(async (roomId: string, type: FilterType, offset: number, append: boolean) => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      if (type !== 'all') params.set('type', type);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));

      const res = await fetch(`/api/rooms/${roomId}/files?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setFiles(prev => append ? [...prev, ...data.files] : data.files);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showFilesPanel || !activeRoomId) return;
    setFiles(EMPTY_FILES);
    fetchFiles(activeRoomId, filter, 0, false);
  }, [showFilesPanel, activeRoomId, filter, fetchFiles]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loading || !hasMore || !activeRoomId) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      fetchFiles(activeRoomId, filter, files.length, true);
    }
  }, [loading, hasMore, activeRoomId, filter, files.length, fetchFiles]);

  if (!showFilesPanel) return null;

  const filterLabels: Record<FilterType, string> = {
    all: t('files.all'),
    image: t('files.images'),
    document: t('files.documents'),
    other: t('files.other'),
  };

  return (
    <>
      <div className="w-80 border-l border-dark-border bg-dark-surface flex flex-col h-full shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border">
          <h3 className="text-sm font-semibold text-dark-text">{t('chat.sharedFiles')}</h3>
          <button
            onClick={() => setShowFilesPanel(false)}
            className="text-dark-muted hover:text-dark-text transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex px-2 py-2 gap-1 border-b border-dark-border">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-full transition ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'text-dark-muted hover:bg-dark-hover hover:text-dark-text'
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>

        {/* File list */}
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
          {files.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-40 text-dark-muted text-sm">
              <span className="text-2xl mb-2">📂</span>
              {t('files.empty')}
            </div>
          )}

          {files.map(file => (
            <div
              key={file.id}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-dark-hover transition cursor-pointer border-b border-dark-border/50"
              onClick={() => {
                if (file.mimeType.startsWith('image/')) {
                  setPreviewFile(file);
                }
              }}
            >
              {/* Thumbnail or icon */}
              {file.mimeType.startsWith('image/') ? (
                <img
                  src={file.url}
                  alt={file.originalName}
                  className="w-10 h-10 rounded object-cover shrink-0 bg-dark-hover"
                  loading="lazy"
                />
              ) : (
                <span className="text-xl w-10 h-10 flex items-center justify-center shrink-0">
                  {fileIcon(file.mimeType)}
                </span>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-dark-text truncate">{file.originalName}</div>
                <div className="text-xs text-dark-muted">
                  {formatSize(file.size)} · {file.uploaderName} · {formatDate(file.createdAt)}
                </div>
              </div>

              {/* Download */}
              <a
                href={file.url}
                download={file.originalName}
                onClick={e => e.stopPropagation()}
                className="text-dark-muted hover:text-dark-text transition shrink-0"
                title="Download"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>
            </div>
          ))}

          {loading && (
            <div className="flex justify-center py-4">
              <div className="text-dark-muted text-sm">{t('chat.loading')}</div>
            </div>
          )}
        </div>

        {/* Footer with count */}
        {total > 0 && (
          <div className="px-4 py-2 border-t border-dark-border text-xs text-dark-muted">
            {files.length} / {total}
          </div>
        )}
      </div>

      {/* Image preview modal */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setPreviewFile(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img
              src={previewFile.url}
              alt={previewFile.originalName}
              className="max-w-full max-h-[85vh] rounded-lg"
            />
            <div className="absolute top-2 right-2 flex gap-2">
              <a
                href={previewFile.url}
                download={previewFile.originalName}
                className="bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>
              <button
                onClick={() => setPreviewFile(null)}
                className="bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="absolute bottom-2 left-2 bg-black/50 text-white text-sm px-3 py-1 rounded">
              {previewFile.originalName}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
