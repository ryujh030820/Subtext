import { onMessage, sendMessage } from '@/lib/messaging';
import { formatTimestamp, parseTimestamp } from '@/lib/subtitle-parser';
import {
  getOutputLanguageInstruction,
  type OutputLanguageCode,
} from '@/lib/output-language';
import type { SubtitleTrackOption } from '@/lib/types';
import {
  getArticleCacheKey,
  getDetailedSummaryCacheKey,
  getSuggestionsCacheKey,
  getSummaryCacheKey,
  getTimelineCacheKey,
} from '@/lib/ai-cache';

export default defineBackground(() => {
  // Toolbar icon click → toggle overlay panel in the active tab
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      try {
        await sendMessage('togglePanel', undefined, tab.id);
      } catch {
        // content script not yet loaded
      }
    }
  });

  onMessage('generateSummary', async ({ data }) => {
    const { videoId, text, lang, targetLanguage } = data;
    const cacheKey = getSummaryCacheKey(videoId, targetLanguage);
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      return cached[cacheKey] as { summary: string[]; keywords: string[] };
    }

    const languageInstruction = getOutputLanguageInstruction(targetLanguage, lang);

    const prompt = `You are a video content summarizer. Given the following video transcript, produce:
1. "summary": exactly 3 concise sentences.
2. "keywords": exactly 3 short tags.

Keep each summary sentence under 28 characters for Chinese, Japanese, or Korean, and under 15 words for other languages.
Each summary sentence MUST be a grammatically complete sentence with a proper ending — for Korean, end with 합니다/입니다/습니다 etc.; for Japanese, end with です/ます etc.; for other languages, use a proper full stop. Never end a sentence with a noun or fragment like "오토인코더." — always use a verb ending.
Keep each keyword to 1 or 2 words maximum.

${languageInstruction}

IMPORTANT: Output ONLY a single-line JSON object, no explanation, no markdown:
{"summary":["...","...","..."],"keywords":["...","...","..."]}

Transcript:
${text.slice(0, 30000)}`;

    const parsed = await requestGeminiJson<{ summary?: string[]; keywords?: string[] }>(
      prompt,
      getSummaryResponseSchema(),
      { maxOutputTokens: 4096 },
    );

    const isSentence = (s: string) => typeof s === 'string' && s.trim().length >= 5 && s.trim().split(/\s+/).length >= 2;
    const result = {
      summary: Array.isArray(parsed.summary) ? parsed.summary.filter(isSentence).slice(0, 3) : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter((item) => typeof item === 'string').slice(0, 3) : [],
    };

    if (result.summary.length === 0) {
      throw new Error('The generated summary was empty.');
    }

    await chrome.storage.local.set({ [cacheKey]: result });
    return result;
  });

  onMessage('generateDetailedSummary', async ({ data }) => {
    const { videoId, text, lang, targetLanguage } = data;
    const cacheKey = getDetailedSummaryCacheKey(videoId, targetLanguage);
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      return cached[cacheKey] as { detailedSummary: string };
    }

    const languageInstruction = getOutputLanguageInstruction(targetLanguage, lang);

    const prompt = `You are a video content summarizer. Given the transcript below, write a structured summary in the following format. Follow the example format exactly.

CRITICAL: ${languageInstruction} Every single word, including section titles, must be in the target language. Do NOT mix languages.

--- EXAMPLE FORMAT ---
## [Overview]
This video explains [topic]. [1-2 sentence summary of the core content]

## [Key Topics]
- **[Subtopic 1]**: [1-2 sentence summary]
- **[Subtopic 2]**: [1-2 sentence summary]
- **[Subtopic 3]**: [1-2 sentence summary]

## [Key Takeaways]
- [Most important insight 1]
- [Most important insight 2]
- [Most important insight 3]
--- END EXAMPLE ---

Rules:
- Translate ALL section titles and content into the target language. For example, if the target language is English, use "Overview", "Key Topics", "Key Takeaways". If Korean, use "개요", "주요 내용", "핵심 포인트". Etc.
- "Key Topics" should have 3–5 items depending on content richness.
- "Key Takeaways" should have exactly 3 items.
- Every sentence must be grammatically complete. For Korean use proper verb endings (합니다/입니다/습니다), for Japanese use です/ます, etc.
- Be concise but informative. Total length should be around 200–350 words.
- Do NOT use code blocks or JSON. Output plain markdown only.
- REMINDER: ${languageInstruction}

Transcript:
${text.slice(0, 60000)}`;

    const detailedSummary = await requestGeminiText(prompt, undefined, { maxOutputTokens: 8192 });

    const result = { detailedSummary: detailedSummary.trim() };
    await chrome.storage.local.set({ [cacheKey]: result });
    return result;
  });

  onMessage('generateTimeline', async ({ data }) => {
    const { videoId, segments, lang, targetLanguage } = data;
    const cacheKey = getTimelineCacheKey(videoId, targetLanguage);
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      return cached[cacheKey] as { timeline: Array<{ timestamp: number; summary: string; importance: number }> };
    }

    const transcript = buildTimestampedTranscript(segments);
    const duration = getTranscriptDuration(segments);
    const targetCount = getTimelineTargetCount(duration);
    const languageInstruction = getOutputLanguageInstruction(targetLanguage, lang);
    const timeline = await generateTimelineItems(transcript, languageInstruction, targetCount);
    if (timeline.length === 0) {
      throw new Error('The generated timeline was empty.');
    }

    const result = { timeline };
    await chrome.storage.local.set({ [cacheKey]: result });
    return result;
  });

  onMessage('generateArticle', async ({ data }) => {
    const { videoId, segments, lang, targetLanguage } = data;
    const cacheKey = getArticleCacheKey(videoId, targetLanguage);
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      return cached[cacheKey] as { article: Array<{ topicTitle: string; description: string; startTimestamp: number; endTimestamp: number }> };
    }

    const transcript = buildTimestampedTranscript(segments);
    const languageInstruction = getOutputLanguageInstruction(targetLanguage, lang);
    const prompt = `You are turning a YouTube transcript into a structured article.

Create 4 to 7 sections in chronological order.
Each section must include:
- "topicTitle": a short topic title
- "description": 2 to 4 sentences explaining the section clearly
- "startTimestamp": exact transcript timestamp in HH:MM:SS
- "endTimestamp": exact transcript timestamp in HH:MM:SS and not earlier than the start

${languageInstruction}

IMPORTANT:
- Use only timestamps that already appear in the transcript.
- Keep sections sorted by time with no overlaps.
- Output ONLY JSON with this shape:
{"article":[{"topicTitle":"...","description":"...","startTimestamp":"00:00:00","endTimestamp":"00:00:00"}]}

Transcript:
${transcript}`;

    const parsed = await requestGeminiJson<{
      article?: Array<{
        topicTitle?: string;
        description?: string;
        startTimestamp?: string | number;
        endTimestamp?: string | number;
      }>;
    }>(prompt, getArticleResponseSchema(), { maxOutputTokens: 30000 });
    const article = normalizeArticleSections(parsed.article ?? []);
    if (article.length === 0) {
      throw new Error('The generated article was empty.');
    }

    const result = { article };
    await chrome.storage.local.set({ [cacheKey]: result });
    return result;
  });

  onMessage('chatWithAi', async ({ data }) => {
    const { messages, transcriptText, lang, targetLanguage, customPrompt } = data;
    const languageInstruction = getOutputLanguageInstruction(targetLanguage, lang);
    const customSection = customPrompt?.trim()
      ? `\n\nAdditional user instructions:\n${customPrompt.trim()}`
      : '';

    const contents = [
      {
        role: 'user' as const,
        parts: [{
          text: `You are a helpful assistant that answers questions about a YouTube video based on its transcript.
${languageInstruction}

Here is the transcript:
---
${transcriptText}
---

Answer questions based on this transcript. Be concise and helpful. If the answer is not in the transcript, say so.${customSection}`,
        }],
      },
      {
        role: 'model' as const,
        parts: [{ text: 'Understood. I will answer questions about this video based on the transcript.' }],
      },
      ...messages.map((msg) => ({
        role: msg.role as 'user' | 'model',
        parts: [{ text: msg.text }],
      })),
    ];

    const proxyUrl = import.meta.env.WXT_PROXY_URL;
    if (!proxyUrl) {
      throw new Error('WXT_PROXY_URL is not set in .env');
    }

    const endpoint = `${proxyUrl}/api/gemini`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      let detail = `${resp.status}`;
      try {
        const errJson = JSON.parse(errText) as { error?: { message?: string } };
        if (errJson.error?.message) {
          detail = errJson.error.message;
        }
      } catch {
        // use status code
      }
      throw new Error(`Gemini API: ${detail}`);
    }

    const apiResult = await resp.json() as Record<string, unknown>;
    const candidates = apiResult.candidates as Array<Record<string, unknown>> | undefined;
    if (!candidates?.length) {
      throw new Error('The AI response was empty.');
    }

    const content = candidates[0].content as Record<string, unknown> | undefined;
    const parts = content?.parts as Array<Record<string, unknown>> | undefined;
    const answer = parts
      ?.filter((part) => typeof part.text === 'string')
      .map((part) => part.text as string)
      .join('') ?? '';

    if (!answer.trim()) {
      throw new Error('The AI response was empty.');
    }

    return { answer: answer.trim() };
  });

  onMessage('suggestQuestions', async ({ data }) => {
    const { videoId, transcriptText, lang, targetLanguage } = data;
    const cacheKey = getSuggestionsCacheKey(videoId, targetLanguage);
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      return cached[cacheKey] as { questions: string[] };
    }

    const languageInstruction = getOutputLanguageInstruction(targetLanguage, lang);

    const prompt = `Given the following YouTube video transcript, suggest exactly 3 short questions a viewer would likely ask about the content.
Each question must be concise (under 40 characters for CJK languages, under 10 words for others).

${languageInstruction}

Output ONLY a JSON array of 3 strings:
["question 1","question 2","question 3"]

Transcript (first 5000 chars):
${transcriptText.slice(0, 5000)}`;

    const responseText = await requestGeminiText(prompt, {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string' },
    });
    const parsed = tryParseJson<string[]>(responseText);
    const result = { questions: Array.isArray(parsed) ? parsed.slice(0, 3) : [] };
    if (result.questions.length > 0) {
      await chrome.storage.local.set({ [cacheKey]: result });
    }
    return result;
  });

  onMessage('fetchTranscriptBg', async ({ data }) => {
    const { videoId } = data;

    const segments = await fetchWithFallbacks(videoId);

    if (segments.length === 0) {
      throw new Error('Could not retrieve subtitle data.');
    }
    return { segments };
  });

  onMessage('listSubtitleTracks', async ({ data }) => {
    const tracks = await listSubtitleTracks(data.videoId);
    return { tracks };
  });

  onMessage('fetchSubtitleTrack', async ({ data }) => {
    const segments = await fetchSubtitleTrack(data.videoId, data.track);
    if (segments.length === 0) {
      throw new Error('Could not retrieve subtitle data.');
    }
    return { segments };
  });
});

