import { Effect, ProjectSettings, AspectRatio } from './types';
import { extractColorGradeValues, extractMasterColorGrade } from './engine/grading';

export function buildCssFilter(effects: Effect[] = [], lutId?: string): string {
  const g = extractColorGradeValues(effects, lutId);

  let tempFilter = '';
  if (g.temperature > 0) {
    tempFilter = `sepia(${Math.round(g.temperature * 0.35)}%) saturate(${100 + Math.round(g.temperature * 0.25)}%)`;
  } else if (g.temperature < 0) {
    tempFilter = `hue-rotate(${Math.round(g.temperature * 0.3)}deg) saturate(${100 + Math.round(Math.abs(g.temperature) * 0.15)}%)`;
  }

  const expBrightness = g.exposure !== 0 ? Math.round(Math.pow(2, g.exposure) * g.brightness) : g.brightness;
  const effectiveContrast = g.contrast + (g.highlights * 0.15) - (g.fade * 0.12);

  const filters = [
    expBrightness !== 100 ? `brightness(${Math.max(10, Math.round(expBrightness))}%)` : null,
    Math.round(effectiveContrast) !== 100 ? `contrast(${Math.max(20, Math.round(effectiveContrast))}%)` : null,
    g.saturation !== 100 ? `saturate(${g.saturation}%)` : null,
    g.blur > 0 ? `blur(${g.blur}px)` : null,
    g.hue !== 0 ? `hue-rotate(${g.hue}deg)` : null,
    g.sepia > 0 ? `sepia(${g.sepia}%)` : null,
    g.grayscale > 0 ? `grayscale(${g.grayscale}%)` : null,
    g.invert > 0 ? `invert(${g.invert}%)` : null,
    tempFilter || null,
  ].filter(Boolean);

  return filters.length > 0 ? filters.join(' ') : 'none';
}

export function buildMasterFilter(settings: ProjectSettings): string {
  const g = extractMasterColorGrade(settings);
  const expBrightness = g.exposure !== 0 ? Math.round(Math.pow(2, g.exposure) * g.brightness) : g.brightness;

  const filters = [
    g.blur > 0 ? `blur(${g.blur}px)` : null,
    expBrightness !== 100 ? `brightness(${Math.max(10, Math.round(expBrightness))}%)` : null,
    g.contrast !== 100 ? `contrast(${g.contrast}%)` : null,
    g.saturation !== 100 ? `saturate(${g.saturation}%)` : null,
    g.hue !== 0 ? `hue-rotate(${g.hue}deg)` : null,
  ].filter(Boolean);

  return filters.length > 0 ? filters.join(' ') : 'none';
}

export function getExportDimensions(
  aspectRatio: AspectRatio,
  resolution: 'source' | '720p' | '1080p' | '1440p' | '4k' | 'custom',
): { width: number; height: number } {
  const shortSide =
    resolution === '4k'
      ? 2160
      : resolution === '1440p'
        ? 1440
        : resolution === '1080p' || resolution === 'source' || resolution === 'custom'
          ? 1080
          : 720;

  if (aspectRatio === '9:16') {
    const h = Math.round((shortSide * 16) / 9);
    return { width: shortSide, height: h % 2 === 0 ? h : h + 1 };
  }
  if (aspectRatio === '1:1') {
    return { width: shortSide, height: shortSide };
  }
  if (aspectRatio === '4:5') {
    const h = Math.round((shortSide * 5) / 4);
    return { width: shortSide, height: h % 2 === 0 ? h : h + 1 };
  }
  const w = Math.round((shortSide * 16) / 9);
  return { width: w % 2 === 0 ? w : w + 1, height: shortSide };
}
