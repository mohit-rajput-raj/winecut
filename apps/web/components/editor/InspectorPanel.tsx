'use client';

import React from 'react';
import { useEditor } from '../../lib/editor/EditorContext';
import { EffectType } from '../../lib/editor/types';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { 
  Trash2, 
  Scissors, 
  Volume2, 
  Type, 
  Maximize2, 
  Layers, 
  Sun,
  ArrowDownToLine,
  Sliders,
  Droplets,
  Palette,
  Sparkles,
  RotateCcw,
  Eye
} from 'lucide-react';

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
    updateProjectSettings,
    splitClipAtPlayhead, 
    deleteClip,
    extractAudioFromClip,
    beginHistoryTransaction,
    endHistoryTransaction
  } = useEditor();

  const rangeTx = (label: string) => ({
    onPointerDown: () => beginHistoryTransaction(label),
    onPointerUp: () => endHistoryTransaction(),
    onPointerCancel: () => endHistoryTransaction(),
  });

  // Clip Cutter Wireframe Inspector is dedicated exclusively to Clipping projects
  if (project.mode === 'clipping') {
    return (
      <aside className="w-full h-full bg-zinc-950 p-3.5 flex flex-col text-zinc-300 select-none overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <Sparkles className="w-4 h-4" />
            <span>Smart Cut Framer</span>
          </span>
          <button
            onClick={() => {
              beginHistoryTransaction('Reset dual speaker framing');
              updateFramerSettings({
                splitRatio: 0.5,
                dividerWidth: 2,
                dividerColor: '#000000',
                viewMode: 'framing_crop',
              });
              updateFramerBox('top', { x: 6, y: 8, width: 42, height: 84 });
              updateFramerBox('bottom', { x: 52, y: 8, width: 42, height: 84 });
              endHistoryTransaction();
            }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
            title="Reset to Default Dual Speaker Framing"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>

        <div className="mt-3.5 space-y-4 text-xs">
          {/* Target Format & View Mode */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Output Format & Mode
            </label>
            <div className="bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-300">Target Aspect Ratio</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 text-emerald-400 border border-emerald-800/80">
                  9:16 Vertical Short
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={() => updateFramerSettings({ viewMode: 'framing_crop' })}
                  className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-all ${
                    framerSettings.viewMode === 'framing_crop'
                      ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Framing Crop Boxes
                </button>
                <button
                  onClick={() => updateFramerSettings({ viewMode: 'split_preview' })}
                  className={`py-1.5 px-2 rounded text-[11px] font-medium border text-center transition-all ${
                    framerSettings.viewMode === 'split_preview'
                      ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  9:16 Split Preview
                </button>
              </div>
            </div>
          </div>

          {/* Top Speaker Card */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shadow-sm" />
                <span>Top Speaker (Box 1)</span>
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">
                {Math.round(framerSettings.topBox.width)}% × {Math.round(framerSettings.topBox.height)}%
              </span>
            </div>

            <div className="bg-zinc-900/60 p-2.5 rounded-md border border-emerald-900/40 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                    <span>X Position</span>
                    <span className="font-mono text-zinc-200">{Math.round(framerSettings.topBox.x)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    value={framerSettings.topBox.x}
                    {...rangeTx('Adjust top box X')}
                    onChange={(e) => updateFramerBox('top', { x: parseInt(e.target.value) || 0 })}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                    <span>Y Position</span>
                    <span className="font-mono text-zinc-200">{Math.round(framerSettings.topBox.y)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    value={framerSettings.topBox.y}
                    {...rangeTx('Adjust top box Y')}
                    onChange={(e) => updateFramerBox('top', { y: parseInt(e.target.value) || 0 })}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800/80">
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                    <span>Crop Width</span>
                    <span className="font-mono text-zinc-200">{Math.round(framerSettings.topBox.width)}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="90"
                    value={framerSettings.topBox.width}
                    {...rangeTx('Adjust top box width')}
                    onChange={(e) => updateFramerBox('top', { width: parseInt(e.target.value) || 20 })}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                    <span>Crop Height</span>
                    <span className="font-mono text-zinc-200">{Math.round(framerSettings.topBox.height)}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={framerSettings.topBox.height}
                    {...rangeTx('Adjust top box height')}
                    onChange={(e) => updateFramerBox('top', { height: parseInt(e.target.value) || 20 })}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Speaker Card */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-sky-400 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block shadow-sm" />
                <span>Bottom Speaker (Box 2)</span>
              </span>
              <span className="text-[10px] text-zinc-400 font-mono">
                {Math.round(framerSettings.bottomBox.width)}% × {Math.round(framerSettings.bottomBox.height)}%
              </span>
            </div>

            <div className="bg-zinc-900/60 p-2.5 rounded-md border border-sky-900/40 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                    <span>X Position</span>
                    <span className="font-mono text-zinc-200">{Math.round(framerSettings.bottomBox.x)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    value={framerSettings.bottomBox.x}
                    {...rangeTx('Adjust bottom box X')}
                    onChange={(e) => updateFramerBox('bottom', { x: parseInt(e.target.value) || 0 })}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-sky-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                    <span>Y Position</span>
                    <span className="font-mono text-zinc-200">{Math.round(framerSettings.bottomBox.y)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    value={framerSettings.bottomBox.y}
                    {...rangeTx('Adjust bottom box Y')}
                    onChange={(e) => updateFramerBox('bottom', { y: parseInt(e.target.value) || 0 })}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800/80">
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                    <span>Crop Width</span>
                    <span className="font-mono text-zinc-200">{Math.round(framerSettings.bottomBox.width)}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="90"
                    value={framerSettings.bottomBox.width}
                    {...rangeTx('Adjust bottom box width')}
                    onChange={(e) => updateFramerBox('bottom', { width: parseInt(e.target.value) || 20 })}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-sky-500"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                    <span>Crop Height</span>
                    <span className="font-mono text-zinc-200">{Math.round(framerSettings.bottomBox.height)}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={framerSettings.bottomBox.height}
                    {...rangeTx('Adjust bottom box height')}
                    onChange={(e) => updateFramerBox('bottom', { height: parseInt(e.target.value) || 20 })}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-sky-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Split Ratio & Divider Settings */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Split Ratio & Divider
            </label>

            <div className="bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800 space-y-2.5">
              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                  <span>Split Division (Top / Bottom)</span>
                  <span className="font-mono text-zinc-200">
                    {Math.round(framerSettings.splitRatio * 100)}% / {Math.round((1 - framerSettings.splitRatio) * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="0.7"
                  step="0.05"
                  value={framerSettings.splitRatio}
                  {...rangeTx('Adjust split ratio')}
                  onChange={(e) => updateFramerSettings({ splitRatio: parseFloat(e.target.value) })}
                  className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                  <span>Divider Thickness</span>
                  <span className="font-mono text-zinc-200">{framerSettings.dividerWidth}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="8"
                  value={framerSettings.dividerWidth}
                  {...rangeTx('Adjust divider thickness')}
                  onChange={(e) => updateFramerSettings({ dividerWidth: parseInt(e.target.value) || 0 })}
                  className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-zinc-800 text-[10px]">
                <span className="text-zinc-400">Divider Color</span>
                <div className="flex items-center gap-1.5">
                  {[
                    { label: 'Black', color: '#000000' },
                    { label: 'Zinc', color: '#3f3f46' },
                    { label: 'White', color: '#ffffff' },
                    { label: 'Cyan', color: '#38bdf8' },
                  ].map((item) => (
                    <button
                      key={item.color}
                      onClick={() => updateFramerSettings({ dividerColor: item.color })}
                      className={`w-5 h-5 rounded-full border transition-transform ${
                        framerSettings.dividerColor === item.color
                          ? 'scale-110 border-white ring-1 ring-blue-500'
                          : 'border-zinc-700 hover:scale-105'
                      }`}
                      style={{ backgroundColor: item.color }}
                      title={item.label}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Send Framed Clip to Full Video Editor */}
          <div className="pt-2">
            <Button
              onClick={sendClipperToEditor}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-md hover:shadow-emerald-900/30 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Send Cut to Video Editor (9:16)</span>
            </Button>
            <p className="text-[10px] text-zinc-500 text-center mt-1.5">
              Converts framed speakers into multi-track layers for captions & effects
            </p>
          </div>
        </div>
      </aside>
    );
  }

  // If no clip is selected, provide the Master Screen Blur & Global Color Grading Panel
  if (!selectedClip) {
    const screenBlur = project.settings.screenBlur ?? 0;
    const masterBrightness = project.settings.masterBrightness ?? 100;
    const masterContrast = project.settings.masterContrast ?? 100;
    const masterSaturation = project.settings.masterSaturation ?? 100;
    const masterTemperature = project.settings.masterTemperature ?? 0;
    const masterHue = project.settings.masterHue ?? 0;

    return (
      <aside className="w-full h-full bg-zinc-950 p-3.5 flex flex-col text-zinc-300 select-none overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          <span className="flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-blue-400" />
            <span>Screen Grade & Blur</span>
          </span>
          <button
            onClick={() => {
              updateProjectSettings({
                screenBlur: 0,
                masterBrightness: 100,
                masterContrast: 100,
                masterSaturation: 100,
                masterTemperature: 0,
                masterHue: 0,
              });
            }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
            title="Reset Master Screen Grade"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>

        <div className="mt-3.5 space-y-4 text-xs">
          {/* Master Screen Blur Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <span className="flex items-center gap-1.5 text-blue-400">
                <Droplets className="w-3.5 h-3.5" />
                <span>Screen Blur</span>
              </span>
              <span className="font-mono text-zinc-200">{screenBlur}px</span>
            </div>

            <div className="bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800 space-y-2">
              <input
                type="range"
                min="0"
                max="40"
                step="1"
                value={screenBlur}
                {...rangeTx('Adjust screen blur')}
                onChange={(e) => updateProjectSettings({ screenBlur: parseInt(e.target.value) || 0 })}
                className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
              />

              <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-500 font-mono">
                <button
                  onClick={() => updateProjectSettings({ screenBlur: 0 })}
                  className="px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  Clear (0px)
                </button>
                <button
                  onClick={() => updateProjectSettings({ screenBlur: 8 })}
                  className="px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  Soft (8px)
                </button>
                <button
                  onClick={() => updateProjectSettings({ screenBlur: 18 })}
                  className="px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  Frosted (18px)
                </button>
                <button
                  onClick={() => updateProjectSettings({ screenBlur: 32 })}
                  className="px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  Heavy (32px)
                </button>
              </div>
            </div>
          </div>

          {/* Master Screen Color Grading Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <span className="flex items-center gap-1.5 text-amber-400">
                <Sun className="w-3.5 h-3.5" />
                <span>Canvas Color Grading</span>
              </span>
            </div>

            <div className="bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800 space-y-2.5">
              {/* Exposure / Brightness */}
              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                  <span>Master Exposure</span>
                  <span className="font-mono text-zinc-200">{masterBrightness}%</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="180"
                  value={masterBrightness}
                  {...rangeTx('Adjust master exposure')}
                  onChange={(e) => updateProjectSettings({ masterBrightness: parseInt(e.target.value) })}
                  className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* Contrast */}
              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                  <span>Master Contrast</span>
                  <span className="font-mono text-zinc-200">{masterContrast}%</span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="200"
                  value={masterContrast}
                  {...rangeTx('Adjust master contrast')}
                  onChange={(e) => updateProjectSettings({ masterContrast: parseInt(e.target.value) })}
                  className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* Saturation */}
              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                  <span>Master Saturation</span>
                  <span className="font-mono text-zinc-200">{masterSaturation}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="220"
                  value={masterSaturation}
                  {...rangeTx('Adjust master saturation')}
                  onChange={(e) => updateProjectSettings({ masterSaturation: parseInt(e.target.value) })}
                  className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              {/* Temperature */}
              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                  <span>Color Temperature</span>
                  <span className="font-mono text-zinc-200">{masterTemperature > 0 ? `+${masterTemperature}` : masterTemperature}</span>
                </div>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={masterTemperature}
                  {...rangeTx('Adjust color temperature')}
                  onChange={(e) => updateProjectSettings({ masterTemperature: parseInt(e.target.value) })}
                  className="w-full h-1 bg-gradient-to-r from-cyan-600 via-zinc-700 to-amber-500 rounded appearance-none cursor-pointer"
                />
              </div>

              {/* Hue Rotation */}
              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                  <span>Master Hue Shift</span>
                  <span className="font-mono text-zinc-200">{masterHue}°</span>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  value={masterHue}
                  {...rangeTx('Adjust master hue')}
                  onChange={(e) => updateProjectSettings({ masterHue: parseInt(e.target.value) })}
                  className="w-full h-1 bg-gradient-to-r from-rose-500 via-emerald-500 via-blue-500 to-rose-500 rounded appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Project Details Card */}
          <div className="bg-zinc-900/60 p-3 rounded-md border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-200 text-xs">{project.name}</span>
              <Badge variant="outline" className="border-zinc-700 text-zinc-300 font-mono text-[10px]">
                {project.settings.aspectRatio}
              </Badge>
            </div>
            <div className="text-zinc-400 text-[11px] space-y-1 font-mono">
              <div className="flex justify-between">
                <span className="text-zinc-500">CANVAS:</span>
                <span className="text-zinc-300">{project.settings.width}x{project.settings.height}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">FPS:</span>
                <span className="text-zinc-300">{project.settings.fps} FPS</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">DURATION:</span>
                <span className="text-zinc-300">{project.timeline.duration}s</span>
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-md border border-zinc-800/80 bg-zinc-900/30 text-[11px] text-zinc-500 leading-relaxed text-center">
            Click any clip on the timeline to grade its specific clip layers, adjust transform gizmos, or edit typography.
          </div>
        </div>
      </aside>
    );
  }

  // --- CLIP SPECIFIC INSPECTOR ---
  const { transform, effects = [] } = selectedClip;
  const brightness = effects.find(e => (e.type === 'brightness' || e.id === 'brightness') && e.enabled)?.value ?? 100;
  const contrast = effects.find(e => (e.type === 'contrast' || e.id === 'contrast') && e.enabled)?.value ?? 100;
  const saturation = effects.find(e => (e.type === 'saturation' || e.id === 'saturation') && e.enabled)?.value ?? 100;
  const blur = effects.find(e => (e.type === 'blur' || e.id === 'blur') && e.enabled)?.value ?? 0;
  const temperature = effects.find(e => (e.type === 'temperature' || e.id === 'temperature') && e.enabled)?.value ?? 0;
  const hue = effects.find(e => (e.type === 'hue' || e.id === 'hue') && e.enabled)?.value ?? 0;
  const sepia = effects.find(e => (e.type === 'sepia' || e.id === 'sepia') && e.enabled)?.value ?? 0;
  const grayscale = effects.find(e => (e.type === 'grayscale' || e.id === 'grayscale') && e.enabled)?.value ?? 0;
  const invert = effects.find(e => (e.type === 'invert' || e.id === 'invert') && e.enabled)?.value ?? 0;

  // Preset LUTs
  const applyLutPreset = (preset: 'teal_orange' | 'cyberpunk' | 'vintage' | 'noir' | 'vibrant' | 'dreamy' | 'reset') => {
    switch (preset) {
      case 'teal_orange':
        batchUpdateClipEffects(selectedClip.id, {
          brightness: 102,
          contrast: 130,
          saturation: 125,
          temperature: 30,
          hue: -12,
          sepia: 0,
          grayscale: 0,
          invert: 0,
          blur: 0,
        });
        break;
      case 'cyberpunk':
        batchUpdateClipEffects(selectedClip.id, {
          brightness: 110,
          contrast: 145,
          saturation: 165,
          temperature: -25,
          hue: 45,
          sepia: 0,
          grayscale: 0,
          invert: 0,
          blur: 0,
        });
        break;
      case 'vintage':
        batchUpdateClipEffects(selectedClip.id, {
          brightness: 98,
          contrast: 115,
          saturation: 90,
          temperature: 35,
          hue: 0,
          sepia: 35,
          grayscale: 0,
          invert: 0,
          blur: 0,
        });
        break;
      case 'noir':
        batchUpdateClipEffects(selectedClip.id, {
          brightness: 95,
          contrast: 155,
          saturation: 0,
          temperature: 0,
          hue: 0,
          sepia: 0,
          grayscale: 100,
          invert: 0,
          blur: 0,
        });
        break;
      case 'vibrant':
        batchUpdateClipEffects(selectedClip.id, {
          brightness: 106,
          contrast: 115,
          saturation: 145,
          temperature: 5,
          hue: 0,
          sepia: 0,
          grayscale: 0,
          invert: 0,
          blur: 0,
        });
        break;
      case 'dreamy':
        batchUpdateClipEffects(selectedClip.id, {
          brightness: 112,
          contrast: 92,
          saturation: 95,
          temperature: 15,
          hue: 0,
          sepia: 10,
          grayscale: 0,
          invert: 0,
          blur: 2,
        });
        break;
      case 'reset':
      default:
        batchUpdateClipEffects(selectedClip.id, {
          brightness: 100,
          contrast: 100,
          saturation: 100,
          temperature: 0,
          hue: 0,
          sepia: 0,
          grayscale: 0,
          invert: 0,
          blur: 0,
        });
        break;
    }
  };

  return (
    <aside className="w-full h-full bg-zinc-950 p-3.5 flex flex-col text-zinc-300 select-none overflow-y-auto custom-scrollbar">
      {/* Clip Header Title & Quick Actions */}
      <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="secondary" className="text-[10px] uppercase font-mono bg-zinc-800 text-zinc-300 border-zinc-700">
            {selectedClip.type}
          </Badge>
          <span className="text-xs font-semibold text-zinc-100 truncate" title={selectedClip.name}>
            {selectedClip.name}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {selectedClip.type === 'video' && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => extractAudioFromClip(selectedClip.id)}
              title="Extract Audio to Track A1"
              className="h-6 w-6 text-zinc-400 hover:text-emerald-400"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => splitClipAtPlayhead(selectedClip.id)}
            title="Split at Playhead (Ctrl+K)"
            className="h-6 w-6 text-zinc-400 hover:text-zinc-100"
          >
            <Scissors className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => deleteClip(selectedClip.id)}
            title="Delete Selected Clip (Del)"
            className="h-6 w-6 text-zinc-400 hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-3.5 space-y-4 text-xs">
        {/* Transform Matrix Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5 text-blue-400" />
              <span>Transform</span>
            </span>
            <button
              onClick={() => updateClipTransform(selectedClip.id, { scale: 1, rotation: 0, x: 0, y: 0 })}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Reset
            </button>
          </div>

          <div className="bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800 space-y-2.5">
            {/* Scale Slider */}
            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>Scale</span>
                <span className="font-mono text-zinc-200">{Math.round(transform.scale * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="3"
                step="0.05"
                value={transform.scale}
                {...rangeTx('Adjust clip scale')}
                onChange={(e) => updateClipTransform(selectedClip.id, { scale: parseFloat(e.target.value) })}
                className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* Rotation Slider */}
            <div>
              <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                <span>Rotation</span>
                <span className="font-mono text-zinc-200">{transform.rotation}°</span>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                value={transform.rotation}
                {...rangeTx('Adjust clip rotation')}
                onChange={(e) => updateClipTransform(selectedClip.id, { rotation: parseInt(e.target.value) })}
                className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* Position X / Y */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800">
              <div>
                <label className="text-[10px] text-zinc-500 font-mono">POS X</label>
                <input
                  type="number"
                  value={transform.x}
                  onChange={(e) => updateClipTransform(selectedClip.id, { x: parseInt(e.target.value) || 0 })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono mt-0.5 focus:border-zinc-600 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 font-mono">POS Y</label>
                <input
                  type="number"
                  value={transform.y}
                  onChange={(e) => updateClipTransform(selectedClip.id, { y: parseInt(e.target.value) || 0 })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono mt-0.5 focus:border-zinc-600 focus:outline-hidden"
                />
              </div>
            </div>
          </div>
        </div>

        {/* CapCut-Style Image Controls */}
        {selectedClip.type === 'image' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <span className="flex items-center gap-1.5 text-purple-400">
                <Layers className="w-3.5 h-3.5" />
                <span>CapCut Image Styling</span>
              </span>
            </div>

            <div className="bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800 space-y-3">
              {/* Fit Mode */}
              <div>
                <label className="text-[10px] text-zinc-400 block mb-1">Image Fit Mode</label>
                <div className="grid grid-cols-3 gap-1">
                  {(['cover', 'contain', 'fill'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => updateClip(selectedClip.id, { fitMode: mode })}
                      className={`py-1 text-[10px] capitalize rounded border transition-colors ${
                        (selectedClip.fitMode || 'cover') === mode
                          ? 'bg-purple-600/30 border-purple-500 text-purple-300 font-semibold'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Corner Radius */}
              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                  <span>Rounded Corners</span>
                  <span className="font-mono text-zinc-200">{selectedClip.borderRadius ?? 0}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={selectedClip.borderRadius ?? 0}
                  {...rangeTx('Adjust rounded corners')}
                  onChange={(e) => updateClip(selectedClip.id, { borderRadius: parseInt(e.target.value) || 0 }, { coalesceKey: 'image-radius' })}
                  className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-purple-500"
                />
                <div className="flex items-center justify-between pt-1 text-[9px] text-zinc-500 font-mono">
                  <button
                    onClick={() => updateClip(selectedClip.id, { borderRadius: 0 })}
                    className="px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    Sharp
                  </button>
                  <button
                    onClick={() => updateClip(selectedClip.id, { borderRadius: 12 })}
                    className="px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    Smooth (12px)
                  </button>
                  <button
                    onClick={() => updateClip(selectedClip.id, { borderRadius: 28 })}
                    className="px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    Card (28px)
                  </button>
                  <button
                    onClick={() => updateClip(selectedClip.id, { borderRadius: 60 })}
                    className="px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    Capsule
                  </button>
                </div>
              </div>

              {/* Border Stroke */}
              <div>
                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                  <span>Border Stroke</span>
                  <span className="font-mono text-zinc-200">{selectedClip.borderWidth ?? 0}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  value={selectedClip.borderWidth ?? 0}
                  {...rangeTx('Adjust border stroke')}
                  onChange={(e) => updateClip(selectedClip.id, { borderWidth: parseInt(e.target.value) || 0 }, { coalesceKey: 'image-border' })}
                  className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-purple-500"
                />

                {(selectedClip.borderWidth ?? 0) > 0 && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[10px] text-zinc-500">Border Color</span>
                    <div className="flex items-center gap-1.5">
                      {['#ffffff', '#38bdf8', '#a855f7', '#eab308', '#ef4444', '#000000'].map((color) => (
                        <button
                          key={color}
                          onClick={() => updateClip(selectedClip.id, { borderColor: color })}
                          className={`w-4 h-4 rounded-full border ${
                            (selectedClip.borderColor || '#ffffff') === color
                              ? 'border-white scale-110'
                              : 'border-zinc-700'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Drop Shadow */}
              <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
                <span className="text-[10px] text-zinc-400">CapCut Drop Shadow</span>
                <button
                  onClick={() => updateClip(selectedClip.id, { dropShadow: !selectedClip.dropShadow })}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                    selectedClip.dropShadow
                      ? 'bg-purple-600/40 border-purple-500 text-purple-300'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {selectedClip.dropShadow ? 'Active' : 'Off'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Text Properties Section */}
        {selectedClip.type === 'text' && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <Type className="w-3.5 h-3.5 text-blue-400" />
              <span>Typography</span>
            </div>

            <div className="bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800 space-y-2.5">
              <div>
                <label className="text-[10px] text-zinc-500 font-mono">CAPTION CONTENT</label>
                <input
                  type="text"
                  value={selectedClip.textContent || ''}
                  onChange={(e) => updateClip(selectedClip.id, { textContent: e.target.value }, { coalesceKey: `text-content:${selectedClip.id}` })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 mt-1 focus:border-zinc-600 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-zinc-500 font-mono">FONT SIZE</label>
                  <input
                    type="number"
                    value={selectedClip.fontSize || 32}
                    onChange={(e) => updateClip(selectedClip.id, { fontSize: parseInt(e.target.value) || 24 }, { coalesceKey: `text-size:${selectedClip.id}` })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 font-mono mt-0.5 focus:border-zinc-600 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 font-mono">COLOR</label>
                  <input
                    type="color"
                    value={selectedClip.textColor || '#ffffff'}
                    onChange={(e) => updateClip(selectedClip.id, { textColor: e.target.value }, { coalesceKey: `text-color:${selectedClip.id}` })}
                    className="w-full h-7 bg-zinc-950 border border-zinc-800 rounded p-0.5 mt-0.5 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Comprehensive Color Grading & Screen Blur Section for Video & Images */}
        {(selectedClip.type === 'video' || selectedClip.type === 'image') && (
          <div className="space-y-3">
            {/* Screen / Clip Blur Control */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-blue-400">
                  <Droplets className="w-3.5 h-3.5" />
                  <span>Screen & Clip Blur</span>
                </span>
                <span className="font-mono text-zinc-200">{blur}px</span>
              </div>

              <div className="bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800 space-y-2">
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="1"
                  value={blur}
                  {...rangeTx('Adjust clip blur')}
                  onChange={(e) => updateClipEffect(selectedClip.id, 'blur', parseInt(e.target.value) || 0)}
                  className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                />

                <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                  <button
                    onClick={() => updateClipEffect(selectedClip.id, 'blur', 0)}
                    className="px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    0px
                  </button>
                  <button
                    onClick={() => updateClipEffect(selectedClip.id, 'blur', 6)}
                    className="px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    6px
                  </button>
                  <button
                    onClick={() => updateClipEffect(selectedClip.id, 'blur', 14)}
                    className="px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    14px
                  </button>
                  <button
                    onClick={() => updateClipEffect(selectedClip.id, 'blur', 28)}
                    className="px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    28px
                  </button>
                </div>
              </div>
            </div>

            {/* Cinematic 1-Click LUT Presets */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Cinematic Color Presets</span>
              </span>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => applyLutPreset('teal_orange')}
                  className="p-1.5 rounded bg-zinc-900 border border-zinc-800 hover:border-blue-500 hover:bg-blue-950/40 text-[10px] font-medium text-zinc-300 text-center transition-colors"
                >
                  Teal & Orange
                </button>
                <button
                  type="button"
                  onClick={() => applyLutPreset('cyberpunk')}
                  className="p-1.5 rounded bg-zinc-900 border border-zinc-800 hover:border-pink-500 hover:bg-pink-950/40 text-[10px] font-medium text-zinc-300 text-center transition-colors"
                >
                  Cyberpunk
                </button>
                <button
                  type="button"
                  onClick={() => applyLutPreset('vintage')}
                  className="p-1.5 rounded bg-zinc-900 border border-zinc-800 hover:border-amber-500 hover:bg-amber-950/40 text-[10px] font-medium text-zinc-300 text-center transition-colors"
                >
                  Vintage 90s
                </button>
                <button
                  type="button"
                  onClick={() => applyLutPreset('noir')}
                  className="p-1.5 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-500 hover:bg-zinc-800 text-[10px] font-medium text-zinc-300 text-center transition-colors"
                >
                  Film Noir
                </button>
                <button
                  type="button"
                  onClick={() => applyLutPreset('vibrant')}
                  className="p-1.5 rounded bg-zinc-900 border border-zinc-800 hover:border-emerald-500 hover:bg-emerald-950/40 text-[10px] font-medium text-zinc-300 text-center transition-colors"
                >
                  Viral Pop
                </button>
                <button
                  type="button"
                  onClick={() => applyLutPreset('dreamy')}
                  className="p-1.5 rounded bg-zinc-900 border border-zinc-800 hover:border-indigo-500 hover:bg-indigo-950/40 text-[10px] font-medium text-zinc-300 text-center transition-colors"
                >
                  Dreamy Soft
                </button>
              </div>
            </div>

            {/* Fine-Tuning Color Grading Sliders */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Color Wheels & Grading</span>
                </span>
                <button
                  onClick={() => applyLutPreset('reset')}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Reset
                </button>
              </div>

              <div className="bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800 space-y-2.5">
                {/* Exposure / Brightness */}
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Exposure / Brightness</span>
                    <span className="font-mono text-zinc-200">{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="180"
                    value={brightness}
                    {...rangeTx('Adjust brightness')}
                    onChange={(e) => updateClipEffect(selectedClip.id, 'brightness', parseInt(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Contrast */}
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Contrast</span>
                    <span className="font-mono text-zinc-200">{contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="200"
                    value={contrast}
                    {...rangeTx('Adjust contrast')}
                    onChange={(e) => updateClipEffect(selectedClip.id, 'contrast', parseInt(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Saturation */}
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Saturation / Vibrance</span>
                    <span className="font-mono text-zinc-200">{saturation}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="220"
                    value={saturation}
                    {...rangeTx('Adjust saturation')}
                    onChange={(e) => updateClipEffect(selectedClip.id, 'saturation', parseInt(e.target.value))}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* White Balance / Temperature */}
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Temperature (Cool / Warm)</span>
                    <span className="font-mono text-zinc-200">{temperature > 0 ? `+${temperature}` : temperature}</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={temperature}
                    {...rangeTx('Adjust temperature')}
                    onChange={(e) => updateClipEffect(selectedClip.id, 'temperature', parseInt(e.target.value))}
                    className="w-full h-1 bg-gradient-to-r from-cyan-600 via-zinc-700 to-amber-500 rounded appearance-none cursor-pointer"
                  />
                </div>

                {/* Hue Rotation */}
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Hue Rotation</span>
                    <span className="font-mono text-zinc-200">{hue}°</span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    value={hue}
                    {...rangeTx('Adjust hue rotation')}
                    onChange={(e) => updateClipEffect(selectedClip.id, 'hue', parseInt(e.target.value))}
                    className="w-full h-1 bg-gradient-to-r from-rose-500 via-emerald-500 via-blue-500 to-rose-500 rounded appearance-none cursor-pointer"
                  />
                </div>

                {/* Advanced Sliders: Sepia, Grayscale, Invert */}
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-zinc-800">
                  <div>
                    <label className="text-[10px] text-zinc-500 font-mono block mb-1">SEPIA</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={sepia}
                      {...rangeTx('Adjust sepia')}
                      onChange={(e) => updateClipEffect(selectedClip.id, 'sepia', parseInt(e.target.value))}
                      className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 font-mono block mb-1">B&W</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={grayscale}
                      {...rangeTx('Adjust B&W')}
                      onChange={(e) => updateClipEffect(selectedClip.id, 'grayscale', parseInt(e.target.value))}
                      className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-zinc-400"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 font-mono block mb-1">INVERT</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={invert}
                      {...rangeTx('Adjust invert')}
                      onChange={(e) => updateClipEffect(selectedClip.id, 'invert', parseInt(e.target.value))}
                      className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Audio Track Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Audio Gain & Mixing</span>
          </div>

          <div className="bg-zinc-900/60 p-2.5 rounded-md border border-zinc-800 space-y-2">
            <div className="flex justify-between text-[11px] text-zinc-400">
              <span>Channel Gain</span>
              <span className="font-mono text-zinc-200">{Math.round(selectedClip.volume)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              value={selectedClip.volume}
              {...rangeTx('Adjust channel gain')}
              onChange={(e) => updateClip(selectedClip.id, { volume: parseInt(e.target.value) }, { coalesceKey: `gain:${selectedClip.id}` })}
              className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