type Segment = { text: string; duration: number; offset: number; lang: string };
type AnyObj = Record<string, unknown>;

function buildTimestampedTranscript(segments: Segment[]): string {
  const lines = segments.map((segment) => `[${formatTimestamp(segment.offset)}] ${segment.text.trim()}`);
  const joined = lines.join('\n').slice(0, 120000);
  return joined;
}

function getTranscriptDuration(segments: Segment[]): number {
  return segments.reduce((max, segment) => Math.max(max, segment.offset + segment.duration), 0);
}

function getTimelineTargetCount(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 12;
  }

  const perTwoMinutes = Math.round(durationSeconds / 120);
  return Math.max(12, Math.min(36, perTwoMinutes));
}

async function generateTimelineItems(
  transcript: string,
  languageInstruction: string,
  targetCount: number,
): Promise<Array<{ timestamp: number; summary: string; importance: number }>> {
  const minimumCount = Math.max(10, Math.floor(targetCount * 0.8));
  const recommendedCount = Math.max(minimumCount, targetCount);
  const prompt = `You are building a study timeline from a YouTube transcript.

Create enough timeline items for a reader to understand the full flow of the video from start to finish.
Aim for about ${recommendedCount} items.
Do not over-compress the video into just a few major peaks.
Cover the intro, concept changes, examples, transitions, and conclusion.

Each item must include:
- "timestamp": exact timestamp copied from the transcript in HH:MM:SS
- "summary": one concise sentence under 28 characters for Chinese, Japanese, or Korean, and under 12 words for other languages
- "importance": a number from 0 to 1

${languageInstruction}

IMPORTANT:
- Use only timestamps that already appear in the transcript.
- Keep the list strictly chronological.
- Provide at least ${minimumCount} items unless the transcript itself is unusually short.
- Output ONLY JSON with this shape:
{"timeline":[{"timestamp":"00:00:00","summary":"...","importance":0.82}]}

Transcript:
${transcript}`;

  const responseText = await requestGeminiText(
    prompt,
    getTimelineResponseSchema(minimumCount, recommendedCount + 6),
    { maxOutputTokens: 30000 },
  );

  const parsed = tryParseJson<{
    timeline?: Array<{ timestamp?: string | number; summary?: string; importance?: number }>;
  }>(responseText);

  if (parsed?.timeline) {
    return normalizeTimelineItems(parsed.timeline);
  }

  return extractTimelineItemsFromText(responseText);
}

