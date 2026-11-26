import { EffectType, TransitionType } from '../types';

export interface FilterPresetDef {
  id: string;
  label: string;
  category: 'Cinematic' | 'Portrait' | 'Mood' | 'Retro';
  swatch: string;
  adjustments: Partial<Record<EffectType, number>>;
}

export const FILTER_PRESETS: FilterPresetDef[] = [
  {
    id: 'none',
    label: 'Original',
    category: 'Cinematic',
    swatch: 'linear-gradient(135deg, #27272a, #52525b)',
    adjustments: {},
  },
  {
    id: 'teal-orange',
    label: 'Teal & Orange',
    category: 'Cinematic',
    swatch: 'linear-gradient(135deg, #0d9488, #f97316)',
    adjustments: {
      contrast: 122,
      saturation: 126,
      temperature: 18,
      highlights: -15,
      shadows: -18,
      vignette: 28,
      sharpen: 18,
    },
  },
  {
    id: 'cinematic-warm',
    label: 'Golden 35mm',
    category: 'Cinematic',
    swatch: 'linear-gradient(135deg, #d97706, #78350f)',
    adjustments: {
      exposure: 0.15,
      contrast: 115,
      saturation: 112,
      temperature: 34,
      fade: 18,
      grain: 24,
      vignette: 25,
    },
  },
  {
    id: 'matte-film',
    label: 'Matte Vintage',
    category: 'Retro',
    swatch: 'linear-gradient(135deg, #57534e, #a8a29e)',
    adjustments: {
      contrast: 92,
      saturation: 82,
      fade: 42,
      shadows: 25,
      highlights: -25,
      grain: 32,
      vignette: 20,
    },
  },
  {
    id: 'noir-bw',
    label: 'Silver Noir',
    category: 'Mood',
    swatch: 'linear-gradient(135deg, #09090b, #e4e4e7)',
    adjustments: {
      grayscale: 100,
      contrast: 138,
      highlights: 16,
      shadows: -28,
      sharpen: 24,
      vignette: 40,
      grain: 30,
    },
  },
  {
    id: 'vivid-pop',
    label: 'Crisp Studio',
    category: 'Portrait',
    swatch: 'linear-gradient(135deg, #3b82f6, #ec4899)',
    adjustments: {
      exposure: 0.12,
      contrast: 114,
      saturation: 130,
      highlights: 14,
      sharpen: 35,
    },
  },
  {
    id: 'cyber-cool',
    label: 'Night Neon',
    category: 'Mood',
    swatch: 'linear-gradient(135deg, #06b6d4, #6366f1)',
    adjustments: {
      temperature: -38,
      tint: 22,
      contrast: 126,
      saturation: 120,
      shadows: -12,
      vignette: 32,
    },
  },
  {
    id: 'soft-portrait',
    label: 'Soft Skin',
    category: 'Portrait',
    swatch: 'linear-gradient(135deg, #fda4af, #fed7aa)',
    adjustments: {
      exposure: 0.18,
      contrast: 96,
      saturation: 106,
      temperature: 12,
      shadows: 18,
      fade: 12,
    },
  },
];

export interface EffectBundleDef {
  id: string;
  label: string;
  category: 'Motion' | 'Lens' | 'Retro';
  description: string;
}

export const EFFECT_BUNDLES: EffectBundleDef[] = [
  { id: 'chromatic', label: 'RGB Split', category: 'Lens', description: 'Radial R/B chromatic aberration.' },
  { id: 'camera-shake', label: 'Camera Shake', category: 'Motion', description: 'Dynamic handheld kinetic tremor.' },
  { id: 'vhs', label: 'VHS Scanlines', category: 'Retro', description: 'CRT horizontal scanlines & tape warp.' },
  { id: 'flash', label: 'Flash Pulse', category: 'Motion', description: 'Periodic crisp white strobe boost.' },
  { id: 'vignette-pulse', label: 'Pulse Vignette', category: 'Lens', description: 'Breathing dark edge focus.' },
  { id: 'blur-zoom', label: 'Edge Blur Focus', category: 'Lens', description: 'Soft radial blur halo.' },
  { id: 'film-flicker', label: '35mm Flicker', category: 'Retro', description: 'Subtle analog projector exposure flutter.' },
  { id: 'prism', label: 'Prism Ghost', category: 'Lens', description: 'Offset translucent prism echo.' },
];

export interface TransitionPresetDef {
  id: TransitionType;
  label: string;
  defaultDuration: number;
  ffmpegXfade: string;
}

