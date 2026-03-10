import type { Memo } from './types';

const MEMO_PREFIX = 'memo_';
const CHAT_PREFIX = 'chat_';

export interface ChatHistoryEntry {
  role: 'user' | 'model';
  text: string;
}

export async function getChatHistory(videoId: string): Promise<ChatHistoryEntry[]> {
  const key = CHAT_PREFIX + videoId;
  const result = await chrome.storage.local.get(key);
  return result[key] ?? [];
}

export async function saveChatHistory(videoId: string, messages: ChatHistoryEntry[]): Promise<void> {
  const key = CHAT_PREFIX + videoId;
  await chrome.storage.local.set({ [key]: messages });
}

export async function getMemos(videoId: string): Promise<Memo[]> {
  const key = MEMO_PREFIX + videoId;
  const result = await chrome.storage.local.get(key);
  return result[key] ?? [];
}

export async function saveMemos(videoId: string, memos: Memo[]): Promise<void> {
  const key = MEMO_PREFIX + videoId;
  await chrome.storage.local.set({ [key]: memos });
}

export async function addMemo(memo: Memo): Promise<void> {
  const memos = await getMemos(memo.videoId);
  memos.push(memo);
  memos.sort((a, b) => a.timestamp - b.timestamp);
  await saveMemos(memo.videoId, memos);
}

export async function updateMemo(memo: Memo): Promise<void> {
  const memos = await getMemos(memo.videoId);
  const index = memos.findIndex((m) => m.id === memo.id);
  if (index !== -1) {
    memos[index] = memo;
    await saveMemos(memo.videoId, memos);
  }
}

export async function deleteMemo(videoId: string, memoId: string): Promise<void> {
  const memos = await getMemos(videoId);
  const filtered = memos.filter((m) => m.id !== memoId);
  await saveMemos(videoId, filtered);
}

export async function getAllMemos(): Promise<Record<string, Memo[]>> {
  const all = await chrome.storage.local.get(null);
  const result: Record<string, Memo[]> = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(MEMO_PREFIX) && Array.isArray(value)) {
      const videoId = key.slice(MEMO_PREFIX.length);
      result[videoId] = value as Memo[];
    }
  }
  return result;
}