async function requestGeminiJson<T>(
  prompt: string,
  responseJsonSchema?: AnyObj,
  options?: { maxOutputTokens?: number },
): Promise<T> {
  const responseText = await requestGeminiText(prompt, responseJsonSchema, options);
  const parsed = tryParseJson<T>(responseText);
  if (parsed !== null) {
    return parsed;
  }

  throw new Error('Failed to parse the AI JSON response.');
}

async function requestGeminiText(
  prompt: string,
  responseJsonSchema?: AnyObj,
  options?: { maxOutputTokens?: number },
): Promise<string> {
  const proxyUrl = import.meta.env.WXT_PROXY_URL;
  if (!proxyUrl) {
    throw new Error('WXT_PROXY_URL is not set in .env');
  }

  const endpoint = `${proxyUrl}/api/gemini`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: options?.maxOutputTokens ?? 4096,
        ...(responseJsonSchema
          ? { responseMimeType: 'application/json', responseJsonSchema }
          : { responseMimeType: 'text/plain' }),
      },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    let detail = `${resp.status}`;
    try {
      const errJson = JSON.parse(errText) as { error?: { message?: string } };
      if (errJson.error?.message) {
        detail = errJson.error.message;
      }
    } catch {
      // use status code
    }
    throw new Error(`Gemini API: ${detail}`);
  }

  const apiResult = await resp.json() as Record<string, unknown>;
  const candidates = apiResult.candidates as Array<Record<string, unknown>> | undefined;
  if (!candidates?.length) {
    throw new Error('The AI response was empty.');
  }

  const candidate = candidates[0];
  const finishReason = candidate.finishReason as string | undefined;
  const content = candidate.content as Record<string, unknown> | undefined;
  const parts = content?.parts as Array<Record<string, unknown>> | undefined;
  const responseText = parts
    ?.filter((part) => typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('') ?? '';

  if (!responseText.trim()) {
    throw new Error(`The AI response text was empty (${finishReason || 'unknown'})`);
  }

  return responseText;
}

function tryParseJson<T>(raw: string): T | null {
  const candidate = extractJsonCandidate(raw);
  if (!candidate) {
    return null;
  }

  const attempts = [
    candidate,
    normalizeJsonText(candidate),
    repairJsonText(normalizeJsonText(candidate)),
  ];

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch {
      // try next normalization pass
    }
  }

  return null;
}

