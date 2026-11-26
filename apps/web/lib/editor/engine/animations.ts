import { AnimationSlot, TimelineClip } from '../types';

export type AnimationDirection = 'in' | 'out' | 'middle';

export interface AnimationPresetDef {
  id: string;
  label: string;
  direction: AnimationDirection;
  defaultDuration: number;
}

export const ANIMATION_BUNDLES: AnimationPresetDef[] = [
  // IN animations
  { id: 'none', label: 'None', direction: 'in', defaultDuration: 0 },
  { id: 'fade-in', label: 'Fade In', direction: 'in', defaultDuration: 0.45 },
  { id: 'pop-in', label: 'Pop In', direction: 'in', defaultDuration: 0.4 },
  { id: 'slide-up', label: 'Slide Up', direction: 'in', defaultDuration: 0.45 },
  { id: 'slide-down', label: 'Slide Down', direction: 'in', defaultDuration: 0.45 },
  { id: 'slide-left', label: 'Slide Left', direction: 'in', defaultDuration: 0.45 },
  { id: 'slide-right', label: 'Slide Right', direction: 'in', defaultDuration: 0.45 },
  { id: 'zoom-in', label: 'Zoom In', direction: 'in', defaultDuration: 0.5 },
  { id: 'whip-zoom', label: 'Whip Zoom', direction: 'in', defaultDuration: 0.35 },
  { id: 'drop-bounce', label: 'Drop Bounce', direction: 'in', defaultDuration: 0.55 },
  { id: 'spin-in', label: 'Spin In', direction: 'in', defaultDuration: 0.5 },

  // OUT animations
  { id: 'fade-out', label: 'Fade Out', direction: 'out', defaultDuration: 0.45 },
  { id: 'shrink-out', label: 'Shrink Out', direction: 'out', defaultDuration: 0.4 },
  { id: 'slide-out-down', label: 'Slide Down', direction: 'out', defaultDuration: 0.45 },
  { id: 'slide-out-left', label: 'Slide Left', direction: 'out', defaultDuration: 0.45 },
  { id: 'slide-out-right', label: 'Slide Right', direction: 'out', defaultDuration: 0.45 },
  { id: 'zoom-out', label: 'Zoom Out', direction: 'out', defaultDuration: 0.45 },
  { id: 'spin-out', label: 'Spin Out', direction: 'out', defaultDuration: 0.45 },
  { id: 'whip-exit', label: 'Whip Exit', direction: 'out', defaultDuration: 0.35 },

  // MIDDLE / LOOP animations
  { id: 'pulse', label: 'Soft Pulse', direction: 'middle', defaultDuration: 1.2 },
  { id: 'float', label: 'Float Hover', direction: 'middle', defaultDuration: 1.8 },
  { id: 'pendulum', label: 'Pendulum Rock', direction: 'middle', defaultDuration: 1.4 },
  { id: 'heartbeat', label: 'Heartbeat', direction: 'middle', defaultDuration: 0.9 },
  { id: 'jitter-shake', label: 'Handheld Shake', direction: 'middle', defaultDuration: 0.4 },
  { id: 'slow-zoom', label: 'Ken Burns Push', direction: 'middle', defaultDuration: 3.0 },
];

export interface MotionDelta {
  dx: number; // px relative to base stage (~680x382 normalized)
  dy: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // degrees delta
  opacity: number; // multiplier 0..1
  blur: number; // extra px blur
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

function easeInCubic(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * c;
}

function easeOutBack(t: number): number {
  const c = clamp(t, 0, 1);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(c - 1, 3) + c1 * Math.pow(c - 1, 2);
}

function easeOutBounce(t: number): number {
  let x = clamp(t, 0, 1);
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) {
    x -= 1.5 / d1;
    return n1 * x * x + 0.75;
  }
  if (x < 2.5 / d1) {
    x -= 2.25 / d1;
    return n1 * x * x + 0.9375;
  }
  x -= 2.625 / d1;
  return n1 * x * x + 0.984375;
}

