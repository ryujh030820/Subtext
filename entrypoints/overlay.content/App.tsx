import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useSubtitleStore } from '@/lib/stores/subtitle-store';
import { useMemoStore } from '@/lib/stores/memo-store';
import { normalizeTranscript } from '@/lib/subtitle-parser';
import {
  fetchYoutubeSubtitleTracks,
  fetchYoutubeSubtitleTrack,
  fetchYoutubeTranscript,
  translateViaYoutube,
} from '@/lib/youtube-transcript';
import type { TabType } from '@/lib/types';
import { SummarySection } from '@/components/SummarySection';
import { ScriptTab } from '@/components/ScriptTab';
import { ChatTab } from '@/components/ChatTab';
import { TimelineTab } from '@/components/TimelineTab';
import { ArticleTab } from '@/components/ArticleTab';
import { SubtextIcon } from '@/components/SubtextIcon';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  getPreferredOutputLanguage,
  onPreferredOutputLanguageChange,
} from '@/lib/preferences';
import { useTheme } from '@/lib/use-theme';
import {
  DEFAULT_OUTPUT_LANGUAGE,
  isSameLanguageSelection,
  type OutputLanguageCode,
} from '@/lib/output-language';
import { UiTextProvider, createUiText } from '@/lib/ui-text';

const TAB_ICONS: Record<TabType, React.ReactNode> = {
  script: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  timeline: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  article: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  chat: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
};

