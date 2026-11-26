'use client';

/* eslint-disable @next/next/no-img-element */
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useEditor } from '../../lib/editor/EditorContext';
import { useWorkspace } from '../../lib/workspace/WorkspaceContext';
import { secondsToTimecode } from '../../lib/editor/time-utils';
import { MediaAsset } from '../../lib/editor/types';
import { InteractiveFramerBox, SplitResultPreview } from './FramerCanvasComponents';
import { InspectorPanel } from '../editor/InspectorPanel';
import { EditorSidebar } from '../editor/EditorSidebar';
import { Timeline } from '../editor/Timeline';
import { ExportModal } from '../editor/ExportModal';
import { buildCssFilter } from '../../lib/editor/render-utils';
import {
  FILTER_PRESETS,
  STICKER_PACKS,
  TEXT_STYLE_TEMPLATES,
} from '../../lib/editor/presets/bundles';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '../ui/resizable';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  ArrowLeft,
  Scissors,
  Upload,
  Play,
  Pause,
  RotateCcw,
  Download,
  Settings,
  ArrowRight,
  Film,
  Check,
  Volume2,
  VolumeX,
  Plus,
  Undo2,
  Redo2,
} from 'lucide-react';

export function ClippingWorkspace() {
  const { navigateToHome, navigateToSettings } = useWorkspace();
  const {
    project,
    currentTime,
    isPlaying,
    togglePlay,
    seek,
    playbackRate,
    framerSettings,
    updateFramerSettings,
    updateFramerBox,
    importMediaAsset,
    addClipToTrack,
    updateClip,
    selectedClipId,
    selectClip,
    addRichTextClip,
    addStickerClip,
    applyClipFilterPreset,
    toggleClipLayerEffect,
    sendClipperToEditor,
    saveNow,
    undo,
    redo,
    canUndo,
    canRedo,
    beginHistoryTransaction,
    endHistoryTransaction,
  } = useEditor();

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState<'framer' | 'assets'>('framer');
  const [volume, setVolume] = useState(85);
  const [isMuted, setIsMuted] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const framerVideoRef = useRef<HTMLVideoElement>(null);
  const [stageSize, setStageSize] = useState({ width: 720, height: 405 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 80 && height > 80) setStageSize({ width, height });
      }
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  const primaryVideoClip = useMemo(() => {
    return project.timeline.tracks
      .flatMap((t) => t.clips)
      .find((c) => c.type === 'video');
  }, [project.timeline.tracks]);

  const primaryVideoAsset = useMemo(() => {
    if (primaryVideoClip?.assetId) {
      const a = project.mediaLibrary.find((m) => m.id === primaryVideoClip.assetId);
      if (a) return a;
    }
    return project.mediaLibrary.find((m) => m.type === 'video');
  }, [primaryVideoClip, project.mediaLibrary]);

  // Sync framer video element with currentTime
  useEffect(() => {
    const vid = framerVideoRef.current;
    if (!vid) return;
    const targetT = primaryVideoClip
      ? Math.max(0, currentTime - primaryVideoClip.timelineStart + primaryVideoClip.sourceStart)
      : currentTime;
    if (Math.abs(vid.currentTime - targetT) > 0.15) {
      vid.currentTime = targetT;
    }
    vid.playbackRate = playbackRate;
    vid.volume = Math.max(0, Math.min(1, volume / 100));
    vid.muted = isMuted || volume === 0;
    if (isPlaying && vid.paused) vid.play().catch(() => {});
    else if (!isPlaying && !vid.paused) vid.pause();
  }, [currentTime, isPlaying, playbackRate, volume, isMuted, primaryVideoClip]);

  const monitorDimensions = useMemo(() => {
    const padW = stageSize.width * 0.9;
    const padH = stageSize.height * 0.85;
    const targetAspect = 16 / 9;
    if (padW / padH > targetAspect) {
      const h = padH;
      return { width: Math.round(h * targetAspect), height: Math.round(h) };
    } else {
      const w = padW;
      return { width: Math.round(w), height: Math.round(w / targetAspect) };
    }
  }, [stageSize]);

  const handleImportSourceVideo = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = blobUrl;
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve) => {
      video.onloadeddata = () => {
        video.currentTime = Math.min(1.0, (video.duration || 2) / 2);
      };
      video.onseeked = () => {
        const c = document.createElement('canvas');
        c.width = 160;
        c.height = 90;
        const ctx = c.getContext('2d');
        ctx?.drawImage(video, 0, 0, 160, 90);
        const thumbUrl = c.toDataURL('image/jpeg', 0.8);

        const asset: MediaAsset = {
          id: `asset-clip-${Date.now()}`,
          name: file.name,
          type: 'video',
          url: blobUrl,
          thumbnailUrl: thumbUrl,
          duration: Math.round(video.duration || 15),
          width: video.videoWidth || 1920,
          height: video.videoHeight || 1080,
          fps: 30,
          mimeType: file.type || 'video/mp4',
        };
        importMediaAsset(asset, file);
        // Automatically place on V1 track if V1 has no clip yet
        const v1 = project.timeline.tracks.find((t) => t.id === 'track-v1' || t.type === 'video');
        if (v1 && v1.clips.length === 0) {
          addClipToTrack(v1.id, asset);
        }
        resolve();
      };
      video.onerror = () => resolve();
    });
  };

  const handleBackHome = async () => {
    await saveNow();
    await navigateToHome();
  };

  const totalSourceDur = primaryVideoAsset?.duration || 30;
  const clipDuration = primaryVideoClip?.duration || totalSourceDur;

  const activeOverlayClips = useMemo(() => {
    return project.timeline.tracks
      .filter((t) => t.visible && (t.type === 'text' || t.type === 'video'))
      .flatMap((t) => t.clips)
      .filter(
        (c) =>
          c.id !== primaryVideoClip?.id &&
          (c.type === 'text' || c.type === 'sticker' || c.type === 'image') &&
          currentTime >= c.timelineStart &&
          currentTime <= c.timelineStart + c.duration,
      );
  }, [project.timeline.tracks, primaryVideoClip?.id, currentTime]);

  const handleStageDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const raw = e.dataTransfer.getData('application/x-winecut-drag');
    if (!raw) return;
    e.preventDefault();
    try {
      const payload = JSON.parse(raw) as {
        kind?: string;
        templateId?: string;
        stickerId?: string;
        lutId?: string;
        effectId?: string;
      };
      if (payload.kind === 'text-template' && payload.templateId) {
        const tpl = TEXT_STYLE_TEMPLATES.find((t) => t.id === payload.templateId);
        if (tpl) addRichTextClip(tpl);
      } else if (payload.kind === 'sticker' && payload.stickerId) {
        const st = STICKER_PACKS.find((s) => s.id === payload.stickerId);
        if (st) addStickerClip(st);
      } else if (payload.kind === 'filter-preset' && payload.lutId && primaryVideoClip) {
        const preset = FILTER_PRESETS.find((f) => f.id === payload.lutId);
        if (preset) applyClipFilterPreset(primaryVideoClip.id, preset.id);
      } else if (payload.kind === 'layer-effect' && payload.effectId && primaryVideoClip) {
        toggleClipLayerEffect(primaryVideoClip.id, payload.effectId);
      }
    } catch {
      // ignore invalid drop
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0b0e] text-zinc-100 font-sans overflow-hidden select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.mov,.webm,.mkv"
        className="hidden"
        onChange={(e) => handleImportSourceVideo(e.target.files)}
      />

      {/* Top Clipping Studio Header */}
      <header className="h-12 bg-zinc-950 border-b border-zinc-800 px-3 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackHome}
            className="h-8 px-2.5 gap-1.5 text-zinc-400 hover:text-white text-xs cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Projects</span>
          </Button>

          <div className="h-4 w-[1px] bg-zinc-800" />

          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Scissors className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-white truncate max-w-[160px]">{project.name}</span>
            <Badge className="text-[9px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-700/60">
              CLIP CUTTER
            </Badge>
          </div>
        </div>

        {/* Center View Switcher: Wireframe Boxes vs 9:16 Split Result */}
        <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
          <button
            onClick={() => updateFramerSettings({ viewMode: 'framing_crop' })}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              framerSettings.viewMode === 'framing_crop'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Wireframe Crop Boxes
          </button>
          <button
            onClick={() => updateFramerSettings({ viewMode: 'split_preview' })}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              framerSettings.viewMode === 'split_preview'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            9:16 Split Preview
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          {/* Undo / Redo */}
          <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={undo}
              disabled={!canUndo}
              className="h-7 w-7 text-zinc-400 hover:text-zinc-100 disabled:opacity-30 cursor-pointer"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={redo}
              disabled={!canRedo}
              className="h-7 w-7 text-zinc-400 hover:text-zinc-100 disabled:opacity-30 cursor-pointer"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await saveNow();
              setSavedToast(true);
              setTimeout(() => setSavedToast(false), 1800);
            }}
            className="h-8 text-xs text-zinc-400 hover:text-white cursor-pointer"
          >
            {savedToast ? <Check className="w-3.5 h-3.5 text-emerald-400 mr-1" /> : null}
            <span>{savedToast ? 'Saved' : 'Save Draft'}</span>
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={navigateToSettings}
            className="h-8 w-8 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={sendClipperToEditor}
            disabled={!primaryVideoAsset}
            className="h-8 gap-1.5 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-200 cursor-pointer"
            title="Convert framed speakers to multi-track timeline for captions & effects"
          >
            <span>Open in Video Editor</span>
            <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
          </Button>

          <Button
            size="sm"
            onClick={() => setIsExportOpen(true)}
            disabled={!primaryVideoAsset}
            className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Clip</span>
          </Button>
        </div>
      </header>

      {/* Main Workspace Grid (Top Studio Split + Bottom Full Pro Timeline) */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <ResizablePanelGroup direction="vertical" className="h-full w-full">
          <ResizablePanel defaultSize={66} minSize={35} className="min-h-0 flex flex-col">
            <div className="flex-1 flex min-h-0 overflow-hidden">
              {/* Left Tool Rail: Switch smoothly between Clip Framer Presets & Full Stickers/Text/FX Sidebar */}
              <aside className="w-72 shrink-0 bg-zinc-950 border-r border-zinc-800 flex flex-col overflow-hidden">
                <div className="grid grid-cols-2 gap-1 border-b border-zinc-800 bg-zinc-900/60 p-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setLeftPanelTab('framer')}
                    className={`py-1.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${
                      leftPanelTab === 'framer'
                        ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Cut &amp; Framer
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeftPanelTab('assets')}
                    className={`py-1.5 rounded text-[11px] font-medium cursor-pointer transition-colors ${
                      leftPanelTab === 'assets'
                        ? 'bg-zinc-800 text-white border border-zinc-700'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Stickers, Text &amp; FX
                  </button>
                </div>

                {leftPanelTab === 'assets' ? (
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <EditorSidebar />
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col p-3.5 gap-4 overflow-y-auto custom-scrollbar">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              <span>Source Media</span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Import
              </button>
            </div>

            {project.mediaLibrary.length === 0 ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-800 hover:border-emerald-500/60 rounded-xl p-6 text-center cursor-pointer transition-colors bg-zinc-900/30 space-y-2"
              >
                <Upload className="w-6 h-6 text-emerald-400 mx-auto" />
                <p className="text-xs font-medium text-zinc-200">Upload Source Video</p>
                <p className="text-[10px] text-zinc-500">MP4, MOV, WebM podcast or reaction</p>
              </div>
            ) : (
              <div className="space-y-2">
                {project.mediaLibrary.map((asset) => (
                  <div
                    key={asset.id}
                    onClick={() => {
                      const v1 = project.timeline.tracks.find((t) => t.id === 'track-v1' || t.type === 'video');
                      if (v1) {
                        addClipToTrack(v1.id, asset);
                      }
                    }}
                    className={`p-2 rounded-lg border flex items-center gap-2.5 cursor-pointer transition-colors ${
                      primaryVideoAsset?.id === asset.id
                        ? 'border-emerald-500/60 bg-emerald-950/20'
                        : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                    }`}
                  >
                    <div className="w-14 h-9 rounded bg-black overflow-hidden shrink-0 flex items-center justify-center border border-zinc-800">
                      {asset.thumbnailUrl ? (
                        <img src={asset.thumbnailUrl} alt={asset.name} className="w-full h-full object-cover" />
                      ) : (
                        <Film className="w-4 h-4 text-zinc-600" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-zinc-100 truncate">{asset.name}</div>
                      <div className="text-[10px] font-mono text-zinc-500">
                        {asset.duration}s · {asset.width}x{asset.height}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Clip Cut Time Range Controls */}
          {primaryVideoClip && (
            <div className="space-y-2 pt-3 border-t border-zinc-800">
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Scissors className="w-3.5 h-3.5" />
                  <span>Clip Cut Range</span>
                </span>
                <span className="font-mono text-zinc-200">{clipDuration.toFixed(1)}s</span>
              </div>

              <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800 space-y-3 text-xs">
                <div>
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                    <span>Start Offset (In)</span>
                    <span className="font-mono text-zinc-200">{primaryVideoClip.sourceStart.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={Math.max(0, totalSourceDur - 1)}
                    step="0.5"
                    value={primaryVideoClip.sourceStart}
                    onPointerDown={() => beginHistoryTransaction('Adjust clip start offset')}
                    onPointerUp={() => endHistoryTransaction()}
                    onPointerCancel={() => endHistoryTransaction()}
                    onChange={(e) => {
                      const newIn = parseFloat(e.target.value);
                      const maxEnd = totalSourceDur;
                      const newOut = Math.max(newIn + 1, Math.min(maxEnd, primaryVideoClip.sourceEnd));
                      updateClip(primaryVideoClip.id, {
                        sourceStart: newIn,
                        sourceEnd: newOut,
                        duration: Number((newOut - newIn).toFixed(2)),
                      });
                    }}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                    <span>Clip Length</span>
                    <span className="font-mono text-zinc-200">{primaryVideoClip.duration.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max={Math.max(1, totalSourceDur - primaryVideoClip.sourceStart)}
                    step="0.5"
                    value={primaryVideoClip.duration}
                    onPointerDown={() => beginHistoryTransaction('Adjust clip cut length')}
                    onPointerUp={() => endHistoryTransaction()}
                    onPointerCancel={() => endHistoryTransaction()}
                    onChange={(e) => {
                      const dur = parseFloat(e.target.value);
                      updateClip(primaryVideoClip.id, {
                        duration: dur,
                        sourceEnd: primaryVideoClip.sourceStart + dur,
                      });
                    }}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Quick Wireframe Framing Presets */}
          <div className="space-y-2 pt-3 border-t border-zinc-800">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block">
              Wireframe Cutter Presets
            </span>
            <div className="space-y-1.5">
              <button
                onClick={() => {
                  beginHistoryTransaction('Apply Dual Podcast preset');
                  updateFramerBox('top', { x: 6, y: 8, width: 42, height: 84 });
                  updateFramerBox('bottom', { x: 52, y: 8, width: 42, height: 84 });
                  updateFramerSettings({ splitRatio: 0.5 });
                  endHistoryTransaction();
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-200 cursor-pointer"
              >
                <div className="font-semibold">Dual Podcast Left / Right</div>
                <div className="text-[10px] text-zinc-500">2 equal 9:8 crop boxes stacked vertically</div>
              </button>
              <button
                onClick={() => {
                  beginHistoryTransaction('Apply Gameplay + Facecam preset');
                  updateFramerBox('top', { x: 2, y: 5, width: 96, height: 54 });
                  updateFramerBox('bottom', { x: 30, y: 55, width: 40, height: 42 });
                  updateFramerSettings({ splitRatio: 0.6 });
                  endHistoryTransaction();
                }}
                className="w-full text-left px-3 py-2 rounded-lg bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-200 cursor-pointer"
              >
                <div className="font-semibold">Gameplay Top + Facecam Bottom</div>
                <div className="text-[10px] text-zinc-500">60/40 reaction split framing</div>
              </button>
            </div>
          </div>
                  </div>
                )}
        </aside>

        {/* Center Wireframe Clip Cutter Stage */}
        <div
          className="flex-1 flex flex-col justify-between bg-[#08080a] min-w-0 overflow-hidden"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-winecut-drag')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={handleStageDrop}
        >
          <div
            ref={stageRef}
            className="flex-1 flex items-center justify-center p-4 overflow-hidden relative"
          >
            {framerSettings.viewMode === 'split_preview' ? (
              primaryVideoAsset ? (
                <SplitResultPreview
                  videoAsset={primaryVideoAsset}
                  primaryClip={primaryVideoClip}
                  overlayClips={activeOverlayClips}
                  mediaLibrary={project.mediaLibrary}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  playbackRate={playbackRate}
                  framerSettings={framerSettings}
                  isMuted={isMuted}
                  volume={volume}
                  selectedClipId={selectedClipId}
                  onSelectClip={selectClip}
                />
              ) : (
                <div className="text-zinc-500 text-xs font-mono">
                  Upload a source video on the left to preview the 9:16 split result.
                </div>
              )
            ) : (
              <div
                ref={cropContainerRef}
                style={{
                  width: `${monitorDimensions.width}px`,
                  height: `${monitorDimensions.height}px`,
                }}
                className="relative bg-black rounded-lg shadow-[0_4px_35px_rgba(0,0,0,0.8)] border border-zinc-700/80 overflow-hidden flex items-center justify-center select-none"
              >
                {primaryVideoAsset ? (
                  <video
                    ref={framerVideoRef}
                    src={primaryVideoAsset.url}
                    playsInline
                    preload="auto"
                    style={
                      primaryVideoClip
                        ? { filter: buildCssFilter(primaryVideoClip.effects, primaryVideoClip.lutId) }
                        : undefined
                    }
                    className="w-full h-full object-contain pointer-events-none"
                  />
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center gap-2 text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <Upload className="w-7 h-7 text-emerald-400" />
                    <span className="text-xs font-medium">Click to Upload Video for Clip Cutter</span>
                  </button>
                )}

                {/* Clip Cutter Wireframe Boxes */}
                <InteractiveFramerBox
                  box={framerSettings.topBox}
                  onChange={(updates) => updateFramerBox('top', updates, { skipHistory: true })}
                  containerRef={cropContainerRef}
                  onInteractionStart={beginHistoryTransaction}
                  onInteractionEnd={endHistoryTransaction}
                />
                <InteractiveFramerBox
                  box={framerSettings.bottomBox}
                  onChange={(updates) => updateFramerBox('bottom', updates, { skipHistory: true })}
                  containerRef={cropContainerRef}
                  onInteractionStart={beginHistoryTransaction}
                  onInteractionEnd={endHistoryTransaction}
                />
              </div>
            )}
          </div>

          {/* Bottom Scrubber & Playback Bar */}
          <div className="h-12 border-t border-zinc-800 bg-[#0f1013] px-4 flex items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => seek(0)}
                className="h-7 w-7 text-zinc-400 hover:text-white"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="icon"
                onClick={togglePlay}
                className="h-8 w-8 bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </Button>
            </div>

            <div className="flex-1 flex items-center gap-3">
              <span className="font-mono text-[11px] text-zinc-300 w-16">
                {secondsToTimecode(currentTime, 30)}
              </span>
              <input
                type="range"
                min="0"
                max={clipDuration}
                step="0.05"
                value={Math.min(clipDuration, currentTime)}
                onChange={(e) => seek(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-emerald-500"
              />
              <span className="font-mono text-[11px] text-zinc-500 w-16 text-right">
                {secondsToTimecode(clipDuration, 30)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  setVolume(Number(e.target.value));
                  if (isMuted) setIsMuted(false);
                }}
                className="w-16 h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Right Full Pro Clipping Inspector (Framer + Color + Mask + Animate + Speed) */}
        <div className="w-76 shrink-0 border-l border-zinc-800 overflow-hidden">
          <InspectorPanel />
        </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Bottom Full Multi-Track Timeline inside Clip Cutter */}
          <ResizablePanel defaultSize={34} minSize={20} className="min-h-0">
            <Timeline />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Export Modal (Renders 9:16 Top/Bottom Split Crop when exporting from Clipping!) */}
      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
    </div>
  );
}