function extractJsonCandidate(raw: string): string | null {
  const stripped = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = stripped.search(/[\[{]/);
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  let started = false;

  for (let index = start; index < stripped.length; index += 1) {
    const char = stripped[index];

    if (!started && (char === '{' || char === '[')) {
      started = true;
      depth = 1;
      continue;
    }

    if (!started) {
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      depth += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        return stripped.slice(start, index + 1);
      }
    }
  }

  return stripped.slice(start);
}

function normalizeJsonText(raw: string): string {
  return raw
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(\}|\])\s*(\{|\[)/g, '$1,$2')
    .trim();
}

function repairJsonText(raw: string): string {
  const stringPattern = '"(?:\\\\.|[^"\\\\])*"';
  const valuePattern = `(?:${stringPattern}|true|false|null|-?\\d+(?:\\.\\d+)?(?:[eE][+\\-]?\\d+)?)`;

  return raw
    .replace(new RegExp(`(${valuePattern})\\s*(?=${stringPattern}\\s*:)`, 'g'), '$1, ')
    .replace(new RegExp(`(${valuePattern})\\s*(?=${valuePattern}|\\{|\\[)`, 'g'), '$1, ')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/(\}|\])\s*(\{|\[)/g, '$1,$2')
    .trim();
}

function getTimelineResponseSchema(minItems: number, maxItems: number): AnyObj {
  return {
    type: 'object',
    properties: {
      timeline: {
        type: 'array',
        minItems,
        maxItems,
        items: {
          type: 'object',
          properties: {
            timestamp: { type: 'string' },
            summary: { type: 'string' },
            importance: { type: 'number' },
          },
          required: ['timestamp', 'summary', 'importance'],
        },
      },
    },
    required: ['timeline'],
  };
}

function getSummaryResponseSchema(): AnyObj {
  return {
    type: 'object',
    properties: {
      summary: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: { type: 'string' },
      },
      keywords: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: { type: 'string' },
      },
    },
    required: ['summary', 'keywords'],
  };
}

function extractTimelineItemsFromText(raw: string): Array<{ timestamp: number; summary: string; importance: number }> {
  const objectChunks = raw.match(/\{[^{}]*timestamp[^{}]*summary[^{}]*importance[^{}]*\}/gi) ?? [];
  const items = objectChunks
    .map((chunk) => {
      const timestampMatch = chunk.match(/"timestamp"\s*:\s*"([^"]+)"/i)
        ?? chunk.match(/timestamp\s*[:=]\s*"?(?<value>\d{1,2}:\d{2}:\d{2})"?/i);
      const summaryMatch = chunk.match(/"summary"\s*:\s*"([^"]+)"/i)
        ?? chunk.match(/summary\s*[:=]\s*"?(?<value>[^"\n\r]+)"?/i);
      const importanceMatch = chunk.match(/"importance"\s*:\s*([0-9.]+)/i)
        ?? chunk.match(/importance\s*[:=]\s*([0-9.]+)/i);

      const timestamp = timestampMatch?.[1] ?? timestampMatch?.groups?.value;
      const summary = summaryMatch?.[1] ?? summaryMatch?.groups?.value;
      const importance = importanceMatch?.[1];

      if (!timestamp || !summary) {
        return null;
      }

      return {
        timestamp,
        summary: summary.replace(/\\"/g, '"').trim(),
        importance: importance ? Number.parseFloat(importance) : 0.5,
      };
    })
    .filter((item): item is { timestamp: string; summary: string; importance: number } => item !== null);

  if (items.length > 0) {
    return normalizeTimelineItems(items);
  }

  const lineItems = raw
    .split('\n')
    .map((line) => {
      const match = line.match(/(\d{1,2}:\d{2}:\d{2}).*?(?:-|:)\s*(.+)$/);
      if (!match) {
        return null;
      }

      return {
        timestamp: match[1],
        summary: match[2].trim(),
        importance: 0.5,
      };
    })
    .filter((item): item is { timestamp: string; summary: string; importance: number } => item !== null);

  return normalizeTimelineItems(lineItems);
}

function getArticleResponseSchema(): AnyObj {
  return {
    type: 'object',
    properties: {
      article: {
        type: 'array',
        minItems: 3,
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            topicTitle: { type: 'string' },
            description: { type: 'string' },
            startTimestamp: { type: 'string' },
            endTimestamp: { type: 'string' },
          },
          required: ['topicTitle', 'description', 'startTimestamp', 'endTimestamp'],
        },
      },
    },
    required: ['article'],
  };
}


