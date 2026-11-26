'use client';

/**
 * Native Frame-Exact FFmpeg Export Graph Builder
 * Supports:
 * - Multi-track video/image/overlay compositing + Unified 9:16 Clip Cutter Stage 1->2 pipeline
 * - Pro Color Grading (Exposure, Highlights, Shadows, Sharpen, Fade, Vignette, Grain, LUT Presets)
 * - Geometric/Feathered Masks via alpha PNG `alphamerge`
 * - Velocity Speed Curves / Scalar Speed (`setpts` + chained `atempo`) + `afade` In/Out
 * - Contiguous Clip Seam Transitions (`xfade`)
 * - Pixel-identical Stickers & Rich Styled Text rasterized to transparent PNG overlays
 */

import { invoke } from '@tauri-apps/api/core';
import { AspectRatio, EditorProject, FramerSettings, TimelineClip } from './types';
import { getExportDimensions } from './render-utils';
import {
  buildFFmpegGradeFilters,
  extractColorGradeValues,
  extractMasterColorGrade,
  hasNonDefaultGrade,
} from './engine/grading';
import { renderMaskAlphaCanvas } from './engine/masks';
import {
  canvasToPngBytes,
  renderRichTextToCanvas,
  renderSvgStickerToCanvas,
} from './engine/export-raster';
import { TRANSITION_PRESETS } from './presets/bundles';
import { cacheMediaFile, isTauriRuntime, normalizeJoin, writeBinaryToDisk } from '../workspace/storage';

export interface ProbeResult {
  has_video: boolean;
  has_audio: boolean;
  duration: number;
  width: number;
  height: number;
}

