/**
 * Content Script에서 MAIN world 스크립트와 통신하여 자막 추출
 */
import type { SubtitleTrackOption } from './types';
import { translateSegmentsWithGoogleCloud } from './google-translate';

export interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
  lang: string;
}

let mainWorldReady = false;
let mainWorldInjected = false;

function ensureMainWorldScript(): Promise<void> {
  if (mainWorldReady) return Promise.resolve();

  return new Promise((resolve) => {
    if (!mainWorldInjected) {
      mainWorldInjected = true;

      const readyHandler = (event: MessageEvent) => {
        if (event.data?.type === 'SUBTEXT_READY') {
          mainWorldReady = true;
          window.removeEventListener('message', readyHandler);
          resolve();
        }
      };
      window.addEventListener('message', readyHandler);

      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('/transcript-extractor.js');
      document.documentElement.appendChild(script);
      script.remove();

      setTimeout(() => {
        mainWorldReady = true;
        resolve();
      }, 2000);
    } else {
      setTimeout(() => {
        mainWorldReady = true;
        resolve();
      }, 1000);
    }
  });
}

export async function fetchYoutubeTranscript(
  _pageHtml: string,
  _origin: string,
  videoId: string,
  _lang?: string,
): Promise<TranscriptSegment[]> {
  await ensureMainWorldScript();

  return new Promise((resolve, reject) => {
    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'SUBTEXT_TRANSCRIPT_RESULT') return;
      if (event.data.requestId !== requestId) return;

      window.removeEventListener('message', handler);

      if (event.data.error) {
        reject(new Error(event.data.error));
      } else if (event.data.segments?.length > 0) {
        resolve(event.data.segments);
      } else {
        reject(new Error('The subtitle data was empty.'));
      }
    };

    window.addEventListener('message', handler);

    window.postMessage({
      type: 'SUBTEXT_FETCH_TRANSCRIPT',
      videoId,
      requestId,
    }, '*');

    setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Subtitle extraction timed out.'));
    }, 15000);
  });
}

export async function translateViaYoutube(
  targetLanguage: string,
  videoId?: string,
  sourceSegments?: TranscriptSegment[],
): Promise<TranscriptSegment[]> {
  let baseSegments = Array.isArray(sourceSegments) ? sourceSegments : [];
  if (baseSegments.length === 0 && videoId) {
    baseSegments = await fetchYoutubeTranscript('', '', videoId);
  }
  if (baseSegments.length === 0) {
    throw new Error('No subtitle segments available for translation.');
  }

  const sourceLanguage = baseSegments[0]?.lang || undefined;
  return await translateSegmentsWithGoogleCloud(baseSegments, targetLanguage, sourceLanguage);
}

export async function clearSubtitleCaches(videoId?: string): Promise<number> {
  await ensureMainWorldScript();

  const removedStorageKeys = await clearStoredTranscriptTranslationCaches(videoId);
  const clearedMainWorldCache = await clearMainWorldTranscriptCache();

  return removedStorageKeys + (clearedMainWorldCache ? 1 : 0);
}

export async function fetchYoutubeSubtitleTracks(videoId: string): Promise<SubtitleTrackOption[]> {
  await ensureMainWorldScript();

  return new Promise((resolve, reject) => {
    const requestId = 'tracks_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'SUBTEXT_TRACKS_RESULT') return;
      if (event.data.requestId !== requestId) return;

      window.removeEventListener('message', handler);

      if (event.data.error) {
        reject(new Error(event.data.error));
      } else {
        resolve(Array.isArray(event.data.tracks) ? event.data.tracks as SubtitleTrackOption[] : []);
      }
    };

    window.addEventListener('message', handler);

    window.postMessage({
      type: 'SUBTEXT_LIST_TRACKS',
      videoId,
      requestId,
    }, '*');

    setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Subtitle track listing timed out.'));
    }, 5000);
  });
}

export async function fetchYoutubeSubtitleTrack(
  videoId: string,
  track: SubtitleTrackOption,
): Promise<TranscriptSegment[]> {
  await ensureMainWorldScript();

  return new Promise((resolve, reject) => {
    const requestId = 'track_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'SUBTEXT_TRACK_RESULT') return;
      if (event.data.requestId !== requestId) return;

      window.removeEventListener('message', handler);

      if (event.data.error) {
        reject(new Error(event.data.error));
      } else if (Array.isArray(event.data.segments) && event.data.segments.length > 0) {
        resolve(event.data.segments as TranscriptSegment[]);
      } else {
        reject(new Error('The subtitle data was empty.'));
      }
    };

    window.addEventListener('message', handler);

    window.postMessage({
      type: 'SUBTEXT_FETCH_TRACK',
      videoId,
      track,
      requestId,
    }, '*');

    setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Subtitle track download timed out.'));
    }, 30000);
  });
}

async function clearStoredTranscriptTranslationCaches(videoId?: string): Promise<number> {
  const allEntries = await chrome.storage.local.get(null);
  const prefix = videoId
    ? `transcript_translation_v1_${videoId}_`
    : 'transcript_translation_v1_';
  const keys = Object.keys(allEntries).filter((key) => key.startsWith(prefix));

  if (keys.length > 0) {
    await chrome.storage.local.remove(keys);
  }

  return keys.length;
}

async function clearMainWorldTranscriptCache(): Promise<boolean> {
  return new Promise((resolve) => {
    const requestId = 'clear_cache_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'SUBTEXT_CLEAR_TRANSCRIPT_CACHE_RESULT') return;
      if (event.data.requestId !== requestId) return;
      window.removeEventListener('message', handler);
      resolve(Boolean(event.data.cleared));
    };

    window.addEventListener('message', handler);

    window.postMessage({
      type: 'SUBTEXT_CLEAR_TRANSCRIPT_CACHE',
      requestId,
    }, '*');

    setTimeout(() => {
      window.removeEventListener('message', handler);
      resolve(false);
    }, 3000);
  });
}
