import { useState, useEffect, useCallback, useRef } from 'react';
import './style.css';
import { useSubtitleStore } from '@/lib/stores/subtitle-store';
import { useMemoStore } from '@/lib/stores/memo-store';
import { sendMessage, onMessage } from '@/lib/messaging';
import { normalizeTranscript } from '@/lib/subtitle-parser';
import type { TabType } from '@/lib/types';
import { SummarySection } from '@/components/SummarySection';
import { ScriptTab } from '@/components/ScriptTab';
import { ChatTab } from '@/components/ChatTab';
import { TimelineTab } from '@/components/TimelineTab';
import { ArticleTab } from '@/components/ArticleTab';
import {
  getPreferredOutputLanguage,
  onPreferredOutputLanguageChange,
} from '@/lib/preferences';
import {
  DEFAULT_OUTPUT_LANGUAGE,
  isSameLanguageSelection,
  type OutputLanguageCode,
} from '@/lib/output-language';
import { UiTextProvider, createUiText } from '@/lib/ui-text';
import { SubtextIcon } from '@/components/SubtextIcon';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/lib/use-theme';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('script');
  const [targetLanguage, setTargetLanguage] = useState<OutputLanguageCode>(DEFAULT_OUTPUT_LANGUAGE);
  const [isLanguageReady, setIsLanguageReady] = useState(false);
  const { resolved, cycleTheme } = useTheme();
  const {
    videoId,
    sourceSegments,
    setSubtitleTracks,
    segments,
    isLoading,
    error,
    setVideo,
    setSourceSegments,
    setSegments,
    setCurrentTime,
    setLoading,
    setError,
  } = useSubtitleStore();
  const { loadMemos } = useMemoStore();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const translateRequestRef = useRef(0);
  const ui = createUiText(targetLanguage);
  const tabs: { key: TabType; label: string }[] = [
    { key: 'script', label: ui.t('tab.script') },
    { key: 'timeline', label: ui.t('tab.timeline') },
    { key: 'article', label: ui.t('tab.article') },
    { key: 'chat', label: ui.t('tab.chat') },
  ];

  useEffect(() => {
    void getPreferredOutputLanguage().then((language) => {
      setTargetLanguage(language);
      setIsLanguageReady(true);
    });

    return onPreferredOutputLanguageChange((language) => {
      setTargetLanguage(language);
      setIsLanguageReady(true);
    });
  }, []);

  // 자막 가져오기
  const fetchSubtitles = useCallback(
    async (vid: string) => {
      setLoading(true);
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('Could not find the active tab.');
        const result = await sendMessage('fetchTranscript', { videoId: vid }, tab.id);
        const normalized = normalizeTranscript(result.segments);
        setSourceSegments(normalized);
        setSubtitleTracks(result.tracks ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : ui.t('failedLoadSubtitles'));
      }
    },
    [setLoading, setSourceSegments, setSubtitleTracks, setError],
  );

  useEffect(() => {
    if (!videoId || !isLanguageReady) {
      return;
    }

    if (sourceSegments.length === 0) {
      setSegments([]);
      setLoading(false);
      return;
    }

    const currentRequest = translateRequestRef.current + 1;
    translateRequestRef.current = currentRequest;

    const applyLanguage = async () => {
      const sourceLanguage = sourceSegments[0]?.lang;
      if (isSameLanguageSelection(sourceLanguage, targetLanguage)) {
        setSegments(sourceSegments);
        return;
      }

      setSegments([]);
      setLoading(true);

      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active tab.');

        const result = await sendMessage(
          'translateViaYoutube',
          {
            targetLanguage,
            videoId,
            segments: sourceSegments.map((segment) => ({
              text: segment.text,
              duration: segment.endTime - segment.startTime,
              offset: segment.startTime,
              lang: segment.lang,
            })),
          },
          tab.id,
        );
        if (translateRequestRef.current !== currentRequest) return;

        setSegments(result.segments.map((segment, index) => ({
          index,
          startTime: segment.offset,
          endTime: segment.offset + segment.duration,
          text: segment.text,
          lang: segment.lang,
        })));
      } catch (err) {
        if (translateRequestRef.current !== currentRequest) return;

        setSegments(sourceSegments);
        setError(err instanceof Error ? err.message : ui.t('failedTranslateSubtitles'));
      } finally {
        if (translateRequestRef.current === currentRequest) {
          setLoading(false);
        }
      }
    };

    void applyLanguage();
  }, [isLanguageReady, setError, setLoading, setSegments, sourceSegments, targetLanguage, videoId]);

  // 비디오 변경 감지
  useEffect(() => {
    const removeListener = onMessage('videoChanged', ({ data }) => {
      setVideo(data.videoId, data.title);
      fetchSubtitles(data.videoId);
      loadMemos(data.videoId);
    });
    return removeListener;
  }, [setVideo, fetchSubtitles, loadMemos]);

  // 현재 탭에서 비디오 ID 가져오기
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.url) {
        try {
          const url = new URL(tab.url);
          const vid = url.searchParams.get('v');
          if (vid && url.hostname.includes('youtube.com')) {
            const title = tab.title?.replace(' - YouTube', '') ?? '';
            setVideo(vid, title);
            fetchSubtitles(vid);
            loadMemos(vid);
          }
        } catch {
          // non-YouTube page
        }
      }
    });
  }, [setVideo, fetchSubtitles, loadMemos]);

  // 재생 시간 폴링
  useEffect(() => {
    if (!videoId) return;

    pollingRef.current = setInterval(async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          const result = await sendMessage('getCurrentTime', undefined, tab.id);
          setCurrentTime(result.time);
        }
      } catch {
        // ignore
      }
    }, 500);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [videoId, setCurrentTime]);

  // seek 핸들러
  const handleSeek = useCallback(
    async (time: number) => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await sendMessage('seekTo', { time }, tab.id);
        }
      } catch {
        // ignore
      }
    },
    [],
  );

  return (
    <UiTextProvider language={targetLanguage}>
    <div className="flex flex-col h-screen bg-bg-base text-text-primary">
      {/* 헤더 */}
      <header className="px-6 py-5 flex items-center justify-between glass sticky top-0 z-20">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <SubtextIcon className="w-6 h-6 drop-shadow-sm" />
            <h1 className="text-base font-bold tracking-tight text-text-primary">
              Subtext
            </h1>
          </div>
          {videoId && (
            <p className="text-[11px] text-text-muted truncate mt-1 font-medium opacity-80">
              {useSubtitleStore.getState().videoTitle || videoId}
            </p>
          )}
        </div>
        <ThemeToggle resolved={resolved} onToggle={cycleTheme} />
      </header>

      <div className="flex-1 overflow-y-auto flex flex-col bg-bg-base">
        {/* AI 요약 영역 */}
        {videoId && segments.length > 0 && (
          <div className="px-5 py-3">
            <SummarySection
              segments={segments}
              targetLanguage={targetLanguage}
            />
          </div>
        )}

        {/* 에러 상태 */}
        {error && (
          <div className="mx-5 my-4 p-5 bg-danger/5 rounded-xl animate-fade-in">
            <p className="text-sm text-danger font-semibold leading-normal">{error}</p>
            <button
              onClick={() => fetchSubtitles(videoId)}
              className="mt-2.5 text-xs text-danger/70 font-bold hover:text-danger transition-colors"
            >
              {ui.t('retry')}
            </button>
          </div>
        )}

        {/* 빈 상태 */}
        {!videoId && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-fade-in">
            <div className="w-20 h-20 rounded-3xl bg-bg-subtle flex items-center justify-center mb-8 shadow-sm">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
                <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
                <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
              </svg>
            </div>
            <p className="text-lg font-bold text-text-primary mb-3">{ui.t('playVideo')}</p>
            <p className="text-sm text-text-muted leading-relaxed font-medium">
              {ui.t('openYoutube')}
            </p>
          </div>
        )}

        {/* 탭 네비게이션 & 콘텐츠 */}
        {videoId && (
          <div className="flex-1 flex flex-col min-h-0 bg-bg-subtle/30">
            <nav className="px-4 py-3 flex gap-1 justify-center sticky top-0 bg-bg-base/80 backdrop-blur-md z-10">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`whitespace-nowrap px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-xl transition-all ${
                    activeTab === tab.key
                      ? 'bg-accent text-white shadow-md shadow-accent/10 scale-[1.02]'
                      : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="flex-1 relative min-h-0">
              <div className={activeTab === 'script' ? 'h-full' : 'hidden'}>
                <ScriptTab onSeek={handleSeek} />
              </div>
              <div className={activeTab === 'chat' ? 'h-full' : 'hidden'}>
                <ChatTab targetLanguage={targetLanguage} />
              </div>
              <div className={activeTab === 'timeline' ? 'h-full' : 'hidden'}>
                <TimelineTab
                  onSeek={handleSeek}
                  targetLanguage={targetLanguage}
                />
              </div>
              <div className={activeTab === 'article' ? 'h-full' : 'hidden'}>
                <ArticleTab
                  onSeek={handleSeek}
                  targetLanguage={targetLanguage}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </UiTextProvider>
  );
}
