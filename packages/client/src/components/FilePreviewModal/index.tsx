import { useState, useEffect, useCallback, useRef } from 'react';
import { useT } from '../../hooks/useT';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfmSafe from '../../utils/remarkGfmSafe';
import rehypeHighlight from 'rehype-highlight';
import rehypeAutolink from '../../utils/rehypeAutolink';
import type { FileAttachment } from '../../types';
import { formatFileSize } from '../../utils/format';

/** Download file via fetch+blob to avoid iOS Safari navigation */
function triggerDownload(att: FileAttachment) {
  const url = att.url.startsWith('/api/files/')
    ? `${att.url}?name=${encodeURIComponent(att.originalName)}&download=1`
    : att.url;
  fetch(url)
    .then(r => r.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = att.originalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    })
    .catch(() => {
      // Fallback: direct navigation
      window.open(url, '_blank');
    });
}

interface FilePreviewModalProps {
  attachment: FileAttachment;
  onClose: () => void;
}

export default function FilePreviewModal({ attachment, onClose }: FilePreviewModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const t = useT();

  const isImage = attachment.mimeType.startsWith('image/');
  const isPdf = attachment.mimeType === 'application/pdf';
  const isVideo = attachment.mimeType.startsWith('video/');
  const isAudio = attachment.mimeType.startsWith('audio/');
  const isHtml = attachment.mimeType === 'text/html'
    || /\.html?$/i.test(attachment.originalName);
  const isText = !isHtml && (/^(text\/|application\/json|application\/javascript)/.test(attachment.mimeType)
    || /\.(md|txt|json|js|ts|tsx|jsx|py|sh|css|yml|yaml|toml|csv|xml|sql|log|env|cfg|ini|conf)$/i.test(attachment.originalName));
  const isMd = /\.md$/i.test(attachment.originalName);

  useEffect(() => {
    if (!isText && !isHtml && !isPdf) { setLoading(false); return; }
    if (isPdf) {
      fetch(attachment.url)
        .then(r => r.blob())
        .then(blob => {
          const url = URL.createObjectURL(blob);
          setPdfBlobUrl(url);
          setLoading(false);
        })
        .catch(() => { setError(true); setLoading(false); });
      return () => { if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl); };
    }
    fetch(attachment.url)
      .then(r => r.text())
      .then(text => { setContent(text); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [attachment.url, isText, isHtml, isPdf]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Image zoom state
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });
  const lastTouchDist = useRef<number | null>(null);
  const lastTapTime = useRef(0);
  const imgContainerRef = useRef<HTMLDivElement>(null);

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const clampTranslate = useCallback((s: number, tx: number, ty: number) => {
    if (s <= 1) return { x: 0, y: 0 };
    const maxX = (s - 1) * window.innerWidth / 2;
    const maxY = (s - 1) * window.innerHeight / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, tx)),
      y: Math.max(-maxY, Math.min(maxY, ty)),
    };
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => {
      const next = Math.max(0.5, Math.min(10, prev * delta));
      if (next <= 1) setTranslate({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Double click to toggle zoom
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (scale > 1.1) {
      resetZoom();
    } else {
      setScale(3);
    }
  }, [scale, resetZoom]);

  // Mouse drag to pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    translateStart.current = { ...translate };
  }, [scale, translate]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setTranslate(clampTranslate(scale, translateStart.current.x + dx, translateStart.current.y + dy));
  }, [isDragging, scale, clampTranslate]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch: pinch zoom + drag + double tap
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.hypot(dx, dy);
    } else if (e.touches.length === 1) {
      // Double tap detection
      const now = Date.now();
      if (now - lastTapTime.current < 300) {
        e.preventDefault();
        if (scale > 1.1) {
          resetZoom();
        } else {
          setScale(3);
        }
        lastTapTime.current = 0;
        return;
      }
      lastTapTime.current = now;
      // Single touch drag
      if (scale > 1) {
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        translateStart.current = { ...translate };
        setIsDragging(true);
      }
    }
  }, [scale, translate, resetZoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastTouchDist.current !== null) {
        const ratio = dist / lastTouchDist.current;
        setScale(prev => {
          const next = Math.max(0.5, Math.min(10, prev * ratio));
          if (next <= 1) setTranslate({ x: 0, y: 0 });
          return next;
        });
      }
      lastTouchDist.current = dist;
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      const dx = e.touches[0].clientX - dragStart.current.x;
      const dy = e.touches[0].clientY - dragStart.current.y;
      setTranslate(clampTranslate(scale, translateStart.current.x + dx, translateStart.current.y + dy));
    }
  }, [isDragging, scale, clampTranslate]);

  const handleTouchEnd = useCallback(() => {
    lastTouchDist.current = null;
    setIsDragging(false);
  }, []);

  // Reset zoom when modal closes/opens
  useEffect(() => { resetZoom(); }, [attachment.url, resetZoom]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && scale <= 1) onClose();
  }, [onClose, scale]);

  const modal = isImage ? (
    // Image: fullscreen lightbox with zoom/pan + floating controls
    <div
      ref={imgContainerRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90"
      onClick={handleBackdropClick}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'none' }}
    >
      {/* Floating top bar — safe area aware */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pb-3 bg-gradient-to-b from-black/70 to-transparent" style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-white/90 font-medium truncate">{attachment.originalName}</span>
          <span className="text-xs text-white/50 flex-shrink-0">{formatFileSize(attachment.size)}</span>
          {scale > 1.01 && <span className="text-xs text-white/50 flex-shrink-0">{Math.round(scale * 100)}%</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="text-sm text-white/80 hover:text-white transition px-3 py-2"
            onClick={(e) => { e.stopPropagation(); triggerDownload(attachment); }}
          >
            {t('filePreview.download')}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-white/80 hover:text-white text-2xl leading-none transition w-10 h-10 flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      </div>
      {/* Zoom controls — bottom center */}
      <div className="absolute left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-black/60 rounded-full px-2 py-1" style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 8px) + 16px)' }}>
        <button
          className="text-white/80 hover:text-white w-9 h-9 flex items-center justify-center text-lg transition"
          onClick={(e) => { e.stopPropagation(); setScale(prev => { const n = Math.max(0.5, prev * 0.8); if (n <= 1) setTranslate({ x: 0, y: 0 }); return n; }); }}
        >
          −
        </button>
        <button
          className="text-xs text-white/60 hover:text-white px-2 py-1 transition min-w-[3rem] text-center"
          onClick={(e) => { e.stopPropagation(); resetZoom(); }}
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          className="text-white/80 hover:text-white w-9 h-9 flex items-center justify-center text-lg transition"
          onClick={(e) => { e.stopPropagation(); setScale(prev => Math.min(10, prev * 1.25)); }}
        >
          +
        </button>
      </div>
      <img
        src={attachment.url}
        alt={attachment.originalName}
        className="max-w-full max-h-full object-contain p-4 select-none"
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transition: isDragging ? 'none' : 'transform 0.15s ease-out',
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
        }}
        draggable={false}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  ) : (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl flex flex-col w-full max-w-2xl max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border bg-dark-bg flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">📄</span>
            <span className="text-sm text-dark-text font-medium truncate">{attachment.originalName}</span>
            <span className="text-xs text-dark-muted flex-shrink-0">{formatFileSize(attachment.size)}</span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 ml-3">
            <button
              onClick={() => triggerDownload(attachment)}
              className="text-xs text-primary-400 hover:text-primary-300 transition"
            >
              {t('filePreview.download')}
            </button>
            <button
              onClick={onClose}
              className="text-dark-muted hover:text-dark-text text-lg leading-none transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {isHtml ? (
            loading ? (
              <div className="text-sm text-dark-muted animate-pulse py-8 text-center">{t('filePreview.loading')}</div>
            ) : error ? (
              <div className="text-sm text-red-400 py-8 text-center">{t('filePreview.loadFailed')}</div>
            ) : (
              <div className="w-full overflow-auto rounded-lg border border-dark-border" style={{ height: '70vh', WebkitOverflowScrolling: 'touch' }}>
                <iframe
                  srcDoc={content || ''}
                  sandbox="allow-scripts"
                  className="border-0 bg-white"
                  style={{ width: '1024px', height: '100%', display: 'block' }}
                  title={attachment.originalName}
                />
              </div>
            )
          ) : isVideo ? (
            <video src={attachment.url} controls className="max-w-full max-h-[70vh] mx-auto rounded-lg" />
          ) : isAudio ? (
            <audio src={attachment.url} controls className="w-full mt-4" />
          ) : isPdf ? (
            loading ? (
              <div className="text-sm text-dark-muted animate-pulse py-8 text-center">{t('filePreview.loading')}</div>
            ) : error ? (
              <div className="text-sm text-red-400 py-8 text-center">{t('filePreview.loadFailed')}</div>
            ) : pdfBlobUrl ? (
              <iframe
                src={pdfBlobUrl}
                className="w-full h-[70vh] rounded-lg border border-dark-border"
                title={attachment.originalName}
              />
            ) : null
          ) : isText ? (
            loading ? (
              <div className="text-sm text-dark-muted animate-pulse py-8 text-center">{t('filePreview.loading')}</div>
            ) : error ? (
              <div className="text-sm text-red-400 py-8 text-center">{t('filePreview.loadFailed')}</div>
            ) : isMd ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfmSafe]} rehypePlugins={[rehypeHighlight, rehypeAutolink]}>
                  {content || ''}
                </ReactMarkdown>
              </div>
            ) : (
              <pre className="text-sm text-dark-text whitespace-pre-wrap break-words font-mono leading-relaxed">
                {content}
              </pre>
            )
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-dark-muted">
              <span className="text-5xl mb-4">📁</span>
              <p className="text-sm">{t('filePreview.unsupported')}</p>
              <button
                onClick={() => triggerDownload(attachment)}
                className="mt-4 text-sm text-primary-400 hover:text-primary-300 transition"
              >
                {t('filePreview.clickDownload')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Portal to document.body so fixed positioning is always relative to viewport
  return createPortal(modal, document.body);
}
