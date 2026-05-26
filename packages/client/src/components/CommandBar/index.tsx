import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../../hooks/useT';
import { socketService } from '../../services/socket';
import { uploadFile } from '../../services/upload';

const COMMANDS: { name: string; descKey: string }[] = []; // disabled
const EMPTY_SKILLS: any[] = [];
const SKILLS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CommandBarProps {
  roomId: string;
  threadId?: string;
  onExport?: () => void;
}

export default function CommandBar({ roomId, threadId, onExport }: CommandBarProps) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIdx, setMentionIdx] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [skillQuery, setSkillQuery] = useState('');
  const [skillIdx, setSkillIdx] = useState(0);
  const skillsFetchingRef = useRef(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // [DEPRECATED] Client-side speech recognition — replaced by server-side STT (speech-to-text.ts)
  // Kept for potential future use. UI entry removed.
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const speechSupported = !!SpeechRecognition;

  const { rooms, roomMembers, activeRoomId, replyContext, clearReplyContext, removeReplyContext, setContextSelectionMode, mobileView, user, botSkillsCache, setBotSkillsCache } = useAppStore();
  const { stt: sttEnabled } = useAppStore(s => s.capabilities);
  const members = activeRoomId ? roomMembers[activeRoomId] || [] : [];
  const currentRoom = rooms.find(r => r.id === roomId);
  const t = useT();
  const isArchived = !!currentRoom?.archivedAt;
  const mentionableMembers = members.filter(m => m.id !== user?.id);
  const filteredMentions = mentionQuery
    ? mentionableMembers.filter(m => m.username.toLowerCase().includes(mentionQuery.toLowerCase()))
    : mentionableMembers;

  // Bot skills for slash autocomplete
  const botMember = currentRoom?.type === 'bot' ? members.find(m => m.isBot) : null;
  const botId = botMember?.id || '';
  const cachedEntry = botId ? botSkillsCache[botId] : undefined;
  const cachedSkills = cachedEntry?.skills ?? EMPTY_SKILLS;
  const filteredSkills = showSkills
    ? cachedSkills.filter((s: any) => s.eligible !== false && (!skillQuery || s.name.toLowerCase().includes(skillQuery.toLowerCase())))
    : EMPTY_SKILLS;

  const suggestions = input.startsWith('/')
    ? COMMANDS.filter((c) => `/${c.name}`.startsWith(input.split(' ')[0]))
    : [];

  useEffect(() => {
    setShowSuggestions(suggestions.length > 0 && input.startsWith('/') && !input.includes(' '));
    setSelectedIdx(0);
  }, [input]);

  // Close plus menu on click outside
  useEffect(() => {
    if (!showPlusMenu) return;
    const handle = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) setShowPlusMenu(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showPlusMenu]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    socketService.sendMessage(roomId, trimmed, threadId, undefined, undefined, replyContext.map(m => m.id));
    setInput('');
    clearReplyContext();
    setShowSuggestions(false);
    if (typingRef.current) {
      socketService.stopTyping(roomId);
      typingRef.current = false;
    }
  }, [input, roomId, threadId, replyContext]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Skill slash autocomplete
    if (showSkills && filteredSkills.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSkillIdx((i) => Math.min(i + 1, filteredSkills.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSkillIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const skill = filteredSkills[skillIdx];
        if (skill) setInput('/' + skill.name + ' ');
        setShowSkills(false);
        return;
      }
      if (e.key === 'Escape') {
        setShowSkills(false);
        return;
      }
    }

    // Mention autocomplete
    if (showMentions && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx((i) => Math.min(i + 1, filteredMentions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const bot = filteredMentions[mentionIdx];
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

    // Detect /skill
    if (currentRoom?.type === 'bot' && val.startsWith('/') && !val.includes(' ')) {
      const query = val.slice(1);
      setSkillQuery(query);
      setShowSkills(true);
      setSkillIdx(0);
      // Fetch skills if not cached or stale
      if (botId && !skillsFetchingRef.current && (!cachedEntry || Date.now() - cachedEntry.fetchedAt > SKILLS_CACHE_TTL)) {
        skillsFetchingRef.current = true;
        socketService.getBotSkills(botId).then(res => {
          if (res.skills) setBotSkillsCache(botId, res.skills);
        }).finally(() => { skillsFetchingRef.current = false; });
      }
    } else {
      if (showSkills) setShowSkills(false);
    }

    // Detect @mention
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch && mentionableMembers.length > 0) {
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

  // [DEPRECATED] Client-side speech recognition toggle — kept for potential future use
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

  // Auto-resize textarea (also re-run when mobileView changes to recalc after display:none)
  useEffect(() => {
    const el = inputRef.current;
    if (el && el.offsetParent !== null) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
  }, [input, mobileView]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  // Voice recording functions
  const getAudioDuration = (blob: Blob): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.addEventListener('loadedmetadata', () => {
        if (audio.duration === Infinity) {
          audio.currentTime = 1e101;
          audio.addEventListener('timeupdate', function handler() {
            audio.removeEventListener('timeupdate', handler);
            resolve(Math.round(audio.duration));
            audio.currentTime = 0;
          });
        } else {
          resolve(Math.round(audio.duration));
        }
      });
      audio.src = URL.createObjectURL(blob);
    });
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg;codecs=opus';
      const recorder = new MediaRecorder(stream, { mimeType });
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  }, []);

  const stopRecording = useCallback(async (send: boolean) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setIsRecording(false);
      return;
    }
    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (send && recordingChunksRef.current.length > 0) {
          const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType });
          const ext = recorder.mimeType.includes('webm') ? 'webm' : 'ogg';
          const file = new File([blob], `voice-message.${ext}`, { type: recorder.mimeType });
          setUploading(true);
          setUploadProgress(0);
          try {
            const attachment = await uploadFile(file, (pct) => setUploadProgress(pct));
            const duration = await getAudioDuration(blob);
            const withDuration = { ...attachment, duration };
            socketService.sendMessage(roomId, JSON.stringify(withDuration), threadId, 'file');
          } catch (err) {
            console.error('Voice upload failed:', err);
          } finally {
            setUploading(false);
            setUploadProgress(0);
          }
        }
        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        setIsRecording(false);
        setRecordingTime(0);
        resolve();
      };
      recorder.stop();
    });
  }, [roomId, threadId]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="relative flex-shrink-0">
      {/* Skill slash autocomplete */}
      {showSkills && filteredSkills.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-dark-surface border border-dark-border rounded-lg shadow-xl overflow-hidden z-10 max-h-60 overflow-y-auto">
          {filteredSkills.map((skill: any, i: number) => (
            <button
              key={skill.name}
              onClick={() => {
                setInput('/' + skill.name + ' ');
                setShowSkills(false);
                inputRef.current?.focus();
              }}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition ${
                i === skillIdx ? 'bg-primary-600/20 text-primary-400' : 'text-dark-text hover:bg-dark-hover'
              }`}
            >
              <span className="text-sm font-mono text-primary-400">/{skill.name}</span>
              {skill.description && <span className="text-xs text-dark-muted truncate">{skill.description}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Mention autocomplete */}
      {showMentions && filteredMentions.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-dark-surface border border-dark-border rounded-lg shadow-xl overflow-hidden z-10">
          {filteredMentions.map((bot, i) => (
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
              {bot.isBot && <span className="text-[10px] px-1.5 py-0.5 bg-primary-600/20 text-primary-400 rounded font-medium">BOT</span>}
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
              <span className="text-xs text-dark-muted">{t(cmd.descKey as any)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Reply preview */}
      {replyContext.length > 0 && (
        <div className="px-4 py-2 border-t border-dark-border bg-dark-surface">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-primary-400">↩️</span>
            <span className="text-xs text-dark-muted">
              {replyContext.length === 1 ? t('command.replyingTo') : t('command.messagesCount', { count: replyContext.length })}
            </span>
            <div className="flex-1" />
            {replyContext.length < 5 && (
              <button
                onClick={() => setContextSelectionMode(true)}
                className="text-xs text-primary-400 hover:text-primary-300 transition"
              >
                + Add
              </button>
            )}
            <button
              onClick={() => clearReplyContext()}
              className="text-dark-muted hover:text-dark-text p-0.5 flex-shrink-0 text-xs"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {replyContext.map((msg) => (
              <div key={msg.id} className="flex items-center gap-2 border-l-2 border-primary-500 pl-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-primary-400 font-semibold truncate">
                    {members.find(m => m.id === msg.userId)?.username || t('common.unknown')}
                  </p>
                  <p className="text-xs text-dark-muted truncate">{msg.content}</p>
                </div>
                {replyContext.length > 1 && (
                  <button
                    onClick={() => removeReplyContext(msg.id)}
                    className="text-dark-muted hover:text-dark-text p-0.5 flex-shrink-0 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] border-t border-dark-border bg-dark-surface">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
            e.target.value = '';
          }}
        />

        {/* Plus menu */}
        <div className="relative flex-shrink-0" ref={plusMenuRef}>
          <button
            onClick={() => setShowPlusMenu(!showPlusMenu)}
            disabled={uploading}
            className="p-2.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover disabled:opacity-30 rounded-xl transition"
            title={t('command.actions')}
          >
            <svg
              className={`w-5 h-5 transition-transform duration-200 ${showPlusMenu ? 'rotate-45' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* Popup menu */}
          {showPlusMenu && (
            <div className="absolute left-0 bottom-full mb-2 bg-dark-surface border border-dark-border rounded-xl shadow-lg py-1.5 z-50 min-w-[160px] animate-in fade-in slide-in-from-bottom-2">
              <button
                onClick={() => { fileInputRef.current?.click(); setShowPlusMenu(false); }}
                className="w-full text-left px-3 py-2.5 text-sm text-dark-text hover:bg-dark-hover transition flex items-center gap-3"
              >
                <span className="text-base">📄</span>
                <span>{t('command.file')}</span>
              </button>
              {onExport && (
                <>
                  <div className="mx-2 my-1 border-t border-dark-border" />
                  <button
                    onClick={() => { onExport(); setShowPlusMenu(false); }}
                    className="w-full text-left px-3 py-2.5 text-sm text-dark-text hover:bg-dark-hover transition flex items-center gap-3"
                  >
                    <span className="text-base">📥</span>
                    <span>{t('command.exportChat')}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {!isRecording && <div className="flex-1 relative">
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
            placeholder={isArchived ? t('command.archivedPlaceholder') : ''}
            rows={1}
            disabled={isArchived}
            className={`command-bar-input w-full bg-dark-bg border border-dark-border rounded-xl px-4 py-2.5 text-base md:text-sm leading-5 text-dark-text placeholder-dark-muted resize-none focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition ${isArchived ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
          {/* [DEPRECATED] Client-side voice input button — removed in favor of server-side STT */}
        </div>}

        {/* Recording UI overlay */}
        {isRecording && (
          <div className="flex items-center gap-3 flex-1 px-3 py-2 bg-dark-bg border border-red-500/50 rounded-xl">
            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
            <span className="text-sm text-dark-text font-mono">{Math.floor(recordingTime / 60)}:{String(recordingTime % 60).padStart(2, '0')}</span>
            <span className="text-xs text-dark-muted flex-1">{t('command.recording')}</span>
            <button
              onClick={() => stopRecording(false)}
              className="p-1.5 text-dark-muted hover:text-red-400 transition"
              title={t('forward.cancel')}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Send or Mic button */}
        {input.trim() ? (
          <button
            onClick={handleSend}
            className="p-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        ) : isRecording ? (
          <button
            onClick={() => stopRecording(true)}
            className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition flex-shrink-0 animate-pulse"
            title={t('command.sendVoice')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        ) : sttEnabled ? (
          <button
            onClick={startRecording}
            disabled={uploading || isArchived}
            className="p-2.5 text-dark-muted hover:text-dark-text hover:bg-dark-hover disabled:opacity-30 rounded-xl transition flex-shrink-0"
            title={t('command.recordVoice')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" />
            </svg>
          </button>
        ) : (
          <button
            disabled
            className="p-2.5 text-dark-muted opacity-30 rounded-xl flex-shrink-0 cursor-default"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        )}
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
          <p className="text-xs text-dark-muted mt-1">{t('command.uploading', { progress: uploadProgress })}</p>
        </div>
      )}
    </div>
  );
}
