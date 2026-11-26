'use client';

/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useRef, useState } from 'react';
import { TimelineClip, Track } from '../../lib/editor/types';
import { WebGL2LayerProcessor } from '../../lib/editor/engine/compositor-webgl';
import { extractColorGradeValues } from '../../lib/editor/engine/grading';
import { evaluateClipMotion } from '../../lib/editor/engine/animations';
import {
  evaluateClipSpeedAtTime,
  mapTimelineToSourceOffset,
} from '../../lib/editor/engine/velocity';
import { buildCssFilter } from '../../lib/editor/render-utils';

export interface TransitionLayerOverride {
  dx: number;
  dy: number;
  scale: number;
  opacity: number;
  blur: number;
  clipPath?: string;
}

interface WebGLMediaLayerProps {
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
  transitionOverride?: TransitionLayerOverride;
}

export function WebGLMediaLayer({
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
  transitionOverride,
}: WebGLMediaLayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processorRef = useRef<WebGL2LayerProcessor | null>(null);
  const drawOnceRef = useRef<() => void>(() => {});
  const [webglActive, setWebglActive] = useState(false);

  const localTime = Math.max(0, currentTime - clip.timelineStart);
  const grade = extractColorGradeValues(clip.effects, clip.lutId);
  const motion = evaluateClipMotion(clip, localTime);
  const hasLayerEffects = (clip.layerEffects?.length ?? 0) > 0;
  const needsShaderPass =
    hasLayerEffects ||
    Boolean(clip.mask && clip.mask.type !== 'none') ||
    Math.abs(grade.brightness - 100) > 0.1 ||
    Math.abs(grade.contrast - 100) > 0.1 ||
    Math.abs(grade.saturation - 100) > 0.1 ||
    Math.abs(grade.exposure) > 0.01 ||
    Math.abs(grade.highlights) > 0.1 ||
    Math.abs(grade.shadows) > 0.1 ||
    Math.abs(grade.sharpen) > 0.1 ||
    Math.abs(grade.temperature) > 0.1 ||
    Math.abs(grade.tint) > 0.1 ||
    Math.abs(grade.hue) > 0.1 ||
    Math.abs(grade.fade) > 0.1 ||
    Math.abs(grade.vignette) > 0.1 ||
    Math.abs(grade.grain) > 0.1 ||
    Math.abs(grade.blur) > 0.1 ||
    Math.abs(grade.sepia) > 0.1 ||
    Math.abs(grade.grayscale) > 0.1 ||
    Math.abs(grade.invert) > 0.1;
  const useWebGLSurface = webglActive && needsShaderPass;

  const renderStateRef = useRef({
    clipType: clip.type,
    grade,
    mask: clip.mask,
    layerEffects: clip.layerEffects || [],
    currentTime,
  });

  useEffect(() => {
    renderStateRef.current = {
      clipType: clip.type,
      grade,
      mask: clip.mask,
      layerEffects: clip.layerEffects || [],
      currentTime,
    };
    if (!isPlaying) {
      drawOnceRef.current();
    }
  }, [clip.type, grade, clip.mask, clip.layerEffects, currentTime, isPlaying]);

  // Sync media timing, velocity playbackRate, and fade-weighted volume without 60Hz seek fights
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || clip.type !== 'video') return;

    const srcOffset = mapTimelineToSourceOffset(clip, localTime);
    const targetSrcTime = Math.max(0, (clip.sourceStart || 0) + srcOffset);
    const seekThreshold = isPlaying ? 0.45 : 0.04;
    if (Math.abs(vid.currentTime - targetSrcTime) > seekThreshold) {
      vid.currentTime = targetSrcTime;
    }

    const instSpeed = evaluateClipSpeedAtTime(clip, localTime);
    const effectiveRate = Math.max(0.1, Math.min(8.0, playbackRate * instSpeed));
    if (Math.abs(vid.playbackRate - effectiveRate) > 0.02) {
      vid.playbackRate = effectiveRate;
    }

    let fadeMul = 1;
    if (clip.fadeIn > 0 && localTime < clip.fadeIn) {
      fadeMul *= Math.max(0, localTime / clip.fadeIn);
    }
    if (clip.fadeOut > 0 && localTime > clip.duration - clip.fadeOut) {
      fadeMul *= Math.max(0, (clip.duration - localTime) / clip.fadeOut);
    }

    const clipVol = (clip.volume ?? 100) / 100;
    const finalVol = Math.max(0, Math.min(1, (masterVolume / 100) * clipVol * fadeMul));
    vid.volume = finalVol;
    vid.muted = isMasterMuted || track.muted || clip.muted || finalVol === 0;

    if (isPlaying && vid.paused) {
      vid.play().catch(() => {});
    } else if (!isPlaying && !vid.paused) {
      vid.pause();
    }
  }, [
    clip,
    track.muted,
    localTime,
    isPlaying,
    playbackRate,
    masterVolume,
    isMasterMuted,
  ]);

  // Initialize WebGL2 Processor once per mounted canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const proc = new WebGL2LayerProcessor(canvas);
    processorRef.current = proc;
    const ready = proc.isReady();
    // Defer state sync out of synchronous effect body cleanly via rAF
    const raf = requestAnimationFrame(() => setWebglActive(ready));
    return () => {
      cancelAnimationFrame(raf);
      proc.dispose();
      processorRef.current = null;
    };
  }, []);

  // Continuous 60fps GLSL shader pipeline (no per-frame effect teardown during playback)
  useEffect(() => {
    const proc = processorRef.current;
    if (!proc || !proc.isReady()) return;

    let cancelled = false;
    let rafId = 0;

    const drawCurrent = () => {
      if (!needsShaderPass) return;
      const state = renderStateRef.current;
      const vid = videoRef.current;
      const img = imgRef.current;
      if (state.clipType === 'video' && vid && vid.readyState >= 2) {
        const w = Math.min(1280, vid.videoWidth || 1280);
        const h = Math.min(720, vid.videoHeight || 720);
        proc.renderFrame(
          vid,
          w,
          h,
          state.grade,
          state.mask,
          state.layerEffects,
          state.currentTime,
        );
      } else if (state.clipType === 'image' && img && img.complete && img.naturalWidth > 0) {
        const w = Math.min(1280, img.naturalWidth);
        const h = Math.min(720, img.naturalHeight);
        proc.renderFrame(
          img,
          w,
          h,
          state.grade,
          state.mask,
          state.layerEffects,
          state.currentTime,
        );
      }
    };

    drawOnceRef.current = drawCurrent;

    const tick = () => {
      if (cancelled || !needsShaderPass) return;
      drawCurrent();
      if (isPlaying || hasLayerEffects) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const vid = videoRef.current;
    const img = imgRef.current;
    const onMediaReady = () => drawCurrent();
    vid?.addEventListener('seeked', onMediaReady);
    vid?.addEventListener('loadeddata', onMediaReady);
    img?.addEventListener('load', onMediaReady);

    tick();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      drawOnceRef.current = () => {};
      vid?.removeEventListener('seeked', onMediaReady);
      vid?.removeEventListener('loadeddata', onMediaReady);
      img?.removeEventListener('load', onMediaReady);
    };
  }, [clip.id, clip.type, assetUrl, isPlaying, hasLayerEffects, needsShaderPass]);

  const tx = (clip.transform.x || 0) + motion.dx + (transitionOverride?.dx || 0);
  const ty = (clip.transform.y || 0) + motion.dy + (transitionOverride?.dy || 0);
  const sx = (clip.transform.scale || 1) * motion.scaleX * (transitionOverride?.scale ?? 1);
  const sy = (clip.transform.scale || 1) * motion.scaleY * (transitionOverride?.scale ?? 1);
  const rot = (clip.transform.rotation || 0) + motion.rotation;
  const opacity = Math.max(
    0,
    Math.min(1, (clip.transform.opacity ?? 1) * motion.opacity * (transitionOverride?.opacity ?? 1)),
  );
  const motionBlur = motion.blur + (transitionOverride?.blur || 0);

  const fitMode = clip.fitMode || 'cover';
  const borderRadius = clip.borderRadius ?? 0;
  const borderWidth = clip.borderWidth ?? 0;
  const borderColor = clip.borderColor || '#ffffff';

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      style={{
        zIndex,
        transform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy}) rotate(${rot}deg)`,
        opacity,
        filter: motionBlur > 0.2 ? `blur(${motionBlur.toFixed(1)}px)` : undefined,
        clipPath: transitionOverride?.clipPath,
      }}
    >
      {/* Native hardware-accelerated video/image surface (absolute inset-0 prevents flex sibling 50% right-shift) */}
      {clip.type === 'video' ? (
        <video
          ref={videoRef}
          src={assetUrl}
          data-clip-id={useWebGLSurface ? undefined : clip.id}
          playsInline
          preload="auto"
          crossOrigin="anonymous"
          className={
            useWebGLSurface
              ? 'absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none'
              : `w-full h-full object-cover pointer-events-auto cursor-pointer`
          }
          style={{
            borderRadius: !useWebGLSurface && borderRadius > 0 ? `${borderRadius}px` : undefined,
            border: !useWebGLSurface && borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : undefined,
            boxShadow:
              !useWebGLSurface && clip.dropShadow
                ? '0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 8px 10px -6px rgba(0, 0, 0, 0.7)'
                : undefined,
            filter: !useWebGLSurface ? buildCssFilter(clip.effects, clip.lutId) : undefined,
          }}
        />
      ) : (
        <img
          ref={imgRef}
          src={assetUrl}
          alt={clip.name}
          crossOrigin="anonymous"
          data-clip-id={useWebGLSurface ? undefined : clip.id}
          className={
            useWebGLSurface
              ? 'absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none'
              : `${fitMode === 'contain' ? 'max-w-full max-h-full' : 'w-full h-full'} pointer-events-auto cursor-pointer`
          }
          style={!useWebGLSurface ? { filter: buildCssFilter(clip.effects, clip.lutId) } : undefined}
        />
      )}

      {/* Hardware WebGL2 Shader Surface */}
      <canvas
        ref={canvasRef}
        data-clip-id={useWebGLSurface ? clip.id : undefined}
        className={`pointer-events-auto cursor-pointer transition-shadow ${
          clip.type === 'image' && fitMode === 'contain'
            ? 'max-w-full max-h-full object-contain'
            : 'w-full h-full object-cover'
        } ${!isSelected ? 'hover:outline hover:outline-2 hover:outline-blue-400/50 hover:-outline-offset-2' : ''} ${
          useWebGLSurface ? '' : 'hidden'
        }`}
        style={{
          objectFit: clip.type === 'image' ? fitMode : 'cover',
          borderRadius: borderRadius > 0 ? `${borderRadius}px` : undefined,
          border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : undefined,
          boxShadow: clip.dropShadow
            ? '0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 8px 10px -6px rgba(0, 0, 0, 0.7)'
            : undefined,
        }}
      />
    </div>
  );
}
