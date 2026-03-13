import { useState } from 'react';
import { useSubtitleStore } from '@/lib/stores/subtitle-store';
import { useMemoStore } from '@/lib/stores/memo-store';
import { formatTimestamp, downloadFile } from '@/lib/subtitle-parser';
import type { Memo } from '@/lib/types';
import { useUiText } from '@/lib/ui-text';

interface Props {
  onSeek: (time: number) => void;
}

export function MemoTab({ onSeek }: Props) {
  const { videoId, currentTime, videoTitle } = useSubtitleStore();
  const { memos, createMemo, editMemo, removeMemo } = useMemoStore();
  const ui = useUiText();
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const handleCreate = async () => {
    if (!newContent.trim() || !videoId) return;
    await createMemo(videoId, currentTime, newContent.trim(), videoTitle || undefined);
    setNewContent('');
  };

  const handleEdit = (memo: Memo) => {
    setEditingId(memo.id);
    setEditContent(memo.content);
  };

  const handleSaveEdit = async (memo: Memo) => {
    if (!editContent.trim()) return;
    await editMemo({ ...memo, content: editContent.trim() });
    setEditingId(null);
    setEditContent('');
  };

  const handleDelete = async (memoId: string) => {
    await removeMemo(videoId, memoId);
  };

  const handleExport = () => {
    const lines = memos.map(
      (m) => `[${formatTimestamp(m.timestamp)}] ${m.content}`,
    );
    const content = `${videoTitle || videoId}\n${'='.repeat(40)}\n\n${lines.join('\n\n')}`;
    downloadFile(content, `${videoTitle || videoId}_memos.txt`, 'text/plain');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreate();
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-base">
      {/* 새 메모 작성 */}
      <div className="px-6 py-5 bg-bg-subtle/50">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
             <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-accent-brand shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
               <span className="text-[11px] font-bold text-text-primary uppercase tracking-wider">{ui.t('memo.new')}</span>
             </div>
             <span className="text-[10px] font-bold text-accent-brand bg-bg-base px-2.5 py-1 rounded-lg shadow-sm">
               {formatTimestamp(currentTime)}
             </span>
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={ui.t('memo.placeholder')}
            rows={3}
            className="w-full px-4 py-3 text-sm bg-bg-base rounded-2xl resize-none text-text-primary placeholder:text-text-muted transition-all focus:outline-none focus:ring-4 focus:ring-accent-brand/5 shadow-sm font-medium"
          />
          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={!newContent.trim()}
              className="btn-primary h-9 px-5 text-xs font-bold gap-2 shadow-md shadow-accent/10"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              {ui.t('common.save')}
            </button>
          </div>
        </div>
      </div>

      {/* 메모 리스트 */}
      <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-5 custom-scrollbar">
        {memos.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 py-12">
            <div className="w-16 h-16 rounded-3xl bg-bg-subtle flex items-center justify-center mb-6 shadow-sm">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-text-muted leading-relaxed">{ui.t('memo.empty')}</p>
          </div>
        ) : (
          memos.map((memo) => (
            <div
              key={memo.id}
              className="group p-5 bg-bg-subtle/30 rounded-2xl transition-all duration-300 hover:bg-bg-subtle/60 hover:scale-[1.01] animate-slide-up"
            >
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => onSeek(memo.timestamp)}
                  className="px-2.5 py-1 rounded-lg bg-bg-base text-[10px] font-bold text-text-secondary shadow-sm hover:text-accent-brand hover:scale-105 transition-all"
                >
                  {formatTimestamp(memo.timestamp)}
                </button>
                <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => handleEdit(memo)}
                    className="text-[11px] text-text-muted hover:text-accent-brand font-bold uppercase tracking-wider"
                  >
                    {ui.t('common.edit')}
                  </button>
                  <button
                    onClick={() => handleDelete(memo.id)}
                    className="text-[11px] text-text-muted hover:text-danger font-bold uppercase tracking-wider"
                  >
                    {ui.t('common.delete')}
                  </button>
                </div>
              </div>
              
              {editingId === memo.id ? (
                <div className="mt-3 flex flex-col gap-3">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2.5 text-sm bg-bg-base rounded-xl resize-none text-text-primary focus:outline-none focus:ring-4 focus:ring-accent-brand/5 shadow-sm font-medium"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs font-bold text-text-muted hover:text-text-secondary px-3"
                    >
                      {ui.t('common.cancel')}
                    </button>
                    <button
                      onClick={() => handleSaveEdit(memo)}
                      className="btn-primary h-8 px-4 text-xs font-bold"
                    >
                      {ui.t('common.save')}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[14.5px] text-text-primary font-medium leading-relaxed whitespace-pre-wrap">
                  {memo.content}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* 내보내기 버튼 */}
      {memos.length > 0 && (
        <div className="px-6 py-5 bg-bg-base/80 backdrop-blur-md sticky bottom-0">
          <button
            onClick={handleExport}
            className="btn-secondary w-full h-11 text-xs font-bold uppercase tracking-wider gap-2.5 shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {ui.t('memo.export')}
          </button>
        </div>
      )}
    </div>
  );
}
