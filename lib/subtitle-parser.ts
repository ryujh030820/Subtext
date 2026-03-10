import type { TranscriptResponse, SubtitleSegment } from './types';

export function normalizeTranscript(raw: TranscriptResponse[]): SubtitleSegment[] {
  return raw.map((item, index) => ({
    index,
    startTime: item.offset,
    endTime: item.offset + item.duration,
    text: item.text,
    lang: item.lang,
  }));
}

export function formatTimestamp(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = Math.floor(safeSeconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function parseTimestamp(value: string): number | null {
  const parts = value
    .trim()
    .split(':')
    .map((part) => Number.parseInt(part, 10));

  if (parts.some((part) => Number.isNaN(part) || part < 0)) {
    return null;
  }

  if (parts.length === 3) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }

  if (parts.length === 2) {
    return (parts[0] * 60) + parts[1];
  }

  if (parts.length === 1) {
    return parts[0];
  }

  return null;
}

export function toSRT(segments: SubtitleSegment[]): string {
  return segments
    .map((seg, i) => {
      const start = formatSRTTime(seg.startTime);
      const end = formatSRTTime(seg.endTime);
      return `${i + 1}\n${start} --> ${end}\n${seg.text}\n`;
    })
    .join('\n');
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

export function toTXT(segments: SubtitleSegment[], withTimestamp: boolean): string {
  if (withTimestamp) {
    return segments
      .map((seg) => `[${formatTimestamp(seg.startTime)}] ${seg.text}`)
      .join('\n');
  }
  return segments.map((seg) => seg.text).join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
