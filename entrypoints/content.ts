import { onMessage } from '@/lib/messaging';
import {
  clearSubtitleCaches,
  fetchYoutubeSubtitleTrack,
  fetchYoutubeSubtitleTracks,
  fetchYoutubeTranscript,
  translateViaYoutube,
} from '@/lib/youtube-transcript';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  runAt: 'document_idle',

  main() {
    // 자막 추출 - MAIN world inject 방식 (overlay에서도 사용 가능)
    onMessage('fetchTranscript', async ({ data }) => {
      const { videoId, lang } = data;
      const [segments, tracks] = await Promise.all([
        fetchYoutubeTranscript('', '', videoId, lang),
        fetchYoutubeSubtitleTracks(videoId).catch(() => []),
      ]);
      return {
        segments: segments.map((seg) => ({
          text: seg.text,
          duration: seg.duration,
          offset: seg.offset,
          lang: seg.lang,
        })),
        tracks,
      };
    });

    onMessage('translateViaYoutube', async ({ data }) => {
      const inputSegments = Array.isArray(data.segments)
        ? data.segments.map((segment) => ({
          text: segment.text,
          duration: segment.duration,
          offset: segment.offset,
          lang: segment.lang,
        }))
        : [];

      const segments = await translateViaYoutube(data.targetLanguage, data.videoId, inputSegments);
      return {
        segments: segments.map((seg) => ({
          text: seg.text,
          duration: seg.duration,
          offset: seg.offset,
          lang: seg.lang,
        })),
      };
    });

    onMessage('clearSubtitleCaches', async ({ data }) => {
      const cleared = await clearSubtitleCaches(data.videoId);
      return { cleared };
    });

    onMessage('listPageSubtitleTracks', async ({ data }) => {
      const tracks = await fetchYoutubeSubtitleTracks(data.videoId);
      return { tracks };
    });

    onMessage('fetchPageSubtitleTrack', async ({ data }) => {
      const segments = await fetchYoutubeSubtitleTrack(data.videoId, data.track);
      return {
        segments: segments.map((seg) => ({
          text: seg.text,
          duration: seg.duration,
          offset: seg.offset,
          lang: seg.lang,
        })),
      };
    });
  },
});
