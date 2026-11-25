import { EditorProject, MediaAsset, TimelineClip, Track, SkillManifest, FramerSettings } from './types';

export const DEFAULT_FRAMER_SETTINGS: FramerSettings = {
  layout: 'vertical_split',
  targetAspectRatio: '9:16',
  topBox: {
    id: 'top',
    label: 'Top Speaker',
    color: '#22c55e',
    x: 6,
    y: 8,
    width: 42,
    height: 84,
  },
  bottomBox: {
    id: 'bottom',
    label: 'Bottom Speaker',
    color: '#38bdf8',
    x: 52,
    y: 8,
    width: 42,
    height: 84,
  },
  dividerWidth: 2,
  dividerColor: '#000000',
  splitRatio: 0.5,
  viewMode: 'framing_crop',
};

export const INITIAL_MEDIA_LIBRARY: MediaAsset[] = [];

export const INITIAL_CLIPS: TimelineClip[] = [];

export const INITIAL_TRACKS: Track[] = [
  {
    id: 'track-v2',
    name: 'Overlay (V2)',
    type: 'video',
    muted: false,
    locked: false,
    visible: true,
    clips: []
  },
  {
    id: 'track-v1',
    name: 'Main Video (V1)',
    type: 'video',
    muted: false,
    locked: false,
    visible: true,
    clips: []
  },
  {
    id: 'track-a1',
    name: 'Audio 1',
    type: 'audio',
    muted: false,
    locked: false,
    visible: true,
    clips: []
  }
];

export const INITIAL_PROJECT: EditorProject = {
  id: 'proj-new',
  name: 'My_Video_Project',
  version: '0.1.0',
  settings: {
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    duration: 30,
    sampleRate: 48000,
  },
  timeline: {
    tracks: INITIAL_TRACKS,
    duration: 30,
    fps: 30,
  },
  mediaLibrary: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const AVAILABLE_SKILLS: SkillManifest[] = [
  {
    id: 'skill-shorts-creator',
    name: 'Auto-Hook Short Creator',
    description: 'Auto-detects active speech and motion to generate 9:16 vertical shorts.',
    category: 'shorts',
    icon: 'Smartphone',
    tags: ['9:16', 'Auto-Crop', 'Viral']
  },
  {
    id: 'skill-cinematic-grade',
    name: 'Teal & Orange Grade',
    description: 'Applies blockbuster cinematic color LUT curves.',
    category: 'color',
    icon: 'Palette',
    tags: ['LUT', 'Color', '35mm']
  },
  {
    id: 'skill-auto-captions',
    name: 'Whisper Subtitle Sync',
    description: 'Transcribes audio into animated karaoke caption overlays.',
    category: 'social',
    icon: 'Type',
    tags: ['Subtitles', 'Karaoke', 'Whisper']
  },
  {
    id: 'skill-silence-cut',
    name: 'Silence Jump-Cutter',
    description: 'Removes pauses below -40dB from the voice track.',
    category: 'audio',
    icon: 'Scissors',
    tags: ['Audio', 'Jump-Cut', 'Podcast']
  }
];
