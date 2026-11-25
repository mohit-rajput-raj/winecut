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
  x: number; // offset X percentage or px
  y: number; // offset Y percentage or px
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
  | 'hue' 
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

export type ClipType = 'video' | 'audio' | 'text' | 'image';

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
  duration: number; // = sourceEnd - sourceStart

  // Visual Properties
  transform: Transform;
  effects: Effect[];

  // Audio Properties
  volume: number; // 0 - 100
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

  // Image & Overlay Styling (CapCut style)
  fitMode?: 'cover' | 'contain' | 'fill';
  borderRadius?: number; // in pixels
  borderWidth?: number; // in pixels
  borderColor?: string;
  dropShadow?: boolean;
}

export interface FramerBox {
  id: 'top' | 'bottom';
  label: string;
  color: string;
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
  width: number; // percentage 0 - 100
  height: number; // percentage 0 - 100
}

export interface FramerSettings {
  layout: 'vertical_split' | 'horizontal_split' | 'pip' | 'single';
  targetAspectRatio: '9:16' | '1:1' | '4:5';
  topBox: FramerBox;
  bottomBox: FramerBox;
  dividerWidth: number;
  dividerColor: string;
  splitRatio: number; // 0.5 = 50/50
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
  duration: number; // overall project duration in seconds
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
