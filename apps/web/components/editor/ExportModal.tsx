'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { useEditor } from '../../lib/editor/EditorContext';
import { useWorkspace } from '../../lib/workspace/WorkspaceContext';
import { EditorProject } from '../../lib/editor/types';
import { secondsToTimecode } from '../../lib/editor/time-utils';
import { buildCssFilter, buildMasterFilter } from '../../lib/editor/render-utils';
import {
  ExportValidationReport,
  FfmpegCapabilities,
  runNativeFFmpegExport,
} from '../../lib/editor/ffmpeg-export';
import {
  CODEC_PRESETS,
  CodecProfileId,
  computeWebCodecsTargetBitrate,
  EncoderSpeedPreset,
  getCodecPresetMeta,
  QUALITY_TIER_META,
  QualityTier,
  replaceFileExtension,
  ResolutionPreset,
  resolveExportDimensions,
} from '../../lib/editor/engine/export-presets';
import { WebGL2LayerProcessor } from '../../lib/editor/engine/compositor-webgl';
import { extractColorGradeValues } from '../../lib/editor/engine/grading';
import { evaluateClipMotion } from '../../lib/editor/engine/animations';
import {
  getCurveDurationMultiplier,
  mapTimelineToSourceOffset,
} from '../../lib/editor/engine/velocity';
import {
  findActiveTransitionAtTime,
  getTransitionVisualPair,
} from '../../lib/editor/engine/transitions';
import {
  renderRichTextToCanvas,
  renderSvgStickerToCanvas,
} from '../../lib/editor/engine/export-raster';
import { isTauriRuntime, normalizeJoin, openPathInExplorer, saveExportedVideoToDisk } from '../../lib/workspace/storage';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  Download, 
  X, 
  CheckCircle2, 
  Folder, 
  FileVideo, 
  Check, 
  Copy, 
  Terminal, 
  Sparkles, 
  Film,
  ExternalLink,
  AlertCircle
} from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

async function seekElementExact(el: HTMLMediaElement, targetSec: number): Promise<void> {
  const safeTarget = Math.max(0, Math.min(el.duration || targetSec, targetSec));
  if (Math.abs(el.currentTime - safeTarget) < 0.002 && el.readyState >= 2) {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      el.removeEventListener('seeked', onSeeked);
      resolve();
    };
    const timeout = setTimeout(done, 2200);
    const onSeeked = () => {
      const vid = el as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
      };
      if (el instanceof HTMLVideoElement && typeof vid.requestVideoFrameCallback === 'function') {
        let rvfcTimer = setTimeout(done, 80);
        vid.requestVideoFrameCallback(() => {
          clearTimeout(rvfcTimer);
          done();
        });
      } else {
        done();
      }
    };
    el.addEventListener('seeked', onSeeked, { once: true });
    el.currentTime = safeTarget;
  });
}