export const TRANSITION_PRESETS: TransitionPresetDef[] = [
  { id: 'dissolve', label: 'Cross Dissolve', defaultDuration: 0.5, ffmpegXfade: 'fade' },
  { id: 'flash', label: 'White Flash', defaultDuration: 0.35, ffmpegXfade: 'fadewhite' },
  { id: 'slide-left', label: 'Slide Left', defaultDuration: 0.45, ffmpegXfade: 'slideleft' },
  { id: 'slide-right', label: 'Slide Right', defaultDuration: 0.45, ffmpegXfade: 'slideright' },
  { id: 'slide-up', label: 'Slide Up', defaultDuration: 0.45, ffmpegXfade: 'slideup' },
  { id: 'slide-down', label: 'Slide Down', defaultDuration: 0.45, ffmpegXfade: 'slidedown' },
  { id: 'zoom-in', label: 'Zoom In', defaultDuration: 0.45, ffmpegXfade: 'zoomin' },
  { id: 'zoom-out', label: 'Zoom Out', defaultDuration: 0.45, ffmpegXfade: 'fadefast' },
  { id: 'whip-blur', label: 'Whip Pan', defaultDuration: 0.35, ffmpegXfade: 'smoothleft' },
  { id: 'wipe-left', label: 'Wipe Left', defaultDuration: 0.5, ffmpegXfade: 'wipeleft' },
  { id: 'wipe-right', label: 'Wipe Right', defaultDuration: 0.5, ffmpegXfade: 'wiperight' },
  { id: 'radial-wipe', label: 'Radial Wipe', defaultDuration: 0.6, ffmpegXfade: 'radial' },
  { id: 'glitch', label: 'Digital Glitch', defaultDuration: 0.4, ffmpegXfade: 'pixelize' },
];

export interface StickerPresetDef {
  id: string;
  label: string;
  category: 'Badges' | 'Arrows' | 'Reactions';
  color: string;
  svg: string;
}

