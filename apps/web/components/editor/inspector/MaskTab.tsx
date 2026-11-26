'use client';

import React from 'react';
import { MaskConfig, TimelineClip } from '../../../lib/editor/types';
import { DEFAULT_MASK_CONFIG, MASK_PRESETS } from '../../../lib/editor/engine/masks';
import { Shapes, RotateCcw } from 'lucide-react';

interface MaskTabProps {
  clip: TimelineClip;
  onUpdateMask: (clipId: string, updates: Partial<MaskConfig>) => void;
  rangeTx: (label: string) => {
    onPointerDown: () => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
}

export function MaskTab({ clip, onUpdateMask, rangeTx }: MaskTabProps) {
  const mask = clip.mask || DEFAULT_MASK_CONFIG;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-purple-400">
          <Shapes className="h-3.5 w-3.5" />
          <span>Shape &amp; Split Mask</span>
        </span>
        <button
          type="button"
          onClick={() => onUpdateMask(clip.id, { ...DEFAULT_MASK_CONFIG })}
          className="flex cursor-pointer items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-200"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Clear</span>
        </button>
      </div>

      {/* Mask Type Grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {MASK_PRESETS.map((preset) => {
          const active = mask.type === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() =>
                onUpdateMask(clip.id, {
                  ...(preset.defaults || DEFAULT_MASK_CONFIG),
                  type: preset.id,
                })
              }
              className={`cursor-pointer rounded border py-1.5 px-2 text-[11px] font-medium transition-colors ${
                active
                  ? 'border-purple-500 bg-purple-950/40 text-purple-200'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800/70'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {mask.type !== 'none' && (
        <div className="space-y-2.5 rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-zinc-400">
                <span>Center X</span>
                <span className="font-mono text-zinc-200">{Math.round(mask.x)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={mask.x}
                {...rangeTx('Adjust mask X')}
                onChange={(e) => onUpdateMask(clip.id, { x: parseInt(e.target.value, 10) })}
                className="h-1 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-purple-500"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between text-[10px] text-zinc-400">
                <span>Center Y</span>
                <span className="font-mono text-zinc-200">{Math.round(mask.y)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={mask.y}
                {...rangeTx('Adjust mask Y')}
                onChange={(e) => onUpdateMask(clip.id, { y: parseInt(e.target.value, 10) })}
                className="h-1 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-purple-500"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between text-[10px] text-zinc-400">
                <span>Width</span>
                <span className="font-mono text-zinc-200">{Math.round(mask.width)}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="150"
                value={mask.width}
                {...rangeTx('Adjust mask width')}
                onChange={(e) => onUpdateMask(clip.id, { width: parseInt(e.target.value, 10) })}
                className="h-1 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-purple-500"
              />
            </div>

            <div>
              <div className="mb-1 flex justify-between text-[10px] text-zinc-400">
                <span>Height</span>
                <span className="font-mono text-zinc-200">{Math.round(mask.height)}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="150"
                value={mask.height}
                {...rangeTx('Adjust mask height')}
                onChange={(e) => onUpdateMask(clip.id, { height: parseInt(e.target.value, 10) })}
                className="h-1 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-purple-500"
              />
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
              <span>Rotation</span>
              <span className="font-mono text-zinc-200">{Math.round(mask.rotation)}°</span>
            </div>
            <input
              type="range"
              min="-180"
              max="180"
              value={mask.rotation}
              {...rangeTx('Rotate mask')}
              onChange={(e) => onUpdateMask(clip.id, { rotation: parseInt(e.target.value, 10) })}
              className="h-1 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-purple-500"
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
              <span>Edge Feather</span>
              <span className="font-mono text-zinc-200">{Math.round(mask.feather)}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="60"
              value={mask.feather}
              {...rangeTx('Adjust mask feather')}
              onChange={(e) => onUpdateMask(clip.id, { feather: parseInt(e.target.value, 10) })}
              className="h-1 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-purple-500"
            />
          </div>

          {mask.type === 'rect' && (
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
                <span>Corner Radius</span>
                <span className="font-mono text-zinc-200">{Math.round(mask.cornerRadius)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                value={mask.cornerRadius}
                {...rangeTx('Adjust mask radius')}
                onChange={(e) => onUpdateMask(clip.id, { cornerRadius: parseInt(e.target.value, 10) })}
                className="h-1 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-purple-500"
              />
            </div>
          )}

          <div className="flex items-center justify-between border-t border-zinc-800 pt-2">
            <span className="text-[11px] text-zinc-400">Invert Mask</span>
            <button
              type="button"
              onClick={() => onUpdateMask(clip.id, { inverted: !mask.inverted })}
              className={`cursor-pointer rounded border px-2.5 py-0.5 text-[10px] font-medium ${
                mask.inverted
                  ? 'border-purple-500 bg-purple-600/30 text-purple-200'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400'
              }`}
            >
              {mask.inverted ? 'Inverted' : 'Normal'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
