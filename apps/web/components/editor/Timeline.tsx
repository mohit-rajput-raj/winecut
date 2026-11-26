'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useEditor } from '../../lib/editor/EditorContext';
import {
  timeToPixels,
  pixelsToTime,
  snapTime,
  secondsToTimecode,
  secondsToMsTimecode,
  getRulerIntervals,
  formatRulerTime,
} from '../../lib/editor/time-utils';
import { solveTimelineSnap, MAIN_VIDEO_TRACK_ID } from '../../lib/editor/canvas-layout';
import { TimelineClip } from '../../lib/editor/types';
import { mapTimelineToSourceOffset } from '../../lib/editor/engine/velocity';
import { findAdjacentClipSeams } from '../../lib/editor/engine/transitions';
import {
  getCachedWaveform,
  requestAssetWaveform,
  sampleWaveformRange,
  subscribeWaveform,
} from '../../lib/editor/media-index/waveform-decoder';
import {
  getCachedVideoFrame,
  getFrameBucketMs,
  getNearestCachedFrame,
  queueVideoFrames,
  subscribeFilmstrip,
} from '../../lib/editor/media-index/frame-extractor';
import {
  FILTER_PRESETS,
  STICKER_PACKS,
  TEXT_STYLE_TEMPLATES,
} from '../../lib/editor/presets/bundles';
import { TransitionSeamButton } from './timeline/TransitionSeamButton';
import { Button } from '../ui/button';
import {
  Toolbar,
  Button as AriaButton,
  Slider as AriaSlider,
  SliderTrack as AriaSliderTrack,
  SliderThumb as AriaSliderThumb,
} from 'react-aria-components';
import { 
  Scissors, 
  Trash2, 
  ZoomIn, 
  ZoomOut, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Volume2, 
  VolumeX, 
  Plus, 
  Magnet, 
  Film, 
  Type, 
  Music,
  ArrowDownToLine,
  ChevronsLeftRight,
  Maximize2,
  Copy,
  ClipboardPaste,
  Undo2,
  Redo2,
  ChevronUp,
  ChevronDown,
  Image as ImageIcon,
  Sparkles,
  AlignHorizontalSpaceAround
} from 'lucide-react';

const TIMELINE_HEADER_WIDTH = 196;

/**
 * Adaptive timeline grid canvas rendering adaptive second/millisecond
 * subdivisions across the active scroll viewport at native DPR.
 */
function TimelineGridCanvas({
  zoomLevel,
  scrollLeft,
  viewportWidth,
  centerOffsetPx,
  trackCount,
}: {
  zoomLevel: number;
  scrollLeft: number;
  viewportWidth: number;
  centerOffsetPx: number;
  trackCount: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const drawWidth = Math.max(400, Math.ceil(viewportWidth));
    const drawHeight = Math.max(240, canvas.parentElement?.clientHeight || 320);

    if (canvas.width !== drawWidth * dpr || canvas.height !== drawHeight * dpr) {
      canvas.width = drawWidth * dpr;
      canvas.height = drawHeight * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, drawWidth, drawHeight);

    const { majorStep, minorStep } = getRulerIntervals(zoomLevel);
    const startSec = Math.max(0, pixelsToTime(scrollLeft - centerOffsetPx, zoomLevel));
    const endSec = Math.max(0, pixelsToTime(scrollLeft + drawWidth - centerOffsetPx, zoomLevel) + majorStep);

    const firstMinorIdx = Math.max(0, Math.floor(startSec / minorStep));
    const lastMinorIdx = Math.ceil(endSec / minorStep);
    const majorRatio = Math.max(1, Math.round(majorStep / minorStep));

    for (let idx = firstMinorIdx; idx <= lastMinorIdx; idx++) {
      const sec = Number((idx * minorStep).toFixed(4));
      const x = centerOffsetPx + timeToPixels(sec, zoomLevel) - scrollLeft;
      if (x < -1 || x > drawWidth + 1) continue;

      const isMajor = idx % majorRatio === 0;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, drawHeight);
      ctx.strokeStyle = isMajor ? 'rgba(113, 113, 122, 0.24)' : 'rgba(63, 63, 70, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [zoomLevel, scrollLeft, viewportWidth, centerOffsetPx, trackCount]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        left: `${scrollLeft}px`,
        width: `${Math.max(400, Math.ceil(viewportWidth))}px`,
      }}
      className="pointer-events-none absolute top-0 bottom-0 h-full z-0"
    />
  );
}

// Synchronized Real PCM Audio Waveform Canvas (viewport-sliced for arbitrarily long media)
function AudioWaveformCanvas({
  clip,
  assetUrl,
  width,
  offsetPx = 0,
  visibleWidth,
  height,
  zoomLevel,
  volume,
  seed = 'audio',
  color = '#94a3b8',
}: {
  clip?: TimelineClip;
  assetUrl?: string;
  width: number;
  offsetPx?: number;
  visibleWidth?: number;
  height: number;
  zoomLevel: number;
  volume: number;
  seed?: string;
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveRev, setWaveRev] = useState(0);
  const assetId = clip?.assetId;
  const drawOffsetPx = Math.max(0, Math.floor(offsetPx));
  const drawWidth = Math.max(0, Math.min(width - drawOffsetPx, Math.ceil(visibleWidth ?? width)));

  useEffect(() => {
    if (!assetId || !assetUrl) return;
    const unsub = subscribeWaveform(assetId, () => setWaveRev((r) => r + 1));
    if (!getCachedWaveform(assetId)) {
      void requestAssetWaveform(assetId, assetUrl);
    }
    return unsub;
  }, [assetId, assetUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || drawWidth <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pxW = Math.min(4096, Math.floor(drawWidth * dpr));
    const pxH = Math.floor(height * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, drawWidth, height);

    const centerY = height / 2;
    const barWidth = 2.5;
    const barGap = 1.5;
    const stepPx = barWidth + barGap;
    const totalBars = Math.max(1, Math.floor(width / stepPx));
    const firstBar = Math.max(0, Math.floor(drawOffsetPx / stepPx));
    const lastBar = Math.min(totalBars - 1, Math.ceil((drawOffsetPx + drawWidth) / stepPx));
    const volScale = clip?.muted ? 0.1 : Math.min(1.9, (volume || 100) / 100);
    const peakData = assetId ? getCachedWaveform(assetId) : undefined;

    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }

    ctx.fillStyle = color;

    for (let i = firstBar; i <= lastBar; i++) {
      const x = i * stepPx;
      const canvasX = x - drawOffsetPx;
      let rawAmp = 0.15;
      let fadeMul = 1;

      if (clip) {
        const localT0 = pixelsToTime(x, zoomLevel);
        const localT1 = Math.max(localT0 + 0.01, pixelsToTime(x + barWidth, zoomLevel));
        if (clip.fadeIn > 0 && localT0 < clip.fadeIn) {
          fadeMul *= Math.max(0.05, localT0 / clip.fadeIn);
        }
        if (clip.fadeOut > 0 && localT0 > clip.duration - clip.fadeOut) {
          fadeMul *= Math.max(0.05, (clip.duration - localT0) / clip.fadeOut);
        }

        if (peakData) {
          const src0 = (clip.sourceStart || 0) + mapTimelineToSourceOffset(clip, localT0);
          const src1 = (clip.sourceStart || 0) + mapTimelineToSourceOffset(clip, localT1);
          rawAmp = sampleWaveformRange(peakData, src0, src1);
        } else {
          const pseudo = Math.sin(hash + i * 789.123) * 10000;
          rawAmp = 0.25 + (pseudo - Math.floor(pseudo)) * 0.25;
        }
      } else {
        const pseudo = Math.sin(hash + i * 789.123) * 10000;
        rawAmp = pseudo - Math.floor(pseudo);
      }

      const amp = Math.max(1.5, rawAmp * (height * 0.44) * volScale * fadeMul);
      ctx.beginPath();
      ctx.roundRect(canvasX, centerY - amp, barWidth, Math.max(3, amp * 2), 1);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(drawWidth, centerY);
    ctx.stroke();
  }, [width, drawOffsetPx, drawWidth, height, volume, seed, color, clip, assetId, zoomLevel, waveRev]);

  if (drawWidth <= 0) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{ left: `${drawOffsetPx}px`, width: `${drawWidth}px`, height: `${height}px` }}
      className="absolute top-0 bottom-0 pointer-events-none opacity-90"
    />
  );
}