function normalizeTimelineItems(
  items: Array<{ timestamp?: string | number; summary?: string; importance?: number }>,
): Array<{ timestamp: number; summary: string; importance: number }> {
  return items
    .map((item) => {
      const timestamp = normalizeTimestampValue(item.timestamp);
      const summary = item.summary?.trim() ?? '';
      const importance = Number.isFinite(item.importance) ? Number(item.importance) : 0.5;
      if (timestamp === null || !summary) {
        return null;
      }
      return {
        timestamp,
        summary,
        importance: Math.max(0, Math.min(1, importance)),
      };
    })
    .filter((item): item is { timestamp: number; summary: string; importance: number } => item !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function normalizeArticleSections(
  sections: Array<{
    topicTitle?: string;
    description?: string;
    startTimestamp?: string | number;
    endTimestamp?: string | number;
  }>,
): Array<{ topicTitle: string; description: string; startTimestamp: number; endTimestamp: number }> {
  return sections
    .map((section) => {
      const startTimestamp = normalizeTimestampValue(section.startTimestamp);
      const endCandidate = normalizeTimestampValue(section.endTimestamp);
      const topicTitle = section.topicTitle?.trim() ?? '';
      const description = section.description?.trim() ?? '';

      if (startTimestamp === null || !topicTitle || !description) {
        return null;
      }

      return {
        topicTitle,
        description,
        startTimestamp,
        endTimestamp: Math.max(startTimestamp, endCandidate ?? startTimestamp),
      };
    })
    .filter((section): section is { topicTitle: string; description: string; startTimestamp: number; endTimestamp: number } => section !== null)
    .sort((a, b) => a.startTimestamp - b.startTimestamp);
}

function normalizeTimestampValue(value: string | number | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    return parseTimestamp(value);
  }

  return null;
}

async function fetchWithFallbacks(videoId: string): Promise<Segment[]> {
  // 먼저 YouTube 페이지 HTML 한 번만 가져오기
  const cookie = await getYouTubeCookieHeader();
  const html = await fetchYouTubePageHtml(videoId, cookie);

  if (!html) {
    // HTML 없이도 Invidious 시도
    return await strategy_invidious(videoId);
  }

  // 전략 1: captionTracks URL에서 자막 fetch
  try {
    const s1 = await strategy_captionTracks(html, videoId, cookie);
    if (s1.length > 0) {
      return s1;
    }
  } catch (e) {
  }

  // 전략 2: get_transcript API
  try {
    const s2 = await strategy_getTranscript(html, videoId, cookie);
    if (s2.length > 0) {
      return s2;
    }
  } catch (e) {
  }

  // 전략 3: Invidious 공개 API
  try {
    const s3 = await strategy_invidious(videoId);
    if (s3.length > 0) {
      return s3;
    }
  } catch (e) {
  }

  return [];
}

async function listSubtitleTracks(videoId: string): Promise<SubtitleTrackOption[]> {
  const pageTracks = await requestPageSubtitleTracks(videoId);
  if (pageTracks.length > 0) {
    return pageTracks;
  }

  const cookie = await getYouTubeCookieHeader();
  const html = await fetchYouTubePageHtml(videoId, cookie);
  const youtubeTracks = html ? extractSubtitleTracksFromHtml(html) : [];
  if (youtubeTracks.length > 0) {
    return youtubeTracks;
  }

  return await listInvidiousSubtitleTracks(videoId);
}

async function requestPageSubtitleTracks(videoId: string): Promise<SubtitleTrackOption[]> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      return [];
    }

    const result = await Promise.race([
      sendMessage('listPageSubtitleTracks', { videoId }, tab.id),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timed out while reading page subtitle tracks.')), 4000);
      }),
    ]);

    return result.tracks;
  } catch {
    return [];
  }
}

async function fetchSubtitleTrack(videoId: string, track: SubtitleTrackOption): Promise<Segment[]> {
  if (track.source === 'youtube') {
    const freshTrack = await refreshYoutubeSubtitleTrack(videoId, track);
    const pageSegments = await requestPageSubtitleTrack(videoId, freshTrack);
    if (pageSegments.length > 0) {
      return pageSegments;
    }

    const cookie = await getYouTubeCookieHeader();
    return await fetchSegmentsFromCaptionTrack(freshTrack, videoId, cookie);
  }

  if (track.source === 'invidious') {
    return await fetchInvidiousSubtitleTrack(track);
  }

  const cookie = await getYouTubeCookieHeader();
  return await fetchSegmentsFromCaptionTrack(track, videoId, cookie);
}

async function refreshYoutubeSubtitleTrack(videoId: string, requested: SubtitleTrackOption): Promise<SubtitleTrackOption> {
  const pageTracks = await requestPageSubtitleTracks(videoId);
  const matchedPageTrack = findMatchingSubtitleTrackOption(pageTracks, requested);
  if (matchedPageTrack) {
    return matchedPageTrack;
  }

  const cookie = await getYouTubeCookieHeader();
  const html = await fetchYouTubePageHtml(videoId, cookie);
  const htmlTracks = html ? extractSubtitleTracksFromHtml(html) : [];
  return findMatchingSubtitleTrackOption(htmlTracks, requested) ?? requested;
}

async function requestPageSubtitleTrack(videoId: string, track: SubtitleTrackOption): Promise<Segment[]> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      return [];
    }

    const result = await Promise.race([
      sendMessage('fetchPageSubtitleTrack', { videoId, track }, tab.id),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timed out while reading page subtitle track.')), 30000);
      }),
    ]);

    return result.segments.map((segment) => ({
      text: segment.text,
      duration: segment.duration,
      offset: segment.offset,
      lang: segment.lang,
    }));
  } catch (error) {
    return [];
  }
}

// ─── 쿠키 ────────────────────────────────────────────────────

async function getYouTubeCookieHeader(): Promise<string> {
  try {
    const cookies = await chrome.cookies.getAll({ domain: '.youtube.com' });
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  } catch { return ''; }
}

