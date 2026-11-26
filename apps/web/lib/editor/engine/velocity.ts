import { SpeedCurveConfig, SpeedPoint, TimelineClip } from '../types';

export interface SpeedCurvePreset {
  id: string;
  label: string;
  description: string;
  points: SpeedPoint[];
}

export const SPEED_CURVE_PRESETS: SpeedCurvePreset[] = [
  {
    id: 'normal',
    label: 'Normal 1x',
    description: 'Constant 1.0x speed across the entire clip.',
    points: [
      { t: 0, speed: 1 },
      { t: 0.25, speed: 1 },
      { t: 0.5, speed: 1 },
      { t: 0.75, speed: 1 },
      { t: 1, speed: 1 },
    ],
  },
  {
    id: 'montage',
    label: 'Montage',
    description: 'Slow cinematic ease-in into fast mid burst and smooth settle.',
    points: [
      { t: 0, speed: 0.6 },
      { t: 0.22, speed: 2.8 },
      { t: 0.5, speed: 0.75 },
      { t: 0.78, speed: 3.2 },
      { t: 1, speed: 0.7 },
    ],
  },
  {
    id: 'hero',
    label: 'Hero',
    description: 'Fast whip entry into dramatic slow-motion hero moment.',
    points: [
      { t: 0, speed: 2.5 },
      { t: 0.28, speed: 3.4 },
      { t: 0.5, speed: 0.4 },
      { t: 0.75, speed: 2.8 },
      { t: 1, speed: 1.0 },
    ],
  },
  {
    id: 'bullet',
    label: 'Bullet Time',
    description: 'Ultra-slow mid impact flanked by fast lead-in and exit.',
    points: [
      { t: 0, speed: 3.0 },
      { t: 0.35, speed: 0.35 },
      { t: 0.65, speed: 0.35 },
      { t: 1, speed: 3.2 },
    ],
  },
  {
    id: 'flash-in',
    label: 'Flash In',
    description: 'Rapid arrival slowing down cleanly toward normal pace.',
    points: [
      { t: 0, speed: 4.5 },
      { t: 0.3, speed: 1.6 },
      { t: 0.65, speed: 1.0 },
      { t: 1, speed: 1.0 },
    ],
  },
  {
    id: 'flash-out',
    label: 'Flash Out',
    description: 'Normal start accelerating sharply into the cut.',
    points: [
      { t: 0, speed: 1.0 },
      { t: 0.4, speed: 1.0 },
      { t: 0.75, speed: 2.4 },
      { t: 1, speed: 4.8 },
    ],
  },
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function normalizeSpeedPoints(points: SpeedPoint[] | undefined): SpeedPoint[] {
  if (!points || points.length < 2) {
    return SPEED_CURVE_PRESETS[0]!.points.map((p) => ({ ...p }));
  }
  const sorted = [...points]
    .map((p) => ({
      t: clamp(p.t, 0, 1),
      speed: clamp(p.speed, 0.1, 8.0),
    }))
    .sort((a, b) => a.t - b.t);
  sorted[0]!.t = 0;
  sorted[sorted.length - 1]!.t = 1;
  return sorted;
}

/**
 * Smooth cosine-interpolated speed multiplier at normalized source progress u in [0, 1].
 */
export function evaluateSpeedAtNorm(curve: SpeedCurveConfig | undefined, u: number): number {
  if (!curve || !curve.points || curve.points.length < 2) return 1;
  const pts = normalizeSpeedPoints(curve.points);
  const clampedU = clamp(u, 0, 1);

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (clampedU <= b.t || i === pts.length - 2) {
      const span = Math.max(1e-5, b.t - a.t);
      const localT = clamp((clampedU - a.t) / span, 0, 1);
      // Smoothstep easing prevents harsh step discontinuities at control vertices
      const mu = localT * localT * (3 - 2 * localT);
      return a.speed + (b.speed - a.speed) * mu;
    }
  }
  return pts[pts.length - 1]!.speed;
}

export interface SpeedLookupTable {
  samples: number;
  timelineFractionAtSource: Float64Array;
  durationMultiplier: number;
}

