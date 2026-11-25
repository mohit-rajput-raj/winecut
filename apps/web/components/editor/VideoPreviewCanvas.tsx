'use client';

import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useEditor } from '../../lib/editor/EditorContext';
import { secondsToTimecode } from '../../lib/editor/time-utils';
import { buildCssFilter, buildMasterFilter } from '../../lib/editor/render-utils';
import {
  computeClipBoundingBox,
  solveCanvasSnap,
  SmartGuideLine,
  DistanceBadge,
  CanvasBoundingBox,
} from '../../lib/editor/canvas-layout';
import { TimelineClip, Track, MediaAsset } from '../../lib/editor/types';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Toolbar,
} from 'react-aria-components';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  ShieldAlert, 
  ZoomIn, 
  ZoomOut, 
  Grid3X3, 
  Move,
  MousePointer2,
  Magnet,
  AlignCenterHorizontal,
  AlignCenterVertical,
  LayoutGrid,
  Undo2,
  Redo2
} from 'lucide-react';

// Synchronized Audio Player Component for Timeline Audio Clips
function AudioTrackPlayer({
  clip,
  trackMuted,
  assetUrl,
  currentTime,
  isPlaying,
  playbackRate,
  masterVolume,
  isMasterMuted,
}: {
  clip: TimelineClip;
  trackMuted: boolean;
  assetUrl: string;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  masterVolume: number;
  isMasterMuted: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const clipOffset = currentTime - clip.timelineStart + clip.sourceStart;
    if (Math.abs(audio.currentTime - clipOffset) > 0.15) {
      audio.currentTime = Math.max(0, clipOffset);
    }

    audio.playbackRate = playbackRate;

    const clipVol = (clip.volume ?? 100) / 100;
    const finalVol = Math.max(0, Math.min(1, (masterVolume / 100) * clipVol));
    audio.volume = finalVol;
    audio.muted = isMasterMuted || trackMuted || clip.muted || finalVol === 0;

    if (isPlaying && audio.paused) {
      audio.play().catch(() => {});
    } else if (!isPlaying && !audio.paused) {
      audio.pause();
    }
  }, [currentTime, isPlaying, clip, trackMuted, playbackRate, masterVolume, isMasterMuted]);

  return <audio ref={audioRef} src={assetUrl} preload="auto" className="hidden" />;
}

// Synchronized Video Layer Component with Click-to-Select Support
function VideoLayerPlayer({
  clip,
  track,
  assetUrl,
  currentTime,
  isPlaying,
  playbackRate,
  masterVolume,
  isMasterMuted,
  zIndex,
  isSelected,
}: {
  clip: TimelineClip;
  track: Track;
  assetUrl: string;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  masterVolume: number;
  isMasterMuted: boolean;
  zIndex: number;
  isSelected: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const clipOffset = currentTime - clip.timelineStart + clip.sourceStart;
    if (Math.abs(video.currentTime - clipOffset) > 0.15) {
      video.currentTime = Math.max(0, clipOffset);
    }

    video.playbackRate = playbackRate;

    const clipVol = (clip.volume ?? 100) / 100;
    const finalVol = Math.max(0, Math.min(1, (masterVolume / 100) * clipVol));
    video.volume = finalVol;
    video.muted = isMasterMuted || track.muted || clip.muted || finalVol === 0;

    if (isPlaying && video.paused) {
      video.play().catch(() => {});
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [currentTime, isPlaying, clip, track.muted, playbackRate, masterVolume, isMasterMuted]);

  const filterString = buildCssFilter(clip.effects);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{
        zIndex,
        transform: `translate(${clip.transform.x}px, ${clip.transform.y}px) scale(${clip.transform.scale}) rotate(${clip.transform.rotation}deg)`,
        opacity: clip.transform.opacity ?? 1,
        filter: filterString,
      }}
    >
      <video
        ref={videoRef}
        src={assetUrl}
        data-clip-id={clip.id}
        className={`w-full h-full object-cover pointer-events-auto cursor-pointer transition-shadow ${
          !isSelected ? 'hover:outline hover:outline-2 hover:outline-blue-400/50 hover:-outline-offset-2' : ''
        }`}
        playsInline
      />
    </div>
  );
}

