import { useEffect, useMemo, useRef, useState } from 'react';
import { sendMessage } from '@/lib/messaging';
import { downloadFile, formatTimestamp } from '@/lib/subtitle-parser';
import { useSubtitleStore } from '@/lib/stores/subtitle-store';
import type { ArticleSection } from '@/lib/types';
import type { OutputLanguageCode } from '@/lib/output-language';
import { useUiText } from '@/lib/ui-text';

interface Props {
  onSeek: (time: number) => void;
  targetLanguage: OutputLanguageCode;
}

export function ArticleTab({ onSeek, targetLanguage }: Props) {
  const { videoId, videoTitle, segments, currentTime, isLoading } = useSubtitleStore();
  const ui = useUiText();
  const [article, setArticle] = useState<ArticleSection[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const generatedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!videoId || segments.length === 0) {
      setArticle([]);
      setExpanded({});
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
    setArticle([]);
    setExpanded({});

    sendMessage('generateArticle', {
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
        setArticle(result.article);
        setExpanded(
          Object.fromEntries(result.article.map((_, index) => [index, true])),
        );
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : ui.t('failedArticle'));
        generatedForRef.current = null;
      })
      .finally(() => {
        setIsGenerating(false);
      });
  }, [retryNonce, segments, targetLanguage, videoId]);

  const activeIndex = useMemo(
    () =>
      article.findIndex((section, index) => {
        const next = article[index + 1];
        return currentTime >= section.startTimestamp && (!next || currentTime < next.startTimestamp);
      }),
    [article, currentTime],
  );

  const handleRetry = () => {
    generatedForRef.current = null;
    setArticle([]);
    setExpanded({});
    setError(null);
    setRetryNonce((value) => value + 1);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(toMarkdown(article, videoTitle || videoId));
  };

  const handleExport = () => {
    const filename = `${videoTitle || videoId || 'article'}.md`;
    downloadFile(toMarkdown(article, videoTitle || videoId), filename, 'text/markdown');
  };

  if (segments.length === 0) {
    if (isLoading) {
      return (
        <div className="px-5 py-4 space-y-3 bg-bg-base">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-border-subtle p-4 space-y-2">
              <div className="h-4 w-1/3 skeleton-bar" />
              <div className="h-3 w-20 skeleton-bar" />
              <div className="h-4 w-full skeleton-bar" />
              <div className="h-4 w-5/6 skeleton-bar" />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full px-10 text-center text-sm text-text-muted bg-bg-base">
        {ui.t('article.empty')}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-bg-base">
      <div className="px-6 py-5 sticky top-0 bg-bg-base/80 backdrop-blur-md z-10 space-y-4">
        <div>
          <p className="text-sm font-bold text-text-primary tracking-tight">{ui.t('article.title')}</p>
          <p className="mt-1 text-[11px] text-text-muted font-medium leading-relaxed">
            {ui.t('article.description')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setExpanded(Object.fromEntries(article.map((_, index) => [index, true])))}
            className="btn-secondary h-9 w-full px-2.5 text-[10px] font-bold uppercase tracking-wider justify-center"
            disabled={article.length === 0}
          >
            {ui.t('article.expandAll')}
          </button>
          <button
            onClick={() => setExpanded(Object.fromEntries(article.map((_, index) => [index, false])))}
            className="btn-secondary h-9 w-full px-2.5 text-[10px] font-bold uppercase tracking-wider justify-center"
            disabled={article.length === 0}
          >
            {ui.t('article.collapseAll')}
          </button>
          <button
            onClick={() => void handleCopy()}
            className="btn-secondary h-9 w-full px-2.5 text-[10px] font-bold uppercase tracking-wider justify-center"
            disabled={article.length === 0}
          >
            {ui.t('common.copy')}
          </button>
          <button
            onClick={handleExport}
            className="btn-secondary h-9 w-full px-2.5 text-[10px] font-bold uppercase tracking-wider justify-center"
            disabled={article.length === 0}
          >
            {ui.t('common.export')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar">
        {isGenerating && (
          <div className="space-y-4 animate-fade-in">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="rounded-2xl bg-bg-subtle/50 p-6 space-y-3">
                <div className="h-4 w-1/3 skeleton-bar" />
                <div className="h-3 w-20 skeleton-bar" />
                <div className="h-4 w-full skeleton-bar" />
                <div className="h-4 w-5/6 skeleton-bar" />
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

        {!isGenerating && !error && article.length > 0 && (
          <div className="space-y-4 animate-fade-in pb-8">
            {article.map((section, index) => {
              const isActive = index === activeIndex;
              const isExpanded = expanded[index] ?? true;

              return (
                <section
                  key={`${section.startTimestamp}-${section.topicTitle}-${index}`}
                  className={`rounded-2xl transition-all duration-300 ${
                    isActive
                      ? 'bg-accent-brand/5 shadow-xl shadow-black/5 ring-1 ring-accent-brand/10'
                      : 'bg-bg-subtle/30 hover:bg-bg-subtle/50'
                  }`}
                >
                  <button
                    onClick={() => setExpanded((prev) => ({ ...prev, [index]: !isExpanded }))}
                    className="w-full px-5 py-5 text-left"
                  >
                    <div className="flex items-start gap-4">
                      <div className={`mt-0.5 h-6 w-6 shrink-0 rounded-lg flex items-center justify-center transition-all ${
                        isExpanded ? 'bg-accent-brand text-white' : 'bg-bg-elevated text-text-muted'
                      }`}>
                        <svg
                          className={`h-3.5 w-3.5 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M9 5l7 7-7 7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5">
                          <h3 className={`text-[15px] font-bold leading-tight transition-colors ${
                            isActive ? 'text-accent-brand' : 'text-text-primary'
                          }`}>
                            {section.topicTitle}
                          </h3>
                          {isActive && (
                            <span className="rounded-full bg-accent-brand text-[9px] font-bold text-white px-2 py-0.5 uppercase tracking-wider animate-pulse-soft">
                              {ui.t('article.now')}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onSeek(section.startTimestamp);
                          }}
                          className={`mt-1.5 inline-flex items-center px-2 py-0.5 rounded bg-bg-elevated text-[11px] font-mono font-bold transition-all ${
                            isActive ? 'text-accent-brand' : 'text-text-muted hover:text-text-secondary'
                          }`}
                        >
                          {formatTimestamp(section.startTimestamp)}
                        </button>
                      </div>
                    </div>
                  </button>

                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className={`px-5 pb-6 pt-1 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                        isExpanded ? 'translate-y-0' : '-translate-y-2'
                      }`}>
                        <p className="whitespace-pre-line text-[14.5px] font-medium leading-relaxed text-text-secondary">
                          {section.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function toMarkdown(article: ArticleSection[], title: string): string {
  return [
    `# ${title}`,
    '',
    ...article.flatMap((section) => [
      `## ${section.topicTitle} [${formatTimestamp(section.startTimestamp)}]`,
      '',
      section.description,
      '',
    ]),
  ].join('\n');
}
