import { create } from 'zustand';
import type { SubtitleSegment, SubtitleTrackOption } from '../types';

interface SubtitleState {
  videoId: string;
  videoTitle: string;
  sourceSegments: SubtitleSegment[];
  subtitleTracks: SubtitleTrackOption[];
  segments: SubtitleSegment[];
  currentTime: number;
  isLoading: boolean;
  error: string | null;

  setVideo: (videoId: string, title: string) => void;
  setSourceSegments: (segments: SubtitleSegment[]) => void;
  setSubtitleTracks: (tracks: SubtitleTrackOption[]) => void;
  setSegments: (segments: SubtitleSegment[]) => void;
  setCurrentTime: (time: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useSubtitleStore = create<SubtitleState>((set) => ({
  videoId: '',
  videoTitle: '',
  sourceSegments: [],
  subtitleTracks: [],
  segments: [],
  currentTime: 0,
  isLoading: false,
  error: null,

  setVideo: (videoId, title) => set({ videoId, videoTitle: title, sourceSegments: [], subtitleTracks: [], segments: [], error: null }),
  setSourceSegments: (sourceSegments) => set({ sourceSegments }),
  setSubtitleTracks: (subtitleTracks) => set({ subtitleTracks }),
  setSegments: (segments) => set({ segments, isLoading: false, error: null }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  reset: () => set({ videoId: '', videoTitle: '', sourceSegments: [], subtitleTracks: [], segments: [], currentTime: 0, isLoading: false, error: null }),
}));
