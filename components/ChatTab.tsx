import { useState, useRef, useEffect, useCallback } from 'react';
import Markdown from 'react-markdown';
import { useSubtitleStore } from '@/lib/stores/subtitle-store';
import { sendMessage } from '@/lib/messaging';
import { getChatHistory, saveChatHistory, type ChatHistoryEntry } from '@/lib/storage';
import { useUiText } from '@/lib/ui-text';
import type { OutputLanguageCode } from '@/lib/output-language';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface Props {
  targetLanguage: OutputLanguageCode;
}

const TYPING_SPEED = 12; // ms per character

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded-md hover:bg-bg-elevated text-text-muted hover:text-text-secondary transition-colors"
      title="Copy"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function useTypewriter(fullText: string, active: boolean) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (!active || !fullText) {
      setDisplayed(fullText);
      setDone(true);
      return;
    }

    indexRef.current = 0;
    setDisplayed('');
    setDone(false);
    lastTimeRef.current = 0;

    const step = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const elapsed = timestamp - lastTimeRef.current;
      const charsToAdd = Math.max(1, Math.floor(elapsed / TYPING_SPEED));

      if (indexRef.current < fullText.length) {
        const next = Math.min(indexRef.current + charsToAdd, fullText.length);
        setDisplayed(fullText.slice(0, next));
        indexRef.current = next;
        lastTimeRef.current = timestamp;
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDone(true);
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [fullText, active]);

  const skip = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setDisplayed(fullText);
    setDone(true);
  }, [fullText]);

  return { displayed, done, skip };
}

function AiMessageBubble({ text, isLatest, onComplete }: { text: string; isLatest: boolean; onComplete?: () => void }) {
  const { displayed, done, skip } = useTypewriter(text, isLatest);

  useEffect(() => {
    if (done && isLatest && onComplete) {
      onComplete();
    }
  }, [done, isLatest, onComplete]);

  return (
    <div className="group" onClick={!done ? skip : undefined}>
      <div className="text-text-primary text-sm leading-relaxed cursor-pointer">
        <div className="chat-markdown">
          <Markdown>{displayed}</Markdown>
          {!done && (
            <span className="inline-block w-[2px] h-[14px] bg-text-muted ml-0.5 align-text-bottom animate-pulse" />
          )}
        </div>
      </div>
      {done && (
        <div className="flex mt-1">
          <CopyButton text={text} />
        </div>
      )}
    </div>
  );
}

