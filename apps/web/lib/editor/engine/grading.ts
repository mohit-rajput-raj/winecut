import { Effect, ProjectSettings } from '../types';
import { FILTER_PRESETS } from '../presets/bundles';

export interface ColorGradeValues {
  brightness: number; // 100 default (0..200)
  contrast: number; // 100 default (0..200)
  saturation: number; // 100 default (0..250)
  exposure: number; // 0 stops (-2..2)
  highlights: number; // 0 (-100..100)
  shadows: number; // 0 (-100..100)
  sharpen: number; // 0 (0..100)
  temperature: number; // 0 (-100..100)
  tint: number; // 0 (-100..100)
  hue: number; // 0 (-180..180)
  fade: number; // 0 (0..100)
  vignette: number; // 0 (0..100)
  grain: number; // 0 (0..100)
  blur: number; // 0 (0..40)
  sepia: number; // 0 (0..100)
  grayscale: number; // 0 (0..100)
  invert: number; // 0 (0..100)
}

export const DEFAULT_COLOR_GRADE: ColorGradeValues = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  sharpen: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  fade: 0,
  vignette: 0,
  grain: 0,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  invert: 0,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function extractColorGradeValues(
  effects: Effect[] = [],
  lutId?: string,
): ColorGradeValues {
  const result: ColorGradeValues = { ...DEFAULT_COLOR_GRADE };

  // Apply filter LUT preset base first if specified
  if (lutId && lutId !== 'none') {
    const preset = FILTER_PRESETS.find((f) => f.id === lutId);
    if (preset) {
      for (const [k, v] of Object.entries(preset.adjustments)) {
        if (k in result && typeof v === 'number') {
          (result as unknown as Record<string, number>)[k] = v;
        }
      }
    }
  }

  // Layer explicit clip effects on top
  for (const eff of effects) {
    if (!eff.enabled) continue;
    const key = (eff.type || eff.id) as keyof ColorGradeValues;
    if (key in result) {
      result[key] = eff.value;
    }
  }

  return result;
}

export function extractMasterColorGrade(settings: ProjectSettings): ColorGradeValues {
  return {
    ...DEFAULT_COLOR_GRADE,
    brightness: settings.masterBrightness ?? 100,
    contrast: settings.masterContrast ?? 100,
    saturation: settings.masterSaturation ?? 100,
    exposure: settings.masterExposure ?? 0,
    highlights: settings.masterHighlights ?? 0,
    shadows: settings.masterShadows ?? 0,
    sharpen: settings.masterSharpen ?? 0,
    temperature: settings.masterTemperature ?? 0,
    tint: settings.masterTint ?? 0,
    hue: settings.masterHue ?? 0,
    fade: settings.masterFade ?? 0,
    vignette: settings.masterVignette ?? 0,
    grain: settings.masterGrain ?? 0,
    blur: settings.screenBlur ?? 0,
  };
}

export function hasNonDefaultGrade(g: ColorGradeValues): boolean {
  return (
    g.brightness !== 100 ||
    g.contrast !== 100 ||
    g.saturation !== 100 ||
    g.exposure !== 0 ||
    g.highlights !== 0 ||
    g.shadows !== 0 ||
    g.sharpen > 0 ||
    g.temperature !== 0 ||
    g.tint !== 0 ||
    g.hue !== 0 ||
    g.fade > 0 ||
    g.vignette > 0 ||
    g.grain > 0 ||
    g.blur > 0 ||
    g.sepia > 0 ||
    g.grayscale > 0 ||
    g.invert > 0
  );
}

/**
 * Maps every ColorGradeValues parameter 1:1 to FFmpeg video filters.
 */
export function buildFFmpegGradeFilters(g: ColorGradeValues): string[] {
  const filters: string[] = [];

  if (g.exposure !== 0) {
    // Exposure adjustment in EV stops using FFmpeg exposure filter or eq gamma/brightness approximation
    const ev = clamp(g.exposure, -2, 2);
    filters.push(`exposure=exposure=${ev.toFixed(2)}:black=0`);
  }

  if (g.brightness !== 100 || g.contrast !== 100 || g.saturation !== 100) {
    const eqB = clamp((g.brightness - 100) / 100, -1, 1).toFixed(2);
    const eqC = clamp(g.contrast / 100, 0, 3).toFixed(2);
    const eqS = clamp(g.saturation / 100, 0, 3).toFixed(2);
    filters.push(`eq=brightness=${eqB}:contrast=${eqC}:saturation=${eqS}`);
  }

  if (g.highlights !== 0 || g.shadows !== 0) {
    // Approximate tonal curve lift/knee in shadows and highlights
    const sShift = clamp((g.shadows / 100) * 0.18, -0.25, 0.25);
    const hShift = clamp((g.highlights / 100) * 0.18, -0.25, 0.25);
    const sOut = clamp(0.25 + sShift, 0.02, 0.48).toFixed(2);
    const hOut = clamp(0.75 + hShift, 0.52, 0.98).toFixed(2);
    filters.push(`curves=master='0/0 0.25/${sOut} 0.75/${hOut} 1/1'`);
  }

  if (g.fade > 0) {
    const blackFloor = clamp((g.fade / 100) * 0.22, 0, 0.3).toFixed(3);
    filters.push(`curves=master='0/${blackFloor} 0.35/0.38 1/1'`);
  }

  if (g.temperature !== 0 || g.tint !== 0) {
    const temp = clamp(g.temperature / 160, -0.5, 0.5);
    const tintShift = clamp(g.tint / 180, -0.4, 0.4);
    filters.push(
      `colorbalance=rs=${temp.toFixed(2)}:gs=${(-tintShift).toFixed(2)}:bs=${(-temp).toFixed(2)}`,
    );
  }

  if (g.hue !== 0) {
    filters.push(`hue=h=${g.hue}`);
  }

  if (g.grayscale >= 50) {
    filters.push('hue=s=0');
  }

  if (g.sepia >= 30) {
    filters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
  }

  if (g.invert >= 50) {
    filters.push('negate');
  }

  if (g.sharpen > 0) {
    const amt = clamp((g.sharpen / 100) * 1.8, 0.1, 2.2).toFixed(2);
    filters.push(`unsharp=5:5:${amt}:5:5:0.0`);
  }

  if (g.blur > 0) {
    filters.push(`gblur=sigma=${clamp(g.blur, 0.1, 40).toFixed(1)}`);
  }

  if (g.vignette > 0) {
    const angle = clamp(0.15 + (g.vignette / 100) * 0.75, 0.1, Math.PI / 2).toFixed(3);
    filters.push(`vignette=angle=${angle}`);
  }

  if (g.grain > 0) {
    const strength = Math.max(1, Math.round((g.grain / 100) * 28));
    filters.push(`noise=alls=${strength}:allf=t+u`);
  }

  return filters;
}
