import { defineExtensionMessaging } from '@webext-core/messaging';
import type { ArticleSection, SubtitleTrackOption, TimelineItem } from './types';
import type { OutputLanguageCode } from './output-language';

type TranscriptSegmentMsg = {
  text: string;
  duration: number;
  offset: number;
  lang: string;
};

interface ProtocolMap {
  videoChanged(data: { videoId: string; title: string }): void;
  fetchTranscript(data: { videoId: string; lang?: string }): {
    segments: TranscriptSegmentMsg[];
    tracks?: SubtitleTrackOption[];
  };
  fetchTranscriptBg(data: { videoId: string }): {
    segments: TranscriptSegmentMsg[];
  };
  listPageSubtitleTracks(data: { videoId: string }): {
    tracks: SubtitleTrackOption[];
  };
  fetchPageSubtitleTrack(data: { videoId: string; track: SubtitleTrackOption }): {
    segments: TranscriptSegmentMsg[];
  };
  listSubtitleTracks(data: { videoId: string }): {
    tracks: SubtitleTrackOption[];
  };
  fetchSubtitleTrack(data: { videoId: string; track: SubtitleTrackOption }): {
    segments: TranscriptSegmentMsg[];
  };
  togglePanel(): void;
  getCurrentTime(): { time: number };
  seekTo(data: { time: number }): void;
  translateViaYoutube(data: {
    targetLanguage: string;
    videoId?: string;
    segments?: TranscriptSegmentMsg[];
  }): {
    segments: TranscriptSegmentMsg[];
  };
  clearSubtitleCaches(data: {
    videoId?: string;
  }): {
    cleared: number;
  };
  generateTimeline(data: {
    videoId: string;
    segments: TranscriptSegmentMsg[];
    lang: string;
    targetLanguage: OutputLanguageCode;
  }): {
    timeline: TimelineItem[];
  };
  generateArticle(data: {
    videoId: string;
    segments: TranscriptSegmentMsg[];
    lang: string;
    targetLanguage: OutputLanguageCode;
  }): {
    article: ArticleSection[];
  };
  generateSummary(data: {
    videoId: string;
    text: string;
    lang: string;
    targetLanguage: OutputLanguageCode;
  }): {
    summary: string[];
    keywords: string[];
  };
  generateDetailedSummary(data: {
    videoId: string;
    text: string;
    lang: string;
    targetLanguage: OutputLanguageCode;
  }): {
    detailedSummary: string;
  };
  chatWithAi(data: {
    videoId: string;
    messages: Array<{ role: 'user' | 'model'; text: string }>;
    transcriptText: string;
    lang: string;
    targetLanguage: OutputLanguageCode;
    customPrompt?: string;
  }): {
    answer: string;
  };
  suggestQuestions(data: {
    videoId: string;
    transcriptText: string;
    lang: string;
    targetLanguage: OutputLanguageCode;
  }): {
    questions: string[];
  };
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