export function ChatTab({ targetLanguage }: Props) {
  const { videoId, segments } = useSubtitleStore();
  const ui = useUiText();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevVideoIdRef = useRef<string>(videoId);

  // Track the index of the latest AI message being animated
  const [animatingIndex, setAnimatingIndex] = useState<number | null>(null);

  // Suggestions
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const suggestionsKeyRef = useRef<string>('');

  // Custom prompt settings
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const settingsRef = useRef<HTMLDivElement>(null);

  // Load chat history & reset on video change
  useEffect(() => {
    if (videoId !== prevVideoIdRef.current) {
      prevVideoIdRef.current = videoId;
      setInput('');
      setError(null);
      setSuggestions([]);
      suggestionsKeyRef.current = '';
      setAnimatingIndex(null);
    }
    if (videoId) {
      void getChatHistory(videoId).then((history) => {
        setMessages(history);
      });
    } else {
      setMessages([]);
    }
  }, [videoId]);

  // Save chat history when messages change
  useEffect(() => {
    if (videoId && messages.length > 0) {
      void saveChatHistory(videoId, messages);
    }
  }, [videoId, messages]);

  // Load suggestions when segments are available
  useEffect(() => {
    if (segments.length === 0 || messages.length > 0) return;
    const key = `${videoId}-${targetLanguage}-${segments.length}`;
    if (suggestionsKeyRef.current === key) return;
    suggestionsKeyRef.current = key;

    setSuggestionsLoading(true);
    const transcriptText = segments.map((s) => s.text).join(' ');
    const lang = segments[0]?.lang || 'en';
    sendMessage('suggestQuestions', { videoId, transcriptText, lang, targetLanguage })
      .then((result) => setSuggestions(result.questions))
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, [segments, videoId, targetLanguage, messages.length]);

  // Auto-scroll during typing animation
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (animatingIndex === null && !isLoading) return;

    const interval = setInterval(() => {
      el.scrollTop = el.scrollHeight;
    }, 50);
    return () => clearInterval(interval);
  }, [animatingIndex, isLoading]);

  // Click-outside for settings
  useEffect(() => {
    if (!settingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const root = settingsRef.current?.getRootNode() as Document | ShadowRoot;
    const target = root ?? document;
    target.addEventListener('mousedown', handler as EventListener);
    return () => target.removeEventListener('mousedown', handler as EventListener);
  }, [settingsOpen]);

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || !videoId || segments.length === 0 || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', text: msg };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const transcriptText = segments.map((s) => s.text).join(' ');
      const lang = segments[0]?.lang || 'en';
      const result = await sendMessage('chatWithAi', {
        videoId,
        messages: updatedMessages,
        transcriptText,
        lang,
        targetLanguage,
        customPrompt: customPrompt.trim() || undefined,
      });
      const newIndex = updatedMessages.length; // index of the AI message about to be added
      setMessages((prev) => [...prev, { role: 'model', text: result.answer }]);
      setAnimatingIndex(newIndex);
    } catch (e) {
      setError(e instanceof Error ? e.message : ui.t('chat.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // Empty state: no subtitles
  if (segments.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 py-10 px-5">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <p className="text-sm text-text-muted">{ui.t('chat.empty')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center text-center pt-8 pb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 text-text-muted opacity-40">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm text-text-muted opacity-50 mb-4">{ui.t('chat.empty')}</p>

            {/* Suggested questions */}
            {suggestionsLoading && (
              <div className="w-full space-y-3">
                <div className="h-10 bg-bg-elevated rounded-xl animate-pulse" />
                <div className="h-10 bg-bg-elevated rounded-xl animate-pulse" />
                <div className="h-10 bg-bg-elevated rounded-xl animate-pulse" />
              </div>
            )}
            {!suggestionsLoading && suggestions.length > 0 && (
              <div className="w-full space-y-2.5">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">{ui.t('chat.suggestions')}</p>
                {suggestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => void handleSend(q)}
                    className="w-full text-left px-4 py-3 text-sm text-text-secondary font-medium bg-bg-subtle hover:bg-white hover:shadow-md hover:scale-[1.01] rounded-xl transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={i} className="flex flex-col items-end group animate-fade-in">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent text-white px-4 py-3 text-sm leading-relaxed shadow-sm">
                <p className="whitespace-pre-wrap font-medium">{msg.text}</p>
              </div>
              <div className="flex mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <CopyButton text={msg.text} />
              </div>
            </div>
          ) : (
            <div key={i} className="flex flex-col animate-fade-in py-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-accent-brand/10 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent-brand">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <span className="text-[11px] font-bold text-accent-brand uppercase tracking-wider">AI Assistant</span>
              </div>
              <div className="bg-bg-subtle/50 rounded-2xl p-4">
                <AiMessageBubble
                  text={msg.text}
                  isLatest={i === animatingIndex}
                  onComplete={() => {
                    if (i === animatingIndex) setAnimatingIndex(null);
                  }}
                />
              </div>
            </div>
          ),
        )}

        {/* Typing indicator (waiting for response) */}
        {isLoading && (
          <div className="flex justify-start py-2">
            <div className="bg-bg-subtle/50 rounded-2xl px-5 py-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-accent-brand/40 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-accent-brand/40 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-accent-brand/40 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex justify-center my-2">
            <p className="text-xs text-red-500 bg-red-50 font-bold px-4 py-2 rounded-xl">{error}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-4 bg-white/80 backdrop-blur-md">
        <div className="flex items-end gap-2.5">
          {/* Settings gear */}
          <div ref={settingsRef} className="relative">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={`h-11 w-11 p-0 flex items-center justify-center shrink-0 rounded-xl transition-all ${
                customPrompt.trim()
                  ? 'bg-accent/5 text-accent shadow-sm'
                  : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
              }`}
              title={ui.t('chat.customPrompt')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {settingsOpen && (
              <div className="absolute left-0 bottom-full mb-3 w-80 p-4 bg-white rounded-2xl shadow-2xl animate-fade-in z-30 ring-1 ring-black/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-text-primary uppercase tracking-wider">{ui.t('chat.customPrompt')}</span>
                  {customPrompt.trim() && (
                    <button
                      onClick={() => setCustomPrompt('')}
                      className="text-[10px] font-bold text-text-muted hover:text-red-500 transition-colors"
                    >
                      {ui.t('common.delete')}
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-text-muted font-medium mb-3 leading-relaxed">{ui.t('chat.customPrompt.description')}</p>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={ui.t('chat.customPrompt.placeholder')}
                  rows={4}
                  className="w-full px-3 py-2.5 text-sm bg-bg-subtle rounded-xl resize-none text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-brand/10 font-medium"
                />
              </div>
            )}
          </div>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={ui.t('chat.placeholder')}
            rows={1}
            className="flex-1 px-4 py-3 text-sm bg-bg-elevated rounded-2xl resize-none text-text-primary placeholder:text-text-muted transition-all focus:outline-none focus:bg-white focus:ring-4 focus:ring-accent-brand/5 max-h-32 font-medium"
            style={{ minHeight: '44px' }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || isLoading}
            className="btn-primary h-11 w-11 p-0 flex items-center justify-center shrink-0 rounded-xl disabled:opacity-50 shadow-md shadow-accent/10"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
