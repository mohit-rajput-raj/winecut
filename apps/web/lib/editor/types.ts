export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';
export type ProjectMode = 'editing' | 'clipping';

export interface AppSettings {
  cachePath: string;
  downloadsPath: string;
  defaultResolution: '720p' | '1080p' | '4k';
  defaultFps: 30 | 60;
  hardwareAcceleration: 'auto' | 'nvenc' | 'quicksync' | 'software';
  autoSaveIntervalMs: number;
  geminiApiKey: string;
  geminiModel: 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-2.0-flash';
  autoCaptionEngine: 'whisper-local' | 'gemini-multimodal';
  authUser: {
    isSignedIn: boolean;
    name: string;
    email: string;
    plan: 'Studio Free' | 'Pro Creator' | 'Workspace';
    provider: 'google' | 'github' | 'guest';
  };
}

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  aspectRatio: AspectRatio;
  duration: number; // in seconds
  sampleRate: number;
  screenBlur?: number; // 0 to 40 px
  masterBrightness?: number; // 30 - 200 %
  masterContrast?: number; // 30 - 200 %
  masterSaturation?: number; // 0 - 250 %
  masterTemperature?: number; // -100 to 100
  masterHue?: number; // 0 - 360 deg
  masterExposure?: number; // -2.0 to 2.0 stops
  masterHighlights?: number; // -100 to 100
  masterShadows?: number; // -100 to 100
  masterSharpen?: number; // 0 to 100
  masterVignette?: number; // 0 to 100
  masterGrain?: number; // 0 to 100
  masterFade?: number; // 0 to 100
  masterTint?: number; // -100 to 100
}

export type MediaType = 'video' | 'audio' | 'image';

export interface MediaAsset {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  thumbnailUrl?: string;
  duration: number; // in seconds
  width?: number;
  height?: number;
  fps?: number;
  fileSize?: string;
  cachedFilePath?: string;
  mimeType?: string;
}

export interface Transform {
  x: number; // offset X in stage px
  y: number; // offset Y in stage px
  scale: number; // 1 = 100%
  rotation: number; // in degrees
  opacity: number; // 0 to 1
}

export type EffectType =
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'blur'
  | 'temperature'
  | 'tint'
  | 'hue'
  | 'exposure'
  | 'highlights'
  | 'shadows'
  | 'sharpen'
  | 'fade'
  | 'vignette'
  | 'grain'
  | 'sepia'
  | 'grayscale'
  | 'invert'
  | 'lut'
  | 'speed';

export interface Effect {
  id: string;
  type: EffectType;
  name: string;
  value: number; // normalized or specific
  enabled: boolean;
}

export type MaskType = 'none' | 'linear' | 'mirror' | 'circle' | 'rect' | 'star' | 'heart';

export interface MaskConfig {
  type: MaskType;
  x: number; // percentage 0 - 100 (center X)
  y: number; // percentage 0 - 100 (center Y)
  width: number; // percentage 5 - 150
  height: number; // percentage 5 - 150
  rotation: number; // degrees
  cornerRadius: number; // 0 - 50%
  feather: number; // 0 - 60 px blur radius
  inverted: boolean;
}

export interface AnimationSlot {
  presetId: string;
  duration: number; // seconds
  intensity: number; // 0.1 - 2.0
}

export interface ClipAnimations {
  in?: AnimationSlot;
  out?: AnimationSlot;
  middle?: AnimationSlot;
}

export interface SpeedPoint {
  t: number; // normalized source position 0..1
  speed: number; // multiplier 0.1..8.0
}

export interface SpeedCurveConfig {
  presetId?: string;
  points: SpeedPoint[];
}

export type TransitionType =
  | 'dissolve'
  | 'slide-left'
  | 'slide-right'
  | 'slide-up'
  | 'slide-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'whip-blur'
  | 'flash'
  | 'glitch'
  | 'wipe-left'
  | 'wipe-right'
  | 'radial-wipe';

export interface TransitionEdge {
  id: string;
  trackId: string;
  fromClipId: string;
  toClipId: string;
  type: TransitionType;
  duration: number; // seconds
}

export type ClipType = 'video' | 'audio' | 'text' | 'image' | 'sticker';

export interface TimelineClip {
  id: string;
  trackId: string;
  assetId?: string;
  name: string;
  type: ClipType;

  // Timing (in seconds)
  timelineStart: number;
  sourceStart: number;
  sourceEnd: number;
  duration: number;

  // Visual Properties
  transform: Transform;
  effects: Effect[];
  animations?: ClipAnimations;
  mask?: MaskConfig;
  speedCurve?: SpeedCurveConfig;
  layerEffects?: string[];
  lutId?: string;

  // Audio Properties
  volume: number; // 0 - 200
  muted: boolean;
  fadeIn: number; // seconds
  fadeOut: number; // seconds

  // Text / Caption Properties (for 'text' clips)
  textContent?: string;
  textColor?: string;
  textBgColor?: string;
  fontSize?: number;
  fontFamily?: string;
  animationPreset?: 'fade' | 'pop' | 'typewriter' | 'bounce';
  fontWeight?: string;
  strokeWidth?: number;
  strokeColor?: string;
  shadowBlur?: number;
  shadowColor?: string;
  bgPadding?: number;
  bgRadius?: number;
  letterSpacing?: number;
  gradientColors?: [string, string];

  // Sticker Properties (for 'sticker' clips)
  stickerId?: string;
  stickerSvg?: string;
  stickerColor?: string;

  // Image & Overlay Styling
  fitMode?: 'cover' | 'contain' | 'fill';
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  dropShadow?: boolean;
}

export interface FramerBox {
  id: 'top' | 'bottom';
  label: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FramerSettings {
  layout: 'vertical_split' | 'horizontal_split' | 'pip' | 'single';
  targetAspectRatio: '9:16' | '1:1' | '4:5';
  topBox: FramerBox;
  bottomBox: FramerBox;
  dividerWidth: number;
  dividerColor: string;
  splitRatio: number;
  viewMode: 'framing_crop' | 'split_preview';
}

export type TrackType = 'video' | 'audio' | 'text';

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  muted: boolean;
  locked: boolean;
  visible: boolean;
  clips: TimelineClip[];
}

export interface TimelineData {
  tracks: Track[];
  transitions?: TransitionEdge[];
  duration: number;
  fps: number;
}

export interface EditorProject {
  id: string;
  name: string;
  version: string;
  mode?: ProjectMode;
  status?: 'draft' | 'in_progress' | 'exported';
  thumbnailUrl?: string;
  settings: ProjectSettings;
  timeline: TimelineData;
  mediaLibrary: MediaAsset[];
  framerSettings?: FramerSettings;
  lastPlayheadTime?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  category: 'shorts' | 'gaming' | 'audio' | 'color' | 'social';
  icon: string;
  tags: string[];
}
