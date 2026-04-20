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
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIdx, setMentionIdx] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingRef = useRef(false);
  const recognitionRef = useRef<any>(null);

  // Speech recognition support
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const speechSupported = !!SpeechRecognition;

  const { roomMembers, activeRoomId, replyToMessage, setReplyTo } = useAppStore();
  const members = activeRoomId ? roomMembers[activeRoomId] || [] : [];
  const botMembers = members.filter(m => m.isBot);
  const filteredBots = mentionQuery
    ? botMembers.filter(b => b.username.toLowerCase().includes(mentionQuery.toLowerCase()))
    : botMembers;

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
    socketService.sendMessage(roomId, trimmed, threadId, replyToMessage?.id);
    setInput('');
    setReplyTo(null);
    setShowSuggestions(false);
    if (typingRef.current) {
      socketService.stopTyping(roomId);
      typingRef.current = false;
    }
  }, [input, roomId, threadId, replyToMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Mention autocomplete
    if (showMentions && filteredBots.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx((i) => Math.min(i + 1, filteredBots.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const bot = filteredBots[mentionIdx];
        if (bot) {
          const cursorPos = inputRef.current?.selectionStart || input.length;
          const textBefore = input.slice(0, cursorPos);
          const textAfter = input.slice(cursorPos);
          const newBefore = textBefore.replace(/@\w*$/, `@${bot.username} `);
          setInput(newBefore + textAfter);
        }
        setShowMentions(false);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }

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

    // Enter key inserts newline (default behavior), no send on Enter
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // Detect @mention
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch && botMembers.length > 0) {
      setMentionQuery(mentionMatch[1]);
      setShowMentions(true);
      setMentionIdx(0);
    } else {
      setShowMentions(false);
    }

    // Typing indicator
    if (!typingRef.current && val.trim()) {
      socketService.startTyping(roomId);
      typingRef.current = true;
    }
    if (!val.trim() && typingRef.current) {
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

  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';

    const baseText = input; // text before speech started
    let finalText = '';

    recognition.onresult = (event: any) => {
      let interim = '';
      finalText = '';
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      setInput(baseText + finalText + interim);
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, SpeechRecognition, input]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
  }, [input]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  return (
    <div className="relative flex-shrink-0">
      {/* Mention autocomplete */}
      {showMentions && filteredBots.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-dark-surface border border-dark-border rounded-lg shadow-xl overflow-hidden z-10">
          {filteredBots.map((bot, i) => (
            <button
              key={bot.id}
              onClick={() => {
                const cursorPos = inputRef.current?.selectionStart || input.length;
                const textBefore = input.slice(0, cursorPos);
                const textAfter = input.slice(cursorPos);
                const newBefore = textBefore.replace(/@\w*$/, `@${bot.username} `);
                setInput(newBefore + textAfter);
                setShowMentions(false);
                inputRef.current?.focus();
              }}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition ${
                i === mentionIdx ? 'bg-primary-600/20 text-primary-400' : 'text-dark-text hover:bg-dark-hover'
              }`}
            >
              <span className="text-sm font-semibold">@{bot.username}</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-primary-600/20 text-primary-400 rounded font-medium">BOT</span>
            </button>
          ))}
        </div>
      )}

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

      {/* Reply preview */}
      {replyToMessage && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-dark-border bg-dark-surface">
          <span className="text-xs text-primary-400">↩️</span>
          <div className="flex-1 min-w-0 border-l-2 border-primary-500 pl-2">
            <p className="text-xs text-primary-400 font-semibold truncate">
              {members.find(m => m.id === replyToMessage.userId)?.username || 'Unknown'}
            </p>
            <p className="text-xs text-dark-muted truncate">{replyToMessage.content}</p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="text-dark-muted hover:text-white p-1 flex-shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-dark-border bg-dark-surface">
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
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              // iOS: wait for keyboard, then scroll input into view
              setTimeout(() => {
                inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 400);
            }}
            onPaste={handlePaste}
            placeholder=""
            rows={1}
            className={`w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-base md:text-sm leading-5 text-white placeholder-dark-muted resize-none focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition ${
              speechSupported ? 'pr-10' : ''
            }`}
          />
          {/* Voice input button inside textarea */}
          {speechSupported && (
            <button
              onClick={toggleListening}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'text-dark-muted hover:text-white'
              }`}
              title={isListening ? 'Stop listening' : 'Voice input'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
              </svg>
            </button>
          )}
        </div>

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