// ─── YouTube 페이지 fetch ────────────────────────────────────

async function fetchYouTubePageHtml(videoId: string, cookie: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    return html;
  } catch { return null; }
}

function extractSubtitleTracksFromHtml(html: string): SubtitleTrackOption[] {
  const playerResponse = extractJsonObject(html, 'ytInitialPlayerResponse');
  if (!playerResponse) {
    return [];
  }

  const captions = playerResponse.captions as AnyObj | undefined;
  const renderer = captions?.playerCaptionsTracklistRenderer as AnyObj | undefined;
  const captionTracks = renderer?.captionTracks as AnyObj[] | undefined;
  if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
    return [];
  }

  const tracks = captionTracks
    .map((track) => mapCaptionTrack(track))
    .filter((track): track is SubtitleTrackOption => track !== null);

  tracks.sort((a, b) => {
    if (a.isAutoGenerated !== b.isAutoGenerated) {
      return Number(a.isAutoGenerated) - Number(b.isAutoGenerated);
    }
    return a.label.localeCompare(b.label);
  });

  return dedupeSubtitleTracks(tracks);
}

function mapCaptionTrack(track: AnyObj): SubtitleTrackOption | null {
  const fetchUrl = typeof track.baseUrl === 'string' ? track.baseUrl : '';
  if (!fetchUrl) {
    return null;
  }

  const languageCode = typeof track.languageCode === 'string' ? track.languageCode : '';
  const isAutoGenerated = track.kind === 'asr';
  const label = readTextValue(track.name) || languageCode || 'Unknown';
  const vssId = typeof track.vssId === 'string' ? track.vssId : '';

  return {
    id: `youtube:${languageCode}:${isAutoGenerated ? 'auto' : 'manual'}:${vssId || fetchUrl}`,
    label,
    languageCode,
    isAutoGenerated,
    vssId,
    playerTrackData: undefined,
    fetchUrl,
    source: 'youtube',
  };
}

function dedupeSubtitleTracks(tracks: SubtitleTrackOption[]): SubtitleTrackOption[] {
  const seen = new Set<string>();
  const out: SubtitleTrackOption[] = [];

  for (const track of tracks) {
    const key = [
      track.source,
      track.languageCode.trim().toLowerCase(),
      track.isAutoGenerated ? 'auto' : 'manual',
      track.label.trim().replace(/\s+/g, ' ').toLowerCase(),
    ].join(':');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(track);
  }

  return out;
}

function findMatchingSubtitleTrackOption(
  tracks: SubtitleTrackOption[],
  requested: SubtitleTrackOption,
): SubtitleTrackOption | null {
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
    .filter((entry): entry is { track: SubtitleTrackOption; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.track ?? null;
}

function readTextValue(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return '';
  }

  const candidate = value as { simpleText?: unknown; runs?: Array<{ text?: unknown }> };
  if (typeof candidate.simpleText === 'string') {
    return candidate.simpleText.trim();
  }

  if (Array.isArray(candidate.runs)) {
    return candidate.runs
      .map((run) => (typeof run.text === 'string' ? run.text : ''))
      .join('')
      .trim();
  }

  return '';
}

// ─── 전략 1: captionTracks URL fetch ─────────────────────────

async function strategy_captionTracks(html: string, videoId: string, cookie: string): Promise<Segment[]> {
  const tracks = extractSubtitleTracksFromHtml(html);
  if (tracks.length === 0) {
    return [];
  }


  for (const track of tracks) {
    const segments = await fetchSegmentsFromCaptionTrack(track, videoId, cookie);
    if (segments.length > 0) {
      return segments;
    }
  }

  return [];
}

// ─── 전략 2: get_transcript API ──────────────────────────────

async function strategy_getTranscript(html: string, videoId: string, cookie: string): Promise<Segment[]> {
  // API key 추출
  const apiKey = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/)?.[1]
    || html.match(/innertubeApiKey['"]\s*:\s*['"]([^'"]+)/)?.[1];

  // params 추출 시도
  let params = html.match(/"getTranscriptEndpoint"\s*:\s*\{[^}]*?"params"\s*:\s*"([^"]+)"/)?.[1]
    || html.match(/"serializedShareEntity"\s*:\s*"([^"]+)"/)?.[1];

  // params가 없으면 videoId로 직접 생성
  if (!params) {
    params = generateTranscriptParams(videoId);
  }

  // context: 간단한 WEB 클라이언트 사용
  const clientVersion = html.match(/"clientVersion"\s*:\s*"([^"]+)"/)?.[1] || '2.20241201.00.00';

  const context = {
    client: {
      clientName: 'WEB',
      clientVersion,
      hl: 'en',
    },
  };

  const keyParam = apiKey ? `&key=${apiKey}` : '';


  const resp = await fetch(
    `https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false${keyParam}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        'Origin': 'https://www.youtube.com',
        'Referer': `https://www.youtube.com/watch?v=${videoId}`,
      },
      body: JSON.stringify({ context, params }),
    },
  );

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    return [];
  }

  const data = await resp.json() as AnyObj;
  return parseGetTranscriptResponse(data);
}