/**
 * Integrates dt_timeline = ds_source / speed(s) over N steps so timeline duration,
 * playhead position, waveform stretch, and filmstrip frame timestamps stay mathematically locked.
 */
export function buildSpeedLookupTable(
  curve: SpeedCurveConfig | undefined,
  samples: number = 128,
): SpeedLookupTable {
  const cumulative = new Float64Array(samples + 1);
  if (!curve || !curve.points || curve.points.length < 2) {
    for (let i = 0; i <= samples; i++) cumulative[i] = i / samples;
    return { samples, timelineFractionAtSource: cumulative, durationMultiplier: 1 };
  }

  const du = 1 / samples;
  let totalIntegral = 0;
  cumulative[0] = 0;

  for (let i = 1; i <= samples; i++) {
    const u0 = (i - 1) * du;
    const u1 = i * du;
    const s0 = evaluateSpeedAtNorm(curve, u0);
    const s1 = evaluateSpeedAtNorm(curve, u1);
    const avgInvSpeed = 0.5 * (1 / s0 + 1 / s1);
    totalIntegral += du * avgInvSpeed;
    cumulative[i] = totalIntegral;
  }

  const safeTotal = Math.max(0.05, totalIntegral);
  for (let i = 0; i <= samples; i++) {
    cumulative[i] = cumulative[i]! / safeTotal;
  }

  return {
    samples,
    timelineFractionAtSource: cumulative,
    durationMultiplier: safeTotal,
  };
}

export function getCurveDurationMultiplier(curve: SpeedCurveConfig | undefined): number {
  return buildSpeedLookupTable(curve, 64).durationMultiplier;
}

export function getClipScalarSpeed(clip: TimelineClip): number {
  const eff = clip.effects?.find((e) => (e.type === 'speed' || e.id === 'speed') && e.enabled);
  return clamp(eff?.value ?? 1, 0.1, 8.0);
}

/**
 * Given elapsed timeline seconds inside a clip [0, clip.duration], returns the exact source offset
 * inside [0, sourceEnd - sourceStart] accounting for either speedCurve or scalar speed effect.
 */
export function mapTimelineToSourceOffset(clip: TimelineClip, timelineLocalSec: number): number {
  const sourceSpan = Math.max(0.02, (clip.sourceEnd ?? clip.duration) - (clip.sourceStart ?? 0));
  const clipDur = Math.max(0.02, clip.duration);
  const targetFrac = clamp(timelineLocalSec / clipDur, 0, 1);

  if (!clip.speedCurve || clip.speedCurve.points.length < 2) {
    return targetFrac * sourceSpan;
  }

  const lut = buildSpeedLookupTable(clip.speedCurve, 128);
  const arr = lut.timelineFractionAtSource;
  // Binary search inverse of monotonic cumulative timeline fraction
  let lo = 0;
  let hi = lut.samples;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if ((arr[mid] ?? 0) <= targetFrac) lo = mid;
    else hi = mid;
  }

  const f0 = arr[lo] ?? 0;
  const f1 = arr[hi] ?? 1;
  const segSpan = Math.max(1e-6, f1 - f0);
  const sub = clamp((targetFrac - f0) / segSpan, 0, 1);
  const sourceFrac = (lo + sub) / lut.samples;
  return clamp(sourceFrac * sourceSpan, 0, sourceSpan);
}

/**
 * Given timeline elapsed time inside a clip, returns instantaneous playbackRate multiplier.
 */
export function evaluateClipSpeedAtTime(clip: TimelineClip, timelineLocalSec: number): number {
  if (!clip.speedCurve || clip.speedCurve.points.length < 2) {
    return getClipScalarSpeed(clip);
  }
  const sourceSpan = Math.max(0.02, (clip.sourceEnd ?? clip.duration) - (clip.sourceStart ?? 0));
  const srcOffset = mapTimelineToSourceOffset(clip, timelineLocalSec);
  return evaluateSpeedAtNorm(clip.speedCurve, clamp(srcOffset / sourceSpan, 0, 1));
}
