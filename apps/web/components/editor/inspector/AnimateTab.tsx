'use client';

import React, { useState } from 'react';
import { AnimationSlot, TimelineClip } from '../../../lib/editor/types';
import { ANIMATION_BUNDLES, AnimationDirection } from '../../../lib/editor/engine/animations';
import { Sparkles } from 'lucide-react';

interface AnimateTabProps {
  clip: TimelineClip;
  onUpdateAnimation: (
    clipId: string,
    dir: AnimationDirection,
    slot: AnimationSlot | undefined,
  ) => void;
  rangeTx: (label: string) => {
    onPointerDown: () => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
}

export function AnimateTab({ clip, onUpdateAnimation, rangeTx }: AnimateTabProps) {
  const [dir, setDir] = useState<AnimationDirection>('in');
  const activeSlot = clip.animations?.[dir];
  const presetsForDir = ANIMATION_BUNDLES.filter(
    (p) => p.direction === dir || p.id === 'none',
  );

  const selectedId = activeSlot?.presetId || 'none';
  const duration = activeSlot?.duration ?? 0.45;
  const intensity = activeSlot?.intensity ?? 1.0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
        <Sparkles className="h-3.5 w-3.5" />
        <span>Animation Bundles</span>
      </div>

      {/* In / Out / Middle Phase Selector */}
      <div className="grid grid-cols-3 gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-1">
        {(['in', 'out', 'middle'] as AnimationDirection[]).map((phase) => {
          const hasSlot = Boolean(clip.animations?.[phase] && clip.animations[phase]!.presetId !== 'none');
          return (
            <button
              key={phase}
              type="button"
              onClick={() => setDir(phase)}
              className={`cursor-pointer rounded py-1 text-[11px] font-medium capitalize transition-colors ${
                dir === phase
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {phase}
              {hasSlot ? ' ·' : ''}
            </button>
          );
        })}
      </div>

      {/* Preset Grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {presetsForDir.map((preset) => {
          const isSelected = selectedId === preset.id;
          return (
            <button
              key={`${dir}-${preset.id}`}
              type="button"
              onClick={() => {
                if (preset.id === 'none') {
                  onUpdateAnimation(clip.id, dir, undefined);
                } else {
                  onUpdateAnimation(clip.id, dir, {
                    presetId: preset.id,
                    duration: activeSlot?.duration || preset.defaultDuration || 0.45,
                    intensity: activeSlot?.intensity ?? 1.0,
                  });
                }
              }}
              className={`cursor-pointer rounded border p-2 text-left text-[11px] font-medium transition-colors ${
                isSelected
                  ? 'border-cyan-500 bg-cyan-950/40 text-cyan-200'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800/70'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Timing & Intensity */}
      {selectedId !== 'none' && (
        <div className="space-y-2.5 rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5">
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
              <span>{dir === 'middle' ? 'Loop Period' : 'Duration'}</span>
              <span className="font-mono text-zinc-200">{duration.toFixed(2)}s</span>
            </div>
            <input
              type="range"
              min="0.1"
              max={Math.max(1, Math.min(5, clip.duration)).toFixed(1)}
              step="0.05"
              value={duration}
              {...rangeTx(`Adjust ${dir} animation duration`)}
              onChange={(e) =>
                onUpdateAnimation(clip.id, dir, {
                  presetId: selectedId,
                  duration: parseFloat(e.target.value),
                  intensity,
                })
              }
              className="h-1 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-cyan-500"
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
              <span>Intensity</span>
              <span className="font-mono text-zinc-200">{Math.round(intensity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="2.0"
              step="0.05"
              value={intensity}
              {...rangeTx(`Adjust ${dir} animation intensity`)}
              onChange={(e) =>
                onUpdateAnimation(clip.id, dir, {
                  presetId: selectedId,
                  duration,
                  intensity: parseFloat(e.target.value),
                })
              }
              className="h-1 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-cyan-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
