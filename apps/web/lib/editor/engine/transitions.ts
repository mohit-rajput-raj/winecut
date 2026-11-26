import { TimelineClip, Track, TransitionEdge, TransitionType } from '../types';

export interface AdjacentSeam {
  key: string;
  trackId: string;
  fromClip: TimelineClip;
  toClip: TimelineClip;
  seamTime: number;
  existingTransition?: TransitionEdge;
}

/**
 * Finds contiguous clip boundaries (within 0.08s gap/overlap) on any track where a '+' transition button can attach.
 */
export function findAdjacentClipSeams(
  track: Track,
  transitions: TransitionEdge[] = [],
): AdjacentSeam[] {
  if (track.type !== 'video') return [];
  const sorted = [...track.clips]
    .filter((c) => c.type === 'video' || c.type === 'image')
    .sort((a, b) => a.timelineStart - b.timelineStart);

  const seams: AdjacentSeam[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const fromClip = sorted[i]!;
    const toClip = sorted[i + 1]!;
    const fromEnd = fromClip.timelineStart + fromClip.duration;
    const gap = toClip.timelineStart - fromEnd;
    if (Math.abs(gap) <= 0.08) {
      const existingTransition = transitions.find(
        (t) =>
          t.trackId === track.id &&
          t.fromClipId === fromClip.id &&
          t.toClipId === toClip.id,
      );
      seams.push({
        key: `${fromClip.id}__${toClip.id}`,
        trackId: track.id,
        fromClip,
        toClip,
        seamTime: fromEnd + gap * 0.5,
        existingTransition,
      });
    }
  }
  return seams;
}

export interface ActiveTransitionState {
  edge: TransitionEdge;
  fromClip: TimelineClip;
  toClip: TimelineClip;
  progress: number; // 0..1 across transition span
  seamTime: number;
}

/**
 * Evaluates whether `currentTime` is currently inside a transition span centered around a clip seam.
 */
export function findActiveTransitionAtTime(
  track: Track,
  transitions: TransitionEdge[] = [],
  currentTime: number,
): ActiveTransitionState | null {
  const seams = findAdjacentClipSeams(track, transitions);
  for (const seam of seams) {
    if (!seam.existingTransition) continue;
    const dur = Math.max(0.1, Math.min(2.0, seam.existingTransition.duration));
    const half = dur / 2;
    const t0 = seam.seamTime - half;
    const t1 = seam.seamTime + half;
    if (currentTime >= t0 && currentTime <= t1) {
      const progress = Math.max(0, Math.min(1, (currentTime - t0) / dur));
      return {
        edge: seam.existingTransition,
        fromClip: seam.fromClip,
        toClip: seam.toClip,
        progress,
        seamTime: seam.seamTime,
      };
    }
  }
  return null;
}

export function getTransitionVisualPair(
  type: TransitionType,
  p: number,
  stageW: number,
  stageH: number,
): {
  outOpacity: number;
  inOpacity: number;
  outDx: number;
  outDy: number;
  inDx: number;
  inDy: number;
  outScale: number;
  inScale: number;
  outBlur: number;
  inBlur: number;
  flashAlpha: number;
  inClipPath?: string;
} {
  const smooth = p * p * (3 - 2 * p);
  const base = {
    outOpacity: 1,
    inOpacity: 1,
    outDx: 0,
    outDy: 0,
    inDx: 0,
    inDy: 0,
    outScale: 1,
    inScale: 1,
    outBlur: 0,
    inBlur: 0,
    flashAlpha: 0,
    inClipPath: undefined as string | undefined,
  };

  switch (type) {
    case 'dissolve':
      return { ...base, outOpacity: 1 - smooth, inOpacity: smooth };
    case 'flash': {
      const peak = Math.sin(p * Math.PI);
      return {
        ...base,
        outOpacity: p < 0.5 ? 1 : 0,
        inOpacity: p >= 0.5 ? 1 : 0,
        flashAlpha: Math.pow(peak, 0.8),
      };
    }
    case 'slide-left':
      return { ...base, outDx: -smooth * stageW, inDx: (1 - smooth) * stageW };
    case 'slide-right':
      return { ...base, outDx: smooth * stageW, inDx: -(1 - smooth) * stageW };
    case 'slide-up':
      return { ...base, outDy: -smooth * stageH, inDy: (1 - smooth) * stageH };
    case 'slide-down':
      return { ...base, outDy: smooth * stageH, inDy: -(1 - smooth) * stageH };
    case 'whip-blur':
      return {
        ...base,
        outDx: -smooth * stageW * 0.75,
        inDx: (1 - smooth) * stageW * 0.75,
        outOpacity: 1 - smooth,
        inOpacity: smooth,
        outBlur: Math.sin(p * Math.PI) * 14,
        inBlur: Math.sin(p * Math.PI) * 14,
      };
    case 'zoom-in':
      return {
        ...base,
        outScale: 1 + smooth * 0.6,
        outOpacity: 1 - smooth,
        inScale: 0.65 + smooth * 0.35,
        inOpacity: smooth,
      };
    case 'zoom-out':
      return {
        ...base,
        outScale: 1 - smooth * 0.45,
        outOpacity: 1 - smooth,
        inScale: 1.45 - smooth * 0.45,
        inOpacity: smooth,
      };
    case 'wipe-left': {
      const pct = Math.round((1 - smooth) * 100);
      return { ...base, inClipPath: `inset(0 0 0 ${pct}%)` };
    }
    case 'wipe-right': {
      const pct = Math.round((1 - smooth) * 100);
      return { ...base, inClipPath: `inset(0 ${pct}% 0 0)` };
    }
    case 'radial-wipe': {
      const rPct = Math.round(smooth * 125);
      return { ...base, inClipPath: `circle(${rPct}% at 50% 50%)` };
    }
    case 'glitch': {
      const jitter = Math.sin(p * 42) * 18;
      return {
        ...base,
        outDx: jitter,
        inDx: -jitter * 0.5,
        outOpacity: p < 0.5 ? 0.85 : 0.25 * (1 - p),
        inOpacity: p >= 0.45 ? 1 : 0.35,
      };
    }
    default:
      return { ...base, outOpacity: 1 - smooth, inOpacity: smooth };
  }
}
