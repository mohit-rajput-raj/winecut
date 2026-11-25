'use client';

/**
 * Spatial Geometry, Bounding Box Snapping, Smart Guides,
 * Container Margin/Gap Measurement, and Timeline Collision / Auto-Align Engine.
 */

import { TimelineClip, Transform } from './types';

export interface CanvasBoundingBox {
  id: string;
  label: string;
  x: number; // left edge inside canvas coordinates (0..canvasW)
  y: number; // top edge inside canvas coordinates (0..canvasH)
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export interface SmartGuideLine {
  axis: 'vertical' | 'horizontal';
  posPx: number; // exact coordinate inside canvas (0..W or 0..H)
  kind: 'center' | 'safe-margin' | 'sibling-edge' | 'canvas-edge';
  label?: string;
}

export interface DistanceBadge {
  axis: 'horizontal' | 'vertical';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
}

export interface CanvasSnapResult {
  snappedTransformX: number;
  snappedTransformY: number;
  guides: SmartGuideLine[];
  distances: DistanceBadge[];
}

export function computeClipBoundingBox(
  id: string,
  label: string,
  transform: Transform,
  canvasW: number,
  canvasH: number,
  baseWidthRatio: number = 1.0,
  baseHeightRatio: number = 1.0
): CanvasBoundingBox {
  const scale = transform.scale || 1;
  const width = canvasW * baseWidthRatio * scale;
  const height = canvasH * baseHeightRatio * scale;
  const centerX = canvasW / 2 + (transform.x || 0);
  const centerY = canvasH / 2 + (transform.y || 0);
  const left = centerX - width / 2;
  const top = centerY - height / 2;

  return {
    id,
    label,
    x: left,
    y: top,
    width,
    height,
    left,
    right: left + width,
    top,
    bottom: top + height,
    centerX,
    centerY,
  };
}

/**
 * Figma / Canva-style Smart Guide & Snapping Solver for Video Window layers.
 * Preserves element margins/padding during free drags and only snaps positions + visualizes guides.
 */
export function solveCanvasSnap(
  candidateX: number,
  candidateY: number,
  draggedClipId: string,
  draggedScale: number,
  baseW: number,
  baseH: number,
  canvasW: number,
  canvasH: number,
  siblings: CanvasBoundingBox[],
  thresholdPx: number = 8
): CanvasSnapResult {
  const width = baseW * draggedScale;
  const height = baseH * draggedScale;
  const candCenterX = canvasW / 2 + candidateX;
  const candCenterY = canvasH / 2 + candidateY;
  const candLeft = candCenterX - width / 2;
  const candRight = candCenterX + width / 2;
  const candTop = candCenterY - height / 2;
  const candBottom = candCenterY + height / 2;

  const safePadX = canvasW * 0.05;
  const safePadY = canvasH * 0.05;

  // Candidate X snap targets (targetPx -> how candidate centerX should align)
  const xTargets: { targetPx: number; anchor: 'left' | 'center' | 'right'; kind: SmartGuideLine['kind']; label: string }[] = [
    { targetPx: canvasW / 2, anchor: 'center', kind: 'center', label: 'Center X' },
    { targetPx: 0, anchor: 'left', kind: 'canvas-edge', label: 'Left Edge' },
    { targetPx: canvasW, anchor: 'right', kind: 'canvas-edge', label: 'Right Edge' },
    { targetPx: safePadX, anchor: 'left', kind: 'safe-margin', label: 'Safe Left (5%)' },
    { targetPx: canvasW - safePadX, anchor: 'right', kind: 'safe-margin', label: 'Safe Right (5%)' },
  ];

  const yTargets: { targetPx: number; anchor: 'top' | 'center' | 'bottom'; kind: SmartGuideLine['kind']; label: string }[] = [
    { targetPx: canvasH / 2, anchor: 'center', kind: 'center', label: 'Center Y' },
    { targetPx: 0, anchor: 'top', kind: 'canvas-edge', label: 'Top Edge' },
    { targetPx: canvasH, anchor: 'bottom', kind: 'canvas-edge', label: 'Bottom Edge' },
    { targetPx: safePadY, anchor: 'top', kind: 'safe-margin', label: 'Safe Top (5%)' },
    { targetPx: canvasH - safePadY, anchor: 'bottom', kind: 'safe-margin', label: 'Safe Bottom (5%)' },
  ];

  for (const sib of siblings) {
    if (sib.id === draggedClipId) continue;
    xTargets.push(
      { targetPx: sib.centerX, anchor: 'center', kind: 'sibling-edge', label: `Align Center (${sib.label})` },
      { targetPx: sib.left, anchor: 'left', kind: 'sibling-edge', label: `Left -> ${sib.label}` },
      { targetPx: sib.right, anchor: 'right', kind: 'sibling-edge', label: `Right -> ${sib.label}` },
      { targetPx: sib.right, anchor: 'left', kind: 'sibling-edge', label: `Flush ${sib.label}` },
      { targetPx: sib.left, anchor: 'right', kind: 'sibling-edge', label: `Flush ${sib.label}` }
    );
    yTargets.push(
      { targetPx: sib.centerY, anchor: 'center', kind: 'sibling-edge', label: `Align Middle (${sib.label})` },
      { targetPx: sib.top, anchor: 'top', kind: 'sibling-edge', label: `Top -> ${sib.label}` },
      { targetPx: sib.bottom, anchor: 'bottom', kind: 'sibling-edge', label: `Bottom -> ${sib.label}` },
      { targetPx: sib.bottom, anchor: 'top', kind: 'sibling-edge', label: `Stack Below ${sib.label}` },
      { targetPx: sib.top, anchor: 'bottom', kind: 'sibling-edge', label: `Stack Above ${sib.label}` }
    );
  }

  let bestXDelta = thresholdPx + 1;
  let snappedX = candidateX;
  const activeGuides: SmartGuideLine[] = [];
  let matchedXGuide: SmartGuideLine | null = null;

  for (const t of xTargets) {
    const val = t.anchor === 'center' ? candCenterX : t.anchor === 'left' ? candLeft : candRight;
    const diff = t.targetPx - val;
    if (Math.abs(diff) <= thresholdPx && Math.abs(diff) < Math.abs(bestXDelta)) {
      bestXDelta = diff;
      snappedX = Math.round(candidateX + diff);
      matchedXGuide = { axis: 'vertical', posPx: t.targetPx, kind: t.kind, label: t.label };
    }
  }
  if (matchedXGuide) activeGuides.push(matchedXGuide);

  let bestYDelta = thresholdPx + 1;
  let snappedY = candidateY;
  let matchedYGuide: SmartGuideLine | null = null;

  for (const t of yTargets) {
    const val = t.anchor === 'center' ? candCenterY : t.anchor === 'top' ? candTop : candBottom;
    const diff = t.targetPx - val;
    if (Math.abs(diff) <= thresholdPx && Math.abs(diff) < Math.abs(bestYDelta)) {
      bestYDelta = diff;
      snappedY = Math.round(candidateY + diff);
      matchedYGuide = { axis: 'horizontal', posPx: t.targetPx, kind: t.kind, label: t.label };
    }
  }
  if (matchedYGuide) activeGuides.push(matchedYGuide);

  // Measure gap/margin distances between final snapped bounding box & nearest sibling or container edges
  const finalLeft = canvasW / 2 + snappedX - width / 2;
  const finalRight = finalLeft + width;
  const finalTop = canvasH / 2 + snappedY - height / 2;
  const finalBottom = finalTop + height;
  const finalMidX = finalLeft + width / 2;
  const finalMidY = finalTop + height / 2;

  const distances: DistanceBadge[] = [];

  // Container left/top margin distances if element is smaller than canvas
  if (width < canvasW - 8) {
    const marginL = Math.round(finalLeft);
    const marginR = Math.round(canvasW - finalRight);
    if (marginL > 2 && marginL < 220) {
      distances.push({
        axis: 'horizontal',
        x1: 0,
        y1: finalMidY,
        x2: finalLeft,
        y2: finalMidY,
        label: `${marginL}px`,
      });
    }
    if (marginR > 2 && marginR < 220 && Math.abs(marginL - marginR) < 4) {
      distances.push({
        axis: 'horizontal',
        x1: finalRight,
        y1: finalMidY,
        x2: canvasW,
        y2: finalMidY,
        label: `${marginR}px`,
      });
    }
  }
  if (height < canvasH - 8) {
    const marginT = Math.round(finalTop);
    if (marginT > 2 && marginT < 220) {
      distances.push({
        axis: 'vertical',
        x1: finalMidX,
        y1: 0,
        x2: finalMidX,
        y2: finalTop,
        label: `${marginT}px`,
      });
    }
  }

  // Nearest horizontal & vertical sibling gap readout
  for (const sib of siblings) {
    if (sib.id === draggedClipId) continue;
    const verticalOverlap = !(finalBottom < sib.top || finalTop > sib.bottom);
    if (verticalOverlap) {
      if (finalLeft >= sib.right && finalLeft - sib.right < 160) {
        const gap = Math.round(finalLeft - sib.right);
        distances.push({
          axis: 'horizontal',
          x1: sib.right,
          y1: finalMidY,
          x2: finalLeft,
          y2: finalMidY,
          label: `${gap}px`,
        });
      } else if (sib.left >= finalRight && sib.left - finalRight < 160) {
        const gap = Math.round(sib.left - finalRight);
        distances.push({
          axis: 'horizontal',
          x1: finalRight,
          y1: finalMidY,
          x2: sib.left,
          y2: finalMidY,
          label: `${gap}px`,
        });
      }
    }
  }

  return {
    snappedTransformX: snappedX,
    snappedTransformY: snappedY,
    guides: activeGuides,
    distances,
  };
}

/**
 * Explicit Auto-Layout Alignment Actions for Selected Canvas Element
 */
export function alignTransformToCanvas(
  current: Transform,
  canvasW: number,
  canvasH: number,
  alignment: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'
): Partial<Transform> {
  const scale = current.scale || 1;
  const halfElemW = (canvasW * scale) / 2;
  const halfElemH = (canvasH * scale) / 2;
  const margin = 0;

  switch (alignment) {
    case 'center-h':
      return { x: 0 };
    case 'left':
      return { x: Math.round(-canvasW / 2 + halfElemW + margin) };
    case 'right':
      return { x: Math.round(canvasW / 2 - halfElemW - margin) };
    case 'center-v':
      return { y: 0 };
    case 'top':
      return { y: Math.round(-canvasH / 2 + halfElemH + margin) };
    case 'bottom':
      return { y: Math.round(canvasH / 2 - halfElemH - margin) };
  }
}

/**
 * Explicit Container Auto-Layout: cleanly distributes multiple active visual clips side-by-side or grid
 * with consistent padding and gap inside canvas bounds.
 */
export function computeAutoLayoutTransforms(
  clips: TimelineClip[],
  canvasW: number,
  canvasH: number,
  paddingPx: number = 16,
  gapPx: number = 12
): { clipId: string; transform: Partial<Transform> }[] {
  const count = clips.length;
  if (count === 0) return [];
  if (count === 1) {
    return [{ clipId: clips[0]!.id, transform: { x: 0, y: 0, scale: 1, rotation: 0 } }];
  }

  const cols = count === 2 ? 2 : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const usableW = canvasW - paddingPx * 2 - gapPx * (cols - 1);
  const usableH = canvasH - paddingPx * 2 - gapPx * (rows - 1);
  const cellW = usableW / cols;
  const cellH = usableH / rows;
  const targetScale = Number(Math.min(cellW / canvasW, cellH / canvasH).toFixed(2));

  return clips.map((clip, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellCenterX = paddingPx + col * (cellW + gapPx) + cellW / 2;
    const cellCenterY = paddingPx + row * (cellH + gapPx) + cellH / 2;
    return {
      clipId: clip.id,
      transform: {
        x: Math.round(cellCenterX - canvasW / 2),
        y: Math.round(cellCenterY - canvasH / 2),
        scale: targetScale,
        rotation: 0,
      },
    };
  });
}

// =========================================================================
// TIMELINE COLLISION DETECTION, MAGNETIC SNAP GUIDES & MEDIA AUTO-ALIGN
// =========================================================================

export interface TimelineSnapResult {
  snappedStart: number;
  guideTime: number | null;
  guideLabel: string | null;
}

export function solveTimelineSnap(
  proposedStart: number,
  clipDuration: number,
  allSnapPoints: { time: number; label: string; kind: 'clip' | 'playhead' | 'grid' }[],
  thresholdSec: number
): TimelineSnapResult {
  const proposedEnd = proposedStart + clipDuration;
  let bestDiff = thresholdSec;
  let snappedStart = Math.max(0, proposedStart);
  let guideTime: number | null = null;
  let guideLabel: string | null = null;

  for (const pt of allSnapPoints) {
    // Check Start-edge alignment
    const diffStart = Math.abs(proposedStart - pt.time);
    if (diffStart < bestDiff) {
      bestDiff = diffStart;
      snappedStart = Math.max(0, pt.time);
      guideTime = pt.time;
      guideLabel = pt.label;
    }
    // Check End-edge alignment (flush media-to-media on right)
    const diffEnd = Math.abs(proposedEnd - pt.time);
    if (diffEnd < bestDiff) {
      bestDiff = diffEnd;
      snappedStart = Math.max(0, pt.time - clipDuration);
      guideTime = pt.time;
      guideLabel = pt.label;
    }
  }

  return { snappedStart, guideTime, guideLabel };
}

/**
 * Resolves same-track overlaps so dropped media auto-aligns seamlessly without overlapping neighbor media:
 * - If overlap with a neighbor is small or near edge -> snaps flush edge-to-edge (gap = 0).
 * - If placed directly onto occupied slot -> slots flush or ripples subsequent clips cleanly forward.
 */
export function autoAlignClipIntoTrack(
  trackClips: TimelineClip[],
  movedClipId: string,
  proposedStart: number,
  duration: number
): { start: number; shiftedClips: { id: string; timelineStart: number }[] } {
  const others = trackClips
    .filter((c) => c.id !== movedClipId)
    .sort((a, b) => a.timelineStart - b.timelineStart);

  let start = Math.max(0, proposedStart);
  const shiftedClips: { id: string; timelineStart: number }[] = [];

  for (const other of others) {
    const otherStart = other.timelineStart;
    const otherEnd = other.timelineStart + other.duration;
    const end = start + duration;

    const overlaps = start < otherEnd - 0.001 && end > otherStart + 0.001;
    if (!overlaps) continue;

    // Check which side of the colliding clip is closer
    const distToRightEdge = Math.abs(start - otherEnd);
    const distToLeftEdge = Math.abs(end - otherStart);

    if (distToRightEdge <= 0.35 || start >= (otherStart + otherEnd) / 2) {
      // Snap flush right after existing media clip
      start = otherEnd;
    } else if (distToLeftEdge <= 0.35 && otherStart - duration >= 0) {
      // Snap flush right before existing media clip
      start = Math.max(0, otherStart - duration);
    } else {
      // Push collided and subsequent clips forward cleanly (ripple auto-shift)
      break;
    }
  }

  // After determining insertion `start`, ripple any clips still overlapping `[start, start + duration]` forward
  let cursorEnd = start + duration;
  for (const other of others) {
    if (other.timelineStart >= start - 0.001 && other.timelineStart < cursorEnd - 0.001) {
      const nextStart = Number(cursorEnd.toFixed(3));
      shiftedClips.push({ id: other.id, timelineStart: nextStart });
      cursorEnd = nextStart + other.duration;
    } else if (other.timelineStart < start && other.timelineStart + other.duration > start + 0.001) {
      // Placed inside middle of earlier clip -> dock right after it
      start = other.timelineStart + other.duration;
      cursorEnd = start + duration;
    }
  }

  return { start: Number(start.toFixed(3)), shiftedClips };
}

/**
 * Packs all clips on a track cleanly end-to-end with exact uniform spacing (default 0s gap).
 */
export function packTrackMediaSequentially(
  clips: TimelineClip[],
  gapSeconds: number = 0
): TimelineClip[] {
  const sorted = [...clips].sort((a, b) => a.timelineStart - b.timelineStart);
  let cursor = 0;
  return sorted.map((clip) => {
    const nextClip = { ...clip, timelineStart: Number(cursor.toFixed(3)) };
    cursor += clip.duration + gapSeconds;
    return nextClip;
  });
}