// videoId를 protobuf 인코딩하여 get_transcript params 생성
function generateTranscriptParams(videoId: string): string {
  const encoder = new TextEncoder();
  const vidBytes = encoder.encode(videoId);

  // 내부 메시지: field1=videoId, field3=empty
  const inner: number[] = [
    0x0a, vidBytes.length, ...vidBytes,  // field 1: video ID
    0x1a, 0x00,                           // field 3: empty string
  ];

  // 외부 메시지: field1=videoId, field2=inner
  const outer: number[] = [
    0x0a, vidBytes.length, ...vidBytes,   // field 1: video ID
    0x12, inner.length, ...inner,         // field 2: inner message
  ];

  return btoa(String.fromCharCode(...outer));
}

// ─── 전략 3: Invidious API ───────────────────────────────────

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://vid.puffyan.us',
  'https://invidious.nerdvpn.de',
  'https://iv.ggtyler.dev',
];

async function strategy_invidious(videoId: string): Promise<Segment[]> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {

      const listResp = await fetch(`${instance}/api/v1/captions/${videoId}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!listResp.ok) {
        continue;
      }

      const listData = await listResp.json() as { captions?: Array<{ label: string; languageCode: string; url: string }> };
      const captions = listData.captions;
      if (!Array.isArray(captions) || captions.length === 0) continue;


      for (const caption of captions) {
        // URL이 상대경로일 수 있음
        const captionUrl = caption.url.startsWith('http')
          ? caption.url
          : `${instance}${caption.url}`;


        const captionResp = await fetch(captionUrl, {
          signal: AbortSignal.timeout(8000),
        });
        if (!captionResp.ok) {
          continue;
        }

        const text = await captionResp.text();

        if (!text.trim()) continue;

        // VTT → XML → 파싱 시도
        let segments = parseVtt(text, caption.languageCode);
        if (segments.length > 0) return segments;

        segments = parseXml(text, caption.languageCode);
        if (segments.length > 0) return segments;
      }
    } catch (e) {
    }
  }
  return [];
}

async function listInvidiousSubtitleTracks(videoId: string): Promise<SubtitleTrackOption[]> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const listResp = await fetch(`${instance}/api/v1/captions/${videoId}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!listResp.ok) {
        continue;
      }

      const listData = await listResp.json() as { captions?: Array<{ label?: string; languageCode?: string; url?: string }> };
      if (!Array.isArray(listData.captions) || listData.captions.length === 0) {
        continue;
      }

      return dedupeSubtitleTracks(
        listData.captions
          .map((caption) => {
            const fetchUrl = typeof caption.url === 'string'
              ? (caption.url.startsWith('http') ? caption.url : `${instance}${caption.url}`)
              : '';
            if (!fetchUrl) {
              return null;
            }

            const label = caption.label?.trim() || caption.languageCode?.trim() || 'Unknown';
            const languageCode = caption.languageCode?.trim() || '';
            const isAutoGenerated = /auto/i.test(label);

            return {
              id: `invidious:${languageCode}:${isAutoGenerated ? 'auto' : 'manual'}:${fetchUrl}`,
              label,
              languageCode,
              isAutoGenerated,
              vssId: '',
              playerTrackData: undefined,
              fetchUrl,
              source: 'invidious' as const,
            };
          })
          .filter((track): track is SubtitleTrackOption => track !== null),
      );
    } catch {
      // try next instance
    }
  }

  return [];
}

async function fetchInvidiousSubtitleTrack(track: SubtitleTrackOption): Promise<Segment[]> {
  try {
    const resp = await fetch(track.fetchUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      return [];
    }

    const text = await resp.text();
    if (!text.trim()) {
      return [];
    }

    const vttSegments = parseVtt(text, track.languageCode);
    if (vttSegments.length > 0) {
      return vttSegments;
    }

    return parseXml(text, track.languageCode);
  } catch {
    return [];
  }
}

async function fetchSegmentsFromCaptionTrack(
  track: SubtitleTrackOption,
  videoId: string,
  cookie: string,
): Promise<Segment[]> {
  for (const url of makeCaptionUrlCandidates(track.fetchUrl)) {
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          'Referer': `https://www.youtube.com/watch?v=${videoId}`,
          'Origin': 'https://www.youtube.com',
        },
      });

      if (!resp.ok) {
        continue;
      }

      const text = await resp.text();
      if (!text.trim()) {
        continue;
      }

      const segments = parseCaptionResponse(text, url, track.languageCode);
      if (segments.length > 0) {
        return segments;
      }
    } catch {
      // try next format
    }
  }

  return [];
}

function makeCaptionUrlCandidates(baseUrl: string): string[] {
  const urls = new Set<string>();
  urls.add(baseUrl);

  try {
    const url = new URL(baseUrl);
    if (!url.searchParams.get('fmt')) {
      for (const format of ['json3', 'srv3', 'vtt']) {
        const candidate = new URL(url.toString());
        candidate.searchParams.set('fmt', format);
        urls.add(candidate.toString());
      }
    }
  } catch {
    if (!baseUrl.includes('fmt=')) {
      urls.add(`${baseUrl}&fmt=json3`);
      urls.add(`${baseUrl}&fmt=srv3`);
      urls.add(`${baseUrl}&fmt=vtt`);
    }
  }

  return Array.from(urls);
}

