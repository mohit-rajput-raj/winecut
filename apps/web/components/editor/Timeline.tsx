'use client';

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
import { solveTimelineSnap } from '../../lib/editor/canvas-layout';
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

/**
 * Adaptive timeline grid canvas rendering adaptive second/millisecond
 * subdivisions across the active scroll viewport at native DPR.
 */
function TimelineGridCanvas({
  zoomLevel,
  scrollLeft,
  viewportWidth,
  trackCount,
}: {
  zoomLevel: number;
  scrollLeft: number;
  viewportWidth: number;
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
    const startSec = Math.max(0, pixelsToTime(scrollLeft, zoomLevel));
    const endSec = pixelsToTime(scrollLeft + drawWidth, zoomLevel) + majorStep;

    const firstMinorIdx = Math.floor(startSec / minorStep);
    const lastMinorIdx = Math.ceil(endSec / minorStep);
    const majorRatio = Math.max(1, Math.round(majorStep / minorStep));

    for (let idx = firstMinorIdx; idx <= lastMinorIdx; idx++) {
      const sec = Number((idx * minorStep).toFixed(4));
      const x = timeToPixels(sec, zoomLevel) - scrollLeft;
      if (x < -1 || x > drawWidth + 1) continue;

      const isMajor = idx % majorRatio === 0;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, drawHeight);
      ctx.strokeStyle = isMajor ? 'rgba(113, 113, 122, 0.24)' : 'rgba(63, 63, 70, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [zoomLevel, scrollLeft, viewportWidth, trackCount]);

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

// Canvas Audio Waveform Component
function AudioWaveformCanvas({ 
  width, 
  height, 
  volume, 
  seed,
  color = '#94a3b8'
}: { 
  width: number; 
  height: number; 
  volume: number; 
  seed: string; 
  color?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // Pseudorandom deterministic waveform based on seed
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }

    const pseudoRandom = (idx: number) => {
      const x = Math.sin(hash + idx * 789.123) * 10000;
      return x - Math.floor(x);
    };

    const centerY = height / 2;
    const barWidth = 2.5;
    const barGap = 1.5;
    const totalBars = Math.floor(width / (barWidth + barGap));
    const volScale = Math.min(1.8, (volume || 100) / 100);

    ctx.fillStyle = color;

    for (let i = 0; i < totalBars; i++) {
      const x = i * (barWidth + barGap);
      const rawAmp = pseudoRandom(i);
      // Smoothed envelope calculation
      const envelope = Math.sin((i / totalBars) * Math.PI * 6) * 0.3 + 0.7;
      const amp = Math.max(2, rawAmp * (height * 0.44) * volScale * envelope);

      ctx.beginPath();
      ctx.roundRect(x, centerY - amp, barWidth, Math.max(4, amp * 2), 1);
      ctx.fill();
    }

    // Subtle horizontal baseline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

  }, [width, height, volume, seed, color]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ width: `${width}px`, height: `${height}px` }} 
      className="absolute inset-0 pointer-events-none opacity-90" 
    />
  );
}

// Canvas Video Filmstrip Preview Component (Repeating frames matching reference image)
function VideoFilmstripCanvas({ 
  width, 
  height,
  thumbnailUrl,
  seed = 'scene'
}: { 
  width: number; 
  height: number; 
  thumbnailUrl?: string;
  seed?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const frameAspect = 16 / 9;
    const frameWidth = Math.max(40, Math.round(height * frameAspect));
    const totalFrames = Math.ceil(width / frameWidth);

    if (thumbnailUrl) {
      // Draw real thumbnail image repeating side-by-side
      const img = new Image();
      img.src = thumbnailUrl;
      img.onload = () => {
        if (!canvasRef.current) return;
        const currentCtx = canvasRef.current.getContext('2d');
        if (!currentCtx) return;

        currentCtx.save();
        for (let i = 0; i < totalFrames; i++) {
          const x = i * frameWidth;
          const drawW = Math.min(frameWidth, width - x);
          currentCtx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, x, 0, drawW, height);

          // Frame separator line
          currentCtx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          currentCtx.fillRect(x + drawW - 1, 0, 1, height);
        }
        currentCtx.restore();
      };
      if (img.complete && img.naturalWidth > 0) {
        for (let i = 0; i < totalFrames; i++) {
          const x = i * frameWidth;
          const drawW = Math.min(frameWidth, width - x);
          ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, x, 0, drawW, height);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.fillRect(x + drawW - 1, 0, 1, height);
        }
      }
    } else {
      // Procedural cinematic filmstrip scene (ocean, sunset, camper vibes as in reference photo)
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
      }

      for (let i = 0; i < totalFrames; i++) {
        const x = i * frameWidth;
        const drawW = Math.min(frameWidth, width - x);

        // Gradient representing cinematic footage
        const grad = ctx.createLinearGradient(x, 0, x, height);
        const hueShift = Math.abs((hash + i * 17) % 40);
        grad.addColorStop(0, `hsl(${195 + hueShift}, 45%, 45%)`); // Ocean blue / sky
        grad.addColorStop(0.55, `hsl(${180 + hueShift}, 50%, 55%)`); // Surf / turquoise
        grad.addColorStop(1, `hsl(${35 + hueShift}, 60%, 45%)`); // Golden sand / beach

        ctx.fillStyle = grad;
        ctx.fillRect(x, 0, drawW, height);

        // Subtle frame divider
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x + drawW - 1, 0, 1, height);

        // Frame number stamp in top corner
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = '8px monospace';
        ctx.fillText(`#${(i + 1).toString().padStart(2, '0')}`, x + 4, 11);
      }
    }
  }, [width, height, thumbnailUrl, seed]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ width: `${width}px`, height: `${height}px` }} 
      className="absolute inset-0 pointer-events-none" 
    />
  );
}

