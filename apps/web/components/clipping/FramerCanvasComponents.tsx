'use client';

import React, { useRef, useEffect } from 'react';
import { FramerBox, FramerSettings, MediaAsset } from '../../lib/editor/types';

// Interactive Draggable and Resizable Bounding Box for Smart Cut Framing
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

      if (handle.includes('e')) {
        newW = Math.max(15, Math.min(100 - startX, startW + deltaX));
      }
      if (handle.includes('s')) {
        newH = Math.max(15, Math.min(100 - startY, startH + deltaY));
      }
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
      {/* Top Header Pill */}
      <div
        className={`absolute -top-7 left-0 ${badgeBg} text-white font-medium text-[11px] px-2 py-0.5 rounded-sm shadow-md flex items-center gap-1.5 whitespace-nowrap pointer-events-none`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        <span>{box.label}</span>
      </div>

      {/* Subtle Center Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
        <div className="w-4 h-[1px] bg-white" />
        <div className="h-4 w-[1px] bg-white absolute" />
      </div>

      {/* 8 Resize Handles */}
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

// Split Result Preview Component for Live Vertical 9:16 Shorts Preview
export function SplitResultPreview({
  videoAsset,
  currentTime,
  isPlaying,
  playbackRate,
  framerSettings,
  isMuted,
  volume,
}: {
  videoAsset: MediaAsset;
  currentTime: number;
  isPlaying: boolean;
  playbackRate: number;
  framerSettings: FramerSettings;
  isMuted: boolean;
  volume: number;
}) {
  const topVideoRef = useRef<HTMLVideoElement>(null);
  const bottomVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const topVid = topVideoRef.current;
    const btmVid = bottomVideoRef.current;

    if (topVid && Math.abs(topVid.currentTime - currentTime) > 0.15) {
      topVid.currentTime = currentTime;
    }
    if (btmVid && Math.abs(btmVid.currentTime - currentTime) > 0.15) {
      btmVid.currentTime = currentTime;
    }

    if (topVid) {
      topVid.playbackRate = playbackRate;
      topVid.volume = Math.max(0, Math.min(1, volume / 100));
    }
    if (btmVid) btmVid.playbackRate = playbackRate;

    if (isPlaying) {
      topVid?.play().catch(() => {});
      btmVid?.play().catch(() => {});
    } else {
      topVid?.pause();
      btmVid?.pause();
    }
  }, [currentTime, isPlaying, playbackRate, volume]);

  const topH = framerSettings.splitRatio * 100;
  const bottomH = (1 - framerSettings.splitRatio) * 100;

  return (
    <div className="w-full h-full flex items-center justify-center p-2">
      {/* 9:16 Vertical Phone Display Container */}
      <div className="h-full aspect-[9/16] bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-zinc-800 flex flex-col relative">
        {/* Top Half: Top Speaker Cropped */}
        <div
          className="relative overflow-hidden w-full"
          style={{ height: `${topH}%` }}
        >
          <video
            ref={topVideoRef}
            src={videoAsset.url}
            muted={isMuted || volume === 0}
            playsInline
            preload="auto"
            className="absolute max-w-none pointer-events-none"
            style={{
              width: `${(100 / Math.max(10, framerSettings.topBox.width)) * 100}%`,
              height: `${(100 / Math.max(10, framerSettings.topBox.height)) * 100}%`,
              left: `-${(framerSettings.topBox.x / Math.max(10, framerSettings.topBox.width)) * 100}%`,
              top: `-${(framerSettings.topBox.y / Math.max(10, framerSettings.topBox.height)) * 100}%`,
              objectFit: 'fill',
            }}
          />
          <div className="absolute top-2 left-2 bg-emerald-600/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow">
            Top Speaker
          </div>
        </div>

        {/* Center Divider Line */}
        <div
          className="w-full z-10 shrink-0"
          style={{
            height: `${framerSettings.dividerWidth}px`,
            backgroundColor: framerSettings.dividerColor,
          }}
        />

        {/* Bottom Half: Bottom Speaker Cropped */}
        <div
          className="relative overflow-hidden w-full"
          style={{ height: `${bottomH}%` }}
        >
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
            }}
          />
          <div className="absolute top-2 left-2 bg-sky-600/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow">
            Bottom Speaker
          </div>
        </div>
      </div>
    </div>
  );
}
