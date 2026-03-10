import type { OutputLanguageCode } from './output-language';

export function getSummaryCacheKey(videoId: string, targetLanguage: OutputLanguageCode): string {
  return `summary_v2_${videoId}_${targetLanguage}`;
}

export function getTimelineCacheKey(videoId: string, targetLanguage: OutputLanguageCode): string {
  return `timeline_v6_${videoId}_${targetLanguage}`;
}

export function getArticleCacheKey(videoId: string, targetLanguage: OutputLanguageCode): string {
  return `article_v3_${videoId}_${targetLanguage}`;
}

export function getDetailedSummaryCacheKey(videoId: string, targetLanguage: OutputLanguageCode): string {
  return `detailed_summary_v2_${videoId}_${targetLanguage}`;
}

export function getSuggestionsCacheKey(videoId: string, targetLanguage: OutputLanguageCode): string {
  return `suggestions_v1_${videoId}_${targetLanguage}`;
}

export function getTranscriptTranslationCacheKey(
  videoId: string,
  targetLanguage: OutputLanguageCode,
  segmentCount: number,
): string {
  return `transcript_translation_v1_${videoId}_${targetLanguage}_${segmentCount}`;
}