// Interactive Transform Wireframe Gizmo for Selected Clip in Video Window
// Interior allows click-through for top layers via stage hit-testing, while handles stay directly interactive.
function WireframeGizmo({
  clip,
  onTransformChange,
  onInteractionStart,
  onInteractionEnd,
}: {
  clip: TimelineClip;
  onTransformChange: (updates: Partial<{ x: number; y: number; scale: number; rotation: number }>) => void;
  onInteractionStart?: (label?: string) => void;
  onInteractionEnd?: () => void;
}) {
  const [isDragging, setIsDragging] = useState<'scale' | 'rotate' | null>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startScale: number; startRot: number }>({
    mouseX: 0,
    mouseY: 0,
    startScale: 1,
    startRot: 0,
  });

  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'scale' | 'rotate') => {
    e.stopPropagation();
    e.preventDefault();
    onInteractionStart?.(type === 'scale' ? 'Scale layer in video window' : 'Rotate layer in video window');
    setIsDragging(type);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startScale: clip.transform.scale || 1,
      startRot: clip.transform.rotation || 0,
    };
  }, [clip.transform, onInteractionStart]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      if (isDragging === 'scale') {
        const factor = 1 + (deltaX - deltaY) / 300;
        const newScale = Math.max(0.1, Math.min(3.0, Number((dragStartRef.current.startScale * factor).toFixed(2))));
        onTransformChange({ scale: newScale });
      } else if (isDragging === 'rotate') {
        const newRot = Math.round((dragStartRef.current.startRot + deltaX * 0.8) % 360);
        onTransformChange({ rotation: newRot });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
      onInteractionEnd?.();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onTransformChange, onInteractionEnd]);

  const scale = clip.transform.scale || 1;
  const rotation = clip.transform.rotation || 0;
  const posX = clip.transform.x || 0;
  const posY = clip.transform.y || 0;

  return (
    <div
      style={{
        zIndex: 200,
        transform: `translate(${posX}px, ${posY}px) scale(${scale}) rotate(${rotation}deg)`,
        transformOrigin: 'center center',
      }}
      className="absolute inset-0 pointer-events-none flex items-center justify-center"
    >
      {/* Wireframe Dashed Border (pointer-events-none so overlay layers remain clickable) */}
      <div className="w-full h-full border-2 border-blue-400 border-dashed relative pointer-events-none shadow-[0_0_12px_rgba(59,130,246,0.3)]">
        {/* Active Clip Info Pill */}
        <div className="absolute -top-7 left-0 bg-blue-600 text-white text-[10px] font-mono px-2 py-0.5 rounded shadow flex items-center gap-1 pointer-events-none select-none whitespace-nowrap">
          <Move className="w-3 h-3" />
          <span className="font-semibold">{clip.name}</span>
          <span className="text-blue-200">·</span>
          <span>{Math.round(scale * 100)}%</span>
          <span>·</span>
          <span>{rotation}°</span>
        </div>

        {/* Rotation Handle (Top Center stem) */}
        <div
          data-gizmo-handle="true"
          className="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto"
        >
          <div
            data-gizmo-handle="true"
            onMouseDown={(e) => handleMouseDown(e, 'rotate')}
            className="w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white shadow cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
            title="Drag to Rotate"
          />
          <div className="w-[1.5px] h-3 bg-blue-400" />
        </div>

        {/* Corner Resize Handles */}
        <div
          data-gizmo-handle="true"
          onMouseDown={(e) => handleMouseDown(e, 'scale')}
          className="pointer-events-auto absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs shadow cursor-nwse-resize hover:scale-125 transition-transform"
          title="Drag to Scale"
        />
        <div
          data-gizmo-handle="true"
          onMouseDown={(e) => handleMouseDown(e, 'scale')}
          className="pointer-events-auto absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs shadow cursor-nesw-resize hover:scale-125 transition-transform"
          title="Drag to Scale"
        />
        <div
          data-gizmo-handle="true"
          onMouseDown={(e) => handleMouseDown(e, 'scale')}
          className="pointer-events-auto absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs shadow cursor-nesw-resize hover:scale-125 transition-transform"
          title="Drag to Scale"
        />
        <div
          data-gizmo-handle="true"
          onMouseDown={(e) => handleMouseDown(e, 'scale')}
          className="pointer-events-auto absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-600 rounded-xs shadow cursor-nwse-resize hover:scale-125 transition-transform"
          title="Drag to Scale"
        />

        {/* Mid-points */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border border-blue-600 rounded-xs pointer-events-none" />
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border border-blue-600 rounded-xs pointer-events-none" />
        <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-white border border-blue-600 rounded-xs pointer-events-none" />
        <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-2 bg-white border border-blue-600 rounded-xs pointer-events-none" />
      </div>
    </div>
  );
}

