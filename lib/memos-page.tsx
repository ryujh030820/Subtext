import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DEFAULT_OUTPUT_LANGUAGE,
  type OutputLanguageCode,
} from '@/lib/output-language';
import { getPreferredOutputLanguage } from '@/lib/preferences';
import { UiTextProvider, createUiText } from '@/lib/ui-text';
import { getAllMemos, updateMemo, deleteMemo, saveMemos } from '@/lib/storage';
import { formatTimestamp } from '@/lib/subtitle-parser';
import type { Memo } from '@/lib/types';
import './memos-page.css';

function MemosApp() {
  const [language, setLanguage] = useState<OutputLanguageCode>(DEFAULT_OUTPUT_LANGUAGE);
  const [allMemos, setAllMemos] = useState<Record<string, Memo[]>>({});
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  const ui = createUiText(language);

  useEffect(() => {
    void getPreferredOutputLanguage().then((value) => {
      setLanguage(value);
    });
    void loadAllMemos();
  }, []);

  useEffect(() => {
    document.title = ui.t('memos.pageTitle');
  }, [ui]);

  const loadAllMemos = async () => {
    const memos = await getAllMemos();
    setAllMemos(memos);
    setIsLoaded(true);
  };

  const handleEdit = (memo: Memo) => {
    setEditingId(memo.id);
    setEditContent(memo.content);
  };

  const handleSaveEdit = async (memo: Memo) => {
    if (!editContent.trim()) return;
    await updateMemo({ ...memo, content: editContent.trim(), updatedAt: new Date().toISOString() });
    setEditingId(null);
    setEditContent('');
    await loadAllMemos();
  };

  const handleDelete = async (videoId: string, memoId: string) => {
    if (!confirm(ui.t('memos.deleteConfirm'))) return;
    await deleteMemo(videoId, memoId);
    await loadAllMemos();
  };

  const handleDeleteAllForVideo = async (videoId: string) => {
    if (!confirm(ui.t('memos.deleteConfirm'))) return;
    await saveMemos(videoId, []);
    await loadAllMemos();
  };

  // Filter memos by search
  const filteredMemos: Record<string, Memo[]> = {};
  let totalCount = 0;

  for (const [videoId, memos] of Object.entries(allMemos)) {
    const filtered = search
      ? memos.filter((m) => m.content.toLowerCase().includes(search.toLowerCase()))
      : memos;
    if (filtered.length > 0) {
      filteredMemos[videoId] = filtered;
      totalCount += filtered.length;
    }
  }

  const videoIds = Object.keys(filteredMemos).sort();

  if (!isLoaded) return null;

  return (
    <UiTextProvider language={language}>
      <main className="min-h-screen px-6 py-10">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-3xl border border-border-subtle bg-white p-8 shadow-sm">
            <p className="text-sm font-semibold text-accent-brand">{ui.t('options.title')}</p>
            <h1 className="mt-2 text-2xl font-semibold text-text-primary">{ui.t('memos.title')}</h1>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              {ui.t('memos.description')}
            </p>

            {/* Search + count */}
            <div className="mt-6 flex items-center gap-3">
              <div className="relative flex-1">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={ui.t('memos.searchPlaceholder')}
                  className="w-full rounded-xl border border-border-default bg-bg-subtle py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-brand/30 focus:ring-4 focus:ring-accent-brand/5 transition-all"
                />
              </div>
              <span className="shrink-0 text-xs text-text-muted">
                {ui.t('memos.totalCount', { count: totalCount })}
              </span>
            </div>
          </div>

          {/* Memo list */}
          {videoIds.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-border-subtle bg-white p-12 text-center shadow-sm">
              <svg
                className="mx-auto mb-4 text-text-muted opacity-40"
                width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <p className="text-sm text-text-muted">{ui.t('memos.empty')}</p>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-4">
              {videoIds.map((videoId) => (
                <VideoMemoGroup
                  key={videoId}
                  videoId={videoId}
                  memos={filteredMemos[videoId]}
                  editingId={editingId}
                  editContent={editContent}
                  ui={ui}
                  onEdit={handleEdit}
                  onEditContentChange={setEditContent}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={handleDelete}
                  onDeleteAll={() => handleDeleteAllForVideo(videoId)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </UiTextProvider>
  );
}

interface VideoMemoGroupProps {
  videoId: string;
  memos: Memo[];
  editingId: string | null;
  editContent: string;
  ui: ReturnType<typeof createUiText>;
  onEdit: (memo: Memo) => void;
  onEditContentChange: (content: string) => void;
  onSaveEdit: (memo: Memo) => void;
  onCancelEdit: () => void;
  onDelete: (videoId: string, memoId: string) => void;
  onDeleteAll: () => void;
}

function VideoMemoGroup({
  videoId,
  memos,
  editingId,
  editContent,
  ui,
  onEdit,
  onEditContentChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: VideoMemoGroupProps) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-white shadow-sm overflow-hidden">
      {/* Video header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-bg-subtle border-b border-border-subtle">
        <img
          src={`https://i.ytimg.com/vi/${videoId}/default.jpg`}
          alt=""
          className="w-16 h-12 rounded-lg object-cover bg-bg-elevated"
        />
        <div className="flex-1 min-w-0">
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-text-primary hover:text-accent-brand transition-colors truncate block"
            title={memos[0]?.videoTitle || videoId}
          >
            {memos[0]?.videoTitle || videoId}
          </a>
          <p className="text-[11px] text-text-muted mt-0.5">
            {ui.t('memos.totalCount', { count: memos.length })}
          </p>
        </div>
      </div>

      {/* Memo items */}
      <div className="divide-y divide-border-subtle">
        {memos.map((memo) => (
          <div key={memo.id} className="group px-5 py-4 hover:bg-bg-subtle/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <a
                href={`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(memo.timestamp)}s`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-0.5 rounded bg-bg-elevated text-[10px] font-mono text-text-secondary hover:text-accent-brand hover:bg-accent-brand/5 transition-colors"
              >
                {formatTimestamp(memo.timestamp)}
              </a>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-text-muted">
                  {new Date(memo.updatedAt).toLocaleDateString()}
                </span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onEdit(memo)}
                    className="text-[11px] text-text-muted hover:text-accent-brand font-medium"
                  >
                    {ui.t('common.edit')}
                  </button>
                  <button
                    onClick={() => onDelete(videoId, memo.id)}
                    className="text-[11px] text-text-muted hover:text-danger font-medium"
                  >
                    {ui.t('common.delete')}
                  </button>
                </div>
              </div>
            </div>

            {editingId === memo.id ? (
              <div className="mt-2 flex flex-col gap-2">
                <textarea
                  value={editContent}
                  onChange={(e) => onEditContentChange(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm bg-bg-subtle border border-accent-brand/30 rounded-lg resize-none text-text-primary focus:outline-none focus:ring-4 focus:ring-accent-brand/5"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={onCancelEdit}
                    className="text-xs text-text-muted hover:text-text-secondary px-2 py-1"
                  >
                    {ui.t('common.cancel')}
                  </button>
                  <button
                    onClick={() => onSaveEdit(memo)}
                    className="text-xs text-white bg-accent-brand hover:bg-accent-brand/90 px-3 py-1 rounded-lg font-medium transition-colors"
                  >
                    {ui.t('common.save')}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">
                {memo.content}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const container = document.getElementById('root');

if (container) {
  createRoot(container).render(<MemosApp />);
}
