'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { 
  EditorProject, 
  TimelineClip, 
  Track, 
  AspectRatio, 
  MediaAsset, 
  Effect,
  EffectType,
  ProjectSettings,
  Transform,
  TrackType,
  FramerBox,
  FramerSettings,
  AnimationSlot,
  MaskConfig,
  SpeedCurveConfig,
  TransitionEdge,
  TransitionType
} from './types';
import { INITIAL_PROJECT, DEFAULT_FRAMER_SETTINGS } from './sample-data';
import { SnapshotHistoryManager, EditorSnapshot } from './commands';
import { useWorkspace } from '../workspace/WorkspaceContext';
import {
  autoAlignClipIntoTrack,
  packTrackMediaSequentially,
  alignTransformToCanvas,
  computeAutoLayoutTransforms,
  MAIN_VIDEO_TRACK_ID,
  moveClipMagnetically,
  enforceMainTrackMagnetism,
  computeElasticTimelineDuration,
} from './canvas-layout';
import { DEFAULT_MASK_CONFIG } from './engine/masks';
import { getCurveDurationMultiplier, mapTimelineToSourceOffset } from './engine/velocity';
import type { StickerPresetDef, TextStyleTemplate } from './presets/bundles';

export type SidebarTabId = 'media' | 'text' | 'stickers' | 'audio' | 'effects' | 'skills' | 'export';

interface EditorContextType {
  project: EditorProject;
  currentTime: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  selectedClip: TimelineClip | null;
  clipboardClip: TimelineClip | null;
  zoomLevel: number;
  playbackRate: number;
  aspectRatio: AspectRatio;
  activeSidebarTab: SidebarTabId;
  snapping: boolean;
  canUndo: boolean;
  canRedo: boolean;
  
  // Playback & Zoom Actions
  togglePlay: () => void;
  pausePlayback: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  setActiveSidebarTab: (tab: SidebarTabId) => void;
  setSnapping: (enabled: boolean) => void;
  selectClip: (clipId: string | null) => void;
  
  // Clip Manipulations (Undoable)
  updateClip: (clipId: string, updates: Partial<TimelineClip>, options?: { skipHistory?: boolean; coalesceKey?: string }) => void;
  updateClipTransform: (clipId: string, transform: Partial<Transform>, options?: { skipHistory?: boolean; coalesceKey?: string }) => void;
  updateClipEffect: (clipId: string, effectId: string, value: number) => void;
  batchUpdateClipEffects: (clipId: string, effectsMap: Partial<Record<EffectType, number>>) => void;
  applyClipFilterPreset: (clipId: string, lutId: string) => void;
  updateClipMask: (clipId: string, updates: Partial<MaskConfig>, options?: { skipHistory?: boolean; coalesceKey?: string }) => void;
  updateClipAnimation: (clipId: string, dir: 'in' | 'out' | 'middle', slot: AnimationSlot | undefined) => void;
  updateClipSpeedCurve: (clipId: string, curve: SpeedCurveConfig) => void;
  toggleClipLayerEffect: (clipId: string, effectId: string) => void;
  setClipTransition: (trackId: string, fromClipId: string, toClipId: string, type: TransitionType, duration?: number) => void;
  removeClipTransition: (transitionId: string) => void;
  updateProjectSettings: (updates: Partial<ProjectSettings>) => void;
  moveClip: (clipId: string, newStart: number) => void;
  commitMoveClip: (clipId: string, prevStart: number, newStart: number) => void;
  moveClipToTrack: (clipId: string, targetTrackId: string, newStart: number) => void;
  autoAlignClipDrop: (clipId: string, targetTrackId: string, proposedStart: number, enableAutoAlign?: boolean) => void;
  autoPackTrack: (trackId?: string, gapSeconds?: number) => void;
  alignClipInCanvas: (clipId: string, alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom', canvasW: number, canvasH: number) => void;
  autoArrangeCanvasLayers: (canvasW: number, canvasH: number, padding?: number, gap?: number) => void;
  moveSelectedClipVertical: (direction: 'up' | 'down') => void;
  nudgeClip: (clipId: string, deltaSeconds: number) => void;
  trimClip: (clipId: string, newStart: number, newEnd: number) => void;
  trimClipTimeline: (clipId: string, newTimelineStart: number, newDuration: number, newSourceStart: number, newSourceEnd: number) => void;
  commitTrimClip: (
    clipId: string,
    prevTimelineStart: number,
    prevDuration: number,
    prevSourceStart: number,
    prevSourceEnd: number,
    newTimelineStart: number,
    newDuration: number,
    newSourceStart: number,
    newSourceEnd: number
  ) => void;
  splitClipAtPlayhead: (clipId: string) => void;
  deleteClip: (clipId: string) => void;
  
  // Clipboard Operations
  copyClip: (clipId?: string) => void;
  cutClip: (clipId?: string) => void;
  pasteClip: (targetTrackId?: string, targetTime?: number) => void;
  duplicateClip: (clipId?: string) => void;

  // Media & Presets
  addClipToTrack: (trackId: string, asset: MediaAsset) => void;
  autoAddMediaToTimeline: (asset: MediaAsset) => void;
  addTextClip: (textPreset?: string) => void;
  addRichTextClip: (template: TextStyleTemplate, options?: { timelineStart?: number; trackId?: string; x?: number; y?: number }) => void;
  addStickerClip: (sticker: StickerPresetDef, options?: { timelineStart?: number; trackId?: string; x?: number; y?: number }) => void;
  importMediaAsset: (asset: MediaAsset, rawFileBlob?: Blob) => void;
  extractAudioFromClip: (clipId: string) => void;
  
  // Track operations & Auto-generation
  addTrack: (type: TrackType, name?: string, position?: 'top' | 'bottom') => string;
  deleteTrack: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackVisibility: (trackId: string) => void;

  // AI & Skills
  applySkill: (skillId: string) => void;
  
  // History (Whole-Editor Snapshot Stack & Pointer Transactions)
  undo: () => void;
  redo: () => void;
  beginHistoryTransaction: (label?: string) => void;
  endHistoryTransaction: () => void;

  // Smart Cut Framing & Workspace Sync
  activeMonitorTab: 'video' | 'framer';
  framerSettings: FramerSettings;
  setActiveMonitorTab: (tab: 'video' | 'framer') => void;
  updateFramerSettings: (updates: Partial<FramerSettings>, options?: { skipHistory?: boolean; coalesceKey?: string }) => void;
  updateFramerBox: (boxId: 'top' | 'bottom', updates: Partial<FramerBox>, options?: { skipHistory?: boolean; coalesceKey?: string }) => void;
  applyFramerToTimeline: () => void;
  sendClipperToEditor: () => Promise<void>;
  saveNow: () => Promise<void>;
}

const EditorContext = createContext<EditorContextType | null>(null);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const {
    activeProject,
    saveProjectSnapshot,
    cacheAssetForActiveProject,
    switchActiveProjectMode,
    settings: appSettings,
  } = useWorkspace();

  const initialProj = activeProject || INITIAL_PROJECT;

