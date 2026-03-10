import type { TranscriptSegment } from './youtube-transcript';

type GoogleTranslateResponse = {
  data?: {
    translations?: Array<{
      translatedText?: string;
      detectedSourceLanguage?: string;
    }>;
  };
  error?: {
    message?: string;
  };
};

type TextBatch = {
  texts: string[];
};

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_MAX_BATCH_ITEMS = 64;
const DEFAULT_MAX_BATCH_CHARS = 4500;

export async function translateSegmentsWithGoogleCloud(
  segments: TranscriptSegment[],
  targetLanguage: string,
  sourceLanguage?: string,
): Promise<TranscriptSegment[]> {
  if (segments.length === 0) {
    return [];
  }

  const apiKey = import.meta.env.WXT_GOOGLE_TRANSLATE_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error('WXT_GOOGLE_TRANSLATE_API_KEY is not set in .env');
  }

  const normalizedTarget = normalizeGoogleLanguageCode(targetLanguage);
  const normalizedSource = sourceLanguage ? normalizeGoogleLanguageCode(sourceLanguage) : '';
  if (normalizedSource && isSameLanguage(normalizedSource, normalizedTarget)) {
    return segments.map((segment) => ({ ...segment, lang: targetLanguage }));
  }

  const uniqueTexts = new Map<string, string>();
  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;
    if (!uniqueTexts.has(text)) {
      uniqueTexts.set(text, text);
    }
  }

  const textList = Array.from(uniqueTexts.keys());
  if (textList.length === 0) {
    return segments.map((segment) => ({ ...segment, lang: targetLanguage }));
  }

  const batches = buildTextBatches(textList, DEFAULT_MAX_BATCH_ITEMS, DEFAULT_MAX_BATCH_CHARS);
  const translatedTextMap = new Map<string, string>();
  let successBatchCount = 0;

  await mapWithConcurrency(batches, DEFAULT_CONCURRENCY, async (batch) => {
    try {
      const translatedTexts = await requestGoogleTranslation({
        texts: batch.texts,
        targetLanguage: normalizedTarget,
        sourceLanguage: normalizedSource || undefined,
        apiKey,
      });
      batch.texts.forEach((text, index) => {
        translatedTextMap.set(text, translatedTexts[index] ?? text);
      });
      successBatchCount += 1;
    } catch (error) {
      batch.texts.forEach((text) => translatedTextMap.set(text, text));
    }
  });

  if (successBatchCount === 0) {
    throw new Error('Google Translation API requests failed for all batches.');
  }

  return segments.map((segment) => {
    const trimmed = segment.text.trim();
    if (!trimmed) {
      return { ...segment, lang: targetLanguage };
    }
    const translated = translatedTextMap.get(trimmed) ?? segment.text;
    return {
      ...segment,
      text: translated,
      lang: targetLanguage,
    };
  });
}

function buildTextBatches(texts: string[], maxItems: number, maxChars: number): TextBatch[] {
  const batches: TextBatch[] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (const text of texts) {
    const textLength = text.length;
    const exceedsItems = current.length >= maxItems;
    const exceedsChars = currentChars + textLength > maxChars;

    if (current.length > 0 && (exceedsItems || exceedsChars)) {
      batches.push({ texts: current });
      current = [];
      currentChars = 0;
    }

    current.push(text);
    currentChars += textLength;
  }

  if (current.length > 0) {
    batches.push({ texts: current });
  }

  return batches;
}

async function requestGoogleTranslation(params: {
  texts: string[];
  targetLanguage: string;
  sourceLanguage?: string;
  apiKey: string;
}): Promise<string[]> {
  const endpoint = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(params.apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: params.texts,
      target: params.targetLanguage,
      ...(params.sourceLanguage ? { source: params.sourceLanguage } : {}),
      format: 'text',
    }),
  });

  const responseText = await response.text();
  let parsed: GoogleTranslateResponse | null = null;
  try {
    parsed = JSON.parse(responseText) as GoogleTranslateResponse;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = parsed?.error?.message || `${response.status}`;
    throw new Error(`Google Translation API: ${detail}`);
  }

  const translations = parsed?.data?.translations;
  if (!Array.isArray(translations) || translations.length !== params.texts.length) {
    throw new Error('Google Translation API returned an invalid translation payload.');
  }

  return translations.map((item, index) => {
    const translated = typeof item.translatedText === 'string' ? item.translatedText : params.texts[index];
    return decodeHtmlEntities(translated);
  });
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      await worker(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
}

function normalizeGoogleLanguageCode(language: string): string {
  const normalized = language.trim().replace(/_/g, '-');
  const lower = normalized.toLowerCase();

  if (lower === 'zh-hans') return 'zh-CN';
  if (lower === 'zh-hant') return 'zh-TW';

  return normalized;
}

function isSameLanguage(a: string, b: string): boolean {
  const normalize = (code: string) => code.trim().toLowerCase().replace(/_/g, '-').split('-')[0];
  return normalize(a) === normalize(b);
}

function decodeHtmlEntities(text: string): string {
  if (!text) return text;

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }

  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