export function Timeline() {
  const {
    project,
    currentTime,
    seek,
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
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);

  // Scroll timeline bar into view automatically when selected (e.g. from Video Window click)
  useEffect(() => {
    if (!selectedClipId || !tracksListRef.current) return;
    const el = tracksListRef.current.querySelector(`[data-timeline-clip-id="${selectedClipId}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
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
  const [viewportWidth, setViewportWidth] = useState(1200);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const syncViewport = () => {
      setScrollLeft(el.scrollLeft);
      setViewportWidth(Math.max(400, el.clientWidth - 180));
    };

    syncViewport();
    el.addEventListener('scroll', syncViewport, { passive: true });
    const ro = new ResizeObserver(syncViewport);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', syncViewport);
      ro.disconnect();
    };
  }, []);

  const duration = project.timeline.duration;
  const totalWidth = Math.max(1400, timeToPixels(duration + 10, zoomLevel));
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
    setIsScrubbing(true);
    handleRulerScrub(e);
  };

  const handleRulerScrub = (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const offsetX = e.clientX - rect.left + scrollLeft - 180;
    if (offsetX < 0) return;

    let targetTime = pixelsToTime(offsetX, zoomLevel);
    if (snapping) {
      targetTime = snapTime(targetTime, snapPoints, 0.15);
    }
    seek(Math.max(0, Math.min(duration, targetTime)));
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
      if (isScrubbing) {
        handleRulerScrub(e);
      } else if (draggedClip) {
        const deltaPixels = e.clientX - draggedClip.startX;
        const deltaTime = pixelsToTime(deltaPixels, zoomLevel);
        let newStart = Math.max(0, draggedClip.origStart + deltaTime);
        if (snapping) {
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
          // Stayed on same track: commit & auto-align drop on mouseUp
          const currentClip = project.timeline.tracks.flatMap(t => t.clips).find(c => c.id === draggedClip.id);
          if (currentClip && Math.abs(currentClip.timelineStart - draggedClip.origStart) > 0.001) {
            if (autoAlignEnabled) {
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
    endHistoryTransaction
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

  const playheadX = 180 + timeToPixels(currentTime, zoomLevel);

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

      {/* Main Timeline Scrollable Body */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative custom-scrollbar bg-[#0b0c0e]"
      >
        <div style={{ width: `${totalWidth}px` }} className="relative min-h-full">
          {/* SMPTE & Clean Interval Ruler (Matching Reference Image) */}
          <div 
            onMouseDown={handleRulerMouseDown}
            className="h-8 border-b border-zinc-800/80 bg-[#0c0d10] sticky top-0 z-20 flex cursor-pointer select-none"
          >
            {/* Left Header label */}
            <div className="w-[180px] shrink-0 border-r border-zinc-800/90 bg-[#101115] px-3 flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span className="font-semibold tracking-wider">TRACKS</span>
              <div className="flex items-center gap-1">
                <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    const vCount = project.timeline.tracks.filter(t => t.type === 'video').length + 1;
                    addTrack('video', `Overlay (V${vCount})`, 'top'); 
                  }}
                  className="px-1.5 py-0.5 rounded bg-blue-900/70 hover:bg-blue-800 text-[9px] text-blue-200 border border-blue-700/60 font-medium"
                  title="Add Video Overlay Track on Top"
                >
                  + Overlay
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); addTrack('audio'); }}
                  className="px-1.5 py-0.5 rounded bg-emerald-900/70 hover:bg-emerald-800 text-[9px] text-emerald-200 border border-emerald-700/60 font-medium"
                  title="Add Audio Track"
                >
                  + Audio
                </button>
              </div>
            </div>

            {/* Adaptive Ruler intervals: transitions automatically into millisecond subdivisions on zoom */}
            <div className="flex-1 relative overflow-hidden">
              {(() => {
                const { majorStep, minorStep, showMs } = rulerIntervals;
                const visStartSec = Math.max(0, pixelsToTime(scrollLeft, zoomLevel) - majorStep);
                const maxTimelineSec = pixelsToTime(totalWidth, zoomLevel);
                const visEndSec = Math.min(maxTimelineSec, pixelsToTime(scrollLeft + viewportWidth, zoomLevel) + majorStep);
                const firstIdx = Math.max(0, Math.floor(visStartSec / minorStep));
                const lastIdx = Math.ceil(visEndSec / minorStep);
                const majorRatio = Math.max(1, Math.round(majorStep / minorStep));
                const ticks: React.ReactNode[] = [];

                for (let idx = firstIdx; idx <= lastIdx; idx++) {
                  const sec = Number((idx * minorStep).toFixed(4));
                  const left = timeToPixels(sec, zoomLevel);
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

          {/* White Circular Playhead Needle (Matching Reference Image) */}
          <div
            className="absolute top-0 bottom-0 z-30 pointer-events-none"
            style={{ left: `${playheadX}px` }}
          >
            {/* White Circular Knob directly on the ruler line */}
            <div 
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsScrubbing(true);
              }}
              className="w-4 h-4 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.8)] border border-zinc-900/30 -translate-x-1/2 top-1.5 absolute pointer-events-auto cursor-ew-resize hover:scale-110 active:scale-95 transition-transform" 
            />
            {/* Vertical White Line needle */}
            <div className="w-[1.5px] h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
          </div>

          {/* Live Magnetic Snap Alignment Guide Line */}
          {activeSnapGuide !== null && (
            <div
              style={{ left: `${180 + timeToPixels(activeSnapGuide.time, zoomLevel)}px` }}
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
            <div className="pointer-events-none absolute top-0 bottom-0 left-[180px] right-0 z-0 overflow-hidden">
              <TimelineGridCanvas
                zoomLevel={zoomLevel}
                scrollLeft={scrollLeft}
                viewportWidth={viewportWidth}
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
              const trackHeight = isVideoTrack ? 'h-[74px]' : 'h-[44px]';
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
                  <div className="w-[180px] shrink-0 border-r border-zinc-800/80 bg-[#101115] px-2.5 flex items-center justify-between sticky left-0 z-10 select-none">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                        isVideoTrack 
                          ? 'bg-blue-950/80 text-blue-300 border-blue-800/60' 
                          : isAudioTrack 
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                            : 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                      }`}>
                        {track.name}
                      </span>
                      <span className="text-[11px] font-medium text-zinc-400 capitalize truncate max-w-[60px]">
                        {track.type}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-zinc-400">
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

                  {/* Track Timeline Lane & Clips */}
                  <div className="flex-1 relative h-full overflow-hidden">
                    {track.clips.map((clip) => {
                      const left = timeToPixels(clip.timelineStart, zoomLevel);
                      const width = Math.max(36, timeToPixels(clip.duration, zoomLevel));
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
                            {/* Top Tier: Repeating Video Filmstrip (~65% height) */}
                            <div className="relative flex-1 overflow-hidden min-h-[42px] bg-zinc-950">
                              <VideoFilmstripCanvas
                                width={width}
                                height={44}
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
                                width={width}
                                height={22}
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
                            className={`absolute top-1 bottom-1 rounded-md border text-xs flex items-center justify-between cursor-move select-none overflow-hidden transition-shadow group/clip ${bgGradient} ${
                              isSelected 
                                ? 'ring-2 ring-white border-white shadow-[0_0_15px_rgba(255,255,255,0.4)] z-10' 
                                : 'shadow-md hover:brightness-105'
                            }`}
                          >
                            {/* Fade In Corner Triangle Handle (Reference Image Feature) */}
                            <div className="absolute top-0 left-0 w-0 h-0 border-t-[8px] border-t-white/80 border-r-[8px] border-r-transparent z-10" />

                            {/* Centered Waveform Canvas */}
                            <AudioWaveformCanvas 
                              width={width} 
                              height={34} 
                              volume={clip.volume} 
                              seed={clip.name + clip.id} 
                              color="rgba(255, 255, 255, 0.75)"
                            />

                            {/* Fade Out Corner Triangle Handle (Reference Image Feature) */}
                            <div className="absolute top-0 right-0 w-0 h-0 border-t-[8px] border-t-white/80 border-l-[8px] border-l-transparent z-10" />

                            {/* Title & Info */}
                            <div className="flex items-center gap-1.5 min-w-0 px-2.5 z-10">
                              <Music className="w-3.5 h-3.5 shrink-0 text-white drop-shadow" />
                              <span className="truncate font-semibold text-[11px] text-white drop-shadow">
                                {clip.name}
                              </span>
                            </div>

                            <span className="text-[9px] font-mono text-white/90 shrink-0 pr-3 z-10 drop-shadow">
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
                          className={`absolute top-1 bottom-1 rounded-md border text-xs flex items-center justify-between cursor-move select-none overflow-hidden transition-shadow group/clip bg-gradient-to-r from-amber-700 to-amber-800 border-amber-500/50 text-white ${
                            isSelected 
                              ? 'ring-2 ring-white border-white shadow-[0_0_15px_rgba(255,255,255,0.4)] z-10' 
                              : 'shadow-md hover:brightness-105'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 px-2.5 z-10">
                            <Type className="w-3.5 h-3.5 shrink-0 text-amber-200" />
                            <span className="truncate font-semibold text-[11px]">
                              {clip.textContent || clip.name}
                            </span>
                          </div>

                          <span className="text-[9px] font-mono text-white/80 shrink-0 pr-3 z-10">
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
  );
}