function applySlotDelta(
  slot: AnimationSlot | undefined,
  p: number, // normalized progress 0..1 inside phase
  delta: MotionDelta,
): void {
  if (!slot || !slot.presetId || slot.presetId === 'none') return;
  const intensity = clamp(slot.intensity ?? 1, 0.1, 2.0);
  const e = easeOutCubic(p);

  switch (slot.presetId) {
    case 'fade-in':
      delta.opacity *= e;
      break;
    case 'pop-in': {
      const s = 0.25 + 0.75 * easeOutBack(p);
      delta.scaleX *= s;
      delta.scaleY *= s;
      delta.opacity *= clamp(p * 3, 0, 1);
      break;
    }
    case 'slide-up':
      delta.dy += (1 - e) * 140 * intensity;
      delta.opacity *= clamp(p * 2.5, 0, 1);
      break;
    case 'slide-down':
      delta.dy -= (1 - e) * 140 * intensity;
      delta.opacity *= clamp(p * 2.5, 0, 1);
      break;
    case 'slide-left':
      delta.dx += (1 - e) * 180 * intensity;
      delta.opacity *= clamp(p * 2.5, 0, 1);
      break;
    case 'slide-right':
      delta.dx -= (1 - e) * 180 * intensity;
      delta.opacity *= clamp(p * 2.5, 0, 1);
      break;
    case 'zoom-in': {
      const s = 1 + (1 - e) * 0.45 * intensity;
      delta.scaleX *= s;
      delta.scaleY *= s;
      delta.opacity *= clamp(p * 2, 0, 1);
      break;
    }
    case 'whip-zoom': {
      const s = 0.2 + 0.8 * easeOutCubic(p);
      delta.scaleX *= s;
      delta.scaleY *= s;
      delta.blur += (1 - e) * 10 * intensity;
      delta.opacity *= clamp(p * 3, 0, 1);
      break;
    }
    case 'drop-bounce': {
      const b = easeOutBounce(p);
      delta.dy -= (1 - b) * 150 * intensity;
      delta.opacity *= clamp(p * 4, 0, 1);
      break;
    }
    case 'spin-in': {
      delta.rotation -= (1 - e) * 180 * intensity;
      const s = 0.35 + 0.65 * e;
      delta.scaleX *= s;
      delta.scaleY *= s;
      delta.opacity *= clamp(p * 2.5, 0, 1);
      break;
    }
    case 'fade-out':
      delta.opacity *= 1 - easeInCubic(p);
      break;
    case 'shrink-out': {
      const i = easeInCubic(p);
      const s = Math.max(0.05, 1 - i * 0.85 * intensity);
      delta.scaleX *= s;
      delta.scaleY *= s;
      delta.opacity *= 1 - i;
      break;
    }
    case 'slide-out-down': {
      const i = easeInCubic(p);
      delta.dy += i * 150 * intensity;
      delta.opacity *= 1 - i;
      break;
    }
    case 'slide-out-left': {
      const i = easeInCubic(p);
      delta.dx -= i * 190 * intensity;
      delta.opacity *= 1 - i;
      break;
    }
    case 'slide-out-right': {
      const i = easeInCubic(p);
      delta.dx += i * 190 * intensity;
      delta.opacity *= 1 - i;
      break;
    }
    case 'zoom-out': {
      const i = easeInCubic(p);
      const s = 1 + i * 0.5 * intensity;
      delta.scaleX *= s;
      delta.scaleY *= s;
      delta.opacity *= 1 - i;
      break;
    }
    case 'spin-out': {
      const i = easeInCubic(p);
      delta.rotation += i * 180 * intensity;
      const s = Math.max(0.05, 1 - i * 0.8);
      delta.scaleX *= s;
      delta.scaleY *= s;
      delta.opacity *= 1 - i;
      break;
    }
    case 'whip-exit': {
      const i = easeInCubic(p);
      const s = Math.max(0.15, 1 - i * 0.75);
      delta.scaleX *= s;
      delta.scaleY *= s;
      delta.blur += i * 12 * intensity;
      delta.opacity *= 1 - i;
      break;
    }
    default:
      break;
  }
}

/**
 * Evaluates combined In + Middle + Out animation offsets deterministically at localTime inside clip.
 */
export function evaluateClipMotion(clip: TimelineClip, localTime: number): MotionDelta {
  const delta: MotionDelta = {
    dx: 0,
    dy: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    blur: 0,
  };

  const anim = clip.animations;
  if (!anim) return delta;
  const dur = Math.max(0.05, clip.duration);

  if (anim.in && anim.in.presetId !== 'none') {
    const inDur = clamp(anim.in.duration || 0.45, 0.05, dur * 0.85);
    if (localTime < inDur) {
      applySlotDelta(anim.in, localTime / inDur, delta);
    }
  }

  if (anim.out && anim.out.presetId !== 'none') {
    const outDur = clamp(anim.out.duration || 0.45, 0.05, dur * 0.85);
    const outStart = dur - outDur;
    if (localTime > outStart) {
      applySlotDelta(anim.out, (localTime - outStart) / outDur, delta);
    }
  }

  if (anim.middle && anim.middle.presetId !== 'none') {
    const period = clamp(anim.middle.duration || 1.2, 0.2, 10);
    const phase = ((localTime % period) / period) * Math.PI * 2;
    const intensity = clamp(anim.middle.intensity ?? 1, 0.1, 2.0);

    switch (anim.middle.presetId) {
      case 'pulse': {
        const s = 1 + Math.sin(phase) * 0.06 * intensity;
        delta.scaleX *= s;
        delta.scaleY *= s;
        break;
      }
      case 'float':
        delta.dy += Math.sin(phase) * 10 * intensity;
        delta.dx += Math.cos(phase * 0.5) * 4 * intensity;
        break;
      case 'pendulum':
        delta.rotation += Math.sin(phase) * 6 * intensity;
        break;
      case 'heartbeat': {
        const beat = Math.pow(Math.max(0, Math.sin(phase)), 6);
        const s = 1 + beat * 0.14 * intensity;
        delta.scaleX *= s;
        delta.scaleY *= s;
        break;
      }
      case 'jitter-shake': {
        delta.dx += Math.sin(localTime * 37.2) * 5 * intensity;
        delta.dy += Math.cos(localTime * 43.8) * 4 * intensity;
        delta.rotation += Math.sin(localTime * 29.1) * 1.4 * intensity;
        break;
      }
      case 'slow-zoom': {
        const progress = clamp(localTime / dur, 0, 1);
        const s = 1 + progress * 0.18 * intensity;
        delta.scaleX *= s;
        delta.scaleY *= s;
        break;
      }
      default:
        break;
    }
  }

  return delta;
}
