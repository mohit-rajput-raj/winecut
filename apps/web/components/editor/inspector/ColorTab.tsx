'use client';

import React from 'react';
import { EffectType, TimelineClip } from '../../../lib/editor/types';
import { FILTER_PRESETS } from '../../../lib/editor/presets/bundles';
import { extractColorGradeValues } from '../../../lib/editor/engine/grading';
import { RotateCcw, Sparkles } from 'lucide-react';

interface ColorTabProps {
  clip: TimelineClip;
  onAdjustEffect: (clipId: string, type: EffectType, val: number) => void;
  onApplyPreset: (clipId: string, lutId: string) => void;
  onResetAll: (clipId: string) => void;
  rangeTx: (label: string) => {
    onPointerDown: () => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
}

interface SliderDef {
  key: EffectType;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  accent?: string;
}

const LIGHT_SLIDERS: SliderDef[] = [
  { key: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.05, unit: ' EV' },
  { key: 'brightness', label: 'Brightness', min: 20, max: 200, step: 1, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: 20, max: 200, step: 1, unit: '%' },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1 },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1 },
];

const COLOR_SLIDERS: SliderDef[] = [
  { key: 'saturation', label: 'Saturation', min: 0, max: 240, step: 1, unit: '%' },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100, step: 1 },
  { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1 },
  { key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, unit: '°' },
];

const DETAIL_FILM_SLIDERS: SliderDef[] = [
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 100, step: 1 },
  { key: 'fade', label: 'Fade', min: 0, max: 100, step: 1 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100, step: 1 },
  { key: 'grain', label: 'Film Grain', min: 0, max: 100, step: 1 },
  { key: 'blur', label: 'Blur', min: 0, max: 40, step: 1, unit: 'px' },
];

export function ColorTab({
  clip,
  onAdjustEffect,
  onApplyPreset,
  onResetAll,
  rangeTx,
}: ColorTabProps) {
  const grade = extractColorGradeValues(clip.effects, clip.lutId);

  const renderGroup = (title: string, sliders: SliderDef[]) => (
    <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {title}
      </div>
      <div className="space-y-2.5">
        {sliders.map((s) => {
          const val = (grade as unknown as Record<string, number>)[s.key] ?? 0;
          const displayVal = s.step && s.step < 1 ? val.toFixed(2) : Math.round(val);
          return (
            <div key={s.key}>
              <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
                <span>{s.label}</span>
                <span className="font-mono text-zinc-200">
                  {val > 0 && s.min < 0 ? `+${displayVal}` : displayVal}
                  {s.unit || ''}
                </span>
              </div>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step ?? 1}
                value={val}
                {...rangeTx(`Adjust ${s.label}`)}
                onChange={(e) => onAdjustEffect(clip.id, s.key, parseFloat(e.target.value))}
                className="h-1 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-blue-500"
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Pro Grading &amp; Filters</span>
        </span>
        <button
          type="button"
          onClick={() => onResetAll(clip.id)}
          className="flex cursor-pointer items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-200"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reset</span>
        </button>
      </div>

      {/* Filter Presets Row */}
      <div className="grid grid-cols-2 gap-1.5">
        {FILTER_PRESETS.map((preset) => {
          const active = (clip.lutId || 'none') === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApplyPreset(clip.id, preset.id)}
              className={`cursor-pointer rounded border p-1.5 text-left transition-colors ${
                active
                  ? 'border-blue-500 bg-blue-950/40'
                  : 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/70'
              }`}
            >
              <div className="mb-1 h-2.5 w-full rounded-xs" style={{ background: preset.swatch }} />
              <div className="truncate text-[10px] font-medium text-zinc-200">{preset.label}</div>
            </button>
          );
        })}
      </div>

      {renderGroup('Light & Tone', LIGHT_SLIDERS)}
      {renderGroup('Color Balance', COLOR_SLIDERS)}
      {renderGroup('Detail & Film Look', DETAIL_FILM_SLIDERS)}

      {/* Classic toggles */}
      <div className="grid grid-cols-3 gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5">
        {(['sepia', 'grayscale', 'invert'] as const).map((k) => (
          <div key={k}>
            <label className="mb-1 block font-mono text-[10px] uppercase text-zinc-400">{k}</label>
            <input
              type="range"
              min="0"
              max="100"
              value={(grade as unknown as Record<string, number>)[k] ?? 0}
              {...rangeTx(`Adjust ${k}`)}
              onChange={(e) => onAdjustEffect(clip.id, k, parseInt(e.target.value, 10))}
              className="h-1 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-amber-500"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
