/**
 * Utility functions for timeline, timecode, frames, millisecond zoom intervals, and pixel math
 */

export function secondsToTimecode(totalSeconds: number, fps: number = 30): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  const frames = Math.floor((safeSeconds - Math.floor(safeSeconds)) * fps);

  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

export function secondsToMsTimecode(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const mins = Math.floor(safeSeconds / 60);
  const secs = Math.floor(safeSeconds % 60);
  const ms = Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000) % 1000;
  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const pad3 = (n: number) => n.toString().padStart(3, '0');
  return `${pad2(mins)}:${pad2(secs)}.${pad3(ms)}`;
}

export function secondsToDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}`;
}

export interface RulerIntervals {
  majorStep: number;
  minorStep: number;
  showMs: boolean;
}

export function getRulerIntervals(zoomLevel: number): RulerIntervals {
  if (zoomLevel < 0.45) {
    return { majorStep: 10, minorStep: 2, showMs: false };
  }
  if (zoomLevel < 1.1) {
    return { majorStep: 3, minorStep: 1, showMs: false };
  }
  if (zoomLevel < 2.2) {
    return { majorStep: 1, minorStep: 0.2, showMs: true };
  }
  if (zoomLevel < 4.5) {
    return { majorStep: 0.5, minorStep: 0.1, showMs: true };
  }
  if (zoomLevel < 8.0) {
    return { majorStep: 0.2, minorStep: 0.05, showMs: true };
  }
  return { majorStep: 0.1, minorStep: 0.02, showMs: true };
}

export function formatRulerTime(seconds: number, showMs: boolean = false): string {
  const roundedMs = Math.round(seconds * 1000);
  if (roundedMs === 0) return showMs ? '0ms' : '0s';

  const wholeSec = Math.floor(roundedMs / 1000);
  const remMs = roundedMs % 1000;

  if (showMs) {
    if (wholeSec === 0) return `${remMs}ms`;
    if (remMs === 0) {
      if (wholeSec < 60) return `${wholeSec}s`;
      const m = Math.floor(wholeSec / 60);
      const s = wholeSec % 60;
      return s === 0 ? `${m}m` : `${m}:${s.toString().padStart(2, '0')}`;
    }
    return `${wholeSec}s ${remMs}ms`;
  }

  if (wholeSec < 60) return `${wholeSec}s`;
  const mins = Math.floor(wholeSec / 60);
  const remSec = wholeSec % 60;
  return remSec === 0 ? `${mins}m` : `${mins}:${remSec.toString().padStart(2, '0')}`;
}

export function timeToPixels(seconds: number, zoomLevel: number = 1.0): number {
  const pxPerSec = 55 * Math.max(0.2, zoomLevel);
  return seconds * pxPerSec;
}

export function pixelsToTime(pixels: number, zoomLevel: number = 1.0): number {
  const pxPerSec = 55 * Math.max(0.2, zoomLevel);
  return pixels / pxPerSec;
}

export function snapTime(
  candidateTime: number,
  snapPoints: number[],
  thresholdSeconds: number = 0.2
): number {
  let closest = candidateTime;
  let minDiff = thresholdSeconds;

  for (const point of snapPoints) {
    const diff = Math.abs(candidateTime - point);
    if (diff < minDiff) {
      minDiff = diff;
      closest = point;
    }
  }

  return closest;
}
