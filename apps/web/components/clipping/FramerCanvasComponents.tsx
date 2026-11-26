'use client';

/* eslint-disable @next/next/no-img-element */
import React, { useRef, useEffect, useState } from 'react';
import {
  FramerBox,
  FramerSettings,
  MediaAsset,
  TimelineClip,
} from '../../lib/editor/types';
import { buildCssFilter } from '../../lib/editor/render-utils';
import { evaluateClipMotion } from '../../lib/editor/engine/animations';
import {
  evaluateClipSpeedAtTime,
  mapTimelineToSourceOffset,
} from '../../lib/editor/engine/velocity';
import { WebGL2LayerProcessor } from '../../lib/editor/engine/compositor-webgl';
import { extractColorGradeValues } from '../../lib/editor/engine/grading';

export interface InteractiveFramerBoxProps {
  box: FramerBox;
  onChange: (updates: Partial<FramerBox>) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onInteractionStart?: (label?: string) => void;
  onInteractionEnd?: () => void;
}

export function InteractiveFramerBox({
  box,
  onChange,
  containerRef,
  onInteractionStart,
  onInteractionEnd,
}: InteractiveFramerBoxProps) {
  const isTop = box.id === 'top';
  const themeBorder = isTop ? 'border-emerald-500' : 'border-sky-400';
  const themeBg = isTop ? 'bg-emerald-500/10' : 'bg-sky-500/10';
  const badgeBg = isTop ? 'bg-emerald-600' : 'bg-sky-600';

  const handlePointerDownMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    onInteractionStart?.(`Move ${box.label}`);
    const rect = container.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startX = box.x;
    const startY = box.y;

    const onPointerMove = (moveEv: PointerEvent) => {
      const deltaPercentX = ((moveEv.clientX - startClientX) / rect.width) * 100;
      const deltaPercentY = ((moveEv.clientY - startClientY) / rect.height) * 100;
      const newX = Math.max(0, Math.min(100 - box.width, startX + deltaPercentX));
      const newY = Math.max(0, Math.min(100 - box.height, startY + deltaPercentY));
      onChange({ x: Number(newX.toFixed(1)), y: Number(newY.toFixed(1)) });
    };

    const onPointerUp = () => {
      onInteractionEnd?.();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handlePointerDownResize = (handle: string, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    onInteractionStart?.(`Resize ${box.label}`);
    const rect = container.getBoundingClientRect();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startX = box.x;
    const startY = box.y;
    const startW = box.width;
    const startH = box.height;

    const onPointerMove = (moveEv: PointerEvent) => {
      const deltaX = ((moveEv.clientX - startClientX) / rect.width) * 100;
      const deltaY = ((moveEv.clientY - startClientY) / rect.height) * 100;
      let newX = startX;
      let newY = startY;
      let newW = startW;
      let newH = startH;

      if (handle.includes('e')) newW = Math.max(15, Math.min(100 - startX, startW + deltaX));
      if (handle.includes('s')) newH = Math.max(15, Math.min(100 - startY, startH + deltaY));
      if (handle.includes('w')) {
        const potentialW = Math.max(15, startW - deltaX);
        if (startX + (startW - potentialW) >= 0) {
          newW = potentialW;
          newX = startX + (startW - potentialW);
        }
      }
      if (handle.includes('n')) {
        const potentialH = Math.max(15, startH - deltaY);
        if (startY + (startH - potentialH) >= 0) {
          newH = potentialH;
          newY = startY + (startH - potentialH);
        }
      }

      onChange({
        x: Number(newX.toFixed(1)),
        y: Number(newY.toFixed(1)),
        width: Number(newW.toFixed(1)),
        height: Number(newH.toFixed(1)),
      });
    };

    const onPointerUp = () => {
      onInteractionEnd?.();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handles = [
    { id: 'nw', cursor: 'nwse-resize', style: { top: -4, left: -4 } },
    { id: 'n', cursor: 'ns-resize', style: { top: -4, left: 'calc(50% - 4px)' } },
    { id: 'ne', cursor: 'nesw-resize', style: { top: -4, right: -4 } },
    { id: 'e', cursor: 'ew-resize', style: { top: 'calc(50% - 4px)', right: -4 } },
    { id: 'se', cursor: 'nwse-resize', style: { bottom: -4, right: -4 } },
    { id: 's', cursor: 'ns-resize', style: { bottom: -4, left: 'calc(50% - 4px)' } },
    { id: 'sw', cursor: 'nesw-resize', style: { bottom: -4, left: -4 } },
    { id: 'w', cursor: 'ew-resize', style: { top: 'calc(50% - 4px)', left: -4 } },
  ];

  return (
    <div
      className={`absolute border-2 ${themeBorder} ${themeBg} cursor-move select-none z-20`}
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.width}%`,
        height: `${box.height}%`,
      }}
      onPointerDown={handlePointerDownMove}
    >
      <div
        className={`absolute -top-7 left-0 ${badgeBg} text-white font-medium text-[11px] px-2 py-0.5 rounded-sm shadow-md flex items-center gap-1.5 whitespace-nowrap pointer-events-none`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        <span>{box.label}</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
        <div className="w-4 h-[1px] bg-white" />
        <div className="h-4 w-[1px] bg-white absolute" />
      </div>

      {handles.map((h) => (
        <div
          key={h.id}
          className="absolute w-2.5 h-2.5 bg-white border border-black/50 shadow-xs z-30 hover:scale-125 transition-transform"
          style={{ ...h.style, cursor: h.cursor }}
          onPointerDown={(e) => handlePointerDownResize(h.id, e)}
        />
      ))}
    </div>
  );
}

// Live 9:16 Split Preview with WebGL2 Pro Grading, Masks, Animations, Stickers & Rich Text Overlays
export function SplitResultPreview({
  videoAsset,
  primaryClip,
  overlayClips = [],
  mediaLibrary = [],
  currentTime,
  isPlaying,
  playbackRate,
  framerSettings,
  isMuted,
  volume,
  selectedClipId,
  onSelectClip,
}: {
  videoAsset: MediaAsset;
  primaryClip?: TimelineClip;
  overlayClips?: TimelineClip[];
  mediaLibrary?: MediaAsset[];
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  framerSettings: FramerSettings;
  isMuted: boolean;
  volume: number;
  selectedClipId?: string | null;
  onSelectClip?: (clipId: string | null) => void;
}) {
  const topVideoRef = useRef<HTMLVideoElement>(null);
  const bottomVideoRef = useRef<HTMLVideoElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const topProcRef = useRef<WebGL2LayerProcessor | null>(null);
  const drawOnceRef = useRef<() => void>(() => {});
  const [webglReady, setWebglReady] = useState(false);
  const [cardHeight, setCardHeight] = useState(382);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 40) {
          setCardHeight(entry.contentRect.height);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const overlayStageScale = Math.max(0.25, cardHeight / 382);

  const localTime = primaryClip ? Math.max(0, currentTime - primaryClip.timelineStart) : currentTime;
  const hasLayerEffects = (primaryClip?.layerEffects?.length ?? 0) > 0;
  const splitRenderRef = useRef({
    primaryClip,
    framerSettings,
    currentTime,
  });

  useEffect(() => {
    splitRenderRef.current = {
      primaryClip,
      framerSettings,
      currentTime,
    };
    if (!isPlaying) {
      drawOnceRef.current();
    }
  }, [primaryClip, framerSettings, currentTime, isPlaying]);

  useEffect(() => {
    const topVid = topVideoRef.current;
    const btmVid = bottomVideoRef.current;
    const srcTime = primaryClip
      ? (primaryClip.sourceStart || 0) + mapTimelineToSourceOffset(primaryClip, localTime)
      : currentTime;
    const instSpeed = primaryClip ? evaluateClipSpeedAtTime(primaryClip, localTime) : 1;
    const rate = Math.max(0.1, Math.min(8.0, playbackRate * instSpeed));
    const seekThreshold = isPlaying ? 0.45 : 0.04;

    if (topVid && Math.abs(topVid.currentTime - srcTime) > seekThreshold) topVid.currentTime = srcTime;
    if (btmVid && Math.abs(btmVid.currentTime - srcTime) > seekThreshold) btmVid.currentTime = srcTime;

    if (topVid) {
      topVid.playbackRate = rate;
      topVid.volume = Math.max(0, Math.min(1, volume / 100));
    }
    if (btmVid) btmVid.playbackRate = rate;

    if (isPlaying) {
      if (topVid?.paused) topVid.play().catch(() => {});
      if (btmVid?.paused) btmVid.play().catch(() => {});
    } else {
      topVid?.pause();
      btmVid?.pause();
    }
  }, [currentTime, localTime, primaryClip, isPlaying, playbackRate, volume]);

  // WebGL2 color/mask pass over the composite split canvas when advanced effects are active
  useEffect(() => {
    const c = compositeCanvasRef.current;
    if (!c) return;
    const proc = new WebGL2LayerProcessor();
    topProcRef.current = proc;
    const ready = proc.isReady();
    const raf = requestAnimationFrame(() => setWebglReady(ready));
    return () => {
      cancelAnimationFrame(raf);
      proc.dispose();
      topProcRef.current = null;
    };
  }, []);

  useEffect(() => {
    const outCanvas = compositeCanvasRef.current;
    const proc = topProcRef.current;
    if (!outCanvas || !proc || !proc.isReady()) return;

    let cancelled = false;
    let rafId = 0;

    const paint = () => {
      const { primaryClip: pClip, framerSettings: fs, currentTime: tNow } = splitRenderRef.current;
      const grade = extractColorGradeValues(pClip?.effects, pClip?.lutId);
      const topVid = topVideoRef.current;
      if (topVid && topVid.readyState >= 2) {
        const vw = topVid.videoWidth || 1280;
        const vh = topVid.videoHeight || 720;
        proc.renderFrame(
          topVid,
          Math.min(1280, vw),
          Math.min(720, vh),
          grade,
          pClip?.mask,
          pClip?.layerEffects || [],
          tNow,
        );
        const ctx = outCanvas.getContext('2d');
        if (ctx) {
          const w = outCanvas.width;
          const h = outCanvas.height;
          const topH = Math.round(fs.splitRatio * h);
          const btmH = h - topH;
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, w, h);

          const pw = proc.canvas.width;
          const ph = proc.canvas.height;
          const tb = fs.topBox;
          const bb = fs.bottomBox;
          ctx.drawImage(
            proc.canvas,
            (tb.x / 100) * pw,
            (tb.y / 100) * ph,
            Math.max(1, (tb.width / 100) * pw),
            Math.max(1, (tb.height / 100) * ph),
            0,
            0,
            w,
            topH,
          );
          ctx.drawImage(
            proc.canvas,
            (bb.x / 100) * pw,
            (bb.y / 100) * ph,
            Math.max(1, (bb.width / 100) * pw),
            Math.max(1, (bb.height / 100) * ph),
            0,
            topH,
            w,
            btmH,
          );
          if (fs.dividerWidth > 0) {
            ctx.fillStyle = fs.dividerColor || '#000000';
            ctx.fillRect(0, topH - fs.dividerWidth / 2, w, fs.dividerWidth);
          }
        }
      }
    };

    drawOnceRef.current = paint;

    const tick = () => {
      if (cancelled) return;
      paint();
      if (isPlaying || hasLayerEffects) {
        rafId = requestAnimationFrame(tick);
      }
    };

    const topVid = topVideoRef.current;
    topVid?.addEventListener('seeked', paint);
    topVid?.addEventListener('loadeddata', paint);
    tick();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      drawOnceRef.current = () => {};
      topVid?.removeEventListener('seeked', paint);
      topVid?.removeEventListener('loadeddata', paint);
    };
  }, [primaryClip?.id, videoAsset.url, isPlaying, hasLayerEffects]);

  const topH = framerSettings.splitRatio * 100;
  const bottomH = (1 - framerSettings.splitRatio) * 100;
  const fallbackFilter = primaryClip ? buildCssFilter(primaryClip.effects, primaryClip.lutId) : 'none';
  const baseMotion = primaryClip ? evaluateClipMotion(primaryClip, localTime) : null;

  return (
    <div className="w-full h-full flex items-center justify-center p-2">
      <div
        ref={cardRef}
        onClick={() => onSelectClip?.(primaryClip?.id ?? null)}
        className="h-full aspect-[9/16] bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-zinc-800 flex flex-col relative"
        style={
          baseMotion
            ? {
                transform: `scale(${baseMotion.scaleX}, ${baseMotion.scaleY}) rotate(${baseMotion.rotation}deg)`,
                opacity: baseMotion.opacity,
              }
            : undefined
        }
      >
        <video
          ref={topVideoRef}
          src={videoAsset.url}
          muted={isMuted || volume === 0}
          playsInline
          crossOrigin="anonymous"
          preload="auto"
          className={webglReady ? 'absolute inset-0 w-full h-full opacity-0 pointer-events-none' : 'absolute max-w-none pointer-events-none'}
          style={
            !webglReady
              ? {
                  width: `${(100 / Math.max(10, framerSettings.topBox.width)) * 100}%`,
                  height: `${(100 / Math.max(10, framerSettings.topBox.height)) * 100}%`,
                  left: `-${(framerSettings.topBox.x / Math.max(10, framerSettings.topBox.width)) * 100}%`,
                  top: `-${(framerSettings.topBox.y / Math.max(10, framerSettings.topBox.height)) * 100}%`,
                  filter: fallbackFilter,
                }
              : undefined
          }
        />

        {webglReady ? (
          <canvas
            ref={compositeCanvasRef}
            width={405}
            height={720}
            className="w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <>
            <div className="relative overflow-hidden w-full" style={{ height: `${topH}%` }} />
            <div
              className="w-full z-10 shrink-0"
              style={{
                height: `${framerSettings.dividerWidth}px`,
                backgroundColor: framerSettings.dividerColor,
              }}
            />
            <div className="relative overflow-hidden w-full" style={{ height: `${bottomH}%` }}>
              <video
                ref={bottomVideoRef}
                src={videoAsset.url}
                muted={true}
                playsInline
                preload="auto"
                className="absolute max-w-none pointer-events-none"
                style={{
                  width: `${(100 / Math.max(10, framerSettings.bottomBox.width)) * 100}%`,
                  height: `${(100 / Math.max(10, framerSettings.bottomBox.height)) * 100}%`,
                  left: `-${(framerSettings.bottomBox.x / Math.max(10, framerSettings.bottomBox.width)) * 100}%`,
                  top: `-${(framerSettings.bottomBox.y / Math.max(10, framerSettings.bottomBox.height)) * 100}%`,
                  objectFit: 'fill',
                  filter: fallbackFilter,
                }}
              />
            </div>
          </>
        )}

        {/* Active Stickers, Image Overlays & Rich Text rendered inside resolution-locked 9:16 stage */}
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center z-20"
        >
          <div
            style={{
              width: '215px',
              height: '382px',
              transform: `scale(${overlayStageScale})`,
              transformOrigin: 'center center',
            }}
            className="relative shrink-0 overflow-hidden pointer-events-none"
          >
        {overlayClips.map((c) => {
          const m = evaluateClipMotion(c, Math.max(0, currentTime - c.timelineStart));
          const isSel = selectedClipId === c.id;
          if (c.type === 'sticker' && c.stickerSvg) {
            return (
              <div
                key={c.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectClip?.(c.id);
                }}
                style={{
                  transform: `translate(${(c.transform.x || 0) * 0.55 + m.dx}px, ${(c.transform.y || 0) * 0.55 + m.dy}px) scale(${(c.transform.scale || 0.45) * m.scaleX}) rotate(${(c.transform.rotation || 0) + m.rotation}deg)`,
                  opacity: (c.transform.opacity ?? 1) * m.opacity,
                }}
                className={`absolute inset-0 flex items-center justify-center pointer-events-auto cursor-pointer z-20 ${
                  isSel ? 'ring-1 ring-cyan-400' : ''
                }`}
              >
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(c.stickerSvg)}`}
                  alt={c.name}
                  className="max-w-[60%] max-h-[60%] object-contain"
                />
              </div>
            );
          }

          if (c.type === 'image') {
            const asset = mediaLibrary.find((a) => a.id === c.assetId);
            if (!asset?.url) return null;
            return (
              <div
                key={c.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectClip?.(c.id);
                }}
                style={{
                  transform: `translate(${(c.transform.x || 0) * 0.55 + m.dx}px, ${(c.transform.y || 0) * 0.55 + m.dy}px) scale(${(c.transform.scale || 1) * m.scaleX})`,
                  opacity: (c.transform.opacity ?? 1) * m.opacity,
                }}
                className="absolute inset-0 flex items-center justify-center pointer-events-auto cursor-pointer z-20"
              >
                <img
                  src={asset.url}
                  alt={c.name}
                  className="max-w-[70%] max-h-[50%] object-contain rounded"
                  style={{ filter: buildCssFilter(c.effects, c.lutId) }}
                />
              </div>
            );
          }

          if (c.type === 'text' && c.textContent) {
            return (
              <div
                key={c.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectClip?.(c.id);
                }}
                style={{
                  transform: `translate(${(c.transform.x || 0) * 0.55 + m.dx}px, ${(c.transform.y || 0) * 0.55 + m.dy}px) scale(${(c.transform.scale || 1) * m.scaleX})`,
                  opacity: (c.transform.opacity ?? 1) * m.opacity,
                }}
                className="absolute inset-x-0 bottom-10 flex justify-center px-3 pointer-events-auto cursor-pointer z-30"
              >
                <div
                  className="text-center font-bold"
                  style={{
                    color: c.gradientColors ? 'transparent' : c.textColor || '#ffffff',
                    backgroundImage: c.gradientColors
                      ? `linear-gradient(90deg, ${c.gradientColors[0]}, ${c.gradientColors[1]})`
                      : undefined,
                    WebkitBackgroundClip: c.gradientColors ? 'text' : undefined,
                    backgroundColor: !c.gradientColors ? c.textBgColor || 'rgba(0,0,0,0.7)' : undefined,
                    fontSize: `${Math.max(12, (c.fontSize || 28) * 0.45)}px`,
                    padding: `${c.bgPadding ?? 6}px ${(c.bgPadding ?? 6) * 1.6}px`,
                    borderRadius: `${c.bgRadius ?? 8}px`,
                    WebkitTextStroke: c.strokeWidth ? `${Math.max(1, c.strokeWidth * 0.4)}px ${c.strokeColor || '#000'}` : undefined,
                    textShadow: c.shadowBlur ? `0 2px ${c.shadowBlur}px ${c.shadowColor || 'rgba(0,0,0,0.85)'}` : undefined,
                  }}
                >
                  {c.textContent}
                </div>
              </div>
            );
          }

          return null;
        })}
          </div>
        </div>
      </div>
    </div>
  );
}