export const STICKER_PACKS: StickerPresetDef[] = [
  {
    id: 'arrow-right-bold',
    label: 'Pointer Arrow',
    category: 'Arrows',
    color: '#38bdf8',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path d="M16 64h78M68 34l32 30-32 30" fill="none" stroke="#38bdf8" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'arrow-curved',
    label: 'Curved Callout',
    category: 'Arrows',
    color: '#facc15',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path d="M22 96C26 42 58 26 98 44" fill="none" stroke="#facc15" stroke-width="12" stroke-linecap="round"/><path d="M84 22l22 24-30 12" fill="none" stroke="#facc15" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'badge-live',
    label: 'REC / LIVE Pill',
    category: 'Badges',
    color: '#ef4444',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 64"><rect x="4" y="8" width="152" height="48" rx="24" fill="#ef4444"/><circle cx="32" cy="32" r="9" fill="#ffffff"/><text x="52" y="40" fill="#ffffff" font-family="Arial,sans-serif" font-weight="900" font-size="24">REC</text></svg>`,
  },
  {
    id: 'badge-verified',
    label: 'Verified Check',
    category: 'Badges',
    color: '#3b82f6',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="52" fill="#3b82f6"/><path d="M40 66l17 17 34-36" fill="none" stroke="#ffffff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'badge-subscribe',
    label: 'Subscribe Tag',
    category: 'Badges',
    color: '#f43f5e',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 72"><rect x="4" y="6" width="212" height="60" rx="14" fill="#18181b" stroke="#f43f5e" stroke-width="4"/><polygon points="28,22 28,50 52,36" fill="#f43f5e"/><text x="68" y="44" fill="#ffffff" font-family="Arial,sans-serif" font-weight="800" font-size="22">SUBSCRIBE</text></svg>`,
  },
  {
    id: 'badge-breaking',
    label: 'Highlight Box',
    category: 'Badges',
    color: '#22c55e',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 64"><rect x="4" y="6" width="172" height="52" rx="10" fill="#22c55e"/><text x="90" y="40" text-anchor="middle" fill="#052e16" font-family="Arial,sans-serif" font-weight="900" font-size="22">WATCH THIS</text></svg>`,
  },
  {
    id: 'reaction-fire',
    label: 'Flame Burst',
    category: 'Reactions',
    color: '#f97316',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path d="M68 12c6 20-12 28-10 46 8-6 14-14 16-24 18 14 28 34 22 54-5 17-20 28-36 28-21 0-36-16-36-38 0-26 24-44 44-66z" fill="#f97316"/><path d="M64 56c3 12-6 18-4 28 14 4 22-8 14-24-4-2-6-3-10-4z" fill="#fde047"/></svg>`,
  },
  {
    id: 'reaction-star',
    label: 'Gold Star',
    category: 'Reactions',
    color: '#eab308',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><polygon points="64,10 80,46 118,50 89,76 98,114 64,94 30,114 39,76 10,50 48,46" fill="#eab308" stroke="#fef08a" stroke-width="4" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'reaction-sparkles',
    label: 'Sparkle Trio',
    category: 'Reactions',
    color: '#a855f7',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path d="M64 14l9 32 32 9-32 9-9 32-9-32-32-9 32-9z" fill="#c084fc"/><path d="M100 18l4 14 14 4-14 4-4 14-4-14-14-4 14-4z" fill="#f0abfc"/></svg>`,
  },
  {
    id: 'reaction-heart',
    label: 'Heart Pop',
    category: 'Reactions',
    color: '#ec4899',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><path d="M64 112S16 82 16 46c0-17 13-30 29-30 10 0 16 5 19 11 3-6 9-11 19-11 16 0 29 13 29 30 0 36-48 66-48 66z" fill="#ec4899"/></svg>`,
  },
  {
    id: 'frame-crosshair',
    label: 'Target Scope',
    category: 'Badges',
    color: '#2dd4bf',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="40" fill="none" stroke="#2dd4bf" stroke-width="6"/><path d="M64 10v24M64 94v24M10 64h24M94 64h24" stroke="#2dd4bf" stroke-width="6" stroke-linecap="round"/><circle cx="64" cy="64" r="6" fill="#2dd4bf"/></svg>`,
  },
  {
    id: 'reaction-bolt',
    label: 'Energy Bolt',
    category: 'Reactions',
    color: '#38bdf8',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><polygon points="72,10 26,72 60,72 52,118 102,54 68,54" fill="#38bdf8" stroke="#e0f2fe" stroke-width="4" stroke-linejoin="round"/></svg>`,
  },
];

export interface TextStyleTemplate {
  id: string;
  label: string;
  previewText: string;
  textColor: string;
  textBgColor: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  strokeWidth?: number;
  strokeColor?: string;
  shadowBlur?: number;
  shadowColor?: string;
  bgPadding?: number;
  bgRadius?: number;
  letterSpacing?: number;
  gradientColors?: [string, string];
  inAnim?: string;
}

export const TEXT_STYLE_TEMPLATES: TextStyleTemplate[] = [
  {
    id: 'viral-bold',
    label: 'Viral Bold',
    previewText: 'WAIT FOR IT',
    textColor: '#fde047',
    textBgColor: 'rgba(0,0,0,0)',
    fontSize: 42,
    fontFamily: 'Impact, Inter, sans-serif',
    fontWeight: '900',
    strokeWidth: 4,
    strokeColor: '#000000',
    shadowBlur: 10,
    shadowColor: 'rgba(0,0,0,0.85)',
    letterSpacing: 1,
    inAnim: 'pop-in',
  },
  {
    id: 'clean-pill',
    label: 'Minimal Pill',
    previewText: 'Key Takeaway',
    textColor: '#ffffff',
    textBgColor: 'rgba(15, 23, 42, 0.85)',
    fontSize: 30,
    fontFamily: 'Inter, sans-serif',
    fontWeight: '700',
    bgPadding: 14,
    bgRadius: 999,
    inAnim: 'slide-up',
  },
  {
    id: 'fire-gradient',
    label: 'Fire Gradient',
    previewText: 'HIGHLIGHT',
    textColor: '#fb923c',
    gradientColors: ['#fde047', '#ef4444'],
    textBgColor: 'rgba(0,0,0,0)',
    fontSize: 40,
    fontFamily: 'Inter, sans-serif',
    fontWeight: '900',
    strokeWidth: 2,
    strokeColor: '#18181b',
    shadowBlur: 12,
    shadowColor: 'rgba(239,68,68,0.45)',
    inAnim: 'zoom-in',
  },
  {
    id: 'cyber-outline',
    label: 'Cyan Outline',
    previewText: 'CHAPTER 01',
    textColor: '#67e8f9',
    textBgColor: 'rgba(8, 51, 68, 0.65)',
    fontSize: 32,
    fontFamily: 'monospace',
    fontWeight: '800',
    strokeWidth: 2,
    strokeColor: '#0e7490',
    bgPadding: 12,
    bgRadius: 8,
    letterSpacing: 3,
    inAnim: 'fade-in',
  },
  {
    id: 'gold-cinema',
    label: 'Cinema Title',
    previewText: 'A NEW STORY',
    textColor: '#fef3c7',
    gradientColors: ['#fef3c7', '#d97706'],
    textBgColor: 'rgba(0,0,0,0)',
    fontSize: 36,
    fontFamily: 'Georgia, serif',
    fontWeight: '700',
    letterSpacing: 4,
    shadowBlur: 14,
    shadowColor: 'rgba(0,0,0,0.9)',
    inAnim: 'fade-in',
  },
  {
    id: 'lower-third',
    label: 'Speaker Tag',
    previewText: 'ALEX MERCER · HOST',
    textColor: '#09090b',
    textBgColor: '#f4f4f5',
    fontSize: 26,
    fontFamily: 'Inter, sans-serif',
    fontWeight: '800',
    bgPadding: 12,
    bgRadius: 6,
    inAnim: 'slide-right',
  },
];
