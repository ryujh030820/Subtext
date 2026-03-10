import { create } from 'zustand';
import type { Memo } from '../types';
import { getMemos, addMemo, updateMemo, deleteMemo } from '../storage';

interface MemoState {
  memos: Memo[];
  isLoading: boolean;

  loadMemos: (videoId: string) => Promise<void>;
  createMemo: (videoId: string, timestamp: number, content: string, videoTitle?: string) => Promise<void>;
  editMemo: (memo: Memo) => Promise<void>;
  removeMemo: (videoId: string, memoId: string) => Promise<void>;
}

export const useMemoStore = create<MemoState>((set) => ({
  memos: [],
  isLoading: false,

  loadMemos: async (videoId) => {
    set({ isLoading: true });
    const memos = await getMemos(videoId);
    set({ memos, isLoading: false });
  },

  createMemo: async (videoId, timestamp, content, videoTitle?) => {
    const memo: Memo = {
      id: crypto.randomUUID(),
      videoId,
      ...(videoTitle ? { videoTitle } : {}),
      timestamp,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await addMemo(memo);
    const memos = await getMemos(videoId);
    set({ memos });
  },

  editMemo: async (memo) => {
    const updated = { ...memo, updatedAt: new Date().toISOString() };
    await updateMemo(updated);
    const memos = await getMemos(memo.videoId);
    set({ memos });
  },

  removeMemo: async (videoId, memoId) => {
    await deleteMemo(videoId, memoId);
    const memos = await getMemos(videoId);
    set({ memos });
  },
}));
