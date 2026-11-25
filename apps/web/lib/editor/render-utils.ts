import { Effect, ProjectSettings, AspectRatio } from './types';

export function buildCssFilter(effects: Effect[] = []): string {
  if (!effects || effects.length === 0) return 'none';
  const brightness = effects.find(e => (e.type === 'brightness' || e.id === 'brightness') && e.enabled)?.value ?? 100;
  const contrast = effects.find(e => (e.type === 'contrast' || e.id === 'contrast') && e.enabled)?.value ?? 100;
  const saturation = effects.find(e => (e.type === 'saturation' || e.id === 'saturation') && e.enabled)?.value ?? 100;
  const blur = effects.find(e => (e.type === 'blur' || e.id === 'blur') && e.enabled)?.value ?? 0;
  const hue = effects.find(e => (e.type === 'hue' || e.id === 'hue') && e.enabled)?.value ?? 0;
  const sepia = effects.find(e => (e.type === 'sepia' || e.id === 'sepia') && e.enabled)?.value ?? 0;
  const grayscale = effects.find(e => (e.type === 'grayscale' || e.id === 'grayscale') && e.enabled)?.value ?? 0;
  const invert = effects.find(e => (e.type === 'invert' || e.id === 'invert') && e.enabled)?.value ?? 0;
  const temperature = effects.find(e => (e.type === 'temperature' || e.id === 'temperature') && e.enabled)?.value ?? 0;

  let tempFilter = '';
  if (temperature > 0) {
    tempFilter = `sepia(${Math.round(temperature * 0.35)}%) saturate(${100 + Math.round(temperature * 0.25)}%)`;
  } else if (temperature < 0) {
    tempFilter = `hue-rotate(${Math.round(temperature * 0.3)}deg) saturate(${100 + Math.round(Math.abs(temperature) * 0.15)}%)`;
  }

  const filters = [
    brightness !== 100 ? `brightness(${brightness}%)` : null,
    contrast !== 100 ? `contrast(${contrast}%)` : null,
    saturation !== 100 ? `saturate(${saturation}%)` : null,
    blur > 0 ? `blur(${blur}px)` : null,
    hue !== 0 ? `hue-rotate(${hue}deg)` : null,
    sepia > 0 ? `sepia(${sepia}%)` : null,
    grayscale > 0 ? `grayscale(${grayscale}%)` : null,
    invert > 0 ? `invert(${invert}%)` : null,
    tempFilter || null,
  ].filter(Boolean);

  return filters.length > 0 ? filters.join(' ') : 'none';
}

export function buildMasterFilter(settings: ProjectSettings): string {
  const screenBlur = settings.screenBlur ?? 0;
  const mb = settings.masterBrightness ?? 100;
  const mc = settings.masterContrast ?? 100;
  const ms = settings.masterSaturation ?? 100;
  const mh = settings.masterHue ?? 0;

  const filters = [
    screenBlur > 0 ? `blur(${screenBlur}px)` : null,
    mb !== 100 ? `brightness(${mb}%)` : null,
    mc !== 100 ? `contrast(${mc}%)` : null,
    ms !== 100 ? `saturate(${ms}%)` : null,
    mh !== 0 ? `hue-rotate(${mh}deg)` : null,
  ].filter(Boolean);

  return filters.length > 0 ? filters.join(' ') : 'none';
}

export function getExportDimensions(aspectRatio: AspectRatio, resolution: '720p' | '1080p' | '4k'): { width: number; height: number } {
  if (aspectRatio === '9:16') {
    if (resolution === '1080p') return { width: 1080, height: 1920 };
    if (resolution === '4k') return { width: 2160, height: 3840 };
    return { width: 720, height: 1280 };
  }
  if (aspectRatio === '1:1') {
    if (resolution === '1080p') return { width: 1080, height: 1080 };
    if (resolution === '4k') return { width: 2160, height: 2160 };
    return { width: 720, height: 720 };
  }
  if (aspectRatio === '4:5') {
    if (resolution === '1080p') return { width: 1080, height: 1350 };
    if (resolution === '4k') return { width: 2160, height: 2700 };
    return { width: 720, height: 900 };
  }
  // Default 16:9
  if (resolution === '1080p') return { width: 1920, height: 1080 };
  if (resolution === '4k') return { width: 3840, height: 2160 };
  return { width: 1280, height: 720 };
}