function drawFittedMedia(
  ctx: CanvasRenderingContext2D,
  media: HTMLVideoElement | HTMLImageElement,
  targetW: number,
  targetH: number,
  fitMode: 'cover' | 'contain' | 'fill' = 'cover',
  borderRadius = 0,
  borderWidth = 0,
  borderColor = '#ffffff'
) {
  const srcW = media instanceof HTMLVideoElement ? (media.videoWidth || targetW) : (media.naturalWidth || targetW);
  const srcH = media instanceof HTMLVideoElement ? (media.videoHeight || targetH) : (media.naturalHeight || targetH);

  let dw = targetW;
  let dh = targetH;
  if (fitMode === 'cover') {
    const s = Math.max(targetW / srcW, targetH / srcH);
    dw = srcW * s;
    dh = srcH * s;
  } else if (fitMode === 'contain') {
    const s = Math.min(targetW / srcW, targetH / srcH);
    dw = srcW * s;
    dh = srcH * s;
  }

  ctx.save();
  if (borderRadius > 0) {
    ctx.beginPath();
    ctx.roundRect(-targetW / 2, -targetH / 2, targetW, targetH, borderRadius);
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(-targetW / 2, -targetH / 2, targetW, targetH);
    ctx.clip();
  }
  ctx.drawImage(media, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();

  if (borderWidth > 0) {
    ctx.save();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.beginPath();
    if (borderRadius > 0) {
      ctx.roundRect(-targetW / 2, -targetH / 2, targetW, targetH, borderRadius);
    } else {
      ctx.rect(-targetW / 2, -targetH / 2, targetW, targetH);
    }
    ctx.stroke();
    ctx.restore();
  }
}

async function mixProjectAudioOffline(project: EditorProject, exportDuration: number): Promise<AudioBuffer | null> {
  if (typeof OfflineAudioContext === 'undefined') return null;

  const sampleRate = 48000;
  const totalSamples = Math.max(1, Math.ceil(exportDuration * sampleRate));
  const decodedCache = new Map<string, AudioBuffer | null>();

  const audioCandidates: Array<{
    assetId: string;
    url: string;
    timelineStart: number;
    sourceStart: number;
    duration: number;
    volume: number;
  }> = [];

  for (const track of project.timeline.tracks) {
    if (track.muted) continue;
    if (track.type !== 'audio' && track.type !== 'video') continue;
    for (const clip of track.clips) {
      if (clip.muted || (clip.volume ?? 100) <= 0 || !clip.assetId) continue;
      if (clip.type !== 'audio' && clip.type !== 'video') continue;
      const asset = project.mediaLibrary.find((a) => a.id === clip.assetId);
      if (!asset?.url) continue;
      audioCandidates.push({
        assetId: clip.assetId,
        url: asset.url,
        timelineStart: clip.timelineStart,
        sourceStart: clip.sourceStart,
        duration: clip.duration,
        volume: clip.volume ?? 100,
      });
    }
  }

  if (audioCandidates.length === 0) return null;

  const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
  let scheduledAny = false;

  for (const item of audioCandidates) {
    let buffer = decodedCache.get(item.assetId);
    if (buffer === undefined) {
      try {
        const res = await fetch(item.url);
        const ab = await res.arrayBuffer();
        buffer = await offlineCtx.decodeAudioData(ab);
      } catch {
        buffer = null;
      }
      decodedCache.set(item.assetId, buffer);
    }

    if (!buffer) continue;
    const playableDur = Math.min(item.duration, Math.max(0, buffer.duration - item.sourceStart));
    if (playableDur <= 0.01) continue;

    const source = offlineCtx.createBufferSource();
    source.buffer = buffer;
    const matchedClip = project.timeline.tracks
      .flatMap((t) => t.clips)
      .find((c) => c.assetId === item.assetId && c.timelineStart === item.timelineStart);
    if (matchedClip?.speedCurve) {
      const mult = getCurveDurationMultiplier(matchedClip.speedCurve);
      source.playbackRate.value = Math.max(0.1, Math.min(8, 1 / mult));
    }

    const gain = offlineCtx.createGain();
    const baseGain = Math.max(0, Math.min(2, item.volume / 100));
    gain.gain.setValueAtTime(baseGain, item.timelineStart);
    if (matchedClip?.fadeIn && matchedClip.fadeIn > 0) {
      gain.gain.setValueAtTime(0, item.timelineStart);
      gain.gain.linearRampToValueAtTime(baseGain, item.timelineStart + Math.min(matchedClip.fadeIn, item.duration));
    }
    if (matchedClip?.fadeOut && matchedClip.fadeOut > 0) {
      const outStart = item.timelineStart + Math.max(0, item.duration - matchedClip.fadeOut);
      gain.gain.setValueAtTime(baseGain, outStart);
      gain.gain.linearRampToValueAtTime(0, item.timelineStart + item.duration);
    }

    source.connect(gain);
    gain.connect(offlineCtx.destination);
    source.start(item.timelineStart, item.sourceStart, playableDur);
    scheduledAny = true;
  }

  if (!scheduledAny) return null;
  return await offlineCtx.startRendering();
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const { settings } = useWorkspace();
  const { project, aspectRatio, framerSettings } = useEditor();

  const [resolutionPreset, setResolutionPreset] = useState<ResolutionPreset>(
    settings.defaultResolution || '1080p',
  );
  const [customWidth, setCustomWidth] = useState<number>(1920);
  const [customHeight, setCustomHeight] = useState<number>(1080);
  const [fps, setFps] = useState<number>(settings.defaultFps || 30);
  const [codecProfile, setCodecProfile] = useState<CodecProfileId>('h264_hq');
  const [qualityTier, setQualityTier] = useState<QualityTier>('high');
  const [encoderSpeed, setEncoderSpeed] = useState<EncoderSpeedPreset>('medium');
  const [verifyAfterExport, setVerifyAfterExport] = useState<boolean>(true);
  const [capabilities, setCapabilities] = useState<FfmpegCapabilities | null>(null);
  const [validationReport, setValidationReport] = useState<ExportValidationReport | null>(null);

  const [customSaveFolder, setCustomSaveFolder] = useState<string | null>(null);
  const [customFileName, setCustomFileName] = useState<string | null>(null);

  const primaryVideoClip = useMemo(
    () => project.timeline.tracks.flatMap((t) => t.clips).find((c) => c.type === 'video' && c.assetId),
    [project.timeline.tracks],
  );
  const primaryVideoAsset = useMemo(
    () => (primaryVideoClip?.assetId ? project.mediaLibrary.find((a) => a.id === primaryVideoClip.assetId) : undefined),
    [primaryVideoClip, project.mediaLibrary],
  );
  const effectiveRatio = project.mode === 'clipping' ? '9:16' : aspectRatio;
  const resolvedDims = useMemo(
    () =>
      resolveExportDimensions(
        effectiveRatio,
        resolutionPreset,
        primaryVideoAsset,
        customWidth,
        customHeight,
      ),
    [effectiveRatio, resolutionPreset, primaryVideoAsset, customWidth, customHeight],
  );
  const codecMeta = useMemo(() => getCodecPresetMeta(codecProfile), [codecProfile]);

  const saveFolderPath = customSaveFolder ?? (settings.downloadsPath || 'D:\\Editor\\downloads');
  const defaultCleanName = (project.name || 'Winecut_Video')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  const rawFileName =
    customFileName ?? `${defaultCleanName}_${resolvedDims.width}x${resolvedDims.height}_${fps}fps.${codecMeta.extension}`;
  const fileName = replaceFileExtension(rawFileName, codecMeta.extension);

  const [exportState, setExportState] = useState<'idle' | 'rendering' | 'finished' | 'error'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [exportedBlobUrl, setExportedBlobUrl] = useState<string | null>(null);
  const [savedDiskPath, setSavedDiskPath] = useState<string | null>(null);
  const [ffmpegCommand, setFfmpegCommand] = useState<string>('');
  const [exportWarning, setExportWarning] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<boolean>(false);

  const livePreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cancelFlagRef = useRef<boolean>(false);

  useEffect(() => {
    cancelFlagRef.current = !isOpen;
    if (isOpen && isTauriRuntime()) {
      invoke<FfmpegCapabilities>('get_ffmpeg_capabilities')
        .then(setCapabilities)
        .catch(() => {});
    }
  }, [isOpen]);

  const handleCloseModal = () => {
    cancelFlagRef.current = true;
    if (exportState === 'rendering' && isTauriRuntime()) {
      invoke('cancel_ffmpeg_export').catch(() => {});
    }
    if (exportedBlobUrl) {
      URL.revokeObjectURL(exportedBlobUrl);
      setExportedBlobUrl(null);
    }
    setExportState('idle');
    setProgress(0);
    setSavedDiskPath(null);
    setFfmpegCommand('');
    setExportWarning(null);
    setValidationReport(null);
    onClose();
  };

  const handleBrowseFolder = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        // @ts-ignore
        const dirHandle = await window.showDirectoryPicker();
        if (dirHandle?.name) {
          setCustomSaveFolder(`D:\\Editor\\${dirHandle.name}`);
          return;
        }
      }
      const custom = prompt('Enter destination folder path:', saveFolderPath);
      if (custom) setCustomSaveFolder(custom.trim());
    } catch {
      // cancelled
    }
  };

  const fullSavePath = normalizeJoin(saveFolderPath, fileName);

  const handleStartExport = async () => {
    if (exportState === 'rendering') return;

    cancelFlagRef.current = false;
    setExportState('rendering');
    setProgress(5);
    setExportWarning(null);
    setValidationReport(null);
    setStatusMessage(
      `Preparing ${resolvedDims.width}x${resolvedDims.height} @ ${fps}fps (${codecMeta.label})...`,
    );

    const legacyRes: '720p' | '1080p' | '4k' =
      resolutionPreset === '4k' ? '4k' : resolutionPreset === '720p' ? '720p' : '1080p';

    // 1. PREFERRED PATH: Native Full-RGB BT.709 FFmpeg Compositor
    if (isTauriRuntime()) {
      try {
        const res = await runNativeFFmpegExport({
          project,
          aspectRatio,
          framerSettings,
          resolution: legacyRes,
          fps,
          exportConfig: {
            resolutionPreset,
            customWidth,
            customHeight,
            fps,
            codecProfile,
            qualityTier,
            encoderSpeed,
            verifyAfterExport,
          },
          cachePath: settings.cachePath || 'D:\\Editor\\cache',
          saveFolderPath,
          fullSavePath,
          onProgress: (pct, msg) => {
            if (!cancelFlagRef.current) {
              setProgress(pct);
              setStatusMessage(msg);
            }
          },
          isCancelled: () => cancelFlagRef.current,
        });

        if (cancelFlagRef.current) return;

        setFfmpegCommand(res.ffmpegCommand);
        setSavedDiskPath(res.savedPath);
        setValidationReport(res.validation ?? null);
        setProgress(100);
        setExportState('finished');
        setStatusMessage(`Exported verified ${res.actualWidth}x${res.actualHeight} @ ${fps}fps -> ${res.savedPath}`);
        return;
      } catch (ffErr: unknown) {
        const msg = ffErr instanceof Error ? ffErr.message : String(ffErr);
        if (cancelFlagRef.current || msg.toLowerCase().includes('cancelled')) {
          setExportState('idle');
          setProgress(0);
          return;
        }
        console.warn('Native FFmpeg graph failed, using step-synced WebGL2 renderer fallback:', ffErr);
        setExportWarning(`FFmpeg direct note: ${msg} — rendered via step-synced WebGL2 fallback.`);
      }
    }

    // 2. FALLBACK PATH (Browser mode or FFmpeg graph fallback): Frame-Stepped Offline WebGL2 Renderer
    const isClippingMode = project.mode === 'clipping';

    try {
      const { width: exportW, height: exportH } = resolvedDims;
      const allClips = project.timeline.tracks.flatMap(t => t.clips);
      const exportDuration = allClips.length > 0
        ? Math.max(...allClips.map(c => c.timelineStart + c.duration))
        : (project.timeline.duration || 5);

      const offscreen = document.createElement('canvas');
      offscreen.width = exportW;
      offscreen.height = exportH;
      const ctx = offscreen.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Could not initialize Canvas 2D Context');

      setStatusMessage('Loading WebGL2 shader compositor & raster layers...');
      const videoElementsByClip = new Map<string, HTMLVideoElement>();
      const imageElementsByClip = new Map<string, HTMLImageElement>();
      const stickerCanvasesByClip = new Map<string, HTMLCanvasElement>();
      const richTextCanvasesByClip = new Map<string, HTMLCanvasElement>();
      const webglProc = new WebGL2LayerProcessor();

      for (const track of project.timeline.tracks) {
        for (const clip of track.clips) {
          if (clip.type === 'sticker' && clip.stickerSvg) {
            const stCanvas = await renderSvgStickerToCanvas(
              clip.stickerSvg,
              Math.max(360, Math.round(exportH * 0.65)),
            );
            stickerCanvasesByClip.set(clip.id, stCanvas);
            continue;
          }
          if (clip.type === 'text' && clip.textContent) {
            richTextCanvasesByClip.set(clip.id, renderRichTextToCanvas(clip, exportH));
            continue;
          }
          if (!clip.assetId) continue;
          const asset = project.mediaLibrary.find(a => a.id === clip.assetId);
          if (!asset?.url) continue;

          if (clip.type === 'video') {
            const v = document.createElement('video');
            v.src = asset.url;
            v.crossOrigin = 'anonymous';
            v.preload = 'auto';
            v.playsInline = true;
            v.muted = true;
            videoElementsByClip.set(clip.id, v);
          } else if (clip.type === 'image') {
            const img = new Image();
            img.src = asset.url;
            img.crossOrigin = 'anonymous';
            imageElementsByClip.set(clip.id, img);
          }
        }
      }

      await Promise.all([
        ...Array.from(videoElementsByClip.values()).map(
          v => new Promise<void>((res) => {
            if (v.readyState >= 2) return res();
            v.onloadeddata = () => res();
            v.onerror = () => res();
            setTimeout(res, 2500);
          })
        ),
        ...Array.from(imageElementsByClip.values()).map(
          img => new Promise<void>((res) => {
            if (img.complete) return res();
            img.onload = () => res();
            img.onerror = () => res();
            setTimeout(res, 2000);
          })
        ),
      ]);

      const bottomToTopVideoTracks = [...project.timeline.tracks.filter(t => t.type === 'video' && t.visible)].reverse();
      const textTracks = project.timeline.tracks.filter(t => t.type === 'text' && t.visible);
      const masterFilterStr = buildMasterFilter(project.settings);

      const totalFrames = Math.max(1, Math.round(exportDuration * fps));
      const frameStepSec = 1 / fps;
      const frameDurationUs = 1_000_000 / fps;

      const drawCompositeFrame = (currentT: number) => {
        ctx.filter = 'none';
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, exportW, exportH);

        const primaryClippingClip = isClippingMode ? allClips.find(c => c.type === 'video') : undefined;
        let flashOverlayAlpha = 0;

        if (isClippingMode && primaryClippingClip) {
          const vid = videoElementsByClip.get(primaryClippingClip.id);
          if (vid && vid.readyState >= 2) {
            const grade = extractColorGradeValues(primaryClippingClip.effects, primaryClippingClip.lutId);
            const shadedSource: HTMLVideoElement | HTMLCanvasElement =
              webglProc.isReady() &&
              webglProc.renderFrame(
                vid,
                vid.videoWidth || 1280,
                vid.videoHeight || 720,
                grade,
                primaryClippingClip.mask,
                primaryClippingClip.layerEffects || [],
                currentT,
              )
                ? webglProc.canvas
                : vid;

            const vw = shadedSource instanceof HTMLVideoElement ? (shadedSource.videoWidth || 1920) : shadedSource.width;
            const vh = shadedSource instanceof HTMLVideoElement ? (shadedSource.videoHeight || 1080) : shadedSource.height;
            const topH = Math.round(framerSettings.splitRatio * exportH);
            const btmH = exportH - topH;

            const tb = framerSettings.topBox;
            ctx.drawImage(shadedSource, (tb.x / 100) * vw, (tb.y / 100) * vh, Math.max(1, (tb.width / 100) * vw), Math.max(1, (tb.height / 100) * vh), 0, 0, exportW, topH);

            const bb = framerSettings.bottomBox;
            ctx.drawImage(shadedSource, (bb.x / 100) * vw, (bb.y / 100) * vh, Math.max(1, (bb.width / 100) * vw), Math.max(1, (bb.height / 100) * vh), 0, topH, exportW, btmH);

            if (framerSettings.dividerWidth > 0) {
              const divPx = framerSettings.dividerWidth * (exportH / 720);
              ctx.fillStyle = framerSettings.dividerColor || '#000000';
              ctx.fillRect(0, topH - divPx / 2, exportW, divPx);
            }
          }
        }

        // Composite multi-track layers, transitions, stickers, animations, masks & rich text (unified in both modes!)
        ctx.save();
        if (masterFilterStr !== 'none') ctx.filter = masterFilterStr;
        const scaleRatioX = exportW / 680;
        const scaleRatioY = exportH / 382;
        const transitions = project.timeline.transitions || [];

        for (const track of bottomToTopVideoTracks) {
          const activeTr = findActiveTransitionAtTime(track, transitions, currentT);
          const clipsToRender = activeTr
            ? [
                { clip: activeTr.fromClip, trSide: 'out' as const },
                { clip: activeTr.toClip, trSide: 'in' as const },
              ]
            : track.clips
                .filter(c => c.id !== primaryClippingClip?.id && currentT >= c.timelineStart && currentT <= c.timelineStart + c.duration)
                .map(clip => ({ clip, trSide: null }));

          for (const { clip, trSide } of clipsToRender) {
            if (clip.id === primaryClippingClip?.id) continue;
            const localT = Math.max(0, currentT - clip.timelineStart);
            const motion = evaluateClipMotion(clip, localT);

            let trDx = 0;
            let trDy = 0;
            let trScale = 1;
            let trOpacity = 1;
            if (trSide && activeTr) {
              const pair = getTransitionVisualPair(activeTr.edge.type, activeTr.progress, exportW, exportH);
              if (pair.flashAlpha > flashOverlayAlpha) flashOverlayAlpha = pair.flashAlpha;
              if (trSide === 'out') {
                trDx = pair.outDx;
                trDy = pair.outDy;
                trScale = pair.outScale;
                trOpacity = pair.outOpacity;
              } else {
                trDx = pair.inDx;
                trDy = pair.inDy;
                trScale = pair.inScale;
                trOpacity = pair.inOpacity;
              }
            }

            const cx = exportW / 2 + ((clip.transform.x + motion.dx) * scaleRatioX) + trDx;
            const cy = exportH / 2 + ((clip.transform.y + motion.dy) * scaleRatioY) + trDy;

            if (clip.type === 'sticker') {
              const stCanvas = stickerCanvasesByClip.get(clip.id);
              if (!stCanvas) continue;
              ctx.save();
              ctx.translate(cx, cy);
              ctx.rotate(((clip.transform.rotation + motion.rotation) * Math.PI) / 180);
              ctx.scale((clip.transform.scale || 0.45) * motion.scaleX * trScale, (clip.transform.scale || 0.45) * motion.scaleY * trScale);
              ctx.globalAlpha = Math.max(0, Math.min(1, (clip.transform.opacity ?? 1) * motion.opacity * trOpacity));
              ctx.drawImage(stCanvas, -stCanvas.width / 2, -stCanvas.height / 2);
              ctx.restore();
              continue;
            }

            const mediaEl = clip.type === 'video'
              ? videoElementsByClip.get(clip.id)
              : clip.type === 'image'
                ? imageElementsByClip.get(clip.id)
                : undefined;
            if (!mediaEl) continue;

            const grade = extractColorGradeValues(clip.effects, clip.lutId);
            const mediaW = mediaEl instanceof HTMLVideoElement ? (mediaEl.videoWidth || exportW) : (mediaEl.naturalWidth || exportW);
            const mediaH = mediaEl instanceof HTMLVideoElement ? (mediaEl.videoHeight || exportH) : (mediaEl.naturalHeight || exportH);
            const targetTexW = Math.min(3840, Math.max(exportW, mediaW));
            const targetTexH = Math.min(3840, Math.max(exportH, mediaH));
            const renderedSource: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement =
              webglProc.isReady() &&
              webglProc.renderFrame(mediaEl, targetTexW, targetTexH, grade, clip.mask, clip.layerEffects || [], currentT)
                ? webglProc.canvas
                : mediaEl;

            const br = (clip.borderRadius || 0) * scaleRatioX;
            const bw = (clip.borderWidth || 0) * scaleRatioX;
            const bc = clip.borderColor || '#ffffff';

            ctx.save();
            if (!(renderedSource instanceof HTMLCanvasElement)) {
              const cf = buildCssFilter(clip.effects, clip.lutId);
              if (cf !== 'none') ctx.filter = masterFilterStr !== 'none' ? `${masterFilterStr} ${cf}` : cf;
            }
            ctx.translate(cx, cy);
            ctx.rotate(((clip.transform.rotation + motion.rotation) * Math.PI) / 180);
            ctx.scale(clip.transform.scale * motion.scaleX * trScale, clip.transform.scale * motion.scaleY * trScale);
            ctx.globalAlpha = Math.max(0, Math.min(1, (clip.transform.opacity ?? 1) * motion.opacity * trOpacity));
            if (clip.dropShadow) {
              ctx.shadowColor = 'rgba(0,0,0,0.65)';
              ctx.shadowBlur = 18 * scaleRatioX;
              ctx.shadowOffsetY = 8 * scaleRatioY;
            }
            if (renderedSource instanceof HTMLCanvasElement) {
              ctx.drawImage(renderedSource, -exportW / 2, -exportH / 2, exportW, exportH);
            } else {
              drawFittedMedia(ctx, renderedSource, exportW, exportH, clip.fitMode || 'cover', br, bw, bc);
            }
            ctx.restore();
          }
        }
        ctx.restore();

        if (flashOverlayAlpha > 0.02) {
          ctx.save();
          ctx.fillStyle = `rgba(255,255,255,${flashOverlayAlpha.toFixed(2)})`;
          ctx.fillRect(0, 0, exportW, exportH);
          ctx.restore();
        }

        ctx.filter = 'none';
        for (const track of textTracks) {
          const clip = track.clips.find(c => currentT >= c.timelineStart && currentT <= c.timelineStart + c.duration);
          if (!clip?.textContent) continue;
          const txtCanvas = richTextCanvasesByClip.get(clip.id);
          if (!txtCanvas) continue;
          const localT = Math.max(0, currentT - clip.timelineStart);
          const motion = evaluateClipMotion(clip, localT);

          const posX = exportW / 2 + (clip.transform.x + motion.dx) * (exportW / 680);
          const posY = exportH * 0.84 + (clip.transform.y + motion.dy) * (exportH / 382);

          ctx.save();
          ctx.translate(posX, posY);
          ctx.rotate(((clip.transform.rotation + motion.rotation) * Math.PI) / 180);
          ctx.scale((clip.transform.scale || 1) * motion.scaleX, (clip.transform.scale || 1) * motion.scaleY);
          ctx.globalAlpha = Math.max(0, Math.min(1, (clip.transform.opacity ?? 1) * motion.opacity));
          ctx.drawImage(txtCanvas, -txtCanvas.width / 2, -txtCanvas.height / 2);
          ctx.restore();
        }

        const previewCanvas = livePreviewCanvasRef.current;
        if (previewCanvas) {
          const pctx = previewCanvas.getContext('2d');
          if (pctx) {
            pctx.fillStyle = '#000000';
            pctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
            const ratio = Math.min(previewCanvas.width / exportW, previewCanvas.height / exportH);
            const dw = exportW * ratio;
            const dh = exportH * ratio;
            pctx.drawImage(offscreen, (previewCanvas.width - dw) / 2, (previewCanvas.height - dh) / 2, dw, dh);
          }
        }
      };

      // Check WebCodecs support for exact-PTS High Profile MP4 muxing scaled cleanly for target resolution & FPS
      let webCodecsConfig: { codec: string; muxerCodec: 'avc' | 'vp9' } | null = null;
      const evenW = exportW % 2 === 0 ? exportW : exportW + 1;
      const evenH = exportH % 2 === 0 ? exportH : exportH + 1;
      const targetBitrate = computeWebCodecsTargetBitrate(evenW, evenH, fps, qualityTier);

      if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
        const candidates: Array<{ codec: string; muxerCodec: 'avc' | 'vp9' }> = [
          { codec: 'avc1.640034', muxerCodec: 'avc' }, // H.264 High L5.2 (up to 4K60)
          { codec: 'avc1.640033', muxerCodec: 'avc' }, // H.264 High L5.1 (4K30)
          { codec: 'avc1.64002a', muxerCodec: 'avc' }, // H.264 High L4.2 (1080p60)
          { codec: 'avc1.4d002a', muxerCodec: 'avc' },
          { codec: 'avc1.4d001f', muxerCodec: 'avc' },
          { codec: 'vp09.00.10.08', muxerCodec: 'vp9' },
        ];
        for (const cand of candidates) {
          try {
            const sup = await VideoEncoder.isConfigSupported({
              codec: cand.codec,
              width: evenW,
              height: evenH,
              bitrate: targetBitrate,
              framerate: fps,
            });
            if (sup.supported) {
              webCodecsConfig = cand;
              break;
            }
          } catch {}
        }
      }

      let finalBlob: Blob;
      let outputMimeType = 'video/mp4';

      if (webCodecsConfig) {
        setStatusMessage('Mixing offline audio stream (48kHz stereo)...');
        const mixedAudio = await mixProjectAudioOffline(project, exportDuration);

        let audioCodecCfg: { codec: string; muxerCodec: 'aac' | 'opus' } | null = null;
        if (mixedAudio && typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined') {
          for (const aCand of [
            { codec: 'mp4a.40.2', muxerCodec: 'aac' as const },
            { codec: 'opus', muxerCodec: 'opus' as const },
          ]) {
            try {
              const sup = await AudioEncoder.isConfigSupported({
                codec: aCand.codec,
                sampleRate: 48000,
                numberOfChannels: 2,
                bitrate: 192_000,
              });
              if (sup.supported) {
                audioCodecCfg = aCand;
                break;
              }
            } catch {}
          }
        }

        const muxer = new Muxer({
          target: new ArrayBufferTarget(),
          video: {
            codec: webCodecsConfig.muxerCodec,
            width: evenW,
            height: evenH,
          },
          audio: audioCodecCfg
            ? { codec: audioCodecCfg.muxerCodec, numberOfChannels: 2, sampleRate: 48000 }
            : undefined,
          fastStart: 'in-memory',
          firstTimestampBehavior: 'offset',
        });

        let encodeFailure: Error | null = null;

        const videoEncoder = new VideoEncoder({
          output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
          error: (e) => {
            encodeFailure = e;
          },
        });
        videoEncoder.configure({
          codec: webCodecsConfig.codec,
          width: evenW,
          height: evenH,
          bitrate: targetBitrate,
          framerate: fps,
        });

        let audioEncoder: AudioEncoder | null = null;
        if (mixedAudio && audioCodecCfg) {
          audioEncoder = new AudioEncoder({
            output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
            error: (e) => {
              console.warn('AudioEncoder warning:', e);
            },
          });
          audioEncoder.configure({
            codec: audioCodecCfg.codec,
            sampleRate: 48000,
            numberOfChannels: 2,
            bitrate: 192_000,
          });

          const leftCh = mixedAudio.getChannelData(0);
          const rightCh = mixedAudio.numberOfChannels > 1 ? mixedAudio.getChannelData(1) : leftCh;
          const chunkFrames = 1024;
          for (let offset = 0; offset < mixedAudio.length; offset += chunkFrames) {
            const count = Math.min(chunkFrames, mixedAudio.length - offset);
            const planar = new Float32Array(count * 2);
            planar.set(leftCh.subarray(offset, offset + count), 0);
            planar.set(rightCh.subarray(offset, offset + count), count);
            const ad = new AudioData({
              format: 'f32-planar',
              sampleRate: 48000,
              numberOfFrames: count,
              numberOfChannels: 2,
              timestamp: Math.round((offset / 48000) * 1_000_000),
              data: planar,
            });
            audioEncoder.encode(ad);
            ad.close();
          }
        }

        offscreen.width = evenW;
        offscreen.height = evenH;

        for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
          if (cancelFlagRef.current) {
            try { videoEncoder.close(); } catch {}
            try { audioEncoder?.close(); } catch {}
            return;
          }
          if (encodeFailure) throw encodeFailure;

          const currentT = frameIdx * frameStepSec;
          setProgress(Math.min(88, Math.round((frameIdx / totalFrames) * 88)));
          setStatusMessage(
            `Encoding exact CFR frame ${frameIdx + 1}/${totalFrames} (${secondsToTimecode(currentT, fps)})...`
          );

          const activeSeekPromises: Promise<void>[] = [];
          for (const track of bottomToTopVideoTracks) {
            for (const clip of track.clips) {
              if (clip.type === 'video' && currentT >= clip.timelineStart && currentT <= clip.timelineStart + clip.duration) {
                const v = videoElementsByClip.get(clip.id);
                if (v) {
                  activeSeekPromises.push(seekElementExact(v, clip.sourceStart + mapTimelineToSourceOffset(clip, currentT - clip.timelineStart)));
                }
              }
            }
          }
          await Promise.all(activeSeekPromises);

          drawCompositeFrame(currentT);

          while (videoEncoder.encodeQueueSize > 8) {
            await new Promise((r) => setTimeout(r, 4));
          }

          const vf = new VideoFrame(offscreen, {
            timestamp: Math.round(frameIdx * frameDurationUs),
            duration: Math.round(frameDurationUs),
          });
          videoEncoder.encode(vf, { keyFrame: frameIdx % (fps * 2) === 0 });
          vf.close();
        }

        setProgress(90);
        setStatusMessage('Finalizing CFR MP4 container...');
        await videoEncoder.flush();
        videoEncoder.close();
        if (audioEncoder) {
          await audioEncoder.flush();
          audioEncoder.close();
        }
        muxer.finalize();
        finalBlob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
      } else {
        // Legacy fallback when WebCodecs VideoEncoder is unavailable
        const canvasStream = offscreen.captureStream(fps);
        const videoTrack = canvasStream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };

        let mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
        outputMimeType = mimeType;

        const chunks: Blob[] = [];
        const recorder = new MediaRecorder(canvasStream, {
          mimeType,
          videoBitsPerSecond: targetBitrate,
        });
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        const recorderStopPromise = new Promise<Blob>((resolve) => {
          recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        });

        recorder.start();
        for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
          if (cancelFlagRef.current) {
            try { recorder.stop(); } catch {}
            return;
          }
          const currentT = frameIdx * frameStepSec;
          setProgress(Math.min(88, Math.round((frameIdx / totalFrames) * 88)));
          setStatusMessage(`Rendering frame ${frameIdx + 1}/${totalFrames}...`);

          const activeSeekPromises: Promise<void>[] = [];
          for (const track of bottomToTopVideoTracks) {
            for (const clip of track.clips) {
              if (clip.type === 'video' && currentT >= clip.timelineStart && currentT <= clip.timelineStart + clip.duration) {
                const v = videoElementsByClip.get(clip.id);
                if (v) activeSeekPromises.push(seekElementExact(v, clip.sourceStart + mapTimelineToSourceOffset(clip, currentT - clip.timelineStart)));
              }
            }
          }
          await Promise.all(activeSeekPromises);
          drawCompositeFrame(currentT);
          if (videoTrack?.requestFrame) videoTrack.requestFrame();
          await new Promise((r) => setTimeout(r, Math.max(8, Math.floor(1000 / fps))));
        }

        recorder.stop();
        setProgress(92);
        setStatusMessage('Saving rendered video...');
        finalBlob = await recorderStopPromise;
      }

      webglProc.dispose();
      for (const v of videoElementsByClip.values()) {
        v.removeAttribute('src');
        v.load();
      }
      videoElementsByClip.clear();
      imageElementsByClip.clear();

      const finalBlobUrl = URL.createObjectURL(finalBlob);
      setExportedBlobUrl(finalBlobUrl);

      const saved = await saveExportedVideoToDisk({
        fullSavePath,
        saveFolderPath,
        renderedBlob: finalBlob,
        mimeType: outputMimeType,
        fps,
      });

      setFfmpegCommand(saved.ffmpegCommand);
      if (saved.savedToDisk) {
        setSavedDiskPath(saved.savedPath);
      } else {
        triggerDownload(finalBlobUrl, fileName);
      }

      setProgress(100);
      setExportState('finished');
      setStatusMessage(
        saved.savedToDisk ? `Saved directly to ${saved.savedPath}!` : 'Export completed! Browser download started.'
      );
    } catch (err: any) {
      console.error('Export failed:', err);
      setExportState('error');
      setStatusMessage(`Export error: ${err?.message || 'Unknown error during rendering'}`);
    }
  };

  const triggerDownload = (blobUrl: string, name: string) => {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyCommand = () => {
    if (!ffmpegCommand) return;
    navigator.clipboard.writeText(ffmpegCommand);
    setCopiedCommand(true);
    setTimeout(() => setCopiedCommand(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in-0 duration-150">
      <div className="bg-[#111216] border border-zinc-800 rounded-xl max-w-lg w-full p-5 shadow-2xl relative flex flex-col text-zinc-200 font-sans">
        
        <div className="flex items-center justify-between pb-3.5 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">
                {project.mode === 'clipping' ? 'Export Clipped Short (9:16)' : 'Export Edited Video'}
              </h3>
              <p className="text-[11px] text-zinc-400 font-mono">
                {project.mode === 'clipping' ? '9:16 Split Cut' : aspectRatio} · Native FFmpeg CFR Encoder
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="py-4 space-y-4 text-xs">
          {exportState === 'rendering' && !isTauriRuntime() && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-blue-400">
                  <Film className="w-3.5 h-3.5 animate-pulse" />
                  <span>Step-Synced Render Preview</span>
                </span>
                <span className="font-mono text-zinc-200">{progress}%</span>
              </div>
              <div className="aspect-video w-full bg-black rounded-lg border border-zinc-800 overflow-hidden flex items-center justify-center relative shadow-inner">
                <canvas ref={livePreviewCanvasRef} width={360} height={202} className="w-full h-full object-contain" />
              </div>
            </div>
          )}

          {exportState !== 'rendering' && exportState !== 'finished' && (
            <>
              <div className="space-y-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/40">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-zinc-400">
                      Resolution ({resolvedDims.width}×{resolvedDims.height})
                    </label>
                    {primaryVideoAsset?.width && (
                      <span className="text-[10px] font-mono text-zinc-500">
                        Source: {primaryVideoAsset.width}×{primaryVideoAsset.height}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {([
                      { id: 'source', label: 'Source' },
                      { id: '720p', label: '720p' },
                      { id: '1080p', label: '1080p' },
                      { id: '1440p', label: '1440p' },
                      { id: '4k', label: '4K' },
                      { id: 'custom', label: 'Custom' },
                    ] as const).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setResolutionPreset(r.id)}
                        className={`py-1.5 px-1 rounded text-[11px] font-mono font-medium border text-center transition-all cursor-pointer ${
                          resolutionPreset === r.id
                            ? 'border-blue-500 bg-blue-950/60 text-blue-200'
                            : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  {resolutionPreset === 'custom' && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <label className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
                        <span>W</span>
                        <input
                          type="number"
                          min={128}
                          max={7680}
                          step={2}
                          value={customWidth}
                          onChange={(e) => setCustomWidth(Math.max(128, Number(e.target.value) || 1920))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200"
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
                        <span>H</span>
                        <input
                          type="number"
                          min={128}
                          max={7680}
                          step={2}
                          value={customHeight}
                          onChange={(e) => setCustomHeight(Math.max(128, Number(e.target.value) || 1080))}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-200"
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
                      Frame Rate
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {[24, 30, 60].map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFps(f)}
                          className={`py-1.5 px-1 rounded text-[11px] font-mono font-medium border text-center transition-all cursor-pointer ${
                            fps === f
                              ? 'border-blue-500 bg-blue-950/60 text-blue-200'
                              : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {f}fps
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
                      Encoder Speed
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {(['slow', 'medium', 'fast'] as const).map((sp) => (
                        <button
                          key={sp}
                          type="button"
                          onClick={() => setEncoderSpeed(sp)}
                          className={`py-1.5 px-1 rounded text-[11px] font-mono font-medium border text-center capitalize transition-all cursor-pointer ${
                            encoderSpeed === sp
                              ? 'border-blue-500 bg-blue-950/60 text-blue-200'
                              : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {sp}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
                      Codec Preset
                    </label>
                    <select
                      value={codecProfile}
                      onChange={(e) => setCodecProfile(e.target.value as CodecProfileId)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-200 font-mono"
                    >
                      {CODEC_PRESETS.filter(
                        (p) => !p.requiresGpu || capabilities?.h264_nvenc,
                      ).map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
                      Quality / CRF Tier
                    </label>
                    <select
                      value={qualityTier}
                      onChange={(e) => setQualityTier(e.target.value as QualityTier)}
                      disabled={codecProfile.startsWith('prores')}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-[11px] text-zinc-200 font-mono disabled:opacity-50"
                    >
                      {(Object.keys(QUALITY_TIER_META) as QualityTier[]).map((tier) => (
                        <option key={tier} value={tier}>
                          {QUALITY_TIER_META[tier].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5 text-[10px] text-zinc-400">
                  <span>{codecMeta.description}</span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300 shrink-0">
                    <input
                      type="checkbox"
                      checked={verifyAfterExport}
                      onChange={(e) => setVerifyAfterExport(e.target.checked)}
                      className="accent-blue-500"
                    />
                    <span>FFprobe Verify</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2 p-3 rounded-lg border border-zinc-800 bg-zinc-900/40">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-blue-400" />
                    <span>Save Folder Location</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    className="text-[10px] text-blue-400 hover:underline cursor-pointer"
                  >
                    Browse...
                  </button>
                </div>

                <input
                  type="text"
                  value={saveFolderPath}
                  onChange={(e) => setCustomSaveFolder(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:border-blue-500 focus:outline-hidden"
                  placeholder="D:\Editor\downloads"
                />

                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] text-zinc-400 font-mono">
                  <span className="text-zinc-500">Quick:</span>
                  <button
                    type="button"
                    onClick={() => setCustomSaveFolder('D:\\Editor\\downloads')}
                    className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800 cursor-pointer"
                  >
                    D:\Editor\downloads
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomSaveFolder('C:\\Users\\91992\\Videos')}
                    className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800 cursor-pointer"
                  >
                    Videos
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomSaveFolder('C:\\Users\\91992\\Downloads')}
                    className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800 cursor-pointer"
                  >
                    Downloads
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/40">
                <label className="text-[11px] font-semibold text-zinc-300 block mb-1 flex items-center gap-1.5">
                  <FileVideo className="w-3.5 h-3.5 text-blue-400" />
                  <span>File Name</span>
                </label>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setCustomFileName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:border-blue-500 focus:outline-hidden"
                />
                <p className="text-[10px] text-zinc-500 font-mono mt-1 truncate">
                  Destination: {fullSavePath}
                </p>
              </div>
            </>
          )}

          {(exportState === 'rendering' || exportState === 'finished' || exportState === 'error') && (
            <div className="space-y-3 p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-semibold text-zinc-200 truncate">{statusMessage}</span>
                <span className="font-mono text-zinc-400 shrink-0">{progress}%</span>
              </div>

              <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500 transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {exportWarning && (
                <div className="p-2 rounded bg-amber-950/40 border border-amber-800/50 text-[10px] text-amber-300 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{exportWarning}</span>
                </div>
              )}

              {exportState === 'finished' && (
                <div className="pt-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Smooth CFR MP4 Export Ready!</span>
                    </div>
                    {savedDiskPath && (
                      <button
                        onClick={() => openPathInExplorer(savedDiskPath)}
                        className="text-[11px] text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open in Explorer</span>
                      </button>
                    )}
                  </div>

                  {savedDiskPath && (
                    <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800/80 text-[11px] font-mono break-all text-zinc-300">
                      <span className="text-zinc-500 block text-[9px] uppercase tracking-wider mb-0.5">Saved Path on Disk:</span>
                      {savedDiskPath}
                    </div>
                  )}

                  {validationReport && (
                    <div className="p-2.5 rounded bg-emerald-950/25 border border-emerald-800/50 text-[10px] font-mono text-zinc-300 grid grid-cols-2 gap-x-3 gap-y-1">
                      <div>
                        <span className="text-zinc-500">Stream:</span>{' '}
                        <span className="text-emerald-300">
                          {validationReport.width}×{validationReport.height} · {validationReport.codec_name || codecMeta.id}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Format / Color:</span>{' '}
                        <span className="text-emerald-300">
                          {validationReport.pix_fmt} · {validationReport.color_space || 'bt709'}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Cadence:</span>{' '}
                        <span>
                          {(validationReport.fps || fps).toFixed(2)}fps ({validationReport.nb_frames || '-'} frames)
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Bitrate / Sync:</span>{' '}
                        <span>
                          {validationReport.bit_rate
                            ? `${(validationReport.bit_rate / 1_000_000).toFixed(1)} Mbps`
                            : 'VBR'}{' '}
                          (Δ {(validationReport.audio_sync_delta_sec ?? 0).toFixed(3)}s)
                        </span>
                      </div>
                      {(validationReport.ssim_avg != null || validationReport.psnr_avg != null) && (
                        <div className="col-span-2 text-cyan-300">
                          Quality vs Source — SSIM: {validationReport.ssim_avg?.toFixed(4) ?? '-'} · PSNR:{' '}
                          {validationReport.psnr_avg?.toFixed(2) ?? '-'} dB
                        </div>
                      )}
                    </div>
                  )}

                  {ffmpegCommand && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                        <span className="flex items-center gap-1 text-zinc-300">
                          <Terminal className="w-3 h-3 text-blue-400" />
                          <span>Executed FFmpeg Filter Graph</span>
                        </span>
                        <button
                          onClick={handleCopyCommand}
                          className="flex items-center gap-1 text-blue-400 hover:text-blue-300 cursor-pointer"
                        >
                          {copiedCommand ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedCommand ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="p-2 rounded bg-black/80 border border-zinc-800 text-[10px] font-mono text-emerald-400/90 break-all max-h-24 overflow-y-auto custom-scrollbar select-all">
                        {ffmpegCommand}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
          <Badge variant="outline" className="text-[10px] font-mono border-zinc-800 text-zinc-400">
            {resolvedDims.width}×{resolvedDims.height} · {fps} FPS · {codecMeta.pixFmt}
          </Badge>

          <div className="flex items-center gap-2">
            {exportState === 'rendering' ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  cancelFlagRef.current = true;
                  if (isTauriRuntime()) {
                    invoke('cancel_ffmpeg_export').catch(() => {});
                  }
                  setExportState('idle');
                  setProgress(0);
                }}
                className="text-xs px-4"
              >
                Cancel
              </Button>
            ) : exportState === 'finished' ? (
              <>
                {exportedBlobUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => triggerDownload(exportedBlobUrl, fileName)}
                    className="text-xs border-zinc-700 hover:bg-zinc-800 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Save Copy...
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleCloseModal}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-5 cursor-pointer"
                >
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCloseModal}
                  className="text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleStartExport}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-5 flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Start Export</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