function TabNav({
  activeTab,
  onTabChange,
  tabs,
}: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  tabs: Array<{ key: TabType; label: string; icon: React.ReactNode }>;
}) {
  const navRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const el = tabRefs.current.get(activeTab);
    const nav = navRef.current;
    if (el && nav) {
      const navRect = nav.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      setIndicator({
        left: elRect.left - navRect.left,
        width: elRect.width,
      });
    }
  }, [activeTab]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [updateIndicator]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const ro = new ResizeObserver(() => updateIndicator());
    ro.observe(nav);
    tabRefs.current.forEach((btn) => ro.observe(btn));
    return () => ro.disconnect();
  }, [updateIndicator]);

  useEffect(() => {
    document.fonts.ready.then(() => updateIndicator());
  }, [updateIndicator]);

  return (
    <nav
      ref={navRef}
      className="px-4 py-4 flex gap-1 justify-center sticky top-0 bg-bg-base/80 backdrop-blur-md z-10 relative"
    >
      <div
        className="absolute top-4 h-[calc(100%-32px)] rounded-xl bg-accent shadow-lg shadow-accent/10 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ left: indicator.left, width: indicator.width }}
      />
      {tabs.map((tab) => (
        <button
          key={tab.key}
          ref={(el) => { if (el) tabRefs.current.set(tab.key, el); }}
          onClick={() => onTabChange(tab.key)}
          className={`whitespace-nowrap relative z-[1] flex items-center gap-1.5 px-2.5 py-2 text-[11px] sm:text-xs font-bold rounded-xl transition-all duration-300 ${
            activeTab === tab.key
              ? 'text-white scale-[1.02]'
              : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
          }`}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function getVideo(): HTMLVideoElement | null {
  return document.querySelector('video.html5-main-video');
}

function extractVideoId(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get('v');
}

function findMatchingTrackOption(
  tracks: import('@/lib/types').SubtitleTrackOption[],
  requested: import('@/lib/types').SubtitleTrackOption,
): import('@/lib/types').SubtitleTrackOption | null {
  const normalizedLabel = requested.label.trim().replace(/\s+/g, ' ').toLowerCase();
  const normalizedLanguage = requested.languageCode.trim().toLowerCase();
  const requestedKind = requested.isAutoGenerated ? 'auto' : 'manual';

  const ranked = tracks
    .map((track) => {
      let score = 0;
      const trackLanguage = track.languageCode.trim().toLowerCase();
      const trackKind = track.isAutoGenerated ? 'auto' : 'manual';
      const trackLabel = track.label.trim().replace(/\s+/g, ' ').toLowerCase();

      if (normalizedLanguage && trackLanguage === normalizedLanguage) score += 4;
      if (requestedKind === trackKind) score += 3;
      if (requested.vssId && track.vssId && requested.vssId === track.vssId) score += 8;
      if (normalizedLabel && trackLabel === normalizedLabel) score += 2;

      return score > 0 ? { track, score } : null;
    })
    .filter((entry): entry is { track: import('@/lib/types').SubtitleTrackOption; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.track ?? null;
}

export default function App({ onClose, shadowHost }: { onClose: () => void; shadowHost?: HTMLElement }) {
  const [activeTab, setActiveTab] = useState<TabType>('script');
  const [targetLanguage, setTargetLanguage] = useState<OutputLanguageCode>(DEFAULT_OUTPUT_LANGUAGE);
  const [isLanguageReady, setIsLanguageReady] = useState(false);
  const { resolved, cycleTheme } = useTheme(shadowHost ?? null);
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
  const tabs = [
    { key: 'script' as const, label: ui.t('tab.script'), icon: TAB_ICONS.script },
    { key: 'timeline' as const, label: ui.t('tab.timeline'), icon: TAB_ICONS.timeline },
    { key: 'article' as const, label: ui.t('tab.article'), icon: TAB_ICONS.article },
    { key: 'chat' as const, label: ui.t('tab.chat'), icon: TAB_ICONS.chat },
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
        const [segments, tracks] = await Promise.all([
          fetchYoutubeTranscript('', '', vid),
          fetchYoutubeSubtitleTracks(vid).catch(() => []),
        ]);
        const normalized = normalizeTranscript(
          segments.map((seg) => ({
            text: seg.text,
            duration: seg.duration,
            offset: seg.offset,
            lang: seg.lang,
          })),
        );
        setSourceSegments(normalized);
        setSubtitleTracks(tracks);
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
        const ytSegments = await translateViaYoutube(
          targetLanguage,
          videoId,
          sourceSegments.map((segment) => ({
            text: segment.text,
            offset: segment.startTime,
            duration: segment.endTime - segment.startTime,
            lang: segment.lang,
          })),
        );
        if (translateRequestRef.current !== currentRequest) return;

        const normalized = normalizeTranscript(ytSegments);
        setSegments(normalized);
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
    let currentVid = '';

    function checkVideoChange() {
      const vid = extractVideoId();
      if (vid && vid !== currentVid) {
        currentVid = vid;
        const titleEl = document.querySelector(
          'yt-formatted-string.style-scope.ytd-watch-metadata',
        ) as HTMLElement | null;
        const title = titleEl?.textContent?.trim() ?? '';
        setVideo(vid, title);
        fetchSubtitles(vid);
        loadMemos(vid);
      }
    }

    const handleNavigate = () => setTimeout(checkVideoChange, 500);
    document.addEventListener('yt-navigate-finish', handleNavigate);
    const intervalId = setInterval(checkVideoChange, 2000);

    checkVideoChange();

    return () => {
      document.removeEventListener('yt-navigate-finish', handleNavigate);
      clearInterval(intervalId);
    };
  }, [setVideo, fetchSubtitles, loadMemos]);

  // 재생 시간 폴링
  useEffect(() => {
    if (!videoId) return;

    pollingRef.current = setInterval(() => {
      const video = getVideo();
      if (video) {
        setCurrentTime(video.currentTime);
      }
    }, 500);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [videoId, setCurrentTime]);

  // seek 핸들러
  const handleSeek = useCallback((time: number) => {
    const video = getVideo();
    if (video) {
      video.currentTime = time;
    }
  }, []);

  // 자막 트랙 직접 fetch (fresh URL 사용)
  const handleFetchTrack = useCallback(async (vid: string, track: import('@/lib/types').SubtitleTrackOption) => {
    // 다운로드 시점에 fresh track URL을 다시 가져옴 (만료 방지)
    const freshTracks = await fetchYoutubeSubtitleTracks(vid).catch(() => []);
    const freshTrack = findMatchingTrackOption(freshTracks, track);
    const targetTrack = freshTrack ?? track;

    const segments = await fetchYoutubeSubtitleTrack(vid, targetTrack);
    return {
      segments: segments.map((seg) => ({
        text: seg.text,
        duration: seg.duration,
        offset: seg.offset,
        lang: seg.lang,
      })),
    };
  }, []);

  return (
    <UiTextProvider language={targetLanguage}>
    <div className="overlay-panel text-text-primary bg-bg-base">
      {/* 헤더 */}
      <header className="px-6 py-6 flex items-center justify-between glass sticky top-0 z-20">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <SubtextIcon className="w-6 h-6 drop-shadow-sm" />
            <h1 className="text-base font-bold tracking-tight text-text-primary">
              Subtext
            </h1>
          </div>
          {videoId && (
            <p className="text-[11px] text-text-muted truncate mt-1.5 font-medium opacity-80 max-w-[240px]">
              {useSubtitleStore.getState().videoTitle || videoId}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle resolved={resolved} onToggle={cycleTheme} />
          <button
            onClick={onClose}
            className="icon-btn w-10 h-10 rounded-xl"
            aria-label={ui.t('close')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col bg-bg-base">
        {/* AI 요약 영역 */}
        {videoId && segments.length > 0 && (
          <div className="px-6 py-4">
            <SummarySection
              segments={segments}
              targetLanguage={targetLanguage}
              fetchTrack={handleFetchTrack}
            />
          </div>
        )}

        {/* 에러 상태 */}
        {error && (
          <div className="mx-6 my-4 p-5 bg-danger/5 rounded-2xl animate-fade-in">
            <p className="text-sm text-danger font-bold leading-normal">{error}</p>
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
            <TabNav activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />

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