function parseCaptionResponse(text: string, url: string, lang: string): Segment[] {
  if (url.includes('fmt=json3')) {
    try {
      const jsonSegments = parseJson3(JSON.parse(text) as AnyObj, lang);
      if (jsonSegments.length > 0) {
        return jsonSegments;
      }
    } catch {
      // fall through
    }
  }

  const xmlSegments = parseXml(text, lang);
  if (xmlSegments.length > 0) {
    return xmlSegments;
  }

  return parseVtt(text, lang);
}

// ─── HTML 파싱: bracket matching ─────────────────────────────

function extractJsonObject(html: string, varName: string): AnyObj | null {
  // "varName = {..." 또는 "varName={..." 패턴 찾기
  const patterns = [
    new RegExp(`${varName}\\s*=\\s*\\{`),
    new RegExp(`"${varName}"\\s*:\\s*\\{`),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (!match) continue;

    // { 시작 위치 찾기
    const braceStart = html.indexOf('{', match.index + varName.length);
    if (braceStart === -1) continue;

    // 중괄호 매칭
    let depth = 0;
    let inString = false;
    let escape = false;
    let end = braceStart;

    for (let i = braceStart; i < html.length && i < braceStart + 5000000; i++) {
      const ch = html[i];

      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }

      if (ch === '"' && !escape) {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { end = i + 1; break; }
      }
    }

    if (depth !== 0) continue;

    try {
      const json = html.slice(braceStart, end);
      return JSON.parse(json) as AnyObj;
    } catch (e) {
    }
  }
  return null;
}

// ─── 파서 ────────────────────────────────────────────────────

function parseJson3(data: AnyObj, lang: string): Segment[] {
  const events = data.events as AnyObj[] | undefined;
  if (!Array.isArray(events)) return [];

  const segments: Segment[] = [];
  for (const ev of events) {
    const segs = ev.segs as AnyObj[] | undefined;
    if (!Array.isArray(segs)) continue;
    const text = segs.map(s => (s.utf8 as string) || '').join('').trim();
    if (!text || text === '\n') continue;
    const tStartMs = Number(ev.tStartMs);
    const dDurationMs = Number(ev.dDurationMs);
    if (!Number.isFinite(tStartMs)) continue;
    segments.push({
      text,
      offset: tStartMs / 1000,
      duration: Number.isFinite(dDurationMs) ? dDurationMs / 1000 : 0,
      lang,
    });
  }
  return normalize(segments);
}

function parseXml(xml: string, lang: string): Segment[] {
  const segments: Segment[] = [];
  const re = /<text\s+start="([^"]*)"(?:\s+dur="([^"]*)")?[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const start = parseFloat(m[1]);
    const dur = parseFloat(m[2] || '0');
    const text = decodeEntities(m[3]).trim();
    if (!text) continue;
    segments.push({ text, offset: start, duration: dur, lang });
  }
  return normalize(segments);
}

function parseVtt(vtt: string, lang: string): Segment[] {
  const segments: Segment[] = [];
  const blocks = vtt.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const timeLine = lines.find(l => l.includes('-->'));
    if (!timeLine) continue;

    const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());
    const start = parseVttTime(startStr);
    const end = parseVttTime(endStr);
    const textLines = lines.slice(lines.indexOf(timeLine) + 1);
    const text = textLines.join(' ').replace(/<[^>]+>/g, '').trim();
    if (!text) continue;

    segments.push({ text, offset: start, duration: end > start ? end - start : 0, lang });
  }
  return normalize(segments);
}

function parseVttTime(s: string): number {
  const parts = s.split(':');
  if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  return parseFloat(s) || 0;
}

function parseGetTranscriptResponse(data: AnyObj): Segment[] {
  try {
    const actions = data.actions;
    if (!Array.isArray(actions)) return [];
    const segs = actions[0]?.updateEngagementPanelAction?.content?.transcriptRenderer?.content
      ?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments;
    if (!Array.isArray(segs)) return [];
    const out: Segment[] = [];
    for (const item of segs) {
      const r = item?.transcriptSegmentRenderer;
      if (!r) continue;
      const runs = r.snippet?.runs;
      const text = Array.isArray(runs) ? runs.map((x: AnyObj) => x.text ?? '').join('').trim() : '';
      const startMs = Number(r.startMs);
      const endMs = Number(r.endMs);
      if (!text || !Number.isFinite(startMs)) continue;
      out.push({
        text, offset: startMs / 1000,
        duration: Number.isFinite(endMs) && endMs >= startMs ? (endMs - startMs) / 1000 : 0,
        lang: '',
      });
    }
    return normalize(out);
  } catch { return []; }
}

// ─── 유틸리티 ────────────────────────────────────────────────

function normalize(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  const seen = new Set<string>();
  for (const seg of segments) {
    const text = seg.text.trim();
    if (!text) continue;
    const offset = Number.isFinite(seg.offset) ? seg.offset : 0;
    const duration = Number.isFinite(seg.duration) && seg.duration >= 0 ? seg.duration : 0;
    const key = `${Math.round(offset * 100)}|${text.replace(/\s+/g, ' ')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text, offset, duration, lang: seg.lang });
  }
  out.sort((a, b) => a.offset - b.offset);
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].duration > 0) continue;
    const gap = out[i + 1].offset - out[i].offset;
    if (gap > 0) out[i].duration = gap;
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, '');
}
