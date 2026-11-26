'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useRef } from 'react';
import { useEditor } from '../../lib/editor/EditorContext';
import { MediaAsset } from '../../lib/editor/types';
import { AVAILABLE_SKILLS } from '../../lib/editor/sample-data';
import {
  EFFECT_BUNDLES,
  FILTER_PRESETS,
  STICKER_PACKS,
  TEXT_STYLE_TEMPLATES,
} from '../../lib/editor/presets/bundles';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { 
  FolderPlus, 
  Type, 
  Music, 
  Sparkles, 
  Plus, 
  Sliders, 
  Check, 
  Zap, 
  Upload, 
  FileVideo,
  FileAudio,
  Smile,
  GripVertical
} from 'lucide-react';

export function EditorSidebar() {
  const { 
    project, 
    selectedClip,
    activeSidebarTab, 
    setActiveSidebarTab, 
    addClipToTrack, 
    autoAddMediaToTimeline,
    addTextClip,
    addRichTextClip,
    addStickerClip,
    applyClipFilterPreset,
    toggleClipLayerEffect,
    applySkill,
    importMediaAsset 
  } = useEditor();

  const [appliedSkill, setAppliedSkill] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [isProcessingFile, setIsProcessingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tabs = [
    { id: 'media' as const, label: 'Media', icon: FolderPlus },
    { id: 'text' as const, label: 'Text', icon: Type },
    { id: 'stickers' as const, label: 'Stickers', icon: Smile },
    { id: 'audio' as const, label: 'Audio', icon: Music },
    { id: 'effects' as const, label: 'FX & LUTs', icon: Sliders },
    { id: 'skills' as const, label: 'AI Skills', icon: Sparkles },
  ];

  const resolveTargetVisualClipId = (): string | null => {
    if (selectedClip && (selectedClip.type === 'video' || selectedClip.type === 'image' || selectedClip.type === 'sticker')) {
      return selectedClip.id;
    }
    const v1 = project.timeline.tracks.find((t) => t.id === 'track-v1') || project.timeline.tracks.find((t) => t.type === 'video');
    return v1?.clips[0]?.id ?? null;
  };

  const handleDragStartPayload = (e: React.DragEvent, payload: Record<string, unknown>) => {
    e.dataTransfer.setData('application/x-winecut-drag', JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleRunSkill = (id: string) => {
    applySkill(id);
    setAppliedSkill(id);
    setTimeout(() => setAppliedSkill(null), 2500);
  };

  // Process user imported video/audio file
  const processFiles = async (files: FileList | File[]) => {
    setIsProcessingFile(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;

      const isVideo = file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|mov|mkv|avi|m4v)$/i);
      const isAudio = file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|ogg|aac|flac|m4a)$/i);
      
      const blobUrl = URL.createObjectURL(file);

      if (isVideo) {
        // Extract real video metadata & canvas thumbnail (non-blocking for large >34s+ media)
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.src = blobUrl;

        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = (thumbUrl?: string) => {
            if (settled) return;
            settled = true;
            clearTimeout(safetyTimer);
            const rawDur =
              Number.isFinite(video.duration) && video.duration > 0
                ? Number(video.duration.toFixed(2))
                : 10;
            const newAsset: MediaAsset = {
              id: `asset-user-${Date.now()}-${i}`,
              name: file.name,
              type: 'video',
              url: blobUrl,
              thumbnailUrl: thumbUrl,
              duration: Math.max(0.5, rawDur),
              width: video.videoWidth || 1920,
              height: video.videoHeight || 1080,
              fps: 30,
              mimeType: file.type || 'video/mp4',
            };
            importMediaAsset(newAsset, file);
            resolve();
          };

          const safetyTimer = setTimeout(() => {
            // Even if seeking stalls on a large/long video, import with full detected metadata duration
            finish(undefined);
          }, 3000);

          video.onloadedmetadata = () => {
            const seekPos = Math.min(1.0, Math.max(0.05, (video.duration || 2) * 0.1));
            try {
              video.currentTime = seekPos;
            } catch {
              finish(undefined);
            }
          };

          video.onseeked = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = 160;
              canvas.height = 90;
              const ctx = canvas.getContext('2d');
              if (ctx && video.videoWidth > 0) {
                ctx.drawImage(video, 0, 0, 160, 90);
                finish(canvas.toDataURL('image/jpeg', 0.8));
                return;
              }
            } catch {
              // ignore thumbnail capture failures and still import full duration
            }
            finish(undefined);
          };

          video.onerror = () => {
            finish(undefined);
          };
        });
      } else if (isAudio) {
        const audio = document.createElement('audio');
        audio.src = blobUrl;

        await new Promise<void>((resolve) => {
          audio.onloadedmetadata = () => {
            const newAsset: MediaAsset = {
              id: `asset-audio-${Date.now()}-${i}`,
              name: file.name,
              type: 'audio',
              url: blobUrl,
              duration: Math.round(audio.duration || 15),
              mimeType: file.type || 'audio/mpeg',
            };
            importMediaAsset(newAsset, file);
            resolve();
          };
          audio.onerror = () => resolve();
        });
      } else if (file.type.startsWith('image/') || file.name.match(/\.(png|jpg|jpeg|webp|gif|svg)$/i)) {
        const img = new Image();
        img.src = blobUrl;

        await new Promise<void>((resolve) => {
          img.onload = () => {
            const newAsset: MediaAsset = {
              id: `asset-image-${Date.now()}-${i}`,
              name: file.name,
              type: 'image',
              url: blobUrl,
              thumbnailUrl: blobUrl,
              duration: 5, // default 5s for image clips
              width: img.naturalWidth || 1920,
              height: img.naturalHeight || 1080,
              mimeType: file.type || 'image/png',
            };
            importMediaAsset(newAsset, file);
            resolve();
          };
          img.onerror = () => {
            const newAsset: MediaAsset = {
              id: `asset-image-${Date.now()}-${i}`,
              name: file.name,
              type: 'image',
              url: blobUrl,
              thumbnailUrl: blobUrl,
              duration: 5,
              mimeType: file.type || 'image/png',
            };
            importMediaAsset(newAsset, file);
            resolve();
          };
        });
      }
    }
    setIsProcessingFile(false);
    setActiveSidebarTab('media');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  return (
    <aside className="w-full h-full bg-zinc-950 flex flex-col select-none overflow-hidden min-w-0">
      {/* Hidden File Input for Real Media Import (Videos, Audio, Images) */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="video/*,audio/*,image/*,.mp4,.mov,.webm,.mp3,.wav,.png,.jpg,.jpeg,.webp"
        multiple
        className="hidden"
      />

      {/* Tab Rail Header with responsive zero-min-width */}
      <div className="flex items-center border-b border-zinc-800 bg-zinc-900/60 p-1 gap-1 min-w-0 overflow-x-auto custom-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSidebarTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSidebarTab(tab.id)}
              className={`flex-1 min-w-0 py-1.5 px-1 flex flex-col items-center gap-1 rounded-md text-[10px] font-medium transition-all ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`} />
              <span className="truncate max-w-full text-center leading-none">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab Content Panel */}
      <div 
        onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        className="flex-1 p-2.5 overflow-y-auto custom-scrollbar min-w-0"
      >
        {/* Media Asset Bin */}
        {activeSidebarTab === 'media' && (
          <div className="space-y-3 min-w-0">
            {/* Real File Import Dropzone Header */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`p-3 rounded-lg border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-1.5 ${
                isDraggingOver
                  ? 'border-blue-500 bg-blue-500/10 text-blue-200'
                  : 'border-zinc-800 hover:border-zinc-600 bg-zinc-900/40 hover:bg-zinc-900/80 text-zinc-400'
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-zinc-800/80 flex items-center justify-center text-zinc-200">
                <Upload className="w-4 h-4" />
              </div>
              <div className="text-xs font-medium text-zinc-200">
                {isProcessingFile ? 'Extracting Metadata...' : 'Import Videos & Audio'}
              </div>
              <div className="text-[10px] text-zinc-500 font-mono">
                Click or drag & drop MP4, MOV, WebM, MP3
              </div>
            </div>

            <div className="flex items-center justify-between pb-0.5">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Project Media Bin
              </span>
              <Badge variant="outline" className="text-[10px] font-mono border-zinc-800 text-zinc-400">
                {project.mediaLibrary.length} items
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
              {project.mediaLibrary.map((asset) => (
                <div
                  key={asset.id}
                  draggable
                  onDragStart={(e) => handleDragStartPayload(e, { kind: 'media', assetId: asset.id })}
                  className="group relative rounded-md border border-zinc-800 bg-zinc-900/60 p-2 hover:bg-zinc-800/60 transition-all flex flex-col gap-1.5 min-w-0 cursor-grab active:cursor-grabbing"
                >
                  <div className="w-full h-20 rounded bg-zinc-950 flex items-center justify-center relative overflow-hidden border border-zinc-800/80">
                    {asset.thumbnailUrl ? (
                      <img 
                        src={asset.thumbnailUrl} 
                        alt={asset.name} 
                        className="w-full h-full object-cover pointer-events-none" 
                      />
                    ) : asset.type === 'video' ? (
                      <FileVideo className="w-6 h-6 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                    ) : (
                      <FileAudio className="w-6 h-6 text-emerald-500 group-hover:text-emerald-400 transition-colors" />
                    )}
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono bg-black/80 px-1 rounded text-zinc-300">
                      {asset.duration}s
                    </span>
                  </div>

                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium text-zinc-200 truncate" title={asset.name}>
                      {asset.name}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {asset.width ? `${asset.width}x${asset.height} · ` : ''}{asset.type.toUpperCase()}
                    </span>
                  </div>

                  {asset.type === 'video' || asset.type === 'image' ? (
                    <div className="grid grid-cols-3 gap-1 mt-0.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => addClipToTrack('track-v1', asset)}
                        className="h-6 text-[10px] px-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 truncate"
                        title="Insert to Main Video (V1)"
                      >
                        + V1
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => addClipToTrack('track-v2', asset)}
                        className="h-6 text-[10px] px-1 bg-blue-900/70 hover:bg-blue-800 text-blue-200 border border-blue-700/60 truncate font-medium"
                        title="Insert to Overlay Video (V2)"
                      >
                        + Overlay
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => autoAddMediaToTimeline(asset)}
                        className="h-6 text-[10px] px-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 truncate"
                        title="Auto Append to Timeline"
                      >
                        + Auto
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1 mt-0.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => addClipToTrack('track-a1', asset)}
                        className="h-6 text-[10px] px-1 bg-emerald-900/70 hover:bg-emerald-800 text-emerald-200 border border-emerald-700/60 truncate font-medium"
                        title="Insert to Audio (A1)"
                      >
                        + Audio (A1)
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => autoAddMediaToTimeline(asset)}
                        className="h-6 text-[10px] px-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 truncate"
                        title="Auto Append to Timeline"
                      >
                        + Auto
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Text Presets Tab (Click or Drag & Drop onto Monitor / Timeline) */}
        {activeSidebarTab === 'text' && (
          <div className="space-y-3 min-w-0">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Typography &amp; Captions
              </span>
              <Badge variant="outline" className="text-[10px] font-mono border-zinc-800 text-zinc-400">
                Drag to Canvas
              </Badge>
            </div>

            <div className="space-y-2">
              {TEXT_STYLE_TEMPLATES.map((tpl) => (
                <div
                  key={tpl.id}
                  draggable
                  onDragStart={(e) => handleDragStartPayload(e, { kind: 'text-template', templateId: tpl.id })}
                  onClick={() => addRichTextClip(tpl)}
                  className="group p-2.5 rounded-md border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/70 transition-all cursor-grab active:cursor-grabbing flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <GripVertical className="w-3 h-3 text-zinc-600 shrink-0" />
                      <span className="text-[10px] font-mono text-zinc-400 truncate">{tpl.label}</span>
                    </div>
                    <div
                      className="inline-block px-2 py-0.5 text-xs truncate max-w-full"
                      style={{
                        color: tpl.gradientColors ? 'transparent' : tpl.textColor,
                        backgroundImage: tpl.gradientColors
                          ? `linear-gradient(90deg, ${tpl.gradientColors[0]}, ${tpl.gradientColors[1]})`
                          : undefined,
                        WebkitBackgroundClip: tpl.gradientColors ? 'text' : undefined,
                        backgroundColor: !tpl.gradientColors ? tpl.textBgColor : undefined,
                        borderRadius: tpl.bgRadius ? `${Math.min(8, tpl.bgRadius)}px` : undefined,
                        fontWeight: tpl.fontWeight,
                        WebkitTextStroke: tpl.strokeWidth ? `1px ${tpl.strokeColor || '#000'}` : undefined,
                      }}
                    >
                      {tpl.previewText}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-zinc-400 group-hover:text-zinc-100 shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => addTextClip('CUSTOM CAPTION')}
                className="w-full py-1.5 rounded-md border border-dashed border-zinc-800 text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 cursor-pointer"
              >
                + Plain Caption Clip
              </button>
            </div>
          </div>
        )}

        {/* Stickers Tab (Click or Drag & Drop onto Monitor / Timeline) */}
        {activeSidebarTab === 'stickers' && (
          <div className="space-y-3 min-w-0">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Stickers &amp; Callouts
              </span>
              <Badge variant="outline" className="text-[10px] font-mono border-zinc-800 text-zinc-400">
                Drag to Canvas
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {STICKER_PACKS.map((sticker) => (
                <div
                  key={sticker.id}
                  draggable
                  onDragStart={(e) => handleDragStartPayload(e, { kind: 'sticker', stickerId: sticker.id })}
                  onClick={() => addStickerClip(sticker)}
                  className="group p-2 rounded-md border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/70 transition-all cursor-grab active:cursor-grabbing flex flex-col items-center gap-1.5"
                >
                  <div className="h-12 w-full flex items-center justify-center rounded bg-zinc-950/80 p-1.5">
                    <img
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(sticker.svg)}`}
                      alt={sticker.label}
                      className="max-h-full max-w-full object-contain pointer-events-none"
                    />
                  </div>
                  <span className="text-[10px] text-zinc-300 truncate w-full text-center">
                    {sticker.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audio & Music Tab */}
        {activeSidebarTab === 'audio' && (
          <div className="space-y-3 min-w-0">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                Sound FX & Music
              </span>
              <Badge variant="outline" className="text-[10px] font-mono border-zinc-800 text-zinc-400">
                Stems
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="p-2.5 rounded-md border border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-zinc-200">Deep Impact Boom</div>
                  <div className="text-[10px] text-zinc-400 font-mono">SFX · 2.4s · 48kHz</div>
                </div>
                <Button 
                  size="sm" 
                  variant="secondary" 
                  onClick={() => addClipToTrack('track-a2', {
                    id: 'sfx-boom',
                    name: 'Deep Impact Boom',
                    type: 'audio',
                    url: 'https://cdn.freesound.org/previews/415/415209_5121236-lq.mp3',
                    duration: 2.4
                  })}
                  className="h-6 text-[10px] px-2 bg-zinc-800 hover:bg-zinc-700"
                >
                  Insert A2
                </Button>
              </div>

              <div className="p-2.5 rounded-md border border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-zinc-200">Cinematic Ambient Pad</div>
                  <div className="text-[10px] text-zinc-400 font-mono">BGM · 24.0s · Stereo</div>
                </div>
                <Button 
                  size="sm" 
                  variant="secondary" 
                  onClick={() => addClipToTrack('track-a1', {
                    id: 'bgm-pad',
                    name: 'Cinematic Ambient Pad',
                    type: 'audio',
                    url: 'https://cdn.freesound.org/previews/530/530663_11565152-lq.mp3',
                    duration: 24.0
                  })}
                  className="h-6 text-[10px] px-2 bg-zinc-800 hover:bg-zinc-700"
                >
                  Insert A1
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Effects & Color Filters Tab */}
        {activeSidebarTab === 'effects' && (
          <div className="space-y-4 min-w-0">
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-0.5">
                <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Color Filter Presets
                </span>
                <Badge variant="outline" className="text-[10px] font-mono border-zinc-800 text-zinc-400">
                  WebGL2
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {FILTER_PRESETS.map((preset) => {
                  const targetId = resolveTargetVisualClipId();
                  const isActive = Boolean(
                    selectedClip &&
                      ((selectedClip.lutId || 'none') === preset.id)
                  );
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      draggable
                      onDragStart={(e) => handleDragStartPayload(e, { kind: 'filter-preset', lutId: preset.id })}
                      onClick={() => {
                        if (targetId) applyClipFilterPreset(targetId, preset.id);
                      }}
                      className={`p-2 rounded-md border text-left transition-all cursor-pointer ${
                        isActive
                          ? 'border-blue-500 bg-blue-950/40'
                          : 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/60'
                      }`}
                    >
                      <div
                        className="h-4 w-full rounded-sm mb-1.5"
                        style={{ background: preset.swatch }}
                      />
                      <div className="text-[11px] font-medium text-zinc-200 truncate">{preset.label}</div>
                      <div className="text-[9px] text-zinc-500 font-mono">{preset.category}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-zinc-800/80">
              <div className="flex items-center justify-between pb-0.5">
                <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Shader FX Bundles
                </span>
                <span className="text-[10px] font-mono text-zinc-500">Click or Drop</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {EFFECT_BUNDLES.map((fx) => {
                  const targetId = resolveTargetVisualClipId();
                  const isActive = Boolean(selectedClip?.layerEffects?.includes(fx.id));
                  return (
                    <button
                      key={fx.id}
                      type="button"
                      draggable
                      onDragStart={(e) => handleDragStartPayload(e, { kind: 'layer-effect', effectId: fx.id })}
                      onClick={() => {
                        if (targetId) toggleClipLayerEffect(targetId, fx.id);
                      }}
                      className={`p-2 rounded-md border text-left transition-all cursor-pointer ${
                        isActive
                          ? 'border-teal-500 bg-teal-950/40 text-teal-200'
                          : 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/60 text-zinc-200'
                      }`}
                      title={fx.description}
                    >
                      <div className="text-[11px] font-semibold truncate">{fx.label}</div>
                      <div className="text-[9px] text-zinc-400 font-mono">{fx.category}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* AI Skills Tab */}
        {activeSidebarTab === 'skills' && (
          <div className="space-y-3 min-w-0">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                AI Automation Copilot
              </span>
              <Badge variant="outline" className="text-[10px] font-mono border-zinc-800 text-zinc-400">
                Local Engine
              </Badge>
            </div>

            <div className="space-y-2">
              {AVAILABLE_SKILLS.map((skill) => (
                <div
                  key={skill.id}
                  className="p-3 rounded-md border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/60 transition-all flex flex-col gap-2 min-w-0"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-semibold text-zinc-200 truncate">{skill.name}</div>
                      <div className="text-[11px] text-zinc-400 mt-0.5 leading-snug line-clamp-2">{skill.description}</div>
                    </div>
                    <Badge variant="secondary" className="text-[9px] font-mono uppercase bg-zinc-800 text-zinc-300 border-zinc-700 shrink-0">
                      {skill.category}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-zinc-800/80">
                    <span className="text-[10px] font-mono text-zinc-500 truncate mr-2">
                      Tags: {skill.tags.join(' · ')}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleRunSkill(skill.id)}
                      className="h-6 text-[10px] gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 shrink-0"
                    >
                      {appliedSkill === skill.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Applied</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3 h-3 text-indigo-400" />
                          <span>Run Skill</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
