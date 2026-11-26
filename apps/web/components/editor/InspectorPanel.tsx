'use client';

import React, { useState } from 'react';
import { useEditor } from '../../lib/editor/EditorContext';
import { EFFECT_BUNDLES } from '../../lib/editor/presets/bundles';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ColorTab } from './inspector/ColorTab';
import { AnimateTab } from './inspector/AnimateTab';
import { MaskTab } from './inspector/MaskTab';
import { SpeedGraphTab } from './inspector/SpeedGraphTab';
import { FramerTab } from './inspector/FramerTab';
import {
  Trash2,
  Scissors,
  Volume2,
  Type,
  Maximize2,
  Layers,
  Palette,
  Droplets,
  RotateCcw,
} from 'lucide-react';

type InspectorTabId = 'framer' | 'basic' | 'color' | 'animate' | 'mask' | 'speed';

export function InspectorPanel() {
  const {
    project,
    selectedClip,
    framerSettings,
    updateFramerSettings,
    updateFramerBox,
    sendClipperToEditor,
    updateClip,
    updateClipTransform,
    updateClipEffect,
    batchUpdateClipEffects,
    applyClipFilterPreset,
    updateClipMask,
    updateClipAnimation,
    updateClipSpeedCurve,
    toggleClipLayerEffect,
    updateProjectSettings,
    splitClipAtPlayhead,
    deleteClip,
    extractAudioFromClip,
    beginHistoryTransaction,
    endHistoryTransaction,
  } = useEditor();

  const [activeTab, setActiveTab] = useState<InspectorTabId>(
    project.mode === 'clipping' ? 'framer' : 'basic',
  );

  const rangeTx = (label: string) => ({
    onPointerDown: () => beginHistoryTransaction(label),
    onPointerUp: () => endHistoryTransaction(),
    onPointerCancel: () => endHistoryTransaction(),
  });

  // In Clip Cutter mode, resolve selected clip OR default primary video clip seamlessly so all tools work
  const fallbackPrimaryVideo = project.timeline.tracks
    .filter((t) => t.type === 'video')
    .flatMap((t) => t.clips)
    .find((c) => c.type === 'video') || null;
  const effectiveClip = selectedClip || (project.mode === 'clipping' ? fallbackPrimaryVideo : null);

  const resetClipGrading = (clipId: string) => {
    applyClipFilterPreset(clipId, 'none');
    batchUpdateClipEffects(clipId, {
      exposure: 0,
      brightness: 100,
      contrast: 100,
      highlights: 0,
      shadows: 0,
      saturation: 100,
      temperature: 0,
      tint: 0,
      hue: 0,
      sharpen: 0,
      fade: 0,
      vignette: 0,
      grain: 0,
      blur: 0,
      sepia: 0,
      grayscale: 0,
      invert: 0,
    });
  };

  // Master Screen Grade view when nothing is selected in Video Editor (or Master tab requested)
  if (!effectiveClip && project.mode !== 'clipping') {
    const s = project.settings;
    return (
      <aside className="w-full h-full bg-zinc-950 p-3.5 flex flex-col text-zinc-300 select-none overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-blue-400" />
            <span>Master Screen Grade</span>
          </span>
          <button
            type="button"
            onClick={() =>
              updateProjectSettings({
                screenBlur: 0,
                masterExposure: 0,
                masterBrightness: 100,
                masterContrast: 100,
                masterHighlights: 0,
                masterShadows: 0,
                masterSaturation: 100,
                masterTemperature: 0,
                masterTint: 0,
                masterHue: 0,
                masterSharpen: 0,
                masterFade: 0,
                masterVignette: 0,
                masterGrain: 0,
              })
            }
            className="text-[10px] text-zinc-500 hover:text-zinc-200 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>

        <div className="mt-3.5 space-y-3 text-xs">
          <div className="bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-blue-400 font-semibold uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Droplets className="w-3.5 h-3.5" />
                <span>Screen Blur</span>
              </span>
              <span className="font-mono text-zinc-200">{s.screenBlur ?? 0}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="40"
              step="1"
              value={s.screenBlur ?? 0}
              {...rangeTx('Adjust screen blur')}
              onChange={(e) => updateProjectSettings({ screenBlur: parseInt(e.target.value, 10) || 0 })}
              className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800 space-y-2.5">
            {(
              [
                { key: 'masterExposure', label: 'Exposure', min: -2, max: 2, step: 0.05, def: 0 },
                { key: 'masterBrightness', label: 'Brightness', min: 30, max: 200, step: 1, def: 100 },
                { key: 'masterContrast', label: 'Contrast', min: 30, max: 200, step: 1, def: 100 },
                { key: 'masterSaturation', label: 'Saturation', min: 0, max: 240, step: 1, def: 100 },
                { key: 'masterHighlights', label: 'Highlights', min: -100, max: 100, step: 1, def: 0 },
                { key: 'masterShadows', label: 'Shadows', min: -100, max: 100, step: 1, def: 0 },
                { key: 'masterTemperature', label: 'Temperature', min: -100, max: 100, step: 1, def: 0 },
                { key: 'masterSharpen', label: 'Sharpen', min: 0, max: 100, step: 1, def: 0 },
                { key: 'masterFade', label: 'Fade', min: 0, max: 100, step: 1, def: 0 },
                { key: 'masterVignette', label: 'Vignette', min: 0, max: 100, step: 1, def: 0 },
                { key: 'masterGrain', label: 'Grain', min: 0, max: 100, step: 1, def: 0 },
              ] as const
            ).map((cfg) => {
              const val = (s[cfg.key] as number | undefined) ?? cfg.def;
              return (
                <div key={cfg.key}>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>{cfg.label}</span>
                    <span className="font-mono text-zinc-200">
                      {cfg.step < 1 ? val.toFixed(2) : Math.round(val)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={cfg.min}
                    max={cfg.max}
                    step={cfg.step}
                    value={val}
                    {...rangeTx(`Adjust ${cfg.label}`)}
                    onChange={(e) =>
                      updateProjectSettings({ [cfg.key]: parseFloat(e.target.value) })
                    }
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              );
            })}
          </div>

          <div className="p-2.5 rounded-md border border-zinc-800/80 bg-zinc-900/30 text-[11px] text-zinc-500 text-center">
            Select a clip on the monitor or timeline to edit its Color, Masks, Speed Curve, or Animations.
          </div>
        </div>
      </aside>
    );
  }

  const isVisual =
    effectiveClip &&
    (effectiveClip.type === 'video' || effectiveClip.type === 'image' || effectiveClip.type === 'sticker');
  const isTimeScaled =
    effectiveClip && (effectiveClip.type === 'video' || effectiveClip.type === 'audio');

  const availableTabs: Array<{ id: InspectorTabId; label: string }> = [
    ...(project.mode === 'clipping' ? [{ id: 'framer' as const, label: 'Framer' }] : []),
    ...(effectiveClip ? [{ id: 'basic' as const, label: 'Basic' }] : []),
    ...(isVisual ? [{ id: 'color' as const, label: 'Color' }] : []),
    ...(isVisual ? [{ id: 'mask' as const, label: 'Mask' }] : []),
    ...(effectiveClip && effectiveClip.type !== 'audio'
      ? [{ id: 'animate' as const, label: 'Animate' }]
      : []),
    ...(isTimeScaled ? [{ id: 'speed' as const, label: 'Speed' }] : []),
  ];

  const currentTab: InspectorTabId = availableTabs.some((t) => t.id === activeTab)
    ? activeTab
    : (availableTabs[0]?.id ?? 'basic');

  return (
    <aside className="w-full h-full bg-zinc-950 flex flex-col text-zinc-300 select-none overflow-hidden">
      {/* Clip Header & Quick Actions */}
      {effectiveClip && (
        <div className="px-3.5 pt-3 pb-2 border-b border-zinc-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Badge
              variant="secondary"
              className="text-[10px] uppercase font-mono bg-zinc-800 text-zinc-300 border-zinc-700 shrink-0"
            >
              {effectiveClip.type}
            </Badge>
            <span className="text-xs font-semibold text-zinc-100 truncate" title={effectiveClip.name}>
              {effectiveClip.name}
            </span>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {effectiveClip.type === 'video' && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => extractAudioFromClip(effectiveClip.id)}
                title="Extract Audio to Track A1"
                className="h-6 w-6 text-zinc-400 hover:text-emerald-400 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => splitClipAtPlayhead(effectiveClip.id)}
              title="Split at Playhead (Ctrl+K)"
              className="h-6 w-6 text-zinc-400 hover:text-zinc-100 cursor-pointer"
            >
              <Scissors className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => deleteClip(effectiveClip.id)}
              title="Delete Selected Clip (Del)"
              className="h-6 w-6 text-zinc-400 hover:text-red-400 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Inspector Sub-Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-zinc-800 bg-zinc-900/60 px-2 py-1.5 overflow-x-auto custom-scrollbar shrink-0">
        {availableTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
              currentTab === t.id
                ? 'bg-zinc-800 text-white shadow-xs'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-Tab Panel Content */}
      <div className="flex-1 overflow-y-auto p-3.5 custom-scrollbar text-xs">
        {currentTab === 'framer' && (
          <FramerTab
            framerSettings={framerSettings}
            updateFramerSettings={updateFramerSettings}
            updateFramerBox={updateFramerBox}
            sendClipperToEditor={sendClipperToEditor}
            beginHistoryTransaction={beginHistoryTransaction}
            endHistoryTransaction={endHistoryTransaction}
            rangeTx={rangeTx}
          />
        )}

        {currentTab === 'color' && effectiveClip && (
          <ColorTab
            clip={effectiveClip}
            onAdjustEffect={(cid, t, v) => updateClipEffect(cid, t, v)}
            onApplyPreset={applyClipFilterPreset}
            onResetAll={resetClipGrading}
            rangeTx={rangeTx}
          />
        )}

        {currentTab === 'mask' && effectiveClip && (
          <MaskTab
            clip={effectiveClip}
            onUpdateMask={(cid, u) => updateClipMask(cid, u)}
            rangeTx={rangeTx}
          />
        )}

        {currentTab === 'animate' && effectiveClip && (
          <AnimateTab
            clip={effectiveClip}
            onUpdateAnimation={updateClipAnimation}
            rangeTx={rangeTx}
          />
        )}

        {currentTab === 'speed' && effectiveClip && (
          <SpeedGraphTab
            clip={effectiveClip}
            onUpdateSpeedCurve={updateClipSpeedCurve}
            beginTx={beginHistoryTransaction}
            endTx={endHistoryTransaction}
          />
        )}

        {currentTab === 'basic' && effectiveClip && (
          <div className="space-y-4">
            {/* Transform Matrix */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Transform</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateClipTransform(effectiveClip.id, { scale: 1, rotation: 0, x: 0, y: 0, opacity: 1 })
                  }
                  className="text-[10px] text-zinc-500 hover:text-zinc-200 cursor-pointer"
                >
                  Reset
                </button>
              </div>

              <div className="bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800 space-y-2.5">
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Scale</span>
                    <span className="font-mono text-zinc-200">
                      {Math.round(effectiveClip.transform.scale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="3"
                    step="0.05"
                    value={effectiveClip.transform.scale}
                    {...rangeTx('Adjust clip scale')}
                    onChange={(e) =>
                      updateClipTransform(effectiveClip.id, { scale: parseFloat(e.target.value) })
                    }
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Rotation</span>
                    <span className="font-mono text-zinc-200">
                      {effectiveClip.transform.rotation}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    value={effectiveClip.transform.rotation}
                    {...rangeTx('Adjust clip rotation')}
                    onChange={(e) =>
                      updateClipTransform(effectiveClip.id, { rotation: parseInt(e.target.value, 10) })
                    }
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Opacity</span>
                    <span className="font-mono text-zinc-200">
                      {Math.round((effectiveClip.transform.opacity ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={effectiveClip.transform.opacity ?? 1}
                    {...rangeTx('Adjust opacity')}
                    onChange={(e) =>
                      updateClipTransform(effectiveClip.id, { opacity: parseFloat(e.target.value) })
                    }
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800">
                  <div>
                    <label className="text-[10px] text-zinc-500 font-mono">POS X</label>
                    <input
                      type="number"
                      value={effectiveClip.transform.x}
                      onChange={(e) =>
                        updateClipTransform(effectiveClip.id, { x: parseInt(e.target.value, 10) || 0 })
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 font-mono">POS Y</label>
                    <input
                      type="number"
                      value={effectiveClip.transform.y}
                      onChange={(e) =>
                        updateClipTransform(effectiveClip.id, { y: parseInt(e.target.value, 10) || 0 })
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono mt-0.5"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Active FX Bundles */}
            {isVisual && (
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
                  Active Shader FX
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {EFFECT_BUNDLES.map((fx) => {
                    const active = Boolean(effectiveClip.layerEffects?.includes(fx.id));
                    return (
                      <button
                        key={fx.id}
                        type="button"
                        onClick={() => toggleClipLayerEffect(effectiveClip.id, fx.id)}
                        className={`px-2 py-1 rounded text-[10px] border transition-colors cursor-pointer ${
                          active
                            ? 'border-teal-500 bg-teal-950/50 text-teal-200'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {fx.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Image Styling */}
            {effectiveClip.type === 'image' && (
              <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-400 uppercase">
                  <Layers className="w-3.5 h-3.5" />
                  <span>Image Style</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(['cover', 'contain', 'fill'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateClip(effectiveClip.id, { fitMode: mode })}
                      className={`py-1 text-[10px] capitalize rounded border cursor-pointer ${
                        (effectiveClip.fitMode || 'cover') === mode
                          ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                    <span>Corner Radius</span>
                    <span className="font-mono text-zinc-200">{effectiveClip.borderRadius ?? 0}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="60"
                    value={effectiveClip.borderRadius ?? 0}
                    {...rangeTx('Adjust radius')}
                    onChange={(e) =>
                      updateClip(effectiveClip.id, { borderRadius: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
              </div>
            )}

            {/* Rich Typography Controls */}
            {effectiveClip.type === 'text' && (
              <div className="space-y-2.5 rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-400 uppercase">
                  <Type className="w-3.5 h-3.5" />
                  <span>Rich Typography</span>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 font-mono">TEXT</label>
                  <input
                    type="text"
                    value={effectiveClip.textContent || ''}
                    onChange={(e) =>
                      updateClip(effectiveClip.id, { textContent: e.target.value }, { coalesceKey: 'txt' })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 mt-0.5"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-500 font-mono">SIZE</label>
                    <input
                      type="number"
                      value={effectiveClip.fontSize || 32}
                      onChange={(e) =>
                        updateClip(effectiveClip.id, { fontSize: parseInt(e.target.value, 10) || 24 })
                      }
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-1.5 py-1 text-xs font-mono mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 font-mono">FILL</label>
                    <input
                      type="color"
                      value={effectiveClip.textColor || '#ffffff'}
                      onChange={(e) => updateClip(effectiveClip.id, { textColor: e.target.value })}
                      className="w-full h-7 bg-zinc-950 border border-zinc-800 rounded p-0.5 mt-0.5 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 font-mono">STROKE</label>
                    <input
                      type="color"
                      value={effectiveClip.strokeColor || '#000000'}
                      onChange={(e) => updateClip(effectiveClip.id, { strokeColor: e.target.value })}
                      className="w-full h-7 bg-zinc-950 border border-zinc-800 rounded p-0.5 mt-0.5 cursor-pointer"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>Stroke Width</span>
                      <span className="font-mono">{effectiveClip.strokeWidth ?? 0}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={effectiveClip.strokeWidth ?? 0}
                      {...rangeTx('Adjust text stroke')}
                      onChange={(e) =>
                        updateClip(effectiveClip.id, { strokeWidth: parseInt(e.target.value, 10) })
                      }
                      className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>Pill Radius</span>
                      <span className="font-mono">{effectiveClip.bgRadius ?? 8}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={effectiveClip.bgRadius ?? 8}
                      {...rangeTx('Adjust text pill radius')}
                      onChange={(e) =>
                        updateClip(effectiveClip.id, { bgRadius: parseInt(e.target.value, 10) })
                      }
                      className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Audio Volume & Fades */}
            {isTimeScaled && (
              <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 uppercase">
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Audio Gain &amp; Fades</span>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Channel Gain</span>
                    <span className="font-mono text-zinc-200">{Math.round(effectiveClip.volume)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={effectiveClip.volume}
                    {...rangeTx('Adjust gain')}
                    onChange={(e) =>
                      updateClip(effectiveClip.id, { volume: parseInt(e.target.value, 10) }, { coalesceKey: 'gain' })
                    }
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>Fade In</span>
                      <span className="font-mono">{(effectiveClip.fadeIn ?? 0).toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="4"
                      step="0.1"
                      value={effectiveClip.fadeIn ?? 0}
                      {...rangeTx('Adjust audio fade in')}
                      onChange={(e) =>
                        updateClip(effectiveClip.id, { fadeIn: parseFloat(e.target.value) })
                      }
                      className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>Fade Out</span>
                      <span className="font-mono">{(effectiveClip.fadeOut ?? 0).toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="4"
                      step="0.1"
                      value={effectiveClip.fadeOut ?? 0}
                      {...rangeTx('Adjust audio fade out')}
                      onChange={(e) =>
                        updateClip(effectiveClip.id, { fadeOut: parseFloat(e.target.value) })
                      }
                      className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