// Timestamp-Accurate Video Filmstrip Preview Canvas (viewport-sliced so >34s/hour videos stay silky)
function VideoFilmstripCanvas({
  clip,
  assetUrl,
  width,
  offsetPx = 0,
  visibleWidth,
  height,
  zoomLevel,
  thumbnailUrl,
  seed = 'scene',
}: {
  clip?: TimelineClip;
  assetUrl?: string;
  width: number;
  offsetPx?: number;
  visibleWidth?: number;
  height: number;
  zoomLevel: number;
  thumbnailUrl?: string;
  seed?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frameRev, setFrameRev] = useState(0);
  const assetId = clip?.assetId;
  const drawOffsetPx = Math.max(0, Math.floor(offsetPx));
  const drawWidth = Math.max(0, Math.min(width - drawOffsetPx, Math.ceil(visibleWidth ?? width)));

  useEffect(() => {
    if (!assetId || !assetUrl) return;
    return subscribeFilmstrip(assetId, () => setFrameRev((r) => r + 1));
  }, [assetId, assetUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || drawWidth <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pxW = Math.min(4096, Math.floor(drawWidth * dpr));
    const pxH = Math.floor(height * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, drawWidth, height);

    const frameAspect = 16 / 9;
    const frameWidth = Math.max(44, Math.round(height * frameAspect));
    const totalFrames = Math.ceil(width / frameWidth);
    const firstFrame = Math.max(0, Math.floor(drawOffsetPx / frameWidth));
    const lastFrame = Math.min(totalFrames - 1, Math.floor((drawOffsetPx + drawWidth) / frameWidth));
    const bucketMs = getFrameBucketMs(zoomLevel);

    const missingTimes: number[] = [];

    for (let i = firstFrame; i <= lastFrame; i++) {
      const x = i * frameWidth;
      const tileW = Math.min(frameWidth, width - x);
      const canvasX = x - drawOffsetPx;
      const localMidTime = pixelsToTime(x + tileW * 0.5, zoomLevel);
      const srcTime = clip
        ? (clip.sourceStart || 0) + mapTimelineToSourceOffset(clip, localMidTime)
        : localMidTime;

      const decoded = assetId ? getCachedVideoFrame(assetId, srcTime, bucketMs) : undefined;
      const frameCanvas =
        decoded ?? (assetId ? getNearestCachedFrame(assetId, srcTime) : undefined);

      if (!decoded && assetId && assetUrl) {
        missingTimes.push(srcTime);
      }

      if (frameCanvas) {
        ctx.drawImage(frameCanvas, 0, 0, frameCanvas.width, frameCanvas.height, canvasX, 0, tileW, height);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(canvasX + tileW - 1, 0, 1, height);
        continue;
      }

      let hash = 0;
      for (let h = 0; h < seed.length; h++) {
        hash = (hash << 5) - hash + seed.charCodeAt(h);
        hash |= 0;
      }
      const grad = ctx.createLinearGradient(canvasX, 0, canvasX, height);
      const hueShift = Math.abs((hash + i * 17) % 40);
      grad.addColorStop(0, `hsl(${205 + hueShift}, 32%, 22%)`);
      grad.addColorStop(1, `hsl(${215 + hueShift}, 28%, 14%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(canvasX, 0, tileW, height);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(canvasX + tileW - 1, 0, 1, height);
    }

    if (assetId && assetUrl && missingTimes.length > 0) {
      queueVideoFrames(assetId, assetUrl, missingTimes, bucketMs);
    } else if (!assetUrl && thumbnailUrl) {
      const img = new Image();
      img.src = thumbnailUrl;
      img.onload = () => {
        if (!canvasRef.current) return;
        const cctx = canvasRef.current.getContext('2d');
        if (!cctx) return;
        for (let i = firstFrame; i <= lastFrame; i++) {
          const x = i * frameWidth;
          const tileW = Math.min(frameWidth, width - x);
          const canvasX = x - drawOffsetPx;
          cctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, canvasX, 0, tileW, height);
          cctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          cctx.fillRect(canvasX + tileW - 1, 0, 1, height);
        }
      };
    }
  }, [width, drawOffsetPx, drawWidth, height, thumbnailUrl, seed, clip, assetId, assetUrl, zoomLevel, frameRev]);

  if (drawWidth <= 0) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{ left: `${drawOffsetPx}px`, width: `${drawWidth}px`, height: `${height}px` }}
      className="absolute top-0 bottom-0 pointer-events-none"
    />
  );
}

export function Timeline() {
  const {
    project,
    currentTime,
    seek,
    pausePlayback,
    zoomLevel,
    setZoom,
    zoomIn,
    zoomOut,
    zoomFit,
    selectedClipId,
    selectedClip,
    selectClip,
    moveClip,
    commitMoveClip,
    moveClipToTrack,
    moveSelectedClipVertical,
    trimClipTimeline,
    commitTrimClip,
    splitClipAtPlayhead,
    deleteClip,
    copyClip,
    pasteClip,
    addClipToTrack,
    addTrack,
    deleteTrack,
    toggleTrackMute,
    toggleTrackLock,
    toggleTrackVisibility,
    snapping,
    setSnapping,
    addTextClip,
    addRichTextClip,
    addStickerClip,
    applyClipFilterPreset,
    toggleClipLayerEffect,
    setClipTransition,
    removeClipTransition,
    extractAudioFromClip,
    autoAlignClipDrop,
    autoPackTrack,
    canUndo,
    canRedo,
    undo,
    redo,
    beginHistoryTransaction,
    endHistoryTransaction
  } = useEditor();

  const containerRef = useRef<HTMLDivElement>(null);
  const tracksListRef = useRef<HTMLDivElement>(null);
  const programmaticScrollTargetRef = useRef<number>(0);
  const panSessionRef = useRef<{
    startClientX: number;
    startTime: number;
    movedPx: number;
    clickSeekTime?: number;
  } | null>(null);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);

  // Scroll track row vertically into view when selected (never alter horizontal scrollLeft so centered playhead stays true)
  useEffect(() => {
    if (!selectedClipId || !tracksListRef.current || !containerRef.current) return;
    const el = tracksListRef.current.querySelector(`[data-timeline-clip-id="${selectedClipId}"]`) as HTMLElement | null;
    const scroller = containerRef.current;
    if (el) {
      const cRect = scroller.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      if (eRect.top < cRect.top + 36) {
        scroller.scrollTop = Math.max(0, scroller.scrollTop - (cRect.top + 40 - eRect.top));
      } else if (eRect.bottom > cRect.bottom - 12) {
        scroller.scrollTop += eRect.bottom - cRect.bottom + 16;
      }
    }
  }, [selectedClipId]);
  
  // Dragging state (X and Y with track detection)
  const [draggedClip, setDraggedClip] = useState<{ 
    id: string; 
    trackId: string;
    startX: number; 
    startY: number; 
    origStart: number;
    hoverTrackId?: string;
    isAboveTop?: boolean;
    isBelowBottom?: boolean;
  } | null>(null);

  // Trimming state (in/out points with live HUD)
  const [trimmingClip, setTrimmingClip] = useState<{ 
    id: string; 
    handle: 'left' | 'right'; 
    startX: number; 
    origTimelineStart: number; 
    origDuration: number;
    origSourceStart: number; 
    origSourceEnd: number; 
  } | null>(null);

  // Live trim tooltip info
  const [trimHUD, setTrimHUD] = useState<{ 
    visible: boolean; 
    x: number; 
    y: number; 
    timecode: string; 
    durationText: string; 
  }>({
    visible: false,
    x: 0,
    y: 0,
    timecode: '',
    durationText: '',
  });

  const [autoAlignEnabled, setAutoAlignEnabled] = useState(true);
  const [activeSnapGuide, setActiveSnapGuide] = useState<{ time: number; label: string } | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(1000);
  const duration = project.timeline.duration;
  const centerOffsetPx = Math.floor(viewportWidth / 2);

  const liveNavRef = useRef({
    zoomLevel,
    duration,
    seek,
    pausePlayback,
  });

  useEffect(() => {
    liveNavRef.current = { zoomLevel, duration, seek, pausePlayback };
  }, [zoomLevel, duration, seek, pausePlayback]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const syncViewport = () => {
      const nextWidth = Math.max(320, el.clientWidth - TIMELINE_HEADER_WIDTH);
      setViewportWidth(nextWidth);
    };

    const handleScroll = () => {
      const left = el.scrollLeft;
      setScrollLeft(left);
      // Any user scroll/scrollbar/wheel disturbance pauses playback and seeks under centered needle
      if (!panSessionRef.current && Math.abs(left - programmaticScrollTargetRef.current) > 2.5) {
        const nav = liveNavRef.current;
        nav.pausePlayback();
        programmaticScrollTargetRef.current = left;
        const nextTime = Math.max(0, Math.min(nav.duration, pixelsToTime(left, nav.zoomLevel)));
        nav.seek(nextTime);
      }
    };

    syncViewport();
    el.addEventListener('scroll', handleScroll, { passive: true });
    const ro = new ResizeObserver(syncViewport);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      ro.disconnect();
    };
  }, []);

  // Keep timeline scrolled so currentTime stays centered directly beneath the fixed white needle
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const target = timeToPixels(currentTime, zoomLevel);
    programmaticScrollTargetRef.current = target;
    if (Math.abs(el.scrollLeft - target) > 0.75) {
      el.scrollLeft = target;
    }
  }, [currentTime, zoomLevel, viewportWidth]);

  const timelineContentWidth = Math.max(viewportWidth, timeToPixels(duration + 12, zoomLevel));
  const totalWidth = TIMELINE_HEADER_WIDTH + centerOffsetPx + timelineContentWidth + centerOffsetPx;
  const rulerIntervals = useMemo(() => getRulerIntervals(zoomLevel), [zoomLevel]);

  // Magnetic Snap points (scalar array kept for edge trim operations)
  const snapPoints = useMemo(() => {
    const points: number[] = [0, currentTime];
    project.timeline.tracks.forEach(track => {
      track.clips.forEach(clip => {
        points.push(clip.timelineStart);
        points.push(clip.timelineStart + clip.duration);
      });
    });
    return points;
  }, [project.timeline.tracks, currentTime]);

  // Structured Snap points for guide overlays & precision dragging
  const structuredSnapPoints = useMemo(() => {
    const points: { time: number; label: string; kind: 'clip' | 'playhead' | 'grid'; clipId?: string }[] = [
      { time: 0, label: '0ms', kind: 'grid' },
      { time: currentTime, label: `Playhead ${formatRulerTime(currentTime, true)}`, kind: 'playhead' },
    ];
    project.timeline.tracks.forEach(track => {
      track.clips.forEach(clip => {
        points.push({
          time: clip.timelineStart,
          label: `${clip.name.slice(0, 12)} Start`,
          kind: 'clip',
          clipId: clip.id,
        });
        points.push({
          time: clip.timelineStart + clip.duration,
          label: `${clip.name.slice(0, 12)} End`,
          kind: 'clip',
          clipId: clip.id,
        });
      });
    });
    return points;
  }, [project.timeline.tracks, currentTime]);

  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickViewportX = e.clientX - rect.left;
    if (clickViewportX < TIMELINE_HEADER_WIDTH) return;

    pausePlayback();
    const offsetX = clickViewportX + containerRef.current.scrollLeft - TIMELINE_HEADER_WIDTH - centerOffsetPx;
    let clickTime = pixelsToTime(offsetX, zoomLevel);
    if (snapping) {
      clickTime = snapTime(clickTime, snapPoints, 0.15);
    }
    panSessionRef.current = {
      startClientX: e.clientX,
      startTime: currentTime,
      movedPx: 0,
      clickSeekTime: Math.max(0, Math.min(duration, clickTime)),
    };
    setIsScrubbing(true);
  };

  const startTimelinePan = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    if (e.button === 1) e.preventDefault();
    pausePlayback();
    panSessionRef.current = {
      startClientX: e.clientX,
      startTime: currentTime,
      movedPx: 0,
    };
    setIsScrubbing(true);
  };

  // Ctrl + Mouse Wheel Zoom on Timeline
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          zoomIn();
        } else {
          zoomOut();
        }
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [zoomIn, zoomOut]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing && panSessionRef.current) {
        const deltaPx = e.clientX - panSessionRef.current.startClientX;
        panSessionRef.current.movedPx = Math.max(panSessionRef.current.movedPx, Math.abs(deltaPx));
        if (panSessionRef.current.movedPx >= 3) {
          // Dragging timeline left/right slides clips beneath the non-draggable centered white line
          const deltaSec = pixelsToTime(-deltaPx, zoomLevel);
          seek(Math.max(0, Math.min(duration, panSessionRef.current.startTime + deltaSec)));
        }
      } else if (draggedClip) {
        const deltaPixels = e.clientX - draggedClip.startX;
        const deltaTime = pixelsToTime(deltaPixels, zoomLevel);
        const isMainTrack = draggedClip.trackId === MAIN_VIDEO_TRACK_ID;
        let newStart = Math.max(0, draggedClip.origStart + deltaTime);
        if (snapping && !isMainTrack) {
          const activeClip = project.timeline.tracks.flatMap(t => t.clips).find(c => c.id === draggedClip.id);
          const activeDuration = activeClip?.duration ?? 3;
          const otherSnapPoints = structuredSnapPoints.filter(p => p.clipId !== draggedClip.id);
          const thresholdSec = Math.max(0.02, pixelsToTime(12, zoomLevel));
          const snapResult = solveTimelineSnap(newStart, activeDuration, otherSnapPoints, thresholdSec);
          newStart = snapResult.snappedStart;
          if (snapResult.guideTime !== null) {
            setActiveSnapGuide({
              time: snapResult.guideTime,
              label: snapResult.guideLabel || formatRulerTime(snapResult.guideTime, true),
            });
          } else {
            setActiveSnapGuide(null);
          }
        } else {
          setActiveSnapGuide(null);
        }
        moveClip(draggedClip.id, newStart);

        // Vertical track detection
        if (tracksListRef.current) {
          const trackRect = tracksListRef.current.getBoundingClientRect();
          const relativeY = e.clientY - trackRect.top;
          
          if (relativeY < 0) {
            setDraggedClip(prev => prev ? { ...prev, isAboveTop: true, isBelowBottom: false, hoverTrackId: undefined } : null);
          } else if (relativeY > trackRect.height) {
            setDraggedClip(prev => prev ? { ...prev, isAboveTop: false, isBelowBottom: true, hoverTrackId: undefined } : null);
          } else {
            // Find track element under cursor
            const trackElements = tracksListRef.current.querySelectorAll<HTMLDivElement>('[data-track-id]');
            let hoveredId: string | undefined = undefined;
            trackElements.forEach(el => {
              const rect = el.getBoundingClientRect();
              if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
                hoveredId = el.getAttribute('data-track-id') || undefined;
              }
            });
            setDraggedClip(prev => prev ? { ...prev, isAboveTop: false, isBelowBottom: false, hoverTrackId: hoveredId } : null);
          }
        }
      } else if (trimmingClip) {
        const deltaPixels = e.clientX - trimmingClip.startX;
        const deltaTime = pixelsToTime(deltaPixels, zoomLevel);

        // Find clip & asset to enforce source duration limits
        const targetClip = project.timeline.tracks.flatMap(t => t.clips).find(c => c.id === trimmingClip.id);
        const targetAsset = project.mediaLibrary.find(a => a.id === targetClip?.assetId);
        const isMedia = targetClip?.type === 'video' || targetClip?.type === 'audio';
        const maxSourceDuration = isMedia 
          ? (targetAsset?.duration || (targetClip?.sourceEnd ? targetClip.sourceEnd : 60))
          : Infinity;

        if (trimmingClip.handle === 'left') {
          // Trimming In-Point (move timelineStart right, decrease duration, increase sourceStart)
          // Video/audio cannot be extended before 0.0s of the source file
          let newSourceStart = trimmingClip.origSourceStart + deltaTime;
          if (isMedia) {
            newSourceStart = Math.max(0, newSourceStart);
          }
          newSourceStart = Math.min(trimmingClip.origSourceEnd - 0.3, newSourceStart);

          const actualDelta = newSourceStart - trimmingClip.origSourceStart;
          const newTimelineStart = Math.max(0, trimmingClip.origTimelineStart + actualDelta);
          const newDuration = trimmingClip.origSourceEnd - newSourceStart;

          trimClipTimeline(
            trimmingClip.id, 
            newTimelineStart, 
            newDuration, 
            newSourceStart, 
            trimmingClip.origSourceEnd
          );

          setTrimHUD({
            visible: true,
            x: e.clientX,
            y: e.clientY - 40,
            timecode: `IN: ${zoomLevel >= 1.1 ? secondsToMsTimecode(newTimelineStart) : secondsToTimecode(newTimelineStart, project.settings.fps)}`,
            durationText: `DUR: ${newDuration.toFixed(2)}s`
          });
        } else {
          // Trimming Out-Point (video/audio CANNOT exceed its source media file duration)
          let newDuration = trimmingClip.origDuration + deltaTime;
          if (isMedia && maxSourceDuration !== Infinity) {
            const maxAllowedDuration = Math.max(0.3, maxSourceDuration - trimmingClip.origSourceStart);
            newDuration = Math.min(maxAllowedDuration, newDuration);
          }
          newDuration = Math.max(0.3, newDuration);
          const newSourceEnd = trimmingClip.origSourceStart + newDuration;

          trimClipTimeline(
            trimmingClip.id, 
            trimmingClip.origTimelineStart, 
            newDuration, 
            trimmingClip.origSourceStart, 
            newSourceEnd
          );

          setTrimHUD({
            visible: true,
            x: e.clientX,
            y: e.clientY - 40,
            timecode: `OUT: ${zoomLevel >= 1.1 ? secondsToMsTimecode(trimmingClip.origTimelineStart + newDuration) : secondsToTimecode(trimmingClip.origTimelineStart + newDuration, project.settings.fps)}`,
            durationText: `DUR: ${newDuration.toFixed(2)}s`
          });
        }
      }
    };

    const handleMouseUp = () => {
      if (draggedClip) {
        setActiveSnapGuide(null);
        // Vertical track drop commit
        if (draggedClip.isAboveTop) {
          // Auto create track at top and place clip
          const clip = project.timeline.tracks.flatMap(t => t.clips).find(c => c.id === draggedClip.id);
          const newId = addTrack(clip?.type === 'audio' ? 'audio' : 'video', undefined, 'top');
          if (newId) {
            moveClipToTrack(draggedClip.id, newId, clip?.timelineStart || 0);
          }
        } else if (draggedClip.isBelowBottom) {
          // Auto create track at bottom and place clip
          const clip = project.timeline.tracks.flatMap(t => t.clips).find(c => c.id === draggedClip.id);
          const newId = addTrack(clip?.type === 'audio' ? 'audio' : 'video', undefined, 'bottom');
          if (newId) {
            moveClipToTrack(draggedClip.id, newId, clip?.timelineStart || 0);
          }
        } else if (draggedClip.hoverTrackId && draggedClip.hoverTrackId !== draggedClip.trackId) {
          const clip = project.timeline.tracks.flatMap(t => t.clips).find(c => c.id === draggedClip.id);
          autoAlignClipDrop(draggedClip.id, draggedClip.hoverTrackId, clip?.timelineStart ?? 0, autoAlignEnabled);
        } else {
          // Stayed on same track: commit magnetic V1 reorder or free track alignment
          const currentClip = project.timeline.tracks.flatMap(t => t.clips).find(c => c.id === draggedClip.id);
          if (currentClip && Math.abs(currentClip.timelineStart - draggedClip.origStart) > 0.001) {
            if (draggedClip.trackId === MAIN_VIDEO_TRACK_ID) {
              commitMoveClip(draggedClip.id, draggedClip.origStart, currentClip.timelineStart);
            } else if (autoAlignEnabled) {
              autoAlignClipDrop(draggedClip.id, draggedClip.trackId, currentClip.timelineStart, true);
            } else {
              commitMoveClip(draggedClip.id, draggedClip.origStart, currentClip.timelineStart);
            }
          }
        }
      }

      if (trimmingClip) {
        // Commit trim action to history only on mouseUp!
        const currentClip = project.timeline.tracks.flatMap(t => t.clips).find(c => c.id === trimmingClip.id);
        if (currentClip) {
          commitTrimClip(
            trimmingClip.id,
            trimmingClip.origTimelineStart,
            trimmingClip.origDuration,
            trimmingClip.origSourceStart,
            trimmingClip.origSourceEnd,
            currentClip.timelineStart,
            currentClip.duration,
            currentClip.sourceStart,
            currentClip.sourceEnd
          );
        }
      }

      if (draggedClip || trimmingClip) {
        endHistoryTransaction();
      }
      if (
        panSessionRef.current &&
        panSessionRef.current.movedPx < 4 &&
        panSessionRef.current.clickSeekTime !== undefined
      ) {
        seek(panSessionRef.current.clickSeekTime);
      }
      panSessionRef.current = null;
      setIsScrubbing(false);
      setDraggedClip(null);
      setTrimmingClip(null);
      setTrimHUD(prev => ({ ...prev, visible: false }));
    };

    if (isScrubbing || draggedClip || trimmingClip) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isScrubbing, 
    draggedClip, 
    trimmingClip, 
    zoomLevel, 
    snapping, 
    snapPoints, 
    structuredSnapPoints,
    autoAlignEnabled,
    project.settings.fps, 
    project.timeline.tracks, 
    project.mediaLibrary,
    moveClip, 
    commitMoveClip,
    moveClipToTrack, 
    autoAlignClipDrop,
    addTrack, 
    trimClipTimeline,
    commitTrimClip,
    endHistoryTransaction,
    duration,
    seek
  ]);

  const startClipDrag = (
    e: React.MouseEvent,
    clip: { id: string; timelineStart: number },
    track: { id: string; locked: boolean }
  ) => {
    e.stopPropagation();
    selectClip(clip.id);
    if (!track.locked) {
      beginHistoryTransaction('Move clip on timeline');
      setDraggedClip({
        id: clip.id,
        trackId: track.id,
        startX: e.clientX,
        startY: e.clientY,
        origStart: clip.timelineStart,
      });
    }
  };

  const startClipTrim = (
    e: React.MouseEvent,
    clip: { id: string; timelineStart: number; duration: number; sourceStart: number; sourceEnd: number },
    track: { locked: boolean },
    handle: 'left' | 'right'
  ) => {
    e.stopPropagation();
    if (!track.locked) {
      beginHistoryTransaction(`Trim clip ${handle} edge`);
      setTrimmingClip({
        id: clip.id,
        handle,
        startX: e.clientX,
        origTimelineStart: clip.timelineStart,
        origDuration: clip.duration,
        origSourceStart: clip.sourceStart,
        origSourceEnd: clip.sourceEnd,
      });
    }
  };

  return (
    <div className="w-full h-full bg-[#0c0d10] flex flex-col select-none overflow-hidden relative font-sans">
      {/* Live Trim HUD Tooltip */}
      {trimHUD.visible && (
        <div 
          style={{ left: `${trimHUD.x}px`, top: `${trimHUD.y}px` }} 
          className="fixed z-50 pointer-events-none transform -translate-x-1/2 bg-zinc-900/95 border border-zinc-700 px-2.5 py-1 rounded shadow-xl flex items-center gap-2 text-xs font-mono text-zinc-100"
        >
          <ChevronsLeftRight className="w-3.5 h-3.5 text-blue-400" />
          <span>{trimHUD.timecode}</span>
          <span className="text-zinc-400">·</span>
          <span className="text-emerald-400">{trimHUD.durationText}</span>
        </div>
      )}

      {/* Timeline Action Header Bar (Wrapped with React Aria Toolbar) */}
      <Toolbar 
        aria-label="Timeline Editing Controls"
        className="h-9 border-b border-zinc-800/80 bg-zinc-900/90 px-3 flex items-center justify-between text-xs z-10"
      >
        <div className="flex items-center gap-1">
          {/* Undo / Redo */}
          <Button
            size="icon"
            variant="ghost"
            onClick={undo}
            disabled={!canUndo}
            className="h-7 w-7 text-zinc-300 hover:text-white disabled:opacity-30"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={redo}
            disabled={!canRedo}
            className="h-7 w-7 text-zinc-300 hover:text-white disabled:opacity-30"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </Button>

          <div className="h-4 w-[1px] bg-zinc-800 mx-1" />

          {/* Split */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => selectedClipId && splitClipAtPlayhead(selectedClipId)}
            disabled={!selectedClipId}
            className="h-7 text-xs gap-1 text-zinc-300 hover:text-white"
            title="Split Clip at Playhead (Ctrl+K)"
          >
            <Scissors className="w-3.5 h-3.5 text-zinc-400" />
            <span>Split</span>
          </Button>

          {/* Extract Audio Action Button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => selectedClipId && extractAudioFromClip(selectedClipId)}
            disabled={!selectedClip || selectedClip.type !== 'video'}
            className="h-7 text-xs gap-1 text-zinc-300 hover:text-white"
            title="Extract audio stream to new Audio Track"
          >
            <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-400" />
            <span>Extract Audio</span>
          </Button>

          {/* Copy & Paste */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => copyClip()}
            disabled={!selectedClipId}
            className="h-7 w-7 text-zinc-400 hover:text-white"
            title="Copy Clip (Ctrl+C)"
          >
            <Copy className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => pasteClip()}
            className="h-7 w-7 text-zinc-400 hover:text-white"
            title="Paste Clip at Playhead (Ctrl+V)"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
          </Button>

          {/* Move Track Up / Down */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => moveSelectedClipVertical('up')}
            disabled={!selectedClipId}
            className="h-7 w-7 text-zinc-400 hover:text-white"
            title="Move clip up to track above (Arrow Up)"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => moveSelectedClipVertical('down')}
            disabled={!selectedClipId}
            className="h-7 w-7 text-zinc-400 hover:text-white"
            title="Move clip down to track below (Arrow Down)"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>

          {/* Delete */}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => selectedClipId && deleteClip(selectedClipId)}
            disabled={!selectedClipId}
            className="h-7 w-7 text-zinc-400 hover:text-red-400"
            title="Delete Selected Clip (Del)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>

          <div className="h-4 w-[1px] bg-zinc-800 mx-1" />

          {/* Add Subtitle */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => addTextClip('New Caption Overlay')}
            className="h-7 text-xs gap-1 text-zinc-300 hover:text-white"
          >
            <Plus className="w-3.5 h-3.5 text-zinc-400" />
            <span>Add Subtitle</span>
          </Button>
        </div>

        {/* Right: Snap, Auto-Align, Pack & Continuous React Aria Zoom Slider */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSnapping(!snapping)}
            title="Toggle Magnetic Edge Snapping"
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              snapping ? 'bg-zinc-800 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Magnet className="w-3 h-3" />
            <span>Snap</span>
          </button>

          <button
            onClick={() => setAutoAlignEnabled(!autoAlignEnabled)}
            title="Auto-Align & Dock Clips on Drop (No Overlaps)"
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
              autoAlignEnabled ? 'bg-cyan-950/70 text-cyan-300 border border-cyan-800/50' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span className="hidden sm:inline">Auto-Align</span>
          </button>

          <button
            onClick={() => autoPackTrack()}
            title="Pack Clips Together (Close Track Gaps)"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <AlignHorizontalSpaceAround className="w-3 h-3" />
            <span className="hidden lg:inline">Pack</span>
          </button>

          <div className="h-4 w-[1px] bg-zinc-800" />

          <div className="flex items-center gap-1.5">
            <Button
              size="icon"
              variant="ghost"
              onClick={zoomOut}
              className="h-6 w-6 text-zinc-400 hover:text-zinc-100"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>

            {/* Continuous React Aria Zoom Slider (supports deep millisecond zoom up to 1200%) */}
            <AriaSlider
              aria-label="Timeline Continuous Zoom Level"
              minValue={0.2}
              maxValue={12.0}
              step={0.1}
              value={zoomLevel}
              onChange={(val) => {
                const numVal = typeof val === 'number' ? val : val[0] ?? 1.0;
                setZoom(numVal);
              }}
              className="w-16 sm:w-20 hidden md:flex items-center relative select-none touch-none h-4"
            >
              <AriaSliderTrack className="relative w-full h-1 bg-zinc-800 rounded-full cursor-pointer">
                <div 
                  className="absolute top-0 bottom-0 left-0 bg-blue-500 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, Math.round(((zoomLevel - 0.2) / (12.0 - 0.2)) * 100)))}%` }}
                />
                <AriaSliderThumb className="block w-2.5 h-2.5 bg-zinc-100 rounded-full shadow hover:scale-125 focus:outline-hidden top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing border border-blue-400" />
              </AriaSliderTrack>
            </AriaSlider>

            <span className="text-[10px] font-mono text-zinc-400 w-10 text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={zoomIn}
              className="h-6 w-6 text-zinc-400 hover:text-zinc-100"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={zoomFit}
              className="h-6 w-6 text-zinc-400 hover:text-zinc-100"
              title="Zoom to Fit (Ctrl+0)"
            >
              <Maximize2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </Toolbar>

      {/* Timeline Scrollable Viewport + Fixed Non-Draggable Center Playhead Overlay */}
      <div className="flex-1 relative min-h-0 flex flex-col">
        {/* Fixed Center White Playhead Needle (stays locked & non-draggable while timeline pans left/right underneath) */}
        <div
          className="absolute top-0 bottom-0 z-40 pointer-events-none select-none"
          style={{ left: `${TIMELINE_HEADER_WIDTH + centerOffsetPx}px` }}
        >
          {/* White Circular Marker directly on the ruler line */}
          <div className="w-3.5 h-3.5 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.85)] border border-zinc-900/30 -translate-x-1/2 top-2 absolute pointer-events-none" />
          {/* Vertical White Line needle */}
          <div className="w-[1.5px] -translate-x-1/2 top-5 bottom-0 absolute bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] pointer-events-none" />
        </div>

        {/* Main Timeline Scrollable Body */}
        <div
          ref={containerRef}
          onMouseDown={(e) => {
            if (e.button === 1) startTimelinePan(e);
          }}
          className="flex-1 overflow-x-auto overflow-y-auto relative custom-scrollbar bg-[#0b0c0e]"
        >
          <div style={{ width: `${totalWidth}px` }} className="relative min-h-full">
            {/* SMPTE & Clean Interval Ruler (drag left/right to pan timeline) */}
            <div
              onMouseDown={handleRulerMouseDown}
              className="h-8 border-b border-zinc-800/80 bg-[#0c0d10] sticky top-0 z-30 flex cursor-grab active:cursor-grabbing select-none"
            >
              {/* Left Header label */}
              <div className="w-[196px] shrink-0 border-r border-zinc-800/90 bg-[#101115] px-2 flex items-center justify-between text-[10px] font-mono text-zinc-400 sticky left-0 z-40 cursor-default">
                <span className="font-semibold tracking-wider">TRACKS</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const vCount = project.timeline.tracks.filter(t => t.type === 'video').length + 1;
                      addTrack('video', `Overlay (V${vCount})`, 'top');
                    }}
                    className="px-1.5 py-0.5 rounded bg-blue-900/70 hover:bg-blue-800 text-[9px] text-blue-200 border border-blue-700/60 font-medium whitespace-nowrap cursor-pointer"
                    title="Add Video Overlay Track on Top"
                  >
                    + Overlay
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); addTrack('audio'); }}
                    className="px-1.5 py-0.5 rounded bg-emerald-900/70 hover:bg-emerald-800 text-[9px] text-emerald-200 border border-emerald-700/60 font-medium whitespace-nowrap cursor-pointer"
                    title="Add Audio Track"
                  >
                    + Audio
                  </button>
                </div>
              </div>

              {/* Adaptive Ruler intervals centered dynamically with centerOffsetPx */}
              <div className="flex-1 relative overflow-hidden">
                {(() => {
                  const { majorStep, minorStep, showMs } = rulerIntervals;
                  const visStartSec = Math.max(0, pixelsToTime(scrollLeft - centerOffsetPx, zoomLevel) - majorStep);
                  const maxTimelineSec = pixelsToTime(timelineContentWidth, zoomLevel);
                  const visEndSec = Math.min(maxTimelineSec, pixelsToTime(scrollLeft + viewportWidth - centerOffsetPx, zoomLevel) + majorStep);
                  const firstIdx = Math.max(0, Math.floor(visStartSec / minorStep));
                  const lastIdx = Math.ceil(visEndSec / minorStep);
                  const majorRatio = Math.max(1, Math.round(majorStep / minorStep));
                  const ticks: React.ReactNode[] = [];

                  for (let idx = firstIdx; idx <= lastIdx; idx++) {
                    const sec = Number((idx * minorStep).toFixed(4));
                    const left = centerOffsetPx + timeToPixels(sec, zoomLevel);
                    const isMajor = idx % majorRatio === 0;
                    const isSubSecond = showMs && Math.abs(sec - Math.round(sec)) > 0.001;

                    ticks.push(
                      <div
                        key={idx}
                        className="absolute top-0 bottom-0 flex flex-col justify-end"
                        style={{ left: `${left}px` }}
                      >
                        {isMajor && (
                          <span
                            className={`absolute top-0.5 text-[10px] font-mono pl-1 whitespace-nowrap select-none pointer-events-none ${
                              isSubSecond
                                ? 'text-cyan-400/90 font-medium'
                                : 'text-zinc-300 font-semibold'
                            }`}
                          >
                            {formatRulerTime(sec, showMs)}
                          </span>
                        )}
                        <div
                          className={`w-[1px] ${
                            isMajor
                              ? isSubSecond
                                ? 'h-2.5 bg-cyan-500/60'
                                : 'h-3 bg-zinc-400'
                              : 'h-1.5 bg-zinc-700/80'
                          }`}
                        />
                      </div>
                    );
                  }

                  return ticks;
                })()}
              </div>
            </div>

            {/* Live Magnetic Snap Alignment Guide Line */}
            {activeSnapGuide !== null && (
              <div
                style={{ left: `${TIMELINE_HEADER_WIDTH + centerOffsetPx + timeToPixels(activeSnapGuide.time, zoomLevel)}px` }}
                className="pointer-events-none absolute top-0 bottom-0 z-30 w-[1.5px] bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.85)]"
              >
                <div className="sticky top-1 -translate-x-1/2 ml-[0.75px] w-fit whitespace-nowrap rounded bg-cyan-500 px-1.5 py-0.5 text-[9px] font-mono font-bold text-zinc-950 shadow">
                  {activeSnapGuide.label}
                </div>
              </div>
            )}

            {/* Tracks List Container */}
            <div ref={tracksListRef} className="flex flex-col relative bg-[#0e0f13]">
              {/* Adaptive Timeline Subdivisions Backdrop Canvas */}
              <div className="pointer-events-none absolute top-0 bottom-0 left-[196px] right-0 z-0 overflow-hidden">
                <TimelineGridCanvas
                  zoomLevel={zoomLevel}
                  scrollLeft={scrollLeft}
                  viewportWidth={viewportWidth}
                  centerOffsetPx={centerOffsetPx}
                  trackCount={project.timeline.tracks.length}
                />
              </div>

            {/* Drop Indicator for New Track Above */}
            {draggedClip?.isAboveTop && (
              <div className="h-10 mx-2 my-1 border-2 border-dashed border-blue-400 bg-blue-500/10 rounded flex items-center justify-center text-xs font-medium text-blue-200 relative z-10">
                + Drop to create new Track at top
              </div>
            )}

            {project.timeline.tracks.map((track) => {
              const isVideoTrack = track.type === 'video';
              const isAudioTrack = track.type === 'audio';
              const trackHeight = isVideoTrack ? 'h-[68px]' : 'h-[28px]';
              const isHoveredTarget = draggedClip?.hoverTrackId === track.id;

              return (
                <div
                  key={track.id}
                  data-track-id={track.id}
                  className={`${trackHeight} border-b border-zinc-800/60 flex relative group bg-[#0e0f13]/30 transition-colors ${
                    isHoveredTarget ? 'bg-blue-950/20 ring-1 ring-blue-500/40' : ''
                  }`}
                >
                  {/* Left Track Control Header */}
                  <div className="w-[196px] shrink-0 border-r border-zinc-800/80 bg-[#101115] px-2 flex items-center justify-between gap-1.5 sticky left-0 z-30 select-none">
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border whitespace-nowrap truncate max-w-[92px] ${
                        isVideoTrack 
                          ? 'bg-blue-950/80 text-blue-300 border-blue-800/60' 
                          : isAudioTrack 
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                            : 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                      }`} title={track.name}>
                        {track.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-0.5 text-zinc-400 shrink-0">
                      <button
                        onClick={() => toggleTrackVisibility(track.id)}
                        className={`p-1 hover:text-white rounded ${!track.visible ? 'text-zinc-600' : ''}`}
                        title="Toggle Visibility"
                      >
                        {track.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => toggleTrackMute(track.id)}
                        className={`p-1 hover:text-white rounded ${track.muted ? 'text-red-400' : ''}`}
                        title="Mute Track"
                      >
                        {track.muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => toggleTrackLock(track.id)}
                        className={`p-1 hover:text-white rounded ${track.locked ? 'text-amber-400' : ''}`}
                        title="Lock Track"
                      >
                        {track.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                      </button>
                      {project.timeline.tracks.length > 2 && (
                        <button
                          onClick={() => deleteTrack(track.id)}
                          className="p-1 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove Track"
                        >
                          <Trash2 className="w-3 h-3 text-zinc-500" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Track Timeline Lane & Clips (drag empty lane left/right to pan timeline) */}
                  <div
                    onMouseDown={startTimelinePan}
                    className="flex-1 relative h-full overflow-hidden z-0 cursor-grab active:cursor-grabbing"
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes('application/x-winecut-drag')) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                      }
                    }}
                    onDrop={(e) => {
                      const raw = e.dataTransfer.getData('application/x-winecut-drag');
                      if (!raw) return;
                      e.preventDefault();
                      try {
                        const payload = JSON.parse(raw) as {
                          kind?: string;
                          assetId?: string;
                          templateId?: string;
                          stickerId?: string;
                          lutId?: string;
                          effectId?: string;
                        };
                        const rect = e.currentTarget.getBoundingClientRect();
                        const dropTime = Math.max(0, pixelsToTime(e.clientX - rect.left - centerOffsetPx, zoomLevel));
                        if (payload.kind === 'media' && payload.assetId) {
                          const found = project.mediaLibrary.find((a) => a.id === payload.assetId);
                          if (found) addClipToTrack(track.id, found);
                        } else if (payload.kind === 'text-template' && payload.templateId) {
                          const tpl = TEXT_STYLE_TEMPLATES.find((t) => t.id === payload.templateId);
                          if (tpl) addRichTextClip(tpl, { timelineStart: dropTime, trackId: track.id });
                        } else if (payload.kind === 'sticker' && payload.stickerId) {
                          const st = STICKER_PACKS.find((s) => s.id === payload.stickerId);
                          if (st) addStickerClip(st, { timelineStart: dropTime, trackId: track.id });
                        } else if (payload.kind === 'filter-preset' && payload.lutId) {
                          const hitClip = track.clips.find(
                            (c) => dropTime >= c.timelineStart && dropTime <= c.timelineStart + c.duration,
                          );
                          const preset = FILTER_PRESETS.find((f) => f.id === payload.lutId);
                          if (hitClip && preset) applyClipFilterPreset(hitClip.id, preset.id);
                        } else if (payload.kind === 'layer-effect' && payload.effectId) {
                          const hitClip = track.clips.find(
                            (c) => dropTime >= c.timelineStart && dropTime <= c.timelineStart + c.duration,
                          );
                          if (hitClip) toggleClipLayerEffect(hitClip.id, payload.effectId);
                        }
                      } catch {
                        // ignore invalid drop payload
                      }
                    }}
                  >
                    {/* '+' Transition Buttons on Adjacent Clip Seams */}
                    {findAdjacentClipSeams(track, project.timeline.transitions || []).map((seam) => (
                      <TransitionSeamButton
                        key={seam.key}
                        leftPx={centerOffsetPx + timeToPixels(seam.seamTime, zoomLevel)}
                        trackId={seam.trackId}
                        fromClipId={seam.fromClip.id}
                        toClipId={seam.toClip.id}
                        existing={seam.existingTransition}
                        onSelect={setClipTransition}
                        onRemove={removeClipTransition}
                      />
                    ))}

                    {track.clips.map((clip) => {
                      const left = centerOffsetPx + timeToPixels(clip.timelineStart, zoomLevel);
                      const width = Math.max(36, timeToPixels(clip.duration, zoomLevel));
                      const visLaneMin = Math.max(0, scrollLeft - 500);
                      const visLaneMax = scrollLeft + viewportWidth + 500;
                      const quantSliceStart = Math.max(0, Math.floor((visLaneMin - left) / 400) * 400);
                      const quantSliceEnd = Math.min(width, Math.ceil((visLaneMax - left) / 400) * 400);
                      const quantSliceWidth = Math.max(0, quantSliceEnd - quantSliceStart);
                      const isSelected = selectedClipId === clip.id;
                      const asset = project.mediaLibrary.find(a => a.id === clip.assetId);

                      // Video Clip Styling (Two-tier: Filmstrip top ~65%, Audio waveform bottom ~35%)
                      if (clip.type === 'video') {
                        return (
                          <div
                            key={clip.id}
                            data-timeline-clip-id={clip.id}
                            onMouseDown={(e) => startClipDrag(e, clip, track)}
                            style={{
                              left: `${left}px`,
                              width: `${width}px`,
                            }}
                            className={`absolute top-1 bottom-1 rounded-lg border flex flex-col cursor-move select-none overflow-hidden transition-shadow group/clip ${
                              isSelected 
                                ? 'border-white ring-2 ring-white/90 shadow-[0_0_15px_rgba(255,255,255,0.3)] z-10' 
                                : 'border-zinc-700/60 hover:border-zinc-500 bg-zinc-900 shadow-md'
                            }`}
                          >
                            {/* Top Tier: Time-Accurate Video Filmstrip (~65% height) */}
                            <div className="relative flex-1 overflow-hidden min-h-[38px] bg-zinc-950">
                              <VideoFilmstripCanvas
                                clip={clip}
                                assetUrl={asset?.url}
                                width={width}
                                offsetPx={quantSliceStart}
                                visibleWidth={quantSliceWidth}
                                height={38}
                                zoomLevel={zoomLevel}
                                thumbnailUrl={asset?.thumbnailUrl}
                                seed={clip.name + clip.id}
                              />

                              {/* Title Badge Overlay */}
                              <div className="absolute top-1 left-2 z-10 flex items-center gap-1.5 bg-black/65 px-1.5 py-0.5 rounded text-[10px] text-white font-medium drop-shadow-md">
                                <Film className="w-3 h-3 text-blue-400 shrink-0" />
                                <span className="truncate max-w-[130px]">{clip.name}</span>
                              </div>

                              <div className="absolute top-1 right-2 z-10 text-[9px] font-mono text-white/80 bg-black/50 px-1 rounded">
                                {clip.duration.toFixed(1)}s
                              </div>
                            </div>

                            {/* Bottom Tier: Integrated Synchronized Audio Waveform Lane (~35% height) */}
                            <div className="h-[22px] bg-[#101216]/95 border-t border-black/40 relative overflow-hidden flex items-center">
                              <AudioWaveformCanvas
                                clip={clip}
                                assetUrl={asset?.url}
                                width={width}
                                offsetPx={quantSliceStart}
                                visibleWidth={quantSliceWidth}
                                height={22}
                                zoomLevel={zoomLevel}
                                volume={clip.volume}
                                seed={clip.name + clip.id}
                                color="#94a3b8"
                              />
                            </div>

                            {/* Left Trim Handle (In-Point) */}
                            <div
                              onMouseDown={(e) => startClipTrim(e, clip, track, 'left')}
                              className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/40 active:bg-white/60 z-20 flex items-center justify-center transition-colors group/trimL"
                              title="Trim In-Point (Drag to Shrink or Expand)"
                            >
                              <div className="w-[2px] h-4 bg-white/70 group-hover/trimL:bg-white rounded-full" />
                            </div>

                            {/* Right Trim Handle (Out-Point) */}
                            <div
                              onMouseDown={(e) => startClipTrim(e, clip, track, 'right')}
                              className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/40 active:bg-white/60 z-20 flex items-center justify-center transition-colors group/trimR"
                              title="Trim Out-Point (Drag to Shrink or Expand)"
                            >
                              <div className="w-[2px] h-4 bg-white/70 group-hover/trimR:bg-white rounded-full" />
                            </div>
                          </div>
                        );
                      }

                      // Dedicated Audio Clip Styling (Matching VO_Taylor and Let'sGoSurfing in reference image)
                      if (clip.type === 'audio') {
                        // Alternate colors between tracks or presets (Indigo vs Emerald)
                        const isVoiceover = clip.name.toLowerCase().includes('vo') || track.name.toLowerCase().includes('1');
                        const bgGradient = isVoiceover 
                          ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 border-indigo-400/50' 
                          : 'bg-gradient-to-r from-teal-500 to-emerald-500 border-teal-300/50';

                        return (
                          <div
                            key={clip.id}
                            data-timeline-clip-id={clip.id}
                            onMouseDown={(e) => startClipDrag(e, clip, track)}
                            style={{
                              left: `${left}px`,
                              width: `${width}px`,
                            }}
                            className={`absolute top-0.5 bottom-0.5 rounded-md border text-[11px] flex items-center justify-between cursor-move select-none overflow-hidden transition-shadow group/clip ${bgGradient} ${
                              isSelected 
                                ? 'ring-2 ring-white border-white shadow-[0_0_15px_rgba(255,255,255,0.4)] z-10' 
                                : 'shadow-md hover:brightness-105'
                            }`}
                          >
                            {/* Fade In Corner Triangle Handle (Reference Image Feature) */}
                            <div className="absolute top-0 left-0 w-0 h-0 border-t-[6px] border-t-white/80 border-r-[6px] border-r-transparent z-10" />

                            {/* Centered Real Audio Waveform Canvas */}
                            <AudioWaveformCanvas 
                              clip={clip}
                              assetUrl={asset?.url}
                              width={width}
                              offsetPx={quantSliceStart}
                              visibleWidth={quantSliceWidth}
                              height={22}
                              zoomLevel={zoomLevel}
                              volume={clip.volume} 
                              seed={clip.name + clip.id} 
                              color="rgba(255, 255, 255, 0.75)"
                            />

                            {/* Fade Out Corner Triangle Handle (Reference Image Feature) */}
                            <div className="absolute top-0 right-0 w-0 h-0 border-t-[6px] border-t-white/80 border-l-[6px] border-l-transparent z-10" />

                            {/* Title & Info */}
                            <div className="flex items-center gap-1 min-w-0 px-2 z-10">
                              <Music className="w-3 h-3 shrink-0 text-white drop-shadow" />
                              <span className="truncate font-semibold text-[10px] text-white drop-shadow">
                                {clip.name}
                              </span>
                            </div>

                            <span className="text-[9px] font-mono text-white/90 shrink-0 pr-2.5 z-10 drop-shadow">
                              {clip.duration.toFixed(1)}s
                            </span>

                            {/* Left Trim Handle */}
                            <div
                              onMouseDown={(e) => startClipTrim(e, clip, track, 'left')}
                              className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 active:bg-white/60 z-20"
                            />

                            {/* Right Trim Handle */}
                            <div
                              onMouseDown={(e) => startClipTrim(e, clip, track, 'right')}
                              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 active:bg-white/60 z-20"
                            />
                          </div>
                        );
                      }

                      // CapCut-Style Image Clip Styling
                      if (clip.type === 'image') {
                        return (
                          <div
                            key={clip.id}
                            data-timeline-clip-id={clip.id}
                            onMouseDown={(e) => startClipDrag(e, clip, track)}
                            style={{
                              left: `${left}px`,
                              width: `${width}px`,
                            }}
                            className={`absolute top-1 bottom-1 rounded-lg border flex items-center justify-between cursor-move select-none overflow-hidden transition-shadow group/clip bg-gradient-to-r from-purple-900/90 to-fuchsia-900/80 ${
                              isSelected
                                ? 'border-white ring-2 ring-white/90 shadow-[0_0_15px_rgba(255,255,255,0.3)] z-10'
                                : 'border-purple-500/50 hover:border-purple-400 shadow-md'
                            }`}
                          >
                            {asset?.thumbnailUrl && (
                              <img
                                src={asset.thumbnailUrl}
                                alt={clip.name}
                                className="h-full w-12 object-cover shrink-0 border-r border-purple-500/30 pointer-events-none"
                              />
                            )}
                            <div className="flex items-center gap-1.5 min-w-0 px-2 z-10 flex-1">
                              <ImageIcon className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                              <span className="truncate font-semibold text-[11px] text-white">{clip.name}</span>
                            </div>
                            <span className="text-[9px] font-mono text-white/80 shrink-0 pr-3 z-10">
                              {clip.duration.toFixed(1)}s
                            </span>

                            {/* Left Trim Handle */}
                            <div
                              onMouseDown={(e) => startClipTrim(e, clip, track, 'left')}
                              className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 active:bg-white/60 z-20"
                            />
                            {/* Right Trim Handle */}
                            <div
                              onMouseDown={(e) => startClipTrim(e, clip, track, 'right')}
                              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 active:bg-white/60 z-20"
                            />
                          </div>
                        );
                      }

                      // Sticker Clip Styling
                      if (clip.type === 'sticker') {
                        return (
                          <div
                            key={clip.id}
                            data-timeline-clip-id={clip.id}
                            onMouseDown={(e) => startClipDrag(e, clip, track)}
                            style={{
                              left: `${left}px`,
                              width: `${width}px`,
                            }}
                            className={`absolute top-1 bottom-1 rounded-md border flex items-center justify-between cursor-move select-none overflow-hidden transition-shadow group/clip bg-gradient-to-r from-cyan-900/90 to-teal-900/80 ${
                              isSelected
                                ? 'border-white ring-2 ring-white/90 shadow-[0_0_15px_rgba(255,255,255,0.3)] z-10'
                                : 'border-cyan-500/50 hover:border-cyan-400 shadow-md'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 px-2 z-10 flex-1">
                              {clip.stickerSvg && (
                                <img
                                  src={`data:image/svg+xml;utf8,${encodeURIComponent(clip.stickerSvg)}`}
                                  alt={clip.name}
                                  className="h-5 w-5 shrink-0 object-contain pointer-events-none"
                                />
                              )}
                              <span className="truncate font-semibold text-[11px] text-white">{clip.name}</span>
                            </div>
                            <span className="text-[9px] font-mono text-white/80 shrink-0 pr-3 z-10">
                              {clip.duration.toFixed(1)}s
                            </span>
                            <div
                              onMouseDown={(e) => startClipTrim(e, clip, track, 'left')}
                              className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 active:bg-white/60 z-20"
                            />
                            <div
                              onMouseDown={(e) => startClipTrim(e, clip, track, 'right')}
                              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 active:bg-white/60 z-20"
                            />
                          </div>
                        );
                      }

                      // Text / Subtitle Clip Styling
                      return (
                        <div
                          key={clip.id}
                          data-timeline-clip-id={clip.id}
                          onMouseDown={(e) => startClipDrag(e, clip, track)}
                          style={{
                            left: `${left}px`,
                            width: `${width}px`,
                          }}
                          className={`absolute top-0.5 bottom-0.5 rounded-md border text-[11px] flex items-center justify-between cursor-move select-none overflow-hidden transition-shadow group/clip bg-gradient-to-r from-amber-700 to-amber-800 border-amber-500/50 text-white ${
                            isSelected 
                              ? 'ring-2 ring-white border-white shadow-[0_0_15px_rgba(255,255,255,0.4)] z-10' 
                              : 'shadow-md hover:brightness-105'
                          }`}
                        >
                          <div className="flex items-center gap-1 min-w-0 px-2 z-10">
                            <Type className="w-3 h-3 shrink-0 text-amber-200" />
                            <span className="truncate font-semibold text-[10px]">
                              {clip.textContent || clip.name}
                            </span>
                          </div>

                          <span className="text-[9px] font-mono text-white/80 shrink-0 pr-2.5 z-10">
                            {clip.duration.toFixed(1)}s
                          </span>

                          {/* Trim handles */}
                          <div
                            onMouseDown={(e) => startClipTrim(e, clip, track, 'left')}
                            className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 active:bg-white/60 z-20"
                          />
                          <div
                            onMouseDown={(e) => startClipTrim(e, clip, track, 'right')}
                            className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 active:bg-white/60 z-20"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Drop Indicator for New Track Below */}
            {draggedClip?.isBelowBottom && (
              <div className="h-10 mx-2 my-1 border-2 border-dashed border-emerald-400 bg-emerald-500/10 rounded flex items-center justify-center text-xs font-medium text-emerald-200">
                + Drop to create new Track at bottom
              </div>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
