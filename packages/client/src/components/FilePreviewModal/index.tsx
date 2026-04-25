import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfmSafe from '../../utils/remarkGfmSafe';
import rehypeHighlight from 'rehype-highlight';
import rehypeAutolink from '../../utils/rehypeAutolink';
import type { FileAttachment } from '../../types';
import { formatFileSize } from '../../utils/format';

interface FilePreviewModalProps {
  attachment: FileAttachment;
  onClose: () => void;
}

export default function FilePreviewModal({ attachment, onClose }: FilePreviewModalProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const isImage = attachment.mimeType.startsWith('image/');
  const isPdf = attachment.mimeType === 'application/pdf';
  const isVideo = attachment.mimeType.startsWith('video/');
  const isAudio = attachment.mimeType.startsWith('audio/');
  const isHtml = attachment.mimeType === 'text/html'
    || /\.html?$/i.test(attachment.originalName);
  const isText = !isHtml && (/^(text\/|application\/json|application\/javascript)/.test(attachment.mimeType)
    || /\.(md|txt|json|js|ts|tsx|jsx|py|sh|css|html|yml|yaml|toml|csv|xml|sql|log|env|cfg|ini|conf)$/i.test(attachment.originalName));
  const isMd = /\.md$/i.test(attachment.originalName);

  useEffect(() => {
    if (!isText && !isHtml) { setLoading(false); return; }
    fetch(attachment.url)
      .then(r => r.text())
      .then(text => { setContent(text); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [attachment.url, isText, isHtml]);

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

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 md:p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-dark-surface border border-dark-border rounded-xl shadow-2xl flex flex-col w-full max-w-2xl h-[95dvh] md:max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border bg-dark-bg flex-shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">📄</span>
            <span className="text-sm text-dark-text font-medium truncate">{attachment.originalName}</span>
            <span className="text-xs text-dark-muted flex-shrink-0">{formatFileSize(attachment.size)}</span>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0 ml-3">
            <a
              href={attachment.url}
              download={attachment.originalName}
              className="text-xs text-primary-400 hover:text-primary-300 transition"
            >
              ⬇ 下载
            </a>
            <button
              onClick={onClose}
              className="text-dark-muted hover:text-dark-text text-lg leading-none transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-2 md:p-4 min-h-0 flex flex-col">
          {isHtml ? (
            loading ? (
              <div className="text-sm text-dark-muted animate-pulse py-8 text-center">加载中...</div>
            ) : error ? (
              <div className="text-sm text-red-400 py-8 text-center">加载失败</div>
            ) : (
              <iframe
                srcDoc={content || ''}
                sandbox="allow-scripts"
                className="w-full flex-1 min-h-0 rounded-lg border border-dark-border bg-white"
                style={{ minHeight: '60vh' }}
                title={attachment.originalName}
              />
            )
          ) : isImage ? (
            <img
              src={attachment.url}
              alt={attachment.originalName}
              className="max-w-full max-h-[70vh] mx-auto rounded-lg"
            />
          ) : isVideo ? (
            <video src={attachment.url} controls className="max-w-full max-h-[70vh] mx-auto rounded-lg" />
          ) : isAudio ? (
            <audio src={attachment.url} controls className="w-full mt-4" />
          ) : isPdf ? (
            <iframe
              src={attachment.url}
              className="w-full h-[70vh] rounded-lg border border-dark-border"
              title={attachment.originalName}
            />
          ) : isText ? (
            loading ? (
              <div className="text-sm text-dark-muted animate-pulse py-8 text-center">加载中...</div>
            ) : error ? (
              <div className="text-sm text-red-400 py-8 text-center">加载失败</div>
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
              <p className="text-sm">此文件类型不支持预览</p>
              <a
                href={attachment.url}
                download={attachment.originalName}
                className="mt-4 text-sm text-primary-400 hover:text-primary-300 transition"
              >
                点击下载
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
