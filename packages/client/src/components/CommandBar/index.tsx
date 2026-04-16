import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { socketService } from '../../services/socket';
import { uploadFile } from '../../services/upload';

const COMMANDS = [
  { name: 'help', description: 'Show available commands' },
  { name: 'clear', description: 'Clear conversation' },
  { name: 'model', description: 'Switch or show model' },
  { name: 'system', description: 'Set system prompt' },
  { name: 'status', description: 'Show bot status' },
  { name: 'export', description: 'Export chat history' },
  { name: 'thread', description: 'Start a thread' },
];

interface CommandBarProps {
  roomId: string;
  threadId?: string;
}

export default function CommandBar({ roomId, threadId }: CommandBarProps) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const typingRef = useRef(false);

  const suggestions = input.startsWith('/')
    ? COMMANDS.filter((c) => `/${c.name}`.startsWith(input.split(' ')[0]))
    : [];

  useEffect(() => {
    setShowSuggestions(suggestions.length > 0 && input.startsWith('/') && !input.includes(' '));
    setSelectedIdx(0);
  }, [input]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    socketService.sendMessage(roomId, trimmed, threadId);
    setInput('');
    setShowSuggestions(false);
    if (typingRef.current) {
      socketService.stopTyping(roomId);
      typingRef.current = false;
    }
  }, [input, roomId, threadId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const cmd = suggestions[selectedIdx];
        if (cmd) setInput(`/${cmd.name} `);
        setShowSuggestions(false);
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    // Typing indicator
    if (!typingRef.current && e.target.value.trim()) {
      socketService.startTyping(roomId);
      typingRef.current = true;
    }
    if (!e.target.value.trim() && typingRef.current) {
      socketService.stopTyping(roomId);
      typingRef.current = false;
    }
  };

  const handleFileUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      const attachment = await uploadFile(file, (pct) => setUploadProgress(pct));
      socketService.sendMessage(roomId, JSON.stringify(attachment), threadId, 'file');
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [roomId, threadId]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleFileUpload(file);
        return;
      }
    }
  }, [handleFileUpload]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
  }, [input]);

  return (
    <div className="relative">
      {/* Command suggestions */}
      {showSuggestions && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-dark-surface border border-dark-border rounded-lg shadow-xl overflow-hidden z-10">
          {suggestions.map((cmd, i) => (
            <button
              key={cmd.name}
              onClick={() => {
                setInput(`/${cmd.name} `);
                setShowSuggestions(false);
                inputRef.current?.focus();
              }}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition ${
                i === selectedIdx ? 'bg-primary-600/20 text-primary-400' : 'text-dark-text hover:bg-dark-hover'
              }`}
            >
              <span className="text-sm font-mono text-primary-400">/{cmd.name}</span>
              <span className="text-xs text-dark-muted">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 p-4 border-t border-dark-border bg-dark-surface">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.txt,.md,.doc,.docx,.zip"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="p-2.5 text-dark-muted hover:text-white hover:bg-dark-hover disabled:opacity-30 rounded-xl transition flex-shrink-0"
          title="Attach file"
        >
          📎
        </button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={threadId ? 'Reply in thread...' : 'Type a message... (/ for commands)'}
          rows={1}
          className="flex-1 bg-dark-bg border border-dark-border rounded-xl px-4 py-3 md:py-2.5 text-sm text-white placeholder-dark-muted resize-none focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition"
        />
        {/* Camera button — mobile only */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
          className="p-2.5 text-dark-muted hover:text-white hover:bg-dark-hover disabled:opacity-30 rounded-xl transition flex-shrink-0 md:hidden"
          title="Take photo"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="p-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl transition flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
          </svg>
        </button>
      </div>
      {/* Upload progress */}
      {uploading && (
        <div className="px-4 pb-2 bg-dark-surface">
          <div className="w-full bg-dark-bg rounded-full h-1.5">
            <div
              className="bg-primary-500 h-1.5 rounded-full transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-xs text-dark-muted mt-1">Uploading... {uploadProgress}%</p>
        </div>
      )}
    </div>
  );
}
