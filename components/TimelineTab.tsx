import { useEffect, useMemo, useRef, useState } from 'react';
import { sendMessage } from '@/lib/messaging';
import { formatTimestamp } from '@/lib/subtitle-parser';
import { useSubtitleStore } from '@/lib/stores/subtitle-store';
import type { TimelineItem } from '@/lib/types';
import type { OutputLanguageCode } from '@/lib/output-language';
import { useUiText } from '@/lib/ui-text';

interface Props {
  onSeek: (time: number) => void;

  targetLanguage: OutputLanguageCode;
}

export function TimelineTab({ onSeek, targetLanguage }: Props) {
  const { videoId, segments, currentTime, isLoading } = useSubtitleStore();
  const ui = useUiText();
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const generatedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!videoId || segments.length === 0) {
      setTimeline([]);
      setError(null);
      setIsGenerating(false);
      generatedForRef.current = null;
      return;
    }

    const key = `${videoId}-${targetLanguage}-${segments.length}-${retryNonce}`;
    if (generatedForRef.current === key) {
      return;
    }

    generatedForRef.current = key;
    setIsGenerating(true);
    setError(null);
    setTimeline([]);

    sendMessage('generateTimeline', {
      videoId,
      lang: segments[0]?.lang || 'en',
      targetLanguage,
      segments: segments.map((segment) => ({
        text: segment.text,
        offset: segment.startTime,
        duration: segment.endTime - segment.startTime,
        lang: segment.lang,
      })),
    })
      .then((result) => {
        setTimeline(result.timeline);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : ui.t('failedTimeline'));
        generatedForRef.current = null;
      })
      .finally(() => {
        setIsGenerating(false);
      });
  }, [retryNonce, segments, targetLanguage, videoId]);

  const activeIndex = useMemo(
    () =>
      timeline.findIndex((item, index) => {
        const next = timeline[index + 1];
        return currentTime >= item.timestamp && (!next || currentTime < next.timestamp);
      }),
    [currentTime, timeline],
  );

  const handleRetry = () => {
    generatedForRef.current = null;
    setTimeline([]);
    setError(null);
    setRetryNonce((value) => value + 1);
  };

  if (segments.length === 0) {
    if (isLoading) {
      return (
        <div className="px-5 py-4 space-y-3 bg-white">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border-subtle p-4 space-y-2">
              <div className="h-3 w-20 skeleton-bar" />
              <div className="h-4 w-full skeleton-bar" />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full px-10 text-center text-sm text-text-muted bg-white">
        {ui.t('timeline.empty')}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-6 py-5 sticky top-0 bg-white/80 backdrop-blur-md z-10">
        <p className="text-sm font-bold text-text-primary tracking-tight">{ui.t('timeline.title')}</p>
        <p className="mt-1 text-[11px] text-text-muted font-medium leading-relaxed">
          {ui.t('timeline.description')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
        {isGenerating && (
          <div className="space-y-4 animate-fade-in">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-2xl bg-bg-subtle/50 p-5 space-y-3">
                <div className="h-3 w-20 skeleton-bar" />
                <div className="h-4 w-full skeleton-bar" />
                <div className="h-4 w-3/4 skeleton-bar" />
              </div>
            ))}
          </div>
        )}

        {!isGenerating && error && (
          <div className="mx-2 rounded-2xl bg-danger/5 p-5 animate-fade-in">
            <p className="text-sm text-danger font-bold leading-normal">{error}</p>
            <button
              onClick={handleRetry}
              className="mt-3 text-xs font-bold text-danger hover:opacity-80 transition-opacity"
            >
              {ui.t('retry')}
            </button>
          </div>
        )}

        {!isGenerating && !error && timeline.length > 0 && (
          <div className="space-y-3 animate-fade-in pb-6">
            {timeline.map((item, index) => {
              const isActive = index === activeIndex;
              const emphasis = getImportanceStyle(item.importance, ui);
              return (
                <div
                  key={`${item.timestamp}-${item.summary}-${index}`}
                  className={`rounded-2xl p-5 transition-all duration-300 ${
                    isActive
                      ? `shadow-xl shadow-black/5 scale-[1.02] z-10 relative ${emphasis.activeCardClass}`
                      : `${emphasis.cardClass} hover:scale-[1.01]`
                  }`}
                  onClick={() => onSeek(item.timestamp)}
                >
                  <div className="flex items-start gap-4 cursor-pointer">
                    <div className="shrink-0 flex flex-col items-center gap-2">
                      <div className={`text-[11px] font-mono font-bold px-2 py-1 rounded-lg transition-all ${
                        isActive ? emphasis.activeTimestampClass : emphasis.timestampClass
                      }`}>
                        {formatTimestamp(item.timestamp)}
                      </div>
                      <div className={`h-2.5 w-2.5 rounded-full ${isActive ? emphasis.activeDotClass : emphasis.dotClass}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-relaxed transition-colors ${isActive ? emphasis.activeTextClass : emphasis.textClass}`}>
                        {item.summary}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${isActive ? emphasis.activeBadgeClass : emphasis.badgeClass}`}>
                      {emphasis.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function getImportanceStyle(importance: number, ui: ReturnType<typeof useUiText>) {
  if (importance >= 0.8) {
    return {
      label: ui.t('timeline.core'),
      cardClass: 'bg-indigo-50/50 hover:bg-indigo-50/80',
      activeCardClass: 'bg-indigo-600 text-white',
      dotClass: 'bg-indigo-400',
      activeDotClass: 'bg-white',
      timestampClass: 'bg-indigo-100/50 text-indigo-700',
      activeTimestampClass: 'bg-white/20 text-white',
      textClass: 'text-indigo-950 font-bold',
      activeTextClass: 'text-white font-bold',
      badgeClass: 'bg-indigo-100 text-indigo-700',
      activeBadgeClass: 'bg-white/20 text-white',
    };
  }

  if (importance >= 0.6) {
    return {
      label: ui.t('timeline.important'),
      cardClass: 'bg-rose-50/50 hover:bg-rose-50/80',
      activeCardClass: 'bg-rose-500 text-white',
      dotClass: 'bg-rose-400',
      activeDotClass: 'bg-white',
      timestampClass: 'bg-rose-100/50 text-rose-700',
      activeTimestampClass: 'bg-white/20 text-white',
      textClass: 'text-rose-950 font-bold',
      activeTextClass: 'text-white font-bold',
      badgeClass: 'bg-rose-100 text-rose-700',
      activeBadgeClass: 'bg-white/20 text-white',
    };
  }

  return {
    label: ui.t('timeline.point'),
    cardClass: 'bg-bg-subtle/50 hover:bg-bg-subtle',
    activeCardClass: 'bg-accent text-white',
    dotClass: 'bg-text-muted/30',
    activeDotClass: 'bg-white/60',
    timestampClass: 'bg-bg-elevated/50 text-text-muted',
    activeTimestampClass: 'bg-white/20 text-white',
    textClass: 'text-text-secondary font-bold',
    activeTextClass: 'text-white font-bold',
    badgeClass: 'bg-bg-elevated/50 text-text-muted',
    activeBadgeClass: 'bg-white/20 text-white',
  };
}