export function VideoPreviewCanvas() {
  const { 
    project, 
    currentTime, 
    isPlaying, 
    togglePlay, 
    seek, 
    aspectRatio,
    selectedClip,
    selectClip,
    updateClipTransform,
    alignClipInCanvas,
    autoArrangeCanvasLayers,
    playbackRate,
    setPlaybackRate,
    undo,
    redo,
    canUndo,
    canRedo,
    beginHistoryTransaction,
    endHistoryTransaction,
  } = useEditor();

  const [volume, setVolume] = useState<number>(85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showSafeAreas, setShowSafeAreas] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [smartGuidesEnabled, setSmartGuidesEnabled] = useState<boolean>(true);
  const [activeGuides, setActiveGuides] = useState<{ guides: SmartGuideLine[]; distances: DistanceBadge[] }>({
    guides: [],
    distances: [],
  });
  const [viewportZoom, setViewportZoom] = useState<number>(1.0);

  // Stage measurement so canvas maintains exact aspect ratio cleanly
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({ width: 720, height: 405 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 60 && height > 60) {
          setStageSize({ width, height });
        }
      }
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // Ctrl + Mouse Wheel Zoom on Monitor Stage
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setViewportZoom(prev => {
          const delta = e.deltaY < 0 ? 0.15 : -0.15;
          return Math.max(0.25, Math.min(3.0, Number((prev + delta).toFixed(2))));
        });
      }
    };

    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  const targetAspect = useMemo(() => {
    switch (aspectRatio) {
      case '9:16': return 9 / 16;
      case '1:1': return 1.0;
      case '4:5': return 4 / 5;
      case '16:9':
      default: return 16 / 9;
    }
  }, [aspectRatio]);

  const monitorDimensions = useMemo(() => {
    const padW = stageSize.width * 0.92;
    const padH = stageSize.height * 0.88;
    if (padW <= 0 || padH <= 0) return { width: 640, height: 360 };

    if (padW / padH > targetAspect) {
      const h = padH;
      const w = h * targetAspect;
      return { width: Math.round(w), height: Math.round(h) };
    } else {
      const w = padW;
      const h = w / targetAspect;
      return { width: Math.round(w), height: Math.round(h) };
    }
  }, [stageSize, targetAspect]);

  // 1. Gather all active visual layers bottom-to-top: tracks higher on timeline render on top!
  interface VisualLayer {
    track: Track;
    clip: TimelineClip;
    asset: MediaAsset | undefined;
  }

  const activeVisualLayers: VisualLayer[] = useMemo(() => {
    const videoTracks = project.timeline.tracks.filter(t => t.type === 'video' && t.visible);
    const bottomToTopVideoTracks = [...videoTracks].reverse();
    const layers: VisualLayer[] = [];
    for (const track of bottomToTopVideoTracks) {
      const clip = track.clips.find(
        c => currentTime >= c.timelineStart && currentTime <= c.timelineStart + c.duration
      );
      if (clip) {
        const asset = project.mediaLibrary.find(a => a.id === clip.assetId);
        layers.push({ track, clip, asset });
      }
    }
    return layers;
  }, [project.timeline.tracks, project.mediaLibrary, currentTime]);

  // 2. Gather all active audio clips across audio tracks
  const activeAudioLayers = useMemo(() => {
    return project.timeline.tracks
      .filter(t => t.type === 'audio' && !t.muted)
      .flatMap(track => 
        track.clips
          .filter(clip => currentTime >= clip.timelineStart && currentTime <= clip.timelineStart + clip.duration)
          .map(clip => {
            const asset = project.mediaLibrary.find(a => a.id === clip.assetId);
            return { track, clip, asset };
          })
      );
  }, [project.timeline.tracks, project.mediaLibrary, currentTime]);

  // 3. Active text overlays
  const activeTextClips = useMemo(() => {
    return project.timeline.tracks
      .filter(t => t.type === 'text' && t.visible)
      .flatMap(t => t.clips)
      .filter(c => currentTime >= c.timelineStart && currentTime <= c.timelineStart + c.duration);
  }, [project.timeline.tracks, currentTime]);

  const activeSelectedVisualClip = activeVisualLayers.find(l => l.clip.id === selectedClip?.id)?.clip;
  const masterScreenFilter = buildMasterFilter(project.settings);

  // Direct Canvas Hit-Testing + Click-to-Select & Drag for Overlay / Video / Image / Text Layers
  const handleMonitorMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // Let WireframeGizmo scale/rotate handles handle themselves
    if (target.closest('[data-gizmo-handle="true"]')) return;

    const hitElements = document.elementsFromPoint(e.clientX, e.clientY);
    const hitClipEl = hitElements.find((el) => el.hasAttribute('data-clip-id')) as HTMLElement | undefined;
    const hitClipId = hitClipEl?.getAttribute('data-clip-id') || null;

    if (!hitClipId) {
      selectClip(null);
      return;
    }

    e.stopPropagation();
    // Immediately synchronize selection across Video Window + Timeline + Inspector!
    selectClip(hitClipId);

    // Find clip transform for seamless click-and-drag right from canvas
    const targetClip =
      activeVisualLayers.find((l) => l.clip.id === hitClipId)?.clip ||
      activeTextClips.find((c) => c.id === hitClipId);

    if (!targetClip) return;

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startX = targetClip.transform.x || 0;
    const startY = targetClip.transform.y || 0;
    const monW = monitorDimensions.width;
    const monH = monitorDimensions.height;
    const isText = targetClip.type === 'text';
    const baseW = isText ? Math.min(monW * 0.55, Math.max(120, (targetClip.textContent?.length || 8) * 10)) : monW;
    const baseH = isText ? 36 : monH;

    beginHistoryTransaction('Move layer in video window');

    // Precompute sibling bounding boxes for Smart Guides & Collision Snapping
    const siblingBoxes: CanvasBoundingBox[] = [
      ...activeVisualLayers.map((l) =>
        computeClipBoundingBox(l.clip.id, l.clip.name, l.clip.transform, monW, monH, 1, 1)
      ),
      ...activeTextClips.map((c) => {
        const bw = Math.min(monW * 0.55, Math.max(120, (c.textContent?.length || 8) * 10)) / monW;
        return computeClipBoundingBox(c.id, c.name, { ...c.transform, y: (c.transform.y || 0) + monH * 0.34 }, monW, monH, bw, 36 / monH);
      }),
    ];

    const onMouseMove = (moveEv: MouseEvent) => {
      const dx = (moveEv.clientX - startMouseX) / viewportZoom;
      const dy = (moveEv.clientY - startMouseY) / viewportZoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        const rawX = Math.round(startX + dx);
        const rawY = Math.round(startY + dy);

        if (smartGuidesEnabled && !moveEv.altKey) {
          const snapRes = solveCanvasSnap(
            rawX,
            isText ? rawY + monH * 0.34 : rawY,
            hitClipId,
            targetClip.transform.scale || 1,
            baseW,
            baseH,
            monW,
            monH,
            siblingBoxes,
            9
          );
          updateClipTransform(
            hitClipId,
            {
              x: snapRes.snappedTransformX,
              y: isText ? Math.round(snapRes.snappedTransformY - monH * 0.34) : snapRes.snappedTransformY,
            },
            { skipHistory: true }
          );
          setActiveGuides({ guides: snapRes.guides, distances: snapRes.distances });
        } else {
          updateClipTransform(hitClipId, { x: rawX, y: rawY }, { skipHistory: true });
          setActiveGuides({ guides: [], distances: [] });
        }
      }
    };

    const onMouseUp = () => {
      setActiveGuides({ guides: [], distances: [] });
      endHistoryTransaction();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [
    activeVisualLayers,
    activeTextClips,
    selectClip,
    updateClipTransform,
    viewportZoom,
    monitorDimensions,
    smartGuidesEnabled,
    beginHistoryTransaction,
    endHistoryTransaction,
  ]);

  return (
    <div className="w-full h-full bg-[#0a0a0c] flex flex-col justify-between select-none relative overflow-hidden font-sans">
      {/* Synchronized Audio Engine */}
      {activeAudioLayers.map((layer) => {
        if (!layer.asset?.url) return null;
        return (
          <AudioTrackPlayer
            key={layer.clip.id}
            clip={layer.clip}
            trackMuted={layer.track.muted}
            assetUrl={layer.asset.url}
            currentTime={currentTime}
            isPlaying={isPlaying}
            playbackRate={playbackRate}
            masterVolume={volume}
            isMasterMuted={isMuted}
          />
        );
      })}

      {/* Program Monitor Toolbar */}
      <Toolbar 
        aria-label="Program Monitor Controls"
        className="h-8 border-b border-zinc-800 bg-[#0f1013] px-3 flex items-center justify-between text-xs text-zinc-400 z-10"
      >
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-zinc-200">Program Monitor</span>
          <span className="text-[10px] font-mono text-zinc-500">[{aspectRatio}]</span>
          {activeVisualLayers.length > 1 && (
            <Badge variant="outline" className="text-[9px] font-mono border-blue-800 text-blue-300 bg-blue-950/60">
              {activeVisualLayers.length} Layers Active
            </Badge>
          )}
          <span className="hidden xl:inline-flex items-center gap-1 text-[10px] text-zinc-500 ml-1">
            <MousePointer2 className="w-3 h-3 text-blue-400/70" />
            <span>Click any layer to select & move</span>
          </span>
        </div>

        {/* Viewport Guides, Undo/Redo & Auto-Align Options */}
        <div className="flex items-center gap-1.5">
          {/* Undo / Redo right on Video Window */}
          <div className="flex items-center gap-0.5 bg-zinc-900 px-0.5 py-0.5 rounded border border-zinc-800 mr-0.5">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title="Undo Video / Editor Action (Ctrl+Z)"
            >
              <Undo2 className="w-3 h-3" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              title="Redo Video / Editor Action (Ctrl+Y)"
            >
              <Redo2 className="w-3 h-3" />
            </button>
          </div>
          {selectedClip && (selectedClip.type === 'video' || selectedClip.type === 'image') && (
            <div className="flex items-center gap-0.5 bg-zinc-900 px-1 py-0.5 rounded border border-zinc-800 mr-1">
              <button
                onClick={() => alignClipInCanvas(selectedClip.id, 'center-h', monitorDimensions.width, monitorDimensions.height)}
                className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                title="Center Layer Horizontally"
              >
                <AlignCenterHorizontal className="w-3 h-3" />
              </button>
              <button
                onClick={() => alignClipInCanvas(selectedClip.id, 'center-v', monitorDimensions.width, monitorDimensions.height)}
                className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                title="Center Layer Vertically"
              >
                <AlignCenterVertical className="w-3 h-3" />
              </button>
            </div>
          )}

          {activeVisualLayers.length > 1 && (
            <button
              onClick={() => autoArrangeCanvasLayers(monitorDimensions.width, monitorDimensions.height, 14, 10)}
              className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-blue-950/60 border border-blue-700/60 text-blue-300 hover:bg-blue-900/70 transition-colors cursor-pointer"
              title="Auto-Layout active layers with uniform padding & spacing"
            >
              <LayoutGrid className="w-3 h-3" />
              <span className="hidden sm:inline">Auto-Layout</span>
            </button>
          )}

          <button
            onClick={() => setSmartGuidesEnabled(!smartGuidesEnabled)}
            className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
              smartGuidesEnabled ? 'bg-zinc-800 text-cyan-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Toggle Smart Snapping Guides & Spacing Badges (Hold Alt to bypass)"
          >
            <Magnet className="w-3 h-3" />
            <span className="hidden md:inline">Guides</span>
          </button>

          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`p-1 rounded text-[11px] transition-colors cursor-pointer ${
              showGrid ? 'bg-zinc-800 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="Toggle Rule-of-Thirds Grid"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setShowSafeAreas(!showSafeAreas)}
            className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
              showSafeAreas ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-400'
            }`}
            title="Toggle Title/Action Safe Areas"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Safe Zones</span>
          </button>

          <div className="h-3.5 w-[1px] bg-zinc-800 mx-1" />

          {/* Viewport Zoom Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewportZoom(1.0)}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
              title="Reset Zoom to Fit (100%)"
            >
              Fit ({Math.round(viewportZoom * 100)}%)
            </button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setViewportZoom(prev => Math.max(0.25, prev - 0.25))}
              className="h-6 w-6 text-zinc-400 hover:text-white"
              title="Zoom Out Monitor (Ctrl+Scroll)"
            >
              <ZoomOut className="w-3 h-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setViewportZoom(prev => Math.min(3.0, prev + 0.25))}
              className="h-6 w-6 text-zinc-400 hover:text-white"
              title="Zoom In Monitor (Ctrl+Scroll)"
            >
              <ZoomIn className="w-3 h-3" />
            </Button>
          </div>

          <Badge variant="outline" className="text-[10px] font-mono py-0 px-1 border-zinc-800 text-zinc-400">
            {secondsToTimecode(currentTime, project.settings.fps)}
          </Badge>
        </div>
      </Toolbar>

      {/* Main Program Monitor Stage */}
      <div 
        ref={stageRef}
        onMouseDown={() => selectClip(null)}
        className="flex-1 flex items-center justify-center p-3 relative bg-[#08080a] overflow-hidden"
      >
        <div
          onMouseDown={handleMonitorMouseDown}
          style={{
            width: `${monitorDimensions.width}px`,
            height: `${monitorDimensions.height}px`,
            transform: `scale(${viewportZoom})`,
            transformOrigin: 'center center',
            filter: masterScreenFilter,
          }}
          className="relative bg-black rounded shadow-[0_4px_35px_rgba(0,0,0,0.8)] border border-zinc-700/80 overflow-hidden flex items-center justify-center select-none"
        >
          {/* Multi-Track Video & Image Compositing Stack */}
          {activeVisualLayers.map((layer, index) => {
            const zIndex = (index + 1) * 10;
            const isLayerSelected = selectedClip?.id === layer.clip.id;

            if (layer.clip.type === 'video' && layer.asset?.url) {
              return (
                <VideoLayerPlayer
                  key={layer.clip.id}
                  clip={layer.clip}
                  track={layer.track}
                  assetUrl={layer.asset.url}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  playbackRate={playbackRate}
                  masterVolume={volume}
                  isMasterMuted={isMuted}
                  zIndex={zIndex}
                  isSelected={isLayerSelected}
                />
              );
            }

            if (layer.clip.type === 'image' && layer.asset?.url) {
              const fitMode = layer.clip.fitMode || 'cover';
              const borderRadius = layer.clip.borderRadius ?? 0;
              const borderWidth = layer.clip.borderWidth ?? 0;
              const borderColor = layer.clip.borderColor || '#ffffff';
              const dropShadow = layer.clip.dropShadow;

              return (
                <div
                  key={layer.clip.id}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{
                    zIndex,
                    transform: `translate(${layer.clip.transform.x}px, ${layer.clip.transform.y}px) scale(${layer.clip.transform.scale}) rotate(${layer.clip.transform.rotation}deg)`,
                    opacity: layer.clip.transform.opacity ?? 1,
                    filter: buildCssFilter(layer.clip.effects),
                  }}
                >
                  <img 
                    src={layer.asset.url} 
                    alt={layer.clip.name}
                    data-clip-id={layer.clip.id}
                    className={`${fitMode === 'contain' ? 'max-w-full max-h-full' : 'w-full h-full'} pointer-events-auto cursor-pointer ${
                      !isLayerSelected ? 'hover:outline hover:outline-2 hover:outline-purple-400/60' : ''
                    }`}
                    style={{
                      objectFit: fitMode,
                      borderRadius: `${borderRadius}px`,
                      border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : undefined,
                      boxShadow: dropShadow ? '0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 8px 10px -6px rgba(0, 0, 0, 0.7)' : undefined,
                    }}
                  />
                </div>
              );
            }

            return null;
          })}

          {/* Active Text Overlays (Clickable to select) */}
          {activeTextClips.map((textClip, idx) => {
            const isTextSelected = selectedClip?.id === textClip.id;
            return (
              <div
                key={textClip.id}
                className="absolute inset-x-0 bottom-12 flex justify-center px-4 pointer-events-none"
                style={{
                  zIndex: 100 + idx,
                  transform: `scale(${textClip.transform.scale}) translate(${textClip.transform.x}px, ${textClip.transform.y}px)`,
                }}
              >
                <div
                  data-clip-id={textClip.id}
                  className={`px-4 py-1.5 rounded bg-black/70 backdrop-blur-sm text-center font-bold tracking-tight shadow-lg border pointer-events-auto cursor-pointer transition-all ${
                    isTextSelected
                      ? 'border-blue-400 ring-2 ring-blue-500/60'
                      : 'border-white/10 hover:border-amber-400/70'
                  }`}
                  style={{
                    color: textClip.textColor || '#ffffff',
                    fontSize: `${Math.max(14, (textClip.fontSize || 32) * 0.45)}px`,
                    fontFamily: textClip.fontFamily || 'Inter',
                  }}
                >
                  {textClip.textContent}
                </div>
              </div>
            );
          })}

          {/* Interactive Transform Wireframe Gizmo for Selected Visual Clip */}
          {activeSelectedVisualClip && (
            <WireframeGizmo
              clip={activeSelectedVisualClip}
              onTransformChange={(updates) => updateClipTransform(activeSelectedVisualClip.id, updates, { skipHistory: true })}
              onInteractionStart={beginHistoryTransaction}
              onInteractionEnd={endHistoryTransaction}
            />
          )}

          {/* Figma / Canva-Style Smart Alignment Guides & Margin Distance Pills */}
          {activeGuides.guides.map((g, idx) =>
            g.axis === 'vertical' ? (
              <div
                key={`vg-${idx}`}
                className={`absolute top-0 bottom-0 w-[1.5px] pointer-events-none z-50 ${
                  g.kind === 'center' ? 'bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.8)]' : 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]'
                }`}
                style={{ left: `${g.posPx}px` }}
              >
                {g.label && (
                  <span className="absolute top-1.5 left-1.5 text-[9px] font-mono px-1 rounded bg-black/80 text-white border border-white/15 whitespace-nowrap">
                    {g.label}
                  </span>
                )}
              </div>
            ) : (
              <div
                key={`hg-${idx}`}
                className={`absolute left-0 right-0 h-[1.5px] pointer-events-none z-50 ${
                  g.kind === 'center' ? 'bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.8)]' : 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]'
                }`}
                style={{ top: `${g.posPx}px` }}
              >
                {g.label && (
                  <span className="absolute left-1.5 top-1.5 text-[9px] font-mono px-1 rounded bg-black/80 text-white border border-white/15 whitespace-nowrap">
                    {g.label}
                  </span>
                )}
              </div>
            )
          )}

          {activeGuides.distances.map((d, idx) => (
            <div
              key={`dist-${idx}`}
              className="absolute pointer-events-none z-50 flex items-center justify-center"
              style={
                d.axis === 'horizontal'
                  ? { left: `${Math.min(d.x1, d.x2)}px`, top: `${d.y1}px`, width: `${Math.abs(d.x2 - d.x1)}px`, height: '1px', backgroundColor: '#f43f5e' }
                  : { top: `${Math.min(d.y1, d.y2)}px`, left: `${d.x1}px`, height: `${Math.abs(d.y2 - d.y1)}px`, width: '1px', backgroundColor: '#f43f5e' }
              }
            >
              <span className="px-1 py-0.2 rounded bg-rose-600 text-white text-[9px] font-mono font-bold shadow">
                {d.label}
              </span>
            </div>
          ))}

          {/* Rule-of-Thirds Grid Overlay */}
          {showGrid && (
            <div className="absolute inset-0 pointer-events-none z-30 grid grid-cols-3 grid-rows-3 border border-white/10">
              <div className="border-r border-b border-white/15" />
              <div className="border-r border-b border-white/15" />
              <div className="border-b border-white/15" />
              <div className="border-r border-b border-white/15" />
              <div className="border-r border-b border-white/15" />
              <div className="border-b border-white/15" />
              <div className="border-r border-white/15" />
              <div className="border-r border-white/15" />
              <div />
            </div>
          )}

          {/* Safe Area Guides */}
          {showSafeAreas && (
            <div className="absolute inset-0 pointer-events-none p-4 z-30">
              <div className="w-full h-full border border-dashed border-zinc-500/30 rounded flex items-center justify-center">
                <div className="w-[88%] h-[88%] border border-dashed border-zinc-500/20 rounded flex items-center justify-center">
                  <span className="text-[8px] font-mono text-zinc-500/60 uppercase tracking-widest">
                    Title Safe (90%)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Viewport Bottom Transport Controls */}
      <Toolbar 
        aria-label="Media Playback Transport Controls"
        className="h-11 border-t border-zinc-800 bg-[#0f1013] px-3 flex items-center justify-between text-xs z-10"
      >
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => seek(0)}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
            title="Jump to Start (Home)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => seek(Math.max(0, currentTime - 1 / project.settings.fps))}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
            title="Previous Frame (Left Arrow)"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="default"
            size="icon"
            onClick={togglePlay}
            className="h-8 w-8 mx-1 bg-zinc-100 text-zinc-950 hover:bg-white shadow-sm"
            title="Play / Pause (Space)"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-zinc-950" />
            ) : (
              <Play className="w-4 h-4 fill-zinc-950 ml-0.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => seek(Math.min(project.timeline.duration, currentTime + 1 / project.settings.fps))}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
            title="Next Frame (Right Arrow)"
          >
            <SkipForward className="w-3.5 h-3.5" />
          </Button>

          <div className="ml-2 hidden md:flex items-center bg-zinc-950 rounded border border-zinc-800 p-0.5">
            {[0.5, 1, 1.5, 2].map((rate) => (
              <button
                key={rate}
                onClick={() => setPlaybackRate(rate)}
                className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors cursor-pointer ${
                  playbackRate === rate
                    ? 'bg-zinc-800 text-zinc-100 font-bold shadow-xs'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title={`Playback Speed ${rate}x`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>

        <div className="font-mono text-xs font-semibold px-3 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-200">
          {secondsToTimecode(currentTime, project.settings.fps)}
          <span className="text-zinc-500 font-normal ml-1">/ {secondsToTimecode(project.timeline.duration, project.settings.fps)}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="text-zinc-400 hover:text-zinc-200 transition-colors p-1 cursor-pointer"
            title={isMuted ? 'Unmute Master Audio' : 'Mute Master Audio'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-zinc-500" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-zinc-300" />
            )}
          </button>

          <input
            type="range"
            min="0"
            max="100"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              setVolume(Number(e.target.value));
              if (isMuted) setIsMuted(false);
            }}
            className="w-16 sm:w-20 h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
            title={`Master Volume: ${isMuted ? 0 : volume}%`}
          />
        </div>
      </Toolbar>
    </div>
  );
}