export interface NativeFFmpegExportResult {
  savedPath: string;
  ffmpegCommand: string;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function even(n: number): number {
  const rounded = Math.max(2, Math.round(n));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * Builds valid FFmpeg `atempo` chain for any speed multiplier (FFmpeg restricts each filter to [0.5, 2.0]).
 */
function buildAtempoFilters(speed: number): string[] {
  let rem = clamp(speed, 0.1, 8.0);
  if (Math.abs(rem - 1.0) < 0.01) return [];
  const chain: string[] = [];
  while (rem > 2.0) {
    chain.push('atempo=2.0');
    rem /= 2.0;
  }
  while (rem < 0.5) {
    chain.push('atempo=0.5');
    rem /= 0.5;
  }
  chain.push(`atempo=${rem.toFixed(4)}`);
  return chain;
}

async function resolveAndProbeDiskAssets(
  project: EditorProject,
  cachePath: string,
): Promise<{ pathMap: Map<string, string>; probes: Map<string, ProbeResult> }> {
  const pathMap = new Map<string, string>();
  const probes = new Map<string, ProbeResult>();
  const usedIds = new Set<string>();
  for (const t of project.timeline.tracks) {
    for (const c of t.clips) {
      if (c.assetId) usedIds.add(c.assetId);
    }
  }

  for (const assetId of usedIds) {
    const asset = project.mediaLibrary.find((a) => a.id === assetId);
    if (!asset) continue;

    let diskPath = asset.cachedFilePath;
    let probe: ProbeResult | null = null;

    if (diskPath) {
      try {
        probe = await invoke<ProbeResult>('probe_media_streams', { path: diskPath });
      } catch {
        probe = null;
      }
    }

    if (!probe && asset.url) {
      try {
        const resp = await fetch(asset.url);
        const blob = await resp.blob();
        const savedPath = await cacheMediaFile(cachePath, project.id, asset.id, asset.name, blob);
        if (savedPath) {
          diskPath = savedPath;
          probe = await invoke<ProbeResult>('probe_media_streams', { path: savedPath });
        }
      } catch (err) {
        console.warn('Re-materializing cached asset failed:', asset.name, err);
      }
    }

    if (diskPath) {
      pathMap.set(assetId, diskPath);
      if (probe) probes.set(assetId, probe);
    }
  }

  return { pathMap, probes };
}

function buildClipSpeedRate(clip: TimelineClip): { sourceDur: number; speedRate: number } {
  const sourceDur = Math.max(0.05, (clip.sourceEnd ?? clip.duration) - (clip.sourceStart ?? 0));
  const targetDur = Math.max(0.05, clip.duration);
  const speedRate = clamp(sourceDur / targetDur, 0.1, 8.0);
  return { sourceDur, speedRate };
}

export async function runNativeFFmpegExport({
  project,
  aspectRatio,
  framerSettings,
  resolution,
  fps,
  cachePath,
  saveFolderPath,
  fullSavePath,
  onProgress,
}: {
  project: EditorProject;
  aspectRatio: AspectRatio;
  framerSettings: FramerSettings;
  resolution: '720p' | '1080p' | '4k';
  fps: number;
  cachePath: string;
  saveFolderPath: string;
  fullSavePath: string;
  onProgress: (pct: number, msg: string) => void;
}): Promise<NativeFFmpegExportResult> {
  if (!isTauriRuntime()) {
    throw new Error('Native FFmpeg export requires desktop app runtime.');
  }

  onProgress(10, 'Checking native FFmpeg installation...');
  await invoke<string>('check_ffmpeg_installed');
  await invoke('ensure_directory', { path: saveFolderPath });

  onProgress(20, 'Verifying cached media streams on disk...');
  const { pathMap: diskPaths, probes } = await resolveAndProbeDiskAssets(project, cachePath);

  const isClipping = project.mode === 'clipping';
  const targetRatio: AspectRatio = isClipping ? '9:16' : aspectRatio;
  const { width: exportW, height: exportH } = getExportDimensions(targetRatio, resolution);

  const allClips = project.timeline.tracks.flatMap((t) => t.clips);
  const exportDuration =
    allClips.length > 0
      ? Math.max(...allClips.map((c) => c.timelineStart + c.duration))
      : Math.max(1, project.timeline.duration || 5);

  const inputArgs: string[] = [];
  const filterChains: string[] = [];
  const audioInputLabels: string[] = [];
  const tempFilesToDelete: string[] = [];
  let nextInputIdx = 0;
  let stepCount = 0;

  filterChains.push(
    `color=c=black:s=${exportW}x${exportH}:r=${fps}:d=${exportDuration.toFixed(3)},format=yuv420p[base0]`,
  );
  let currentCanvasLabel = 'base0';

  const primaryClippingVideo = isClipping
    ? allClips.find((c) => c.type === 'video' && c.assetId && diskPaths.has(c.assetId))
    : undefined;

  // STAGE 1A: If Clip Cutter mode, build Top + Bottom speaker vstack into currentCanvasLabel
  if (isClipping && primaryClippingVideo && primaryClippingVideo.assetId) {
    const srcPath = diskPaths.get(primaryClippingVideo.assetId)!;
    const probe = probes.get(primaryClippingVideo.assetId);
    const { sourceDur, speedRate } = buildClipSpeedRate(primaryClippingVideo);
    const inIdx = nextInputIdx++;

    inputArgs.push(
      '-accurate_seek',
      '-ss',
      primaryClippingVideo.sourceStart.toFixed(3),
      '-t',
      sourceDur.toFixed(3),
      '-i',
      srcPath,
    );

    const topH = even(exportH * framerSettings.splitRatio);
    const btmH = even(exportH - topH);
    const actualOutH = topH + btmH;
    const tb = framerSettings.topBox;
    const bb = framerSettings.bottomBox;
    const gradeFilters = buildFFmpegGradeFilters(
      extractColorGradeValues(primaryClippingVideo.effects, primaryClippingVideo.lutId),
    );
    const gradeChain = gradeFilters.length > 0 ? `,${gradeFilters.join(',')}` : '';

    filterChains.push(
      `[${inIdx}:v]setpts=(PTS-STARTPTS)/${speedRate.toFixed(4)},fps=${fps},setsar=1${gradeChain},split=2[vtop_src][vbtm_src]`,
    );
    filterChains.push(
      `[vtop_src]crop=w='max(2,trunc(iw*${(tb.width / 100).toFixed(4)}/2)*2)':h='max(2,trunc(ih*${(tb.height / 100).toFixed(4)}/2)*2)':x='iw*${(tb.x / 100).toFixed(4)}':y='ih*${(tb.y / 100).toFixed(4)}',scale=${exportW}:${topH}:flags=lanczos,setsar=1[vtop]`,
    );
    filterChains.push(
      `[vbtm_src]crop=w='max(2,trunc(iw*${(bb.width / 100).toFixed(4)}/2)*2)':h='max(2,trunc(ih*${(bb.height / 100).toFixed(4)}/2)*2)':x='iw*${(bb.x / 100).toFixed(4)}':y='ih*${(bb.y / 100).toFixed(4)}',scale=${exportW}:${btmH}:flags=lanczos,setsar=1[vbtm]`,
    );

    const divPx = Math.max(0, Math.round(framerSettings.dividerWidth * (actualOutH / 720)));
    const divColor = (framerSettings.dividerColor || '#000000').replace('#', '0x');
    const splitOutLabel = `clipbase_${++stepCount}`;
    const vstackBase =
      divPx > 0
        ? `[vtop][vbtm]vstack=inputs=2,drawbox=x=0:y=${Math.max(0, topH - Math.floor(divPx / 2))}:w=${exportW}:h=${divPx}:color=${divColor}:t=fill`
        : `[vtop][vbtm]vstack=inputs=2`;

    filterChains.push(
      `${vstackBase},scale=${exportW}:${exportH}:flags=lanczos,setpts=PTS+${primaryClippingVideo.timelineStart.toFixed(3)}/TB[${splitOutLabel}]`,
    );

    const nextBase = `base_${++stepCount}`;
    const endSec = (primaryClippingVideo.timelineStart + primaryClippingVideo.duration).toFixed(3);
    filterChains.push(
      `[${currentCanvasLabel}][${splitOutLabel}]overlay=0:0:eof_action=pass:shortest=0:enable='between(t,${primaryClippingVideo.timelineStart.toFixed(3)},${endSec})'[${nextBase}]`,
    );
    currentCanvasLabel = nextBase;

    if (
      probe?.has_audio &&
      !primaryClippingVideo.muted &&
      (primaryClippingVideo.volume ?? 100) > 0
    ) {
      const aLabel = `aud_${audioInputLabels.length}`;
      const vol = clamp((primaryClippingVideo.volume ?? 100) / 100, 0, 2).toFixed(2);
      const delayMs = Math.max(0, Math.round(primaryClippingVideo.timelineStart * 1000));
      const atempo = buildAtempoFilters(speedRate);
      const fades: string[] = [];
      if (primaryClippingVideo.fadeIn > 0) {
        fades.push(`afade=t=in:st=0:d=${primaryClippingVideo.fadeIn.toFixed(2)}`);
      }
      if (primaryClippingVideo.fadeOut > 0 && primaryClippingVideo.duration > primaryClippingVideo.fadeOut) {
        fades.push(
          `afade=t=out:st=${(primaryClippingVideo.duration - primaryClippingVideo.fadeOut).toFixed(2)}:d=${primaryClippingVideo.fadeOut.toFixed(2)}`,
        );
      }
      const chain = [
        `[${inIdx}:a]atrim=duration=${sourceDur.toFixed(3)},asetpts=PTS-STARTPTS`,
        ...atempo,
        `aresample=48000,aformat=channel_layouts=stereo,volume=${vol}`,
        ...fades,
        `adelay=${delayMs}|${delayMs}`,
      ];
      filterChains.push(`${chain.join(',')}[${aLabel}]`);
      audioInputLabels.push(`[${aLabel}]`);
    }
  }

  // STAGE 1B & STAGE 2: Composite visual tracks (Overlays, Images, Stickers, Transitions, Masks, Speed)
  const bottomToTopVideoTracks = [
    ...project.timeline.tracks.filter((t) => t.type === 'video' && t.visible),
  ].reverse();
  const transitions = project.timeline.transitions || [];

  for (const track of bottomToTopVideoTracks) {
    const orderedClips = [...track.clips].sort((a, b) => a.timelineStart - b.timelineStart);
    const preparedLayerLabels = new Map<string, string>();
    const skippedByTransition = new Set<string>();

    for (const clip of orderedClips) {
      if (clip.id === primaryClippingVideo?.id) continue;

      if (clip.type === 'sticker' && clip.stickerSvg) {
        const stickerCanvas = await renderSvgStickerToCanvas(clip.stickerSvg, 360);
        const bytes = await canvasToPngBytes(stickerCanvas);
        const tempSticker = normalizeJoin(saveFolderPath, `__winecut_sticker_${clip.id}_${Date.now()}.png`);
        await writeBinaryToDisk(tempSticker, bytes);
        tempFilesToDelete.push(tempSticker);

        const inIdx = nextInputIdx++;
        inputArgs.push('-loop', '1', '-t', clip.duration.toFixed(3), '-i', tempSticker);

        const clipScale = clamp(clip.transform.scale || 0.45, 0.05, 4.0);
        const scaledW = even(exportW * clipScale * 0.55);
        const opacity = clamp(clip.transform.opacity ?? 1.0, 0, 1);
        const rotDeg = clip.transform.rotation || 0;

        const chain: string[] = [
          `[${inIdx}:v]format=rgba,fps=${fps},setpts=PTS+${clip.timelineStart.toFixed(3)}/TB`,
          `scale=${scaledW}:-2:flags=lanczos,setsar=1`,
        ];
        if (opacity < 1) chain.push(`colorchannelmixer=aa=${opacity.toFixed(2)}`);
        if (rotDeg !== 0) {
          const rad = ((rotDeg * Math.PI) / 180).toFixed(4);
          chain.push(`rotate=${rad}:ow='rotw(${rad})':oh='roth(${rad})':c=none`);
        }
        const label = `vlayer_${stepCount++}`;
        filterChains.push(`${chain.join(',')}[${label}]`);
        preparedLayerLabels.set(clip.id, label);
        continue;
      }

      if (!clip.assetId || !diskPaths.has(clip.assetId)) continue;
      const srcPath = diskPaths.get(clip.assetId)!;
      const probe = probes.get(clip.assetId);
      const { sourceDur, speedRate } = buildClipSpeedRate(clip);
      const inIdx = nextInputIdx++;

      if (clip.type === 'image') {
        inputArgs.push('-loop', '1', '-t', clip.duration.toFixed(3), '-i', srcPath);
      } else {
        inputArgs.push(
          '-accurate_seek',
          '-ss',
          clip.sourceStart.toFixed(3),
          '-t',
          sourceDur.toFixed(3),
          '-i',
          srcPath,
        );
      }

      const clipScale = clamp(clip.transform.scale || 1, 0.1, 4.0);
      const scaledW = even(exportW * clipScale);
      const scaledH = even(exportH * clipScale);

      const fitFilter =
        clip.type === 'image' && clip.fitMode === 'contain'
          ? `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=decrease,pad=${scaledW}:${scaledH}:(ow-iw)/2:(oh-ih)/2:color=black@0`
          : clip.type === 'image' && clip.fitMode === 'fill'
            ? `scale=${scaledW}:${scaledH}:flags=lanczos`
            : `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${scaledW}:${scaledH}`;

      const gradeFilters = buildFFmpegGradeFilters(
        extractColorGradeValues(clip.effects, clip.lutId),
      );
      const opacity = clamp(clip.transform.opacity ?? 1.0, 0, 1);
      const rotDeg = clip.transform.rotation || 0;
      const hasMask = Boolean(clip.mask && clip.mask.type !== 'none');
      const needAlpha =
        opacity < 1 || rotDeg !== 0 || hasMask || (clip.type === 'image' && clip.fitMode === 'contain');

      const chain: string[] = [
        clip.type === 'image'
          ? `[${inIdx}:v]setpts=PTS-STARTPTS,fps=${fps}`
          : `[${inIdx}:v]setpts=(PTS-STARTPTS)/${speedRate.toFixed(4)},fps=${fps}`,
        fitFilter,
        'setsar=1',
        ...gradeFilters,
      ];

      if (needAlpha) {
        chain.push('format=rgba');
        if (opacity < 1) {
          chain.push(`colorchannelmixer=aa=${opacity.toFixed(2)}`);
        }
        if (rotDeg !== 0) {
          const rad = ((rotDeg * Math.PI) / 180).toFixed(4);
          chain.push(`rotate=${rad}:ow='rotw(${rad})':oh='roth(${rad})':c=none`);
        }
      }

      let layerLabel = `vlayer_${stepCount++}`;
      filterChains.push(`${chain.join(',')}[${layerLabel}]`);

      // Apply feathered mask via transparent alpha PNG if configured
      if (hasMask && clip.mask) {
        const maskCanvas = renderMaskAlphaCanvas(clip.mask, scaledW, scaledH);
        const maskBytes = await canvasToPngBytes(maskCanvas);
        const tempMask = normalizeJoin(saveFolderPath, `__winecut_mask_${clip.id}_${Date.now()}.png`);
        await writeBinaryToDisk(tempMask, maskBytes);
        tempFilesToDelete.push(tempMask);

        const maskIdx = nextInputIdx++;
        inputArgs.push('-loop', '1', '-t', clip.duration.toFixed(3), '-i', tempMask);
        const maskGray = `mgray_${stepCount++}`;
        const maskedLayer = `vmasked_${stepCount++}`;
        filterChains.push(`[${maskIdx}:v]fps=${fps},scale=${scaledW}:${scaledH},format=gray[${maskGray}]`);
        filterChains.push(`[${layerLabel}][${maskGray}]alphamerge[${maskedLayer}]`);
        layerLabel = maskedLayer;
      }

      // Shift PTS to clip's timelineStart if not stitched via xfade
      const outgoingTr = transitions.find((t) => t.trackId === track.id && t.fromClipId === clip.id);
      const incomingTr = transitions.find((t) => t.trackId === track.id && t.toClipId === clip.id);
      if (!outgoingTr && !incomingTr) {
        const shiftedLabel = `vshift_${stepCount++}`;
        filterChains.push(
          `[${layerLabel}]setpts=PTS+${clip.timelineStart.toFixed(3)}/TB[${shiftedLabel}]`,
        );
        layerLabel = shiftedLabel;
      }

      preparedLayerLabels.set(clip.id, layerLabel);

      // Attach audio for video clip
      if (
        clip.type === 'video' &&
        probe?.has_audio &&
        !track.muted &&
        !clip.muted &&
        (clip.volume ?? 100) > 0
      ) {
        const aLabel = `aud_${audioInputLabels.length}`;
        const vol = clamp((clip.volume ?? 100) / 100, 0, 2).toFixed(2);
        const delayMs = Math.max(0, Math.round(clip.timelineStart * 1000));
        const atempo = buildAtempoFilters(speedRate);
        const fades: string[] = [];
        if (clip.fadeIn > 0) fades.push(`afade=t=in:st=0:d=${clip.fadeIn.toFixed(2)}`);
        if (clip.fadeOut > 0 && clip.duration > clip.fadeOut) {
          fades.push(
            `afade=t=out:st=${(clip.duration - clip.fadeOut).toFixed(2)}:d=${clip.fadeOut.toFixed(2)}`,
          );
        }
        const aChain = [
          `[${inIdx}:a]atrim=duration=${sourceDur.toFixed(3)},asetpts=PTS-STARTPTS`,
          ...atempo,
          `aresample=48000,aformat=channel_layouts=stereo,volume=${vol}`,
          ...fades,
          `adelay=${delayMs}|${delayMs}`,
        ];
        filterChains.push(`${aChain.join(',')}[${aLabel}]`);
        audioInputLabels.push(`[${aLabel}]`);
      }
    }

    // Stitch contiguous transitions (`xfade`) and overlay onto main composite canvas
    for (let i = 0; i < orderedClips.length; i++) {
      const clip = orderedClips[i]!;
      if (clip.id === primaryClippingVideo?.id || skippedByTransition.has(clip.id)) continue;
      const layerLabel = preparedLayerLabels.get(clip.id);
      if (!layerLabel) continue;

      const tr = transitions.find((t) => t.trackId === track.id && t.fromClipId === clip.id);
      const nextClip = tr ? orderedClips.find((c) => c.id === tr.toClipId) : undefined;
      const nextLabel = nextClip ? preparedLayerLabels.get(nextClip.id) : undefined;

      if (tr && nextClip && nextLabel) {
        skippedByTransition.add(nextClip.id);
        const trDef = TRANSITION_PRESETS.find((p) => p.id === tr.type);
        const xfadeName = trDef?.ffmpegXfade || 'fade';
        const dur = clamp(tr.duration, 0.1, Math.min(clip.duration, nextClip.duration) * 0.6);
        const offset = Math.max(0.05, clip.duration - dur);

        const joinedLabel = `xjoined_${stepCount++}`;
        const aNorm = `xnormA_${stepCount++}`;
        const bNorm = `xnormB_${stepCount++}`;
        filterChains.push(
          `[${layerLabel}]scale=${exportW}:${exportH}:force_original_aspect_ratio=decrease,pad=${exportW}:${exportH}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setpts=PTS-STARTPTS[${aNorm}]`,
        );
        filterChains.push(
          `[${nextLabel}]scale=${exportW}:${exportH}:force_original_aspect_ratio=decrease,pad=${exportW}:${exportH}:(ow-iw)/2:(oh-ih)/2,format=yuv420p,setpts=PTS-STARTPTS[${bNorm}]`,
        );
        filterChains.push(
          `[${aNorm}][${bNorm}]xfade=transition=${xfadeName}:duration=${dur.toFixed(3)}:offset=${offset.toFixed(3)},setpts=PTS+${clip.timelineStart.toFixed(3)}/TB[${joinedLabel}]`,
        );

        const endSec = (nextClip.timelineStart + nextClip.duration).toFixed(3);
        const nextCanvasLabel = `base_${++stepCount}`;
        filterChains.push(
          `[${currentCanvasLabel}][${joinedLabel}]overlay=0:0:eof_action=pass:shortest=0:enable='between(t,${clip.timelineStart.toFixed(3)},${endSec})'[${nextCanvasLabel}]`,
        );
        currentCanvasLabel = nextCanvasLabel;
        continue;
      }

      const offsetX = Math.round((clip.transform.x || 0) * (exportW / 680));
      const offsetY = Math.round((clip.transform.y || 0) * (exportH / 382));
      const endSec = (clip.timelineStart + clip.duration).toFixed(3);
      const nextCanvasLabel = `base_${++stepCount}`;
      filterChains.push(
        `[${currentCanvasLabel}][${layerLabel}]overlay=x=(W-w)/2+${offsetX}:y=(H-h)/2+${offsetY}:eof_action=pass:shortest=0:enable='between(t,${clip.timelineStart.toFixed(3)},${endSec})'[${nextCanvasLabel}]`,
      );
      currentCanvasLabel = nextCanvasLabel;
    }
  }

  // Standalone Audio Tracks
  const audioTracks = project.timeline.tracks.filter((t) => t.type === 'audio' && !t.muted);
  for (const track of audioTracks) {
    for (const clip of track.clips) {
      if (!clip.assetId || !diskPaths.has(clip.assetId)) continue;
      if (clip.muted || (clip.volume ?? 100) <= 0) continue;
      const srcPath = diskPaths.get(clip.assetId)!;
      const probe = probes.get(clip.assetId);
      if (probe && !probe.has_audio) continue;

      const { sourceDur, speedRate } = buildClipSpeedRate(clip);
      const inIdx = nextInputIdx++;
      inputArgs.push(
        '-accurate_seek',
        '-ss',
        clip.sourceStart.toFixed(3),
        '-t',
        sourceDur.toFixed(3),
        '-i',
        srcPath,
      );

      const aLabel = `aud_${audioInputLabels.length}`;
      const vol = clamp((clip.volume ?? 100) / 100, 0, 2).toFixed(2);
      const delayMs = Math.max(0, Math.round(clip.timelineStart * 1000));
      const atempo = buildAtempoFilters(speedRate);
      const fades: string[] = [];
      if (clip.fadeIn > 0) fades.push(`afade=t=in:st=0:d=${clip.fadeIn.toFixed(2)}`);
      if (clip.fadeOut > 0 && clip.duration > clip.fadeOut) {
        fades.push(
          `afade=t=out:st=${(clip.duration - clip.fadeOut).toFixed(2)}:d=${clip.fadeOut.toFixed(2)}`,
        );
      }

      const chain = [
        `[${inIdx}:a]atrim=duration=${sourceDur.toFixed(3)},asetpts=PTS-STARTPTS`,
        ...atempo,
        `aresample=48000,aformat=channel_layouts=stereo,volume=${vol}`,
        ...fades,
        `adelay=${delayMs}|${delayMs}`,
      ];
      filterChains.push(`${chain.join(',')}[${aLabel}]`);
      audioInputLabels.push(`[${aLabel}]`);
    }
  }

  // Master Screen Grade & Blur
  const masterGrade = extractMasterColorGrade(project.settings);
  if (hasNonDefaultGrade(masterGrade)) {
    const mFilters = buildFFmpegGradeFilters(masterGrade);
    if (mFilters.length > 0) {
      const gradedLabel = `graded_${++stepCount}`;
      filterChains.push(`[${currentCanvasLabel}]${mFilters.join(',')}[${gradedLabel}]`);
      currentCanvasLabel = gradedLabel;
    }
  }

  // Rich Styled Text Rasterization -> Transparent PNG Overlay (Pixel-identical fonts, pills, strokes, gradients)
  const textTracks = project.timeline.tracks.filter((t) => t.type === 'text' && t.visible);
  for (const track of textTracks) {
    for (const clip of track.clips) {
      if (!clip.textContent) continue;
      const txtCanvas = renderRichTextToCanvas(clip, exportH);
      const txtBytes = await canvasToPngBytes(txtCanvas);
      const tempTxt = normalizeJoin(saveFolderPath, `__winecut_text_${clip.id}_${Date.now()}.png`);
      await writeBinaryToDisk(tempTxt, txtBytes);
      tempFilesToDelete.push(tempTxt);

      const inIdx = nextInputIdx++;
      inputArgs.push('-loop', '1', '-t', clip.duration.toFixed(3), '-i', tempTxt);

      const clipScale = clamp(clip.transform.scale || 1, 0.2, 4.0);
      const scaledTxtW = even(txtCanvas.width * clipScale);
      const txtLabel = `txtpng_${++stepCount}`;
      filterChains.push(
        `[${inIdx}:v]format=rgba,fps=${fps},scale=${scaledTxtW}:-2:flags=lanczos,setpts=PTS+${clip.timelineStart.toFixed(3)}/TB[${txtLabel}]`,
      );

      const dx = Math.round((clip.transform.x || 0) * (exportW / 680));
      const dy = Math.round((clip.transform.y || 0) * (exportH / 382));
      const startStr = clip.timelineStart.toFixed(3);
      const endStr = (clip.timelineStart + clip.duration).toFixed(3);
      const nextCanvas = `txt_${++stepCount}`;

      filterChains.push(
        `[${currentCanvasLabel}][${txtLabel}]overlay=x=(W-w)/2+${dx}:y=H*0.84-h/2+${dy}:eof_action=pass:shortest=0:enable='between(t,${startStr},${endStr})'[${nextCanvas}]`,
      );
      currentCanvasLabel = nextCanvas;
    }
  }

  filterChains.push(`[${currentCanvasLabel}]format=yuv420p[outv]`);

  // Final Audio Mix Graph
  filterChains.push(`anullsrc=r=48000:cl=stereo:d=${exportDuration.toFixed(3)}[asilent]`);
  if (audioInputLabels.length > 0) {
    const allAudioInputs = ['[asilent]', ...audioInputLabels].join('');
    filterChains.push(
      `${allAudioInputs}amix=inputs=${audioInputLabels.length + 1}:duration=first:normalize=0,alimiter=limit=0.98[outa]`,
    );
  } else {
    filterChains.push('[asilent]acopy[outa]');
  }

  const filterGraphText = filterChains.join(';\n');
  const tempFilterFile = normalizeJoin(saveFolderPath, `__winecut_filter_${Date.now()}.txt`);
  await writeBinaryToDisk(tempFilterFile, new TextEncoder().encode(filterGraphText));
  tempFilesToDelete.push(tempFilterFile);

  const finalArgs: string[] = [
    '-y',
    ...inputArgs,
    '-/filter_complex',
    tempFilterFile,
    '-map',
    '[outv]',
    '-map',
    '[outa]',
    '-t',
    exportDuration.toFixed(3),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'medium',
    '-crf',
    '19',
    '-r',
    String(fps),
    '-fps_mode',
    'cfr',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    fullSavePath,
  ];

  onProgress(55, 'Encoding constant-frame-rate H.264 MP4 via native FFmpeg...');

  try {
    await invoke('run_ffmpeg_export', { args: finalArgs });
  } finally {
    await Promise.all(
      tempFilesToDelete.map((path) => invoke('delete_temp_file', { path }).catch(() => {})),
    );
  }

  const displayArgs = finalArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
  onProgress(100, `Saved crisp CFR MP4 directly to ${fullSavePath}!`);

  return {
    savedPath: fullSavePath,
    ffmpegCommand: `ffmpeg ${displayArgs}`,
  };
}