  const [project, setProject] = useState<EditorProject>(initialProj);
  const [currentTime, setCurrentTime] = useState<number>(initialProj.lastPlayheadTime || 0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>('track-v1');
  const [clipboardClip, setClipboardClip] = useState<TimelineClip | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTabId>('media');
  const [snapping, setSnapping] = useState<boolean>(true);
  const [activeMonitorTab, setActiveMonitorTab] = useState<'video' | 'framer'>(
    initialProj.mode === 'clipping' ? 'framer' : 'video'
  );
  const [framerSettings, setFramerSettings] = useState<FramerSettings>(
    initialProj.framerSettings || DEFAULT_FRAMER_SETTINGS
  );

  // Derive aspectRatio directly from project settings so Undo/Redo always stays in sync
  const aspectRatio: AspectRatio = project.settings?.aspectRatio || '16:9';

  // Sync refs for non-stale reads, snapshot history transactions & auto-save
  const projectRef = useRef(project);
  const framerSettingsRef = useRef(framerSettings);
  const currentTimeRef = useRef(currentTime);
  const selectedClipIdRef = useRef(selectedClipId);

  useEffect(() => {
    projectRef.current = project;
    framerSettingsRef.current = framerSettings;
    currentTimeRef.current = currentTime;
    selectedClipIdRef.current = selectedClipId;
  }, [project, framerSettings, currentTime, selectedClipId]);

  // Persist current project JSON snapshot (with cache + adjustments + framerSettings + playhead)
  const buildSnapshot = useCallback((): EditorProject => {
    return {
      ...projectRef.current,
      framerSettings: framerSettingsRef.current,
      lastPlayheadTime: Number(currentTimeRef.current.toFixed(2)),
    };
  }, []);

  const saveNow = useCallback(async () => {
    await saveProjectSnapshot(buildSnapshot());
  }, [buildSnapshot, saveProjectSnapshot]);

  // Debounced auto-save whenever project or framerSettings changes
  const isFirstMountRef = useRef(true);
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      saveProjectSnapshot({
        ...projectRef.current,
        framerSettings: framerSettingsRef.current,
        lastPlayheadTime: Number(currentTimeRef.current.toFixed(2)),
      });
    }, appSettings.autoSaveIntervalMs || 900);

    return () => clearTimeout(timer);
  }, [project, framerSettings, appSettings.autoSaveIntervalMs, saveProjectSnapshot]);

  // Flush final snapshot cleanly on unmount so leaving workspace never drops last edit
  useEffect(() => {
    return () => {
      saveProjectSnapshot({
        ...projectRef.current,
        framerSettings: framerSettingsRef.current,
        lastPlayheadTime: Number(currentTimeRef.current.toFixed(2)),
      });
    };
  }, [saveProjectSnapshot]);

  // Unified Whole-Editor Snapshot History Manager
  const historyRef = useRef<SnapshotHistoryManager>(new SnapshotHistoryManager(60));
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);

  useEffect(() => {
    return historyRef.current.subscribe(() => {
      setCanUndo(historyRef.current.canUndo());
      setCanRedo(historyRef.current.canRedo());
    });
  }, []);

  const getEditorSnapshot = useCallback((): EditorSnapshot => ({
    project: projectRef.current,
    framerSettings: framerSettingsRef.current,
    selectedClipId: selectedClipIdRef.current,
  }), []);

  const applyRestoredSnapshot = useCallback((snap: EditorSnapshot) => {
    // Keep live blob URLs and newly written cachedFilePaths synced across Undo/Redo
    const liveMediaById = new Map(projectRef.current.mediaLibrary.map((a) => [a.id, a]));
    const mergedMedia = snap.project.mediaLibrary.map((a) => {
      const live = liveMediaById.get(a.id);
      return live
        ? {
            ...a,
            url: live.url || a.url,
            cachedFilePath: live.cachedFilePath || a.cachedFilePath,
            thumbnailUrl: live.thumbnailUrl || a.thumbnailUrl,
            mimeType: live.mimeType || a.mimeType,
          }
        : a;
    });
    for (const liveAsset of projectRef.current.mediaLibrary) {
      if (!mergedMedia.some((a) => a.id === liveAsset.id)) {
        mergedMedia.push(liveAsset);
      }
    }

    const restoredProject: EditorProject = {
      ...snap.project,
      mediaLibrary: mergedMedia,
    };

    projectRef.current = restoredProject;
    framerSettingsRef.current = snap.framerSettings;
    selectedClipIdRef.current = snap.selectedClipId;

    setProject(restoredProject);
    setFramerSettings(snap.framerSettings);
    setSelectedClipId(snap.selectedClipId);
  }, []);

  const commitProjectEdit = useCallback((
    updater: (prev: EditorProject) => EditorProject,
    options?: { label?: string; skipHistory?: boolean; coalesceKey?: string; selectClipId?: string | null }
  ) => {
    const beforeSnap = getEditorSnapshot();
    const nextProj = updater(projectRef.current);
    if (nextProj === projectRef.current && options?.selectClipId === undefined) return;

    projectRef.current = nextProj;
    const nextSel = options?.selectClipId !== undefined ? options.selectClipId : selectedClipIdRef.current;
    if (options?.selectClipId !== undefined) {
      selectedClipIdRef.current = nextSel;
      setSelectedClipId(nextSel);
    }
    setProject(nextProj);

    const afterSnap: EditorSnapshot = {
      project: nextProj,
      framerSettings: framerSettingsRef.current,
      selectedClipId: nextSel,
    };
    historyRef.current.record(beforeSnap, afterSnap, options);
  }, [getEditorSnapshot]);

  const commitFramerEdit = useCallback((
    updater: (prev: FramerSettings) => FramerSettings,
    options?: { label?: string; skipHistory?: boolean; coalesceKey?: string }
  ) => {
    const beforeSnap = getEditorSnapshot();
    const nextFramer = updater(framerSettingsRef.current);
    if (nextFramer === framerSettingsRef.current) return;

    framerSettingsRef.current = nextFramer;
    setFramerSettings(nextFramer);

    const afterSnap: EditorSnapshot = {
      project: projectRef.current,
      framerSettings: nextFramer,
      selectedClipId: selectedClipIdRef.current,
    };
    historyRef.current.record(beforeSnap, afterSnap, options);
  }, [getEditorSnapshot]);

  const beginHistoryTransaction = useCallback((label?: string) => {
    historyRef.current.beginTransaction(getEditorSnapshot(), label);
  }, [getEditorSnapshot]);

  const endHistoryTransaction = useCallback(() => {
    historyRef.current.endTransaction(getEditorSnapshot());
  }, [getEditorSnapshot]);

  // Playback timer loop: strictly stops when the last existing clip ends
  useEffect(() => {
    let animFrame: number;
    let lastTimestamp: number | null = null;

    const loop = (timestamp: number) => {
      if (!lastTimestamp) lastTimestamp = timestamp;
      const deltaSec = ((timestamp - lastTimestamp) / 1000) * playbackRate;
      lastTimestamp = timestamp;

      setCurrentTime(prevTime => {
        const nextTime = prevTime + deltaSec;
        const currentProject = projectRef.current;
        const allClips = currentProject.timeline.tracks.flatMap(t => t.clips);
        const maxClipEndTime = allClips.length > 0
          ? Math.max(...allClips.map(c => c.timelineStart + c.duration))
          : currentProject.timeline.duration;

        // Stop right at the exact end of the last existing clip on the timeline
        if (allClips.length > 0 && nextTime >= maxClipEndTime) {
          setIsPlaying(false);
          return maxClipEndTime;
        }

        if (nextTime >= currentProject.timeline.duration) {
          setIsPlaying(false);
          return 0;
        }
        return nextTime;
      });

      if (isPlaying) {
        animFrame = requestAnimationFrame(loop);
      }
    };

    if (isPlaying) {
      animFrame = requestAnimationFrame(loop);
    }

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
    };
  }, [isPlaying, playbackRate]);

  const togglePlay = useCallback(() => {
    setIsPlaying(prev => {
      if (!prev) {
        // If playhead is at or past the last clip end, rewind to beginning on play
        const currentProject = projectRef.current;
        const allClips = currentProject.timeline.tracks.flatMap(t => t.clips);
        const maxClipEndTime = allClips.length > 0
          ? Math.max(...allClips.map(c => c.timelineStart + c.duration))
          : currentProject.timeline.duration;

        setCurrentTime(t => {
          if (t >= maxClipEndTime - 0.05) {
            return 0;
          }
          return t;
        });
      }
      return !prev;
    });
  }, []);

  const pausePlayback = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const seek = useCallback((time: number) => {
    const allClips = projectRef.current.timeline.tracks.flatMap(t => t.clips);
    const maxClipEndTime = allClips.length > 0
      ? Math.max(...allClips.map(c => c.timelineStart + c.duration))
      : 0;
    const effectiveDur = Math.max(projectRef.current.timeline.duration, maxClipEndTime);
    const clamped = Math.max(0, Math.min(time, effectiveDur));
    setCurrentTime(clamped);
  }, []);

  const setZoom = useCallback((zoom: number) => {
    setZoomLevel(Math.max(0.2, Math.min(zoom, 12.0)));
  }, []);

  const zoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(12.0, Number((prev * 1.3).toFixed(2))));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(0.2, Number((prev / 1.3).toFixed(2))));
  }, []);

  const zoomFit = useCallback(() => {
    setZoomLevel(1.0);
  }, []);

  const setAspectRatio = useCallback((ratio: AspectRatio) => {
    commitProjectEdit(prev => {
      let width = 1920;
      let height = 1080;
      if (ratio === '9:16') {
        width = 1080;
        height = 1920;
      } else if (ratio === '1:1') {
        width = 1080;
        height = 1080;
      } else if (ratio === '4:5') {
        width = 1080;
        height = 1350;
      }
      return {
        ...prev,
        settings: {
          ...prev.settings,
          aspectRatio: ratio,
          width,
          height
        }
      };
    }, { label: `Change aspect ratio to ${ratio}` });
  }, [commitProjectEdit]);

  // Selected Clip Finder (reads live ref to avoid stale closures across multi-step updates)
  const findClipById = useCallback((id: string | null): TimelineClip | null => {
    if (!id) return null;
    for (const track of projectRef.current.timeline.tracks) {
      const match = track.clips.find(c => c.id === id);
      if (match) return match;
    }
    return null;
  }, []);

  const selectedClip = findClipById(selectedClipId);

  const selectClip = useCallback((clipId: string | null) => {
    selectedClipIdRef.current = clipId;
    setSelectedClipId(clipId);
    if (clipId) {
      for (const track of projectRef.current.timeline.tracks) {
        if (track.clips.some(c => c.id === clipId)) {
          setSelectedTrackId(track.id);
          break;
        }
      }
    }
  }, []);

  // Update Clip (wrapped in unified whole-editor snapshot history)
  const updateClip = useCallback((
    clipId: string,
    updates: Partial<TimelineClip>,
    options?: { skipHistory?: boolean; coalesceKey?: string }
  ) => {
    commitProjectEdit(prev => {
      const newTracks = prev.timeline.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip => (clip.id === clipId ? { ...clip, ...updates } : clip)),
      }));
      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          tracks: newTracks,
        },
      };
    }, { label: 'Update clip', ...options });
  }, [commitProjectEdit]);

  const updateClipTransform = useCallback((
    clipId: string,
    transformUpdates: Partial<Transform>,
    options?: { skipHistory?: boolean; coalesceKey?: string }
  ) => {
    commitProjectEdit(prev => {
      const newTracks = prev.timeline.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip => {
          if (clip.id !== clipId) return clip;
          return {
            ...clip,
            transform: {
              ...clip.transform,
              ...transformUpdates,
            },
          };
        }),
      }));
      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          tracks: newTracks,
        },
      };
    }, {
      label: 'Transform clip',
      coalesceKey: options?.skipHistory ? undefined : (options?.coalesceKey ?? `transform:${clipId}`),
      ...options,
    });
  }, [commitProjectEdit]);

  const updateClipEffect = useCallback((clipId: string, effectTypeOrId: string, value: number) => {
    commitProjectEdit(prev => {
      const newTracks = prev.timeline.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip => {
          if (clip.id !== clipId) return clip;
          const existingIdx = clip.effects.findIndex(
            eff => eff.id === effectTypeOrId || eff.type === effectTypeOrId
          );
          let newEffects: Effect[];
          if (existingIdx >= 0) {
            newEffects = clip.effects.map((eff, idx) =>
              idx === existingIdx ? { ...eff, value, enabled: true } : eff
            );
          } else {
            newEffects = [
              ...clip.effects,
              {
                id: `eff-${effectTypeOrId}-${Date.now()}`,
                type: effectTypeOrId as EffectType,
                name: effectTypeOrId.charAt(0).toUpperCase() + effectTypeOrId.slice(1),
                value,
                enabled: true,
              },
            ];
          }
          return { ...clip, effects: newEffects };
        }),
      }));
      return {
        ...prev,
        timeline: { ...prev.timeline, tracks: newTracks },
      };
    }, { label: `Adjust ${effectTypeOrId}`, coalesceKey: `effect:${clipId}:${effectTypeOrId}` });
  }, [commitProjectEdit]);

  const batchUpdateClipEffects = useCallback((clipId: string, effectsMap: Partial<Record<EffectType, number>>) => {
    commitProjectEdit(prev => {
      const newTracks = prev.timeline.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip => {
          if (clip.id !== clipId) return clip;
          const updatedEffects = [...clip.effects];
          for (const [key, val] of Object.entries(effectsMap)) {
            if (val === undefined) continue;
            const typeKey = key as EffectType;
            const idx = updatedEffects.findIndex(e => e.type === typeKey || e.id === typeKey);
            if (idx >= 0) {
              updatedEffects[idx] = { ...updatedEffects[idx]!, value: val, enabled: true };
            } else {
              updatedEffects.push({
                id: `eff-${typeKey}-${Date.now()}`,
                type: typeKey,
                name: typeKey.charAt(0).toUpperCase() + typeKey.slice(1),
                value: val,
                enabled: true,
              });
            }
          }
          return { ...clip, effects: updatedEffects };
        }),
      }));
      return { ...prev, timeline: { ...prev.timeline, tracks: newTracks } };
    }, { label: 'Apply color preset' });
  }, [commitProjectEdit]);

  const updateProjectSettings = useCallback((updates: Partial<ProjectSettings>) => {
    commitProjectEdit(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...updates,
      },
    }), { label: 'Adjust master grade / blur', coalesceKey: 'project-settings' });
  }, [commitProjectEdit]);

  const applyClipFilterPreset = useCallback((clipId: string, lutId: string) => {
    commitProjectEdit(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        tracks: prev.timeline.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => (c.id === clipId ? { ...c, lutId: lutId === 'none' ? undefined : lutId } : c)),
        })),
      },
    }), { label: `Apply filter ${lutId}` });
  }, [commitProjectEdit]);

  const updateClipMask = useCallback((
    clipId: string,
    updates: Partial<MaskConfig>,
    options?: { skipHistory?: boolean; coalesceKey?: string }
  ) => {
    commitProjectEdit(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        tracks: prev.timeline.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => {
            if (c.id !== clipId) return c;
            const currentMask = c.mask || DEFAULT_MASK_CONFIG;
            return { ...c, mask: { ...currentMask, ...updates } };
          }),
        })),
      },
    }), {
      label: 'Adjust mask',
      coalesceKey: options?.skipHistory ? undefined : (options?.coalesceKey ?? `mask:${clipId}`),
      ...options,
    });
  }, [commitProjectEdit]);

  const updateClipAnimation = useCallback((
    clipId: string,
    dir: 'in' | 'out' | 'middle',
    slot: AnimationSlot | undefined
  ) => {
    commitProjectEdit(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        tracks: prev.timeline.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => {
            if (c.id !== clipId) return c;
            return {
              ...c,
              animations: {
                ...(c.animations || {}),
                [dir]: slot && slot.presetId !== 'none' ? slot : undefined,
              },
            };
          }),
        })),
      },
    }), { label: `Set ${dir} animation`, coalesceKey: `anim:${clipId}:${dir}` });
  }, [commitProjectEdit]);

  const updateClipSpeedCurve = useCallback((clipId: string, curve: SpeedCurveConfig) => {
    const mult = getCurveDurationMultiplier(curve);
    commitProjectEdit(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        tracks: prev.timeline.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => {
            if (c.id !== clipId) return c;
            const sourceSpan = Math.max(0.2, (c.sourceEnd ?? c.duration) - (c.sourceStart ?? 0));
            const nextDuration = Math.max(0.2, Number((sourceSpan * mult).toFixed(3)));
            return {
              ...c,
              speedCurve: curve,
              duration: nextDuration,
            };
          }),
        })),
      },
    }), { label: 'Adjust velocity curve', coalesceKey: `speed:${clipId}` });
  }, [commitProjectEdit]);

  const toggleClipLayerEffect = useCallback((clipId: string, effectId: string) => {
    commitProjectEdit(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        tracks: prev.timeline.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => {
            if (c.id !== clipId) return c;
            const current = c.layerEffects || [];
            const exists = current.includes(effectId);
            return {
              ...c,
              layerEffects: exists ? current.filter(e => e !== effectId) : [...current, effectId],
            };
          }),
        })),
      },
    }), { label: `Toggle effect ${effectId}` });
  }, [commitProjectEdit]);

  const setClipTransition = useCallback((
    trackId: string,
    fromClipId: string,
    toClipId: string,
    type: TransitionType,
    duration: number = 0.5
  ) => {
    commitProjectEdit(prev => {
      const existing = prev.timeline.transitions || [];
      const filtered = existing.filter(
        tr => !(tr.trackId === trackId && tr.fromClipId === fromClipId && tr.toClipId === toClipId)
      );
      const nextEdge: TransitionEdge = {
        id: `tr-${fromClipId}-${toClipId}`,
        trackId,
        fromClipId,
        toClipId,
        type,
        duration,
      };
      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          transitions: [...filtered, nextEdge],
        },
      };
    }, { label: `Set ${type} transition`, coalesceKey: `tr:${fromClipId}:${toClipId}` });
  }, [commitProjectEdit]);

  const removeClipTransition = useCallback((transitionId: string) => {
    commitProjectEdit(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        transitions: (prev.timeline.transitions || []).filter(tr => tr.id !== transitionId),
      },
    }), { label: 'Remove transition' });
  }, [commitProjectEdit]);

  // Move Clip smoothly during drag (Main Video track V1 enforces magnetic gap-free reordering)
  const moveClip = useCallback((clipId: string, newStart: number) => {
    commitProjectEdit(prev => {
      const targetTrack = prev.timeline.tracks.find(t => t.clips.some(c => c.id === clipId));
      if (!targetTrack) return prev;

      const updatedTracks = prev.timeline.tracks.map(t => {
        if (t.id !== targetTrack.id) return t;
        if (t.id === MAIN_VIDEO_TRACK_ID) {
          return { ...t, clips: moveClipMagnetically(t.clips, clipId, newStart) };
        }
        return {
          ...t,
          clips: t.clips.map(c => (c.id === clipId ? { ...c, timelineStart: Math.max(0, newStart) } : c)),
        };
      });

      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          duration: computeElasticTimelineDuration(updatedTracks, prev.timeline.duration),
          tracks: updatedTracks,
        },
      };
    }, { skipHistory: true });
  }, [commitProjectEdit]);

  // Commit Move Clip to Undo History on Mouse Up
  const commitMoveClip = useCallback((clipId: string, prevStart: number, newStart: number) => {
    if (historyRef.current.isInTransaction()) {
      endHistoryTransaction();
      return;
    }
    if (Math.abs(newStart - prevStart) <= 0.005) return;

    const afterSnap = getEditorSnapshot();
    const beforeSnap: EditorSnapshot = {
      ...afterSnap,
      project: {
        ...afterSnap.project,
        timeline: {
          ...afterSnap.project.timeline,
          tracks: afterSnap.project.timeline.tracks.map(t => ({
            ...t,
            clips: t.clips.map(c => (c.id === clipId ? { ...c, timelineStart: prevStart } : c)),
          })),
        },
      },
    };
    historyRef.current.record(beforeSnap, afterSnap, { label: `Move clip to ${newStart.toFixed(1)}s` });
  }, [endHistoryTransaction, getEditorSnapshot]);

  // Nudge clip left or right
  const nudgeClip = useCallback((clipId: string, deltaSeconds: number) => {
    commitProjectEdit(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        tracks: prev.timeline.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c =>
            c.id === clipId ? { ...c, timelineStart: Math.max(0, c.timelineStart + deltaSeconds) } : c
          ),
        })),
      },
    }), { label: 'Nudge clip', coalesceKey: `nudge:${clipId}` });
  }, [commitProjectEdit]);

  // Trim Clip with Undo support
  const trimClip = useCallback((clipId: string, newStart: number, newEnd: number) => {
    commitProjectEdit(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        tracks: prev.timeline.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c =>
            c.id === clipId ? { ...c, sourceStart: newStart, sourceEnd: newEnd, duration: newEnd - newStart } : c
          ),
        })),
      },
    }), { label: 'Trim clip' });
  }, [commitProjectEdit]);

  // Trim Clip in real-time during drag without polluting history
  const trimClipTimeline = useCallback((clipId: string, newTimelineStart: number, newDuration: number, newSourceStart: number, newSourceEnd: number) => {
    commitProjectEdit(prev => {
      const rawTracks = prev.timeline.tracks.map(track => ({
        ...track,
        clips: track.clips.map(clip =>
          clip.id === clipId
            ? {
                ...clip,
                timelineStart: Math.max(0, newTimelineStart),
                duration: Math.max(0.2, newDuration),
                sourceStart: Math.max(0, newSourceStart),
                sourceEnd: Math.max(newSourceStart + 0.2, newSourceEnd),
              }
            : clip
        ),
      }));
      const finalTracks = enforceMainTrackMagnetism(rawTracks);
      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          duration: computeElasticTimelineDuration(finalTracks, prev.timeline.duration),
          tracks: finalTracks,
        },
      };
    }, { skipHistory: true });
  }, [commitProjectEdit]);

  // Commit Trim to History on Mouse Up
  const commitTrimClip = useCallback((
    clipId: string,
    prevTimelineStart: number,
    prevDuration: number,
    prevSourceStart: number,
    prevSourceEnd: number,
    newTimelineStart: number,
    newDuration: number,
    newSourceStart: number,
    newSourceEnd: number
  ) => {
    if (historyRef.current.isInTransaction()) {
      endHistoryTransaction();
      return;
    }
    if (
      Math.abs(newTimelineStart - prevTimelineStart) <= 0.01 &&
      Math.abs(newDuration - prevDuration) <= 0.01 &&
      Math.abs(newSourceStart - prevSourceStart) <= 0.01 &&
      Math.abs(newSourceEnd - prevSourceEnd) <= 0.01
    ) {
      return;
    }

    const afterSnap = getEditorSnapshot();
    const beforeSnap: EditorSnapshot = {
      ...afterSnap,
      project: {
        ...afterSnap.project,
        timeline: {
          ...afterSnap.project.timeline,
          tracks: afterSnap.project.timeline.tracks.map(t => ({
            ...t,
            clips: t.clips.map(c =>
              c.id === clipId
                ? {
                    ...c,
                    timelineStart: prevTimelineStart,
                    duration: prevDuration,
                    sourceStart: prevSourceStart,
                    sourceEnd: prevSourceEnd,
                  }
                : c
            ),
          })),
        },
      },
    };
    historyRef.current.record(beforeSnap, afterSnap, { label: 'Trim clip in/out points' });
  }, [endHistoryTransaction, getEditorSnapshot]);

  // Add Dynamic Track
  const addTrack = useCallback((type: TrackType, name?: string, position: 'top' | 'bottom' = 'bottom'): string => {
    let newTrackId = '';
    commitProjectEdit(prev => {
      const sameTypeTracks = prev.timeline.tracks.filter(t => t.type === type);
      const nextNum = sameTypeTracks.length + 1;
      const defaultName = type === 'video' ? `Video ${nextNum}` : type === 'audio' ? `Audio ${nextNum}` : `Text ${nextNum}`;
      newTrackId = `track-${type[0]}${Date.now().toString().slice(-4)}`;

      const newTrack: Track = {
        id: newTrackId,
        name: name || defaultName,
        type,
        muted: false,
        locked: false,
        visible: true,
        clips: []
      };

      const newTracks = position === 'top'
        ? [newTrack, ...prev.timeline.tracks]
        : [...prev.timeline.tracks, newTrack];

      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          tracks: newTracks
        }
      };
    }, { label: 'Add track' });
    return newTrackId;
  }, [commitProjectEdit]);

  const deleteTrack = useCallback((trackId: string) => {
    commitProjectEdit(prev => {
      if (prev.timeline.tracks.length <= 1) return prev; // Keep at least one track
      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          tracks: prev.timeline.tracks.filter(t => t.id !== trackId)
        }
      };
    }, { label: 'Delete track' });
  }, [commitProjectEdit]);

  // Move clip across tracks or to a new position
  const moveClipToTrack = useCallback((clipId: string, targetTrackId: string, newStart: number) => {
    commitProjectEdit(prev => {
      let movingClip: TimelineClip | null = null;
      const strippedTracks = prev.timeline.tracks.map(t => {
        const found = t.clips.find(c => c.id === clipId);
        if (found) {
          movingClip = { ...found, trackId: targetTrackId, timelineStart: Math.max(0, newStart) };
          return { ...t, clips: t.clips.filter(c => c.id !== clipId) };
        }
        return t;
      });

      if (!movingClip) return prev;
      const clipToPlace: TimelineClip = movingClip;

      const trackExists = strippedTracks.some(t => t.id === targetTrackId);
      let finalTracks = strippedTracks;

      if (!trackExists) {
        const isAudio = clipToPlace.type === 'audio';
        const newTrack: Track = {
          id: targetTrackId,
          name: isAudio ? `Audio ${strippedTracks.filter(t => t.type === 'audio').length + 1}` : `Video ${strippedTracks.filter(t => t.type === 'video').length + 1}`,
          type: isAudio ? 'audio' : 'video',
          muted: false,
          locked: false,
          visible: true,
          clips: [clipToPlace]
        };
        finalTracks = [...strippedTracks, newTrack];
      } else {
        finalTracks = strippedTracks.map(t => {
          if (t.id === targetTrackId) {
            return { ...t, clips: [...t.clips, clipToPlace] };
          }
          return t;
        });
      }

      const magnetizedTracks = enforceMainTrackMagnetism(finalTracks);
      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          duration: computeElasticTimelineDuration(magnetizedTracks, prev.timeline.duration),
          tracks: magnetizedTracks,
        }
      };
    }, { label: 'Move clip to track' });
  }, [commitProjectEdit]);

  // Auto-align dropped clip cleanly into track media slots (colliding/magnetic flush alignment)
  const autoAlignClipDrop = useCallback((
    clipId: string,
    targetTrackId: string,
    proposedStart: number,
    enableAutoAlign: boolean = true
  ) => {
    commitProjectEdit(prev => {
      let movingClip: TimelineClip | null = null;
      const strippedTracks = prev.timeline.tracks.map(t => {
        const found = t.clips.find(c => c.id === clipId);
        if (found) {
          movingClip = { ...found, trackId: targetTrackId, timelineStart: Math.max(0, proposedStart) };
          return { ...t, clips: t.clips.filter(c => c.id !== clipId) };
        }
        return t;
      });
      if (!movingClip) return prev;
      const clipToPlace: TimelineClip = movingClip;

      const finalTracks = strippedTracks.map(t => {
        if (t.id !== targetTrackId) return t;
        if (t.id === MAIN_VIDEO_TRACK_ID) {
          return {
            ...t,
            clips: moveClipMagnetically([...t.clips, clipToPlace], clipToPlace.id, proposedStart),
          };
        }
        if (!enableAutoAlign) {
          return { ...t, clips: [...t.clips, clipToPlace] };
        }
        const { start, shiftedClips } = autoAlignClipIntoTrack(
          t.clips,
          clipToPlace.id,
          proposedStart,
          clipToPlace.duration
        );
        const shiftMap = new Map(shiftedClips.map(s => [s.id, s.timelineStart]));
        const updatedExisting = t.clips.map(c =>
          shiftMap.has(c.id) ? { ...c, timelineStart: shiftMap.get(c.id)! } : c
        );
        const alignedClip = { ...clipToPlace, timelineStart: start };
        return {
          ...t,
          clips: [...updatedExisting, alignedClip].sort((a, b) => a.timelineStart - b.timelineStart),
        };
      });

      const magnetizedTracks = enforceMainTrackMagnetism(finalTracks);
      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          duration: computeElasticTimelineDuration(magnetizedTracks, prev.timeline.duration),
          tracks: magnetizedTracks,
        },
      };
    }, { label: 'Auto-align timeline drop' });
  }, [commitProjectEdit]);

  // Auto-pack all clips on selected/target track end-to-end with consistent spacing (default 0s)
  const autoPackTrack = useCallback((trackId?: string, gapSeconds: number = 0) => {
    const targetId = trackId || selectedTrackId || 'track-v1';
    commitProjectEdit(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        tracks: prev.timeline.tracks.map(t =>
          t.id === targetId ? { ...t, clips: packTrackMediaSequentially(t.clips, gapSeconds) } : t
        ),
      },
    }), { label: 'Pack track clips' });
  }, [selectedTrackId, commitProjectEdit]);

  // Explicit Canvas Auto-Layout Alignment for individual element
  const alignClipInCanvas = useCallback((
    clipId: string,
    alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom',
    canvasW: number,
    canvasH: number
  ) => {
    const clip = findClipById(clipId);
    if (!clip) return;
    const updates = alignTransformToCanvas(clip.transform, canvasW, canvasH, alignment);
    updateClipTransform(clipId, updates, { coalesceKey: undefined });
  }, [findClipById, updateClipTransform]);

  // Explicit Canvas Auto-Layout Container Distribution across active layers (atomic single undo step!)
  const autoArrangeCanvasLayers = useCallback((
    canvasW: number,
    canvasH: number,
    padding: number = 16,
    gap: number = 12
  ) => {
    const t = currentTimeRef.current;
    const activeClips = projectRef.current.timeline.tracks
      .filter(tr => tr.type === 'video' && tr.visible)
      .flatMap(tr => tr.clips)
      .filter(c => t >= c.timelineStart && t <= c.timelineStart + c.duration);

    const arranged = computeAutoLayoutTransforms(activeClips, canvasW, canvasH, padding, gap);
    if (arranged.length === 0) return;

    const transformById = new Map(arranged.map(item => [item.clipId, item.transform]));
    commitProjectEdit(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        tracks: prev.timeline.tracks.map(tr => ({
          ...tr,
          clips: tr.clips.map(c => {
            const tx = transformById.get(c.id);
            return tx ? { ...c, transform: { ...c.transform, ...tx } } : c;
          }),
        })),
      },
    }), { label: 'Auto-layout video layers' });
  }, [commitProjectEdit]);

  // Move selected clip up or down between tracks (Auto-generating new track if at edge!)
  const moveSelectedClipVertical = useCallback((direction: 'up' | 'down') => {
    if (!selectedClipId) return;

    commitProjectEdit(prev => {
      const tracks = prev.timeline.tracks;
      let currentTrackIndex = -1;
      let foundClip: TimelineClip | null = null;

      for (let i = 0; i < tracks.length; i++) {
        const currentT = tracks[i];
        if (!currentT) continue;
        const found = currentT.clips.find(c => c.id === selectedClipId);
        if (found) {
          currentTrackIndex = i;
          foundClip = found;
          break;
        }
      }

      if (!foundClip || currentTrackIndex === -1) return prev;
      const clipToMove: TimelineClip = foundClip;

      if (direction === 'up') {
        if (currentTrackIndex > 0) {
          const targetTrack = tracks[currentTrackIndex - 1];
          if (!targetTrack) return prev;

          const newTracks = tracks.map((t, idx) => {
            if (idx === currentTrackIndex) {
              return { ...t, clips: t.clips.filter(c => c.id !== selectedClipId) };
            }
            if (idx === currentTrackIndex - 1) {
              return { ...t, clips: [...t.clips, { ...clipToMove, trackId: targetTrack.id }] };
            }
            return t;
          });
          return { ...prev, timeline: { ...prev.timeline, tracks: newTracks } };
        } else {
          const newType: TrackType = clipToMove.type === 'audio' ? 'audio' : 'video';
          const newTrackId = `track-${newType[0]}${Date.now().toString().slice(-4)}`;
          const newTrack: Track = {
            id: newTrackId,
            name: `${newType === 'video' ? 'Video' : 'Audio'} ${tracks.filter(t => t.type === newType).length + 1}`,
            type: newType,
            muted: false,
            locked: false,
            visible: true,
            clips: [{ ...clipToMove, trackId: newTrackId }]
          };

          const newTracks = [
            newTrack,
            ...tracks.map((t, idx) => 
              idx === currentTrackIndex 
                ? { ...t, clips: t.clips.filter(c => c.id !== selectedClipId) } 
                : t
            )
          ];
          return { ...prev, timeline: { ...prev.timeline, tracks: newTracks } };
        }
      } else {
        if (currentTrackIndex < tracks.length - 1) {
          const targetTrack = tracks[currentTrackIndex + 1];
          if (!targetTrack) return prev;

          const newTracks = tracks.map((t, idx) => {
            if (idx === currentTrackIndex) {
              return { ...t, clips: t.clips.filter(c => c.id !== selectedClipId) };
            }
            if (idx === currentTrackIndex + 1) {
              return { ...t, clips: [...t.clips, { ...clipToMove, trackId: targetTrack.id }] };
            }
            return t;
          });
          return { ...prev, timeline: { ...prev.timeline, tracks: newTracks } };
        } else {
          const newType: TrackType = clipToMove.type === 'audio' ? 'audio' : 'video';
          const newTrackId = `track-${newType[0]}${Date.now().toString().slice(-4)}`;
          const newTrack: Track = {
            id: newTrackId,
            name: `${newType === 'video' ? 'Video' : 'Audio'} ${tracks.filter(t => t.type === newType).length + 1}`,
            type: newType,
            muted: false,
            locked: false,
            visible: true,
            clips: [{ ...clipToMove, trackId: newTrackId }]
          };

          const newTracks = [
            ...tracks.map((t, idx) => 
              idx === currentTrackIndex 
                ? { ...t, clips: t.clips.filter(c => c.id !== selectedClipId) } 
                : t
            ),
            newTrack
          ];
          return { ...prev, timeline: { ...prev.timeline, tracks: newTracks } };
        }
      }
    }, { label: `Move clip ${direction}` });
  }, [selectedClipId, commitProjectEdit]);

  // Import external media asset and persist binary into D:\Editor\cache\media
  const importMediaAsset = useCallback((asset: MediaAsset, rawFileBlob?: Blob) => {
    const nextProj: EditorProject = {
      ...projectRef.current,
      thumbnailUrl: projectRef.current.thumbnailUrl || asset.thumbnailUrl,
      mediaLibrary: [asset, ...projectRef.current.mediaLibrary],
    };
    projectRef.current = nextProj;
    setProject(nextProj);

    if (rawFileBlob) {
      cacheAssetForActiveProject(asset.id, asset.name, rawFileBlob).then((cachedPath) => {
        if (cachedPath) {
          const updated: EditorProject = {
            ...projectRef.current,
            mediaLibrary: projectRef.current.mediaLibrary.map(a =>
              a.id === asset.id ? { ...a, cachedFilePath: cachedPath, mimeType: rawFileBlob.type } : a
            ),
          };
          projectRef.current = updated;
          setProject(updated);
        }
      });
    }
  }, [cacheAssetForActiveProject]);

  // Extract Audio from Video Clip
  const extractAudioFromClip = useCallback((clipId: string) => {
    const clip = findClipById(clipId);
    if (!clip || clip.type !== 'video') return;

    const newAudioId = `audio-extracted-${Date.now()}`;
    commitProjectEdit(prev => {
      let audioTrack = prev.timeline.tracks.find(t => t.type === 'audio');
      const updatedTracks = [...prev.timeline.tracks];

      if (!audioTrack) {
        audioTrack = {
          id: `track-a${Date.now().toString().slice(-4)}`,
          name: 'Audio 1',
          type: 'audio',
          muted: false,
          locked: false,
          visible: true,
          clips: []
        };
        updatedTracks.push(audioTrack);
      }

      const newAudioClip: TimelineClip = {
        id: newAudioId,
        trackId: audioTrack.id,
        assetId: clip.assetId,
        name: `VO_${clip.name.replace(/\.[^/.]+$/, '')}.mp3`,
        type: 'audio',
        timelineStart: clip.timelineStart,
        sourceStart: clip.sourceStart,
        sourceEnd: clip.sourceEnd,
        duration: clip.duration,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        effects: [],
        volume: clip.volume || 100,
        muted: false,
        fadeIn: 0.2,
        fadeOut: 0.2,
      };

      const finalTracks = updatedTracks.map(t => {
        if (t.id === clip.trackId) {
          return {
            ...t,
            clips: t.clips.map(c => c.id === clipId ? { ...c, muted: true, volume: 0 } : c)
          };
        }
        if (t.id === audioTrack!.id) {
          return { ...t, clips: [...t.clips, newAudioClip] };
        }
        return t;
      });

      const magnetizedTracks = enforceMainTrackMagnetism(finalTracks);
      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          duration: computeElasticTimelineDuration(magnetizedTracks, prev.timeline.duration),
          tracks: magnetizedTracks,
        }
      };
    }, { label: 'Extract audio', selectClipId: newAudioId });
  }, [findClipById, commitProjectEdit]);

  // Split Clip
  const splitClipAtPlayhead = useCallback((clipId: string) => {
    const clip = findClipById(clipId);
    if (!clip) return;
    if (currentTime <= clip.timelineStart || currentTime >= clip.timelineStart + clip.duration) {
      return; // playhead outside clip
    }

    const splitOffset = currentTime - clip.timelineStart;
    const sourceSplitDelta = mapTimelineToSourceOffset(clip, splitOffset);
    const firstDuration = splitOffset;
    const secondDuration = clip.duration - splitOffset;

    const firstClip: TimelineClip = {
      ...clip,
      sourceEnd: clip.sourceStart + sourceSplitDelta,
      duration: firstDuration,
      speedCurve: undefined,
    };

    const secondClip: TimelineClip = {
      ...clip,
      id: `${clip.id}-split-${Date.now()}`,
      timelineStart: currentTime,
      sourceStart: clip.sourceStart + sourceSplitDelta,
      duration: secondDuration,
      speedCurve: undefined,
    };

    commitProjectEdit(prev => {
      const newTracks = prev.timeline.tracks.map(t => {
        if (t.id === clip.trackId) {
          const newClips = t.clips.flatMap(c => c.id === clipId ? [firstClip, secondClip] : [c]);
          return { ...t, clips: newClips };
        }
        return t;
      });
      const magnetizedTracks = enforceMainTrackMagnetism(newTracks);
      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          tracks: magnetizedTracks
        }
      };
    }, { label: 'Split clip at playhead' });
  }, [findClipById, currentTime, commitProjectEdit]);

  // Delete Clip
  const deleteClip = useCallback((clipId: string) => {
    commitProjectEdit(prev => {
      const rawTracks = prev.timeline.tracks.map(t => ({
        ...t,
        clips: t.clips.filter(c => c.id !== clipId)
      }));
      const newTracks = enforceMainTrackMagnetism(rawTracks);
      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          tracks: newTracks,
          transitions: (prev.timeline.transitions || []).filter(
            tr => tr.fromClipId !== clipId && tr.toClipId !== clipId
          ),
        }
      };
    }, {
      label: 'Delete clip',
      selectClipId: selectedClipIdRef.current === clipId ? null : selectedClipIdRef.current,
    });
  }, [commitProjectEdit]);

  // Clipboard: Copy, Cut, Paste, Duplicate
  const copyClip = useCallback((clipId?: string) => {
    const targetId = clipId || selectedClipIdRef.current;
    if (!targetId) return;
    const clip = findClipById(targetId);
    if (clip) {
      setClipboardClip({ ...clip });
    }
  }, [findClipById]);

  const cutClip = useCallback((clipId?: string) => {
    const targetId = clipId || selectedClipIdRef.current;
    if (!targetId) return;
    copyClip(targetId);
    deleteClip(targetId);
  }, [copyClip, deleteClip]);

  const pasteClip = useCallback((targetTrackId?: string, targetTime?: number) => {
    if (!clipboardClip) return;

    const newClipId = `clip-pasted-${Date.now()}`;
    commitProjectEdit(prev => {
      let track = prev.timeline.tracks.find(t => t.id === (targetTrackId || selectedTrackId || clipboardClip.trackId));
      const updatedTracks = [...prev.timeline.tracks];

      if (!track) {
        const newType: TrackType = clipboardClip.type === 'audio' ? 'audio' : 'video';
        const newId = `track-${newType[0]}${Date.now().toString().slice(-4)}`;
        track = {
          id: newId,
          name: `${newType === 'video' ? 'Video' : 'Audio'} ${prev.timeline.tracks.filter(t => t.type === newType).length + 1}`,
          type: newType,
          muted: false,
          locked: false,
          visible: true,
          clips: []
        };
        updatedTracks.push(track);
      }

      const pasteTime = targetTime !== undefined ? targetTime : currentTimeRef.current;
      const newClip: TimelineClip = {
        ...clipboardClip,
        id: newClipId,
        trackId: track.id,
        timelineStart: pasteTime,
      };

      const finalTracks = updatedTracks.map(t => 
        t.id === track!.id ? { ...t, clips: [...t.clips, newClip] } : t
      );

      const totalDur = Math.max(prev.timeline.duration, newClip.timelineStart + newClip.duration + 5);

      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          duration: totalDur,
          tracks: finalTracks
        }
      };
    }, { label: 'Paste clip', selectClipId: newClipId });
  }, [clipboardClip, selectedTrackId, commitProjectEdit]);

  const duplicateClip = useCallback((clipId?: string) => {
    const targetId = clipId || selectedClipIdRef.current;
    if (!targetId) return;
    const clip = findClipById(targetId);
    if (!clip) return;

    const dupId = `clip-dup-${Date.now()}`;
    const duplicatedClip: TimelineClip = {
      ...clip,
      id: dupId,
      timelineStart: clip.timelineStart + clip.duration,
    };

    commitProjectEdit(prev => {
      const newTracks = prev.timeline.tracks.map(t => 
        t.id === clip.trackId ? { ...t, clips: [...t.clips, duplicatedClip] } : t
      );
      const totalDur = Math.max(prev.timeline.duration, duplicatedClip.timelineStart + duplicatedClip.duration + 5);
      return {
        ...prev,
        timeline: { ...prev.timeline, duration: totalDur, tracks: newTracks }
      };
    }, { label: 'Duplicate clip', selectClipId: dupId });
  }, [findClipById, commitProjectEdit]);

  // Add Clip to Track with Auto-track Generation if Track doesn't exist
  const addClipToTrack = useCallback((trackId: string, asset: MediaAsset) => {
    const newClipId = `clip-${Date.now()}`;
    commitProjectEdit(prev => {
      const targetTrack = prev.timeline.tracks.find(t => t.id === trackId);
      const updatedTracks = [...prev.timeline.tracks];

      let resolvedTrack: Track;
      if (!targetTrack) {
        const isAudio = asset.type === 'audio';
        resolvedTrack = {
          id: trackId,
          name: isAudio ? `Audio ${prev.timeline.tracks.filter(t => t.type === 'audio').length + 1}` : `Video ${prev.timeline.tracks.filter(t => t.type === 'video').length + 1}`,
          type: isAudio ? 'audio' : 'video',
          muted: false,
          locked: false,
          visible: true,
          clips: []
        };
        updatedTracks.push(resolvedTrack);
      } else {
        resolvedTrack = targetTrack;
      }

      let nextStart = 0;
      if (resolvedTrack.clips.length > 0) {
        const lastClip = resolvedTrack.clips.reduce((max, c) => 
          (c.timelineStart + c.duration > max.timelineStart + max.duration) ? c : max
        );
        nextStart = lastClip.timelineStart + lastClip.duration;
      }

      const clipDur = Math.max(0.5, asset.duration || 10);
      const newClip: TimelineClip = {
        id: newClipId,
        trackId: resolvedTrack.id,
        assetId: asset.id,
        name: asset.name,
        type: asset.type === 'video' ? 'video' : asset.type === 'audio' ? 'audio' : 'image',
        timelineStart: nextStart,
        sourceStart: 0,
        sourceEnd: clipDur,
        duration: clipDur,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        effects: [
          { id: `eff-b-${Date.now()}`, type: 'brightness', name: 'Brightness', value: 100, enabled: true },
          { id: `eff-c-${Date.now()}`, type: 'contrast', name: 'Contrast', value: 100, enabled: true },
          { id: `eff-s-${Date.now()}`, type: 'saturation', name: 'Saturation', value: 100, enabled: true },
          { id: `eff-bl-${Date.now()}`, type: 'blur', name: 'Blur', value: 0, enabled: false },
        ],
        volume: 100,
        muted: false,
        fadeIn: 0.2,
        fadeOut: 0.2
      };

      const rawTracks = updatedTracks.map(t => 
        t.id === resolvedTrack.id ? { ...t, clips: [...t.clips, newClip] } : t
      );
      const finalTracks = enforceMainTrackMagnetism(rawTracks);
      const totalDur = computeElasticTimelineDuration(finalTracks, prev.timeline.duration);

      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          duration: totalDur,
          tracks: finalTracks
        }
      };
    }, { label: `Add ${asset.name} to track`, selectClipId: newClipId });
  }, [commitProjectEdit]);

  // Auto add media to timeline (routes video/image to Main Video V1 by default, audio to Audio track)
  const autoAddMediaToTimeline = useCallback((asset: MediaAsset) => {
    const isAudio = asset.type === 'audio';
    const targetType: TrackType = isAudio ? 'audio' : 'video';
    
    const existingTrack = !isAudio
      ? (projectRef.current.timeline.tracks.find(t => t.id === MAIN_VIDEO_TRACK_ID) ||
         projectRef.current.timeline.tracks.find(t => t.type === 'video'))
      : projectRef.current.timeline.tracks.find(t => t.type === targetType);
    if (existingTrack) {
      addClipToTrack(existingTrack.id, asset);
    } else {
      const newTrackId = `track-${targetType[0]}${Date.now().toString().slice(-4)}`;
      addClipToTrack(newTrackId, asset);
    }
  }, [addClipToTrack]);

  // Add Text Clip
  const addTextClip = useCallback((textPreset: string = 'NEW SUBTITLE') => {
    const newClipId = `text-${Date.now()}`;
    commitProjectEdit(prev => {
      let textTrack = prev.timeline.tracks.find(t => t.type === 'text');
      const updatedTracks = [...prev.timeline.tracks];

      if (!textTrack) {
        textTrack = {
          id: `track-t${Date.now().toString().slice(-4)}`,
          name: 'Text & Captions',
          type: 'text',
          muted: false,
          locked: false,
          visible: true,
          clips: []
        };
        updatedTracks.unshift(textTrack);
      }

      const newClip: TimelineClip = {
        id: newClipId,
        trackId: textTrack.id,
        name: 'Custom Text',
        type: 'text',
        timelineStart: currentTimeRef.current,
        sourceStart: 0,
        sourceEnd: 4,
        duration: 4,
        transform: { x: 0, y: 20, scale: 1, rotation: 0, opacity: 1 },
        effects: [],
        volume: 0,
        muted: true,
        fadeIn: 0.2,
        fadeOut: 0.2,
        textContent: textPreset,
        textColor: '#FFFFFF',
        textBgColor: 'rgba(0,0,0,0.7)',
        fontSize: 24,
        fontFamily: 'Inter, sans-serif',
        animationPreset: 'pop',
        fontWeight: '800'
      };

      const finalTracks = updatedTracks.map(t => 
        t.id === textTrack!.id ? { ...t, clips: [...t.clips, newClip] } : t
      );

      const magnetizedTracks = enforceMainTrackMagnetism(finalTracks);
      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          duration: computeElasticTimelineDuration(magnetizedTracks, prev.timeline.duration),
          tracks: magnetizedTracks,
        }
      };
    }, { label: 'Add caption clip', selectClipId: newClipId });
  }, [commitProjectEdit]);

  const addRichTextClip = useCallback((
    template: TextStyleTemplate,
    options?: { timelineStart?: number; trackId?: string; x?: number; y?: number }
  ) => {
    const newClipId = `text-${Date.now()}`;
    commitProjectEdit(prev => {
      let targetTrack = options?.trackId
        ? prev.timeline.tracks.find(t => t.id === options.trackId)
        : prev.timeline.tracks.find(t => t.type === 'text');
      const updatedTracks = [...prev.timeline.tracks];

      if (!targetTrack) {
        targetTrack = {
          id: `track-t${Date.now().toString().slice(-4)}`,
          name: 'Text & Captions',
          type: 'text',
          muted: false,
          locked: false,
          visible: true,
          clips: [],
        };
        updatedTracks.unshift(targetTrack);
      }

      const startAt = Math.max(0, options?.timelineStart ?? currentTimeRef.current);
      const newClip: TimelineClip = {
        id: newClipId,
        trackId: targetTrack.id,
        name: template.label,
        type: 'text',
        timelineStart: startAt,
        sourceStart: 0,
        sourceEnd: 4,
        duration: 4,
        transform: {
          x: options?.x ?? 0,
          y: options?.y ?? 20,
          scale: 1,
          rotation: 0,
          opacity: 1,
        },
        effects: [],
        animations: template.inAnim
          ? { in: { presetId: template.inAnim, duration: 0.45, intensity: 1 } }
          : undefined,
        volume: 0,
        muted: true,
        fadeIn: 0.2,
        fadeOut: 0.2,
        textContent: template.previewText,
        textColor: template.textColor,
        textBgColor: template.textBgColor,
        fontSize: template.fontSize,
        fontFamily: template.fontFamily,
        fontWeight: template.fontWeight,
        strokeWidth: template.strokeWidth,
        strokeColor: template.strokeColor,
        shadowBlur: template.shadowBlur,
        shadowColor: template.shadowColor,
        bgPadding: template.bgPadding,
        bgRadius: template.bgRadius,
        letterSpacing: template.letterSpacing,
        gradientColors: template.gradientColors,
      };

      const finalTracks = updatedTracks.map(t =>
        t.id === targetTrack!.id ? { ...t, clips: [...t.clips, newClip] } : t
      );

      return {
        ...prev,
        timeline: { ...prev.timeline, tracks: finalTracks },
      };
    }, { label: `Add ${template.label} text`, selectClipId: newClipId });
  }, [commitProjectEdit]);

  const addStickerClip = useCallback((
    sticker: StickerPresetDef,
    options?: { timelineStart?: number; trackId?: string; x?: number; y?: number }
  ) => {
    const newClipId = `sticker-${Date.now()}`;
    commitProjectEdit(prev => {
      let targetTrack = options?.trackId
        ? prev.timeline.tracks.find(t => t.id === options.trackId)
        : prev.timeline.tracks.find(t => t.id === 'track-v2') || prev.timeline.tracks.find(t => t.type === 'video');
      const updatedTracks = [...prev.timeline.tracks];

      if (!targetTrack) {
        targetTrack = {
          id: `track-v${Date.now().toString().slice(-4)}`,
          name: 'Overlay Stickers',
          type: 'video',
          muted: false,
          locked: false,
          visible: true,
          clips: [],
        };
        updatedTracks.unshift(targetTrack);
      }

      const startAt = Math.max(0, options?.timelineStart ?? currentTimeRef.current);
      const newClip: TimelineClip = {
        id: newClipId,
        trackId: targetTrack.id,
        name: sticker.label,
        type: 'sticker',
        timelineStart: startAt,
        sourceStart: 0,
        sourceEnd: 3.5,
        duration: 3.5,
        transform: {
          x: options?.x ?? 0,
          y: options?.y ?? 0,
          scale: 0.45,
          rotation: 0,
          opacity: 1,
        },
        effects: [],
        volume: 0,
        muted: true,
        fadeIn: 0,
        fadeOut: 0,
        stickerId: sticker.id,
        stickerSvg: sticker.svg,
        stickerColor: sticker.color,
      };

      const rawTracks = updatedTracks.map(t =>
        t.id === targetTrack!.id ? { ...t, clips: [...t.clips, newClip] } : t
      );
      const finalTracks = enforceMainTrackMagnetism(rawTracks);

      return {
        ...prev,
        timeline: {
          ...prev.timeline,
          duration: computeElasticTimelineDuration(finalTracks, prev.timeline.duration),
          tracks: finalTracks,
        },
      };
    }, { label: `Add sticker ${sticker.label}`, selectClipId: newClipId });
  }, [commitProjectEdit]);

  // Toggle Track properties
  const toggleTrackMute = useCallback((trackId: string) => {
    commitProjectEdit(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        tracks: prev.timeline.tracks.map(t => 
          t.id === trackId ? { ...t, muted: !t.muted } : t
        )
      }
    }), { label: 'Toggle track mute' });
  }, [commitProjectEdit]);

  const toggleTrackLock = useCallback((trackId: string) => {
    commitProjectEdit(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        tracks: prev.timeline.tracks.map(t => 
          t.id === trackId ? { ...t, locked: !t.locked } : t
        )
      }
    }), { label: 'Toggle track lock' });
  }, [commitProjectEdit]);

  const toggleTrackVisibility = useCallback((trackId: string) => {
    commitProjectEdit(prev => ({
      ...prev,
      timeline: {
        ...prev.timeline,
        tracks: prev.timeline.tracks.map(t => 
          t.id === trackId ? { ...t, visible: !t.visible } : t
        )
      }
    }), { label: 'Toggle track visibility' });
  }, [commitProjectEdit]);

  // AI Skill simulation trigger
  const applySkill = useCallback((skillId: string) => {
    if (skillId === 'skill-shorts-creator') {
      beginHistoryTransaction('Apply Shorts Creator Skill');
      setAspectRatio('9:16');
      addTextClip('VIRAL HOOK HIGHLIGHT');
      endHistoryTransaction();
    } else if (skillId === 'skill-cinematic-grade' || skillId === 'lut-cinematic') {
      commitProjectEdit(prev => {
        const newTracks = prev.timeline.tracks.map(t => ({
          ...t,
          clips: t.clips.map(c => {
            if (c.type === 'video') {
              return {
                ...c,
                effects: c.effects.map(e => {
                  if (e.type === 'contrast') return { ...e, value: 125 };
                  if (e.type === 'saturation') return { ...e, value: 135 };
                  return e;
                })
              };
            }
            return c;
          })
        }));
        return { ...prev, timeline: { ...prev.timeline, tracks: newTracks } };
      }, { label: 'Apply Cinematic Grade Skill' });
    } else if (skillId === 'skill-auto-captions' || skillId === 'auto-subtitles') {
      addTextClip('AI Generated Caption');
    }
  }, [setAspectRatio, addTextClip, commitProjectEdit, beginHistoryTransaction, endHistoryTransaction]);

  const undo = useCallback(() => {
    const prev = historyRef.current.undo(getEditorSnapshot());
    if (prev) {
      applyRestoredSnapshot(prev);
    }
  }, [getEditorSnapshot, applyRestoredSnapshot]);

  const redo = useCallback(() => {
    const next = historyRef.current.redo(getEditorSnapshot());
    if (next) {
      applyRestoredSnapshot(next);
    }
  }, [getEditorSnapshot, applyRestoredSnapshot]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement || 
        target instanceof HTMLTextAreaElement || 
        target?.isContentEditable
      ) {
        return; // Don't intercept when user is typing in form inputs
      }

      const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (cmdOrCtrl && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        copyClip();
      } else if (cmdOrCtrl && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        pasteClip();
      } else if (cmdOrCtrl && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        cutClip();
      } else if (cmdOrCtrl && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateClip();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault();
          deleteClip(selectedClipId);
        }
      } else if (cmdOrCtrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (cmdOrCtrl && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
      } else if (cmdOrCtrl && (e.key === 'k' || e.key === 'K')) {
        if (selectedClipId) {
          e.preventDefault();
          splitClipAtPlayhead(selectedClipId);
        }
      } else if (e.key === 'ArrowUp') {
        if (selectedClipId) {
          e.preventDefault();
          moveSelectedClipVertical('up');
        }
      } else if (e.key === 'ArrowDown') {
        if (selectedClipId) {
          e.preventDefault();
          moveSelectedClipVertical('down');
        }
      } else if (e.key === 'ArrowLeft') {
        if (selectedClipId) {
          e.preventDefault();
          nudgeClip(selectedClipId, e.shiftKey ? -0.33 : -0.033);
        }
      } else if (e.key === 'ArrowRight') {
        if (selectedClipId) {
          e.preventDefault();
          nudgeClip(selectedClipId, e.shiftKey ? 0.33 : 0.033);
        }
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (cmdOrCtrl && e.key === '0') {
        e.preventDefault();
        zoomFit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    togglePlay, 
    copyClip, 
    pasteClip, 
    cutClip, 
    duplicateClip, 
    deleteClip, 
    selectedClipId, 
    undo, 
    redo, 
    splitClipAtPlayhead, 
    moveSelectedClipVertical, 
    nudgeClip, 
    zoomIn, 
    zoomOut, 
    zoomFit
  ]);

  const updateFramerSettings = useCallback((
    updates: Partial<FramerSettings>,
    options?: { skipHistory?: boolean; coalesceKey?: string }
  ) => {
    commitFramerEdit(prev => ({ ...prev, ...updates }), {
      label: 'Update framer settings',
      coalesceKey: options?.skipHistory ? undefined : (options?.coalesceKey ?? 'framer-settings'),
      ...options,
    });
  }, [commitFramerEdit]);

  const updateFramerBox = useCallback((
    boxId: 'top' | 'bottom',
    updates: Partial<FramerBox>,
    options?: { skipHistory?: boolean; coalesceKey?: string }
  ) => {
    commitFramerEdit(prev => ({
      ...prev,
      [boxId === 'top' ? 'topBox' : 'bottomBox']: {
        ...prev[boxId === 'top' ? 'topBox' : 'bottomBox'],
        ...updates,
      },
    }), {
      label: `Adjust ${boxId} speaker box`,
      coalesceKey: options?.skipHistory ? undefined : (options?.coalesceKey ?? `framer-box:${boxId}`),
      ...options,
    });
  }, [commitFramerEdit]);

  const applyFramerToTimeline = useCallback(() => {
    const fs = framerSettingsRef.current;
    commitProjectEdit(prev => {
      const videoTracks = prev.timeline.tracks.filter(t => t.type === 'video');
      if (videoTracks.length === 0) return prev;

      const mainTrack = videoTracks[0];
      if (!mainTrack) return prev;
      const baseClip = mainTrack.clips.find(c => c.type === 'video');
      if (!baseClip) return prev;

      let updatedTracks = [...prev.timeline.tracks];
      let secondaryTrackIndex = updatedTracks.findIndex(t => t.id === 'track-v2' || (t.type === 'video' && t.id !== mainTrack.id));
      let secondaryTrackId = 'track-v2';

      if (secondaryTrackIndex === -1) {
        const newTrack: Track = {
          id: 'track-v2',
          name: 'Overlay (Bottom Speaker)',
          type: 'video',
          muted: false,
          locked: false,
          visible: true,
          clips: [],
        };
        const mainIdx = updatedTracks.findIndex(t => t.id === mainTrack.id);
        if (mainIdx !== -1) {
          updatedTracks.splice(mainIdx, 0, newTrack);
          secondaryTrackIndex = mainIdx;
        } else {
          updatedTracks.push(newTrack);
          secondaryTrackIndex = updatedTracks.length - 1;
        }
      } else {
        const found = updatedTracks[secondaryTrackIndex];
        if (found) secondaryTrackId = found.id;
      }

      // Top speaker: scale & position for top half of 9:16 screen
      const topScale = Math.max(1.2, 100 / Math.max(25, fs.topBox.width));
      const topOffsetY = -240;
      const topOffsetX = (50 - (fs.topBox.x + fs.topBox.width / 2)) * 3.5;

      const updatedMainClips = mainTrack.clips.map(c => {
        if (c.id === baseClip.id) {
          return {
            ...c,
            name: `${c.name} (Top Speaker)`,
            transform: {
              ...c.transform,
              scale: Number((topScale * 0.85).toFixed(2)),
              x: Number(topOffsetX.toFixed(1)),
              y: topOffsetY,
            },
          };
        }
        return c;
      });

      // Bottom speaker: scale & position for bottom half of 9:16 screen
      const bottomScale = Math.max(1.2, 100 / Math.max(25, fs.bottomBox.width));
      const bottomOffsetY = 240;
      const bottomOffsetX = (50 - (fs.bottomBox.x + fs.bottomBox.width / 2)) * 3.5;

      const bottomClip: TimelineClip = {
        ...baseClip,
        id: `clip-bottom-speaker-${Date.now()}`,
        trackId: secondaryTrackId,
        name: `${baseClip.name} (Bottom Speaker)`,
        transform: {
          ...baseClip.transform,
          scale: Number((bottomScale * 0.85).toFixed(2)),
          x: Number(bottomOffsetX.toFixed(1)),
          y: bottomOffsetY,
        },
      };

      const targetSecTrack = updatedTracks[secondaryTrackIndex];
      const existingSecClips = targetSecTrack ? targetSecTrack.clips : [];
      const updatedSecondaryClips = [
        ...existingSecClips.filter(c => c.timelineStart !== baseClip.timelineStart),
        bottomClip
      ].sort((a, b) => a.timelineStart - b.timelineStart);

      updatedTracks = updatedTracks.map(t => {
        if (t.id === mainTrack.id) {
          return { ...t, name: 'Main Video (Top Speaker)', clips: updatedMainClips };
        }
        if (t.id === secondaryTrackId) {
          return { ...t, name: 'Overlay (Bottom Speaker)', clips: updatedSecondaryClips };
        }
        return t;
      });

      return {
        ...prev,
        settings: {
          ...prev.settings,
          aspectRatio: '9:16',
          width: 1080,
          height: 1920,
        },
        timeline: {
          ...prev.timeline,
          tracks: updatedTracks,
        },
      };
    }, { label: 'Apply dual-speaker split layout' });

    setActiveMonitorTab('video');
  }, [commitProjectEdit]);

  const sendClipperToEditor = useCallback(async () => {
    applyFramerToTimeline();
    // Wait a tick for state update, then switch active project mode to 'editing'
    setTimeout(async () => {
      const nextProj: EditorProject = {
        ...projectRef.current,
        mode: 'editing',
        framerSettings: framerSettingsRef.current,
        lastPlayheadTime: currentTimeRef.current,
      };
      await switchActiveProjectMode('editing', nextProj);
    }, 50);
  }, [applyFramerToTimeline, switchActiveProjectMode]);

  return (
    <EditorContext.Provider
      value={{
        project,
        currentTime,
        isPlaying,
        selectedClipId,
        selectedTrackId,
        selectedClip,
        clipboardClip,
        zoomLevel,
        playbackRate,
        aspectRatio,
        activeSidebarTab,
        activeMonitorTab,
        framerSettings,
        snapping,
        canUndo,
        canRedo,
        setActiveMonitorTab,
        updateFramerSettings,
        updateFramerBox,
        applyFramerToTimeline,
        sendClipperToEditor,
        saveNow,
        togglePlay,
        pausePlayback,
        seek,
        setPlaybackRate,
        setZoom,
        zoomIn,
        zoomOut,
        zoomFit,
        setAspectRatio,
        setActiveSidebarTab,
        setSnapping,
        selectClip,
        updateClip,
        updateClipTransform,
        updateClipEffect,
        batchUpdateClipEffects,
        applyClipFilterPreset,
        updateClipMask,
        updateClipAnimation,
        updateClipSpeedCurve,
        toggleClipLayerEffect,
        setClipTransition,
        removeClipTransition,
        updateProjectSettings,
        moveClip,
        commitMoveClip,
        moveClipToTrack,
        autoAlignClipDrop,
        autoPackTrack,
        alignClipInCanvas,
        autoArrangeCanvasLayers,
        moveSelectedClipVertical,
        nudgeClip,
        trimClip,
        trimClipTimeline,
        commitTrimClip,
        splitClipAtPlayhead,
        deleteClip,
        copyClip,
        cutClip,
        pasteClip,
        duplicateClip,
        addClipToTrack,
        autoAddMediaToTimeline,
        addTextClip,
        addRichTextClip,
        addStickerClip,
        importMediaAsset,
        extractAudioFromClip,
        addTrack,
        deleteTrack,
        toggleTrackMute,
        toggleTrackLock,
        toggleTrackVisibility,
        applySkill,
        undo,
        redo,
        beginHistoryTransaction,
        endHistoryTransaction
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
}
