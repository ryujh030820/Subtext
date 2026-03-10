import { useState, useEffect, useRef, useCallback } from 'react';
import { useSubtitleStore } from '@/lib/stores/subtitle-store';
import { formatTimestamp } from '@/lib/subtitle-parser';
import { useUiText } from '@/lib/ui-text';

interface Props {
  onSeek: (time: number) => void;
}

export function ScriptTab({ onSeek }: Props) {
  const { segments, currentTime, isLoading } = useSubtitleStore();
  const ui = useUiText();
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const activeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 현재 활성 세그먼트 인덱스
  const activeIndex = segments.findIndex(
    (seg, i) =>
      currentTime >= seg.startTime &&
      (i === segments.length - 1 || currentTime < segments[i + 1].startTime),
  );

  // 검색 필터
  const filteredSegments = searchQuery
    ? segments.filter((seg) =>
        seg.text.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : segments;

  // 자동 스크롤
  useEffect(() => {
    if (autoScroll && activeRef.current && !searchQuery) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex, autoScroll, searchQuery]);

  // 텍스트 복사
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  if (segments.length === 0) {
    if (isLoading) {
      return (
        <div className="flex flex-col h-full bg-white">
          <div className="px-5 py-3 flex flex-col gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="shrink-0 w-10 h-3 skeleton-bar mt-1" />
                <div className="flex-1 flex flex-col gap-2">
                  <div className="h-4 skeleton-bar w-full" />
                  <div className="h-4 skeleton-bar w-[80%]" />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm px-10 text-center">
        {ui.t('script.empty')}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* 검색 & 컨트롤 */}
      <div className="px-5 py-4 flex flex-col gap-3 sticky top-0 z-10 glass">
        <div className="relative group">
          <input
            type="text"
            placeholder={ui.t('script.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-bg-elevated/50 rounded-xl text-text-primary placeholder:text-text-muted transition-all focus:outline-none focus:bg-white focus:ring-4 focus:ring-accent-brand/5 font-medium"
          />
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted transition-colors group-focus-within:text-accent-brand"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-text-muted font-bold uppercase tracking-wider">
            {searchQuery
              ? ui.t('script.results', { count: filteredSegments.length })
              : ui.t('script.segments', { count: segments.length })}
          </span>
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              autoScroll
                ? 'text-accent-brand bg-accent-brand/5'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${autoScroll ? 'bg-accent-brand animate-blink' : 'bg-text-muted'}`} />
            {ui.t('script.autoScroll')} {autoScroll ? ui.t('common.on') : ui.t('common.off')}
          </button>
        </div>
      </div>

      {/* 자막 리스트 */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-2 py-3 custom-scrollbar">
        {filteredSegments.map((seg) => {
          const isActive = seg.index === activeIndex && !searchQuery;
          return (
            <div
              key={seg.index}
              ref={isActive ? activeRef : undefined}
              className={`group flex gap-5 px-5 py-4 rounded-2xl mx-1 mb-1.5 cursor-pointer transition-all duration-300 ${
                isActive
                  ? 'active-segment shadow-sm'
                  : 'hover:bg-bg-subtle'
              }`}
              onClick={() => onSeek(seg.startTime)}
              onDoubleClick={() => handleCopy(seg.text)}
            >
              <div className="shrink-0 pt-0.5">
                <span className={`text-[11px] font-mono tracking-tight transition-colors ${
                  isActive ? 'text-accent-brand font-bold' : 'text-text-muted group-hover:text-text-secondary'
                }`}>
                  {formatTimestamp(seg.startTime)}
                </span>
              </div>
              <div className="flex-1">
                <p className={`text-[14.5px] leading-relaxed transition-colors ${
                  isActive ? 'text-text-primary font-bold' : 'text-text-secondary font-medium'
                }`}>
                  {searchQuery ? highlightText(seg.text, searchQuery) : seg.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function highlightText(text: string, query: string) {
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-accent-brand/10 text-accent-brand rounded px-1 font-bold">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
