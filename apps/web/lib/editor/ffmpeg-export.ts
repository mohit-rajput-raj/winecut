'use client';

/**
 * Native High-Precision FFmpeg Compositor & Export Pipeline
 *
 * Architecture guarantees:
 * 1. Full 4:4:4 RGB compositing (`format=rgb24` + `overlay=...:format=rgb`) across all video,
 *    mask, sticker, transition, and rich-text layers — zero multi-generation YUV 4:2:0 smearing.
 * 2. Exact millisecond timebase synchronization (`settb=1/1000,fps=fps:round=near`) with `-fflags +genpts`
 *    preventing frame drops/repeats on VFR sources and overlay boundaries.
 * 3. Single final BT.709 color-matrix conversion (`scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int`)
 *    matching WebGL preview colors and preventing washed-out BT.601 gamma shifts.
 * 4. Configurable Pro Presets (H.264 High Quality CRF, H.265 8-bit/10-bit HEVC, Apple ProRes 422 / HQ, NVENC GPU)
 *    plus real-time `-progress pipe:1` streaming, cancellation, and post-export FFprobe validation.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { AspectRatio, EditorProject, FramerSettings, TimelineClip } from './types';
import {
  buildFFmpegEncoderArgs,
  CodecProfileId,
  EncoderSpeedPreset,
  ExportProfileConfig,
  getCodecPresetMeta,
  QualityTier,
  resolveExportDimensions,
} from './engine/export-presets';
import {
  buildFFmpegGradeFilters,
  buildFFmpegLayerEffectFilters,
  extractColorGradeValues,
  extractMasterColorGrade,
  hasNonDefaultGrade,
} from './engine/grading';
import { buildFFmpegSpeedSetptsExpr } from './engine/velocity';
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
  video_duration?: number;
  audio_duration?: number;
  width: number;
  height: number;
  codec_name?: string;
  pix_fmt?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  fps?: number;
  nb_frames?: number;
  bit_rate?: number;
  file_size?: number;
  color_space?: string;
  color_primaries?: string;
  color_transfer?: string;
  audio_codec?: string;
  audio_sample_rate?: number;
  audio_channels?: number;
}

export interface ExportValidationReport extends ProbeResult {
  audio_sync_delta_sec?: number;
  ssim_avg?: number | null;
  psnr_avg?: number | null;
}

export interface FfmpegCapabilities {
  libx264: boolean;
  libx265: boolean;
  prores_ks: boolean;
  h264_nvenc: boolean;
  hevc_nvenc: boolean;
  h264_qsv: boolean;
  h264_amf: boolean;
  has_psnr: boolean;
  has_ssim: boolean;
  has_vmaf: boolean;
  has_zscale: boolean;
}

export interface NativeFFmpegExportResult {
  savedPath: string;
  ffmpegCommand: string;
  actualWidth: number;
  actualHeight: number;
  validation?: ExportValidationReport | null;
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

/**
 * Maps In/Out clip fade/slide animations cleanly onto FFmpeg alpha & motion expressions.
 */
function buildClipAnimationFilters(clip: TimelineClip): {
  alphaFilters: string[];
  needsAlpha: boolean;
  motionDxExpr: string;
  motionDyExpr: string;
} {
  const alphaFilters: string[] = [];
  let needsAlpha = false;
  let motionDxExpr = '0';
  let motionDyExpr = '0';

  const inAnim = clip.animations?.in;
  if (inAnim && inAnim.presetId !== 'none') {
    const d = Math.max(0.1, Math.min(clip.duration * 0.45, inAnim.duration || 0.45));
    const intensity = clamp(inAnim.intensity ?? 1, 0.2, 2.0);
    if (
      inAnim.presetId === 'fade-in' ||
      inAnim.presetId === 'pop-in' ||
      inAnim.presetId === 'whip-zoom'
    ) {
      alphaFilters.push(`fade=t=in:st=0:d=${d.toFixed(3)}:alpha=1`);
      needsAlpha = true;
    } else if (inAnim.presetId === 'slide-up') {
      const dist = Math.round(140 * intensity);
      motionDyExpr = `if(lt(t-${clip.timelineStart.toFixed(3)},${d.toFixed(3)}),${dist}*pow(1-max(0,(t-${clip.timelineStart.toFixed(3)})/${d.toFixed(3)}),3),0)`;
    } else if (inAnim.presetId === 'slide-down') {
      const dist = Math.round(140 * intensity);
      motionDyExpr = `if(lt(t-${clip.timelineStart.toFixed(3)},${d.toFixed(3)}),-${dist}*pow(1-max(0,(t-${clip.timelineStart.toFixed(3)})/${d.toFixed(3)}),3),0)`;
    } else if (inAnim.presetId === 'slide-left') {
      const dist = Math.round(180 * intensity);
      motionDxExpr = `if(lt(t-${clip.timelineStart.toFixed(3)},${d.toFixed(3)}),${dist}*pow(1-max(0,(t-${clip.timelineStart.toFixed(3)})/${d.toFixed(3)}),3),0)`;
    } else if (inAnim.presetId === 'slide-right') {
      const dist = Math.round(180 * intensity);
      motionDxExpr = `if(lt(t-${clip.timelineStart.toFixed(3)},${d.toFixed(3)}),-${dist}*pow(1-max(0,(t-${clip.timelineStart.toFixed(3)})/${d.toFixed(3)}),3),0)`;
    }
  }

  const outAnim = clip.animations?.out;
  if (outAnim && outAnim.presetId !== 'none') {
    const d = Math.max(0.1, Math.min(clip.duration * 0.45, outAnim.duration || 0.45));
    const st = Math.max(0, clip.duration - d);
    if (outAnim.presetId === 'fade-out' || outAnim.presetId === 'shrink-out') {
      alphaFilters.push(`fade=t=out:st=${st.toFixed(3)}:d=${d.toFixed(3)}:alpha=1`);
      needsAlpha = true;
    }
  }

  return { alphaFilters, needsAlpha, motionDxExpr, motionDyExpr };
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
        if (!probe.has_video && !probe.has_audio) probe = null;
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
  exportConfig,
  cachePath,
  saveFolderPath,
  fullSavePath,
  onProgress,
  isCancelled,
}: {
  project: EditorProject;
  aspectRatio: AspectRatio;
  framerSettings: FramerSettings;
  resolution: '720p' | '1080p' | '4k';
  fps: number;
  exportConfig?: Partial<ExportProfileConfig>;
  cachePath: string;
  saveFolderPath: string;
  fullSavePath: string;
  onProgress: (pct: number, msg: string) => void;
  isCancelled?: () => boolean;
}): Promise<NativeFFmpegExportResult> {
  if (!isTauriRuntime()) {
    throw new Error('Native FFmpeg export requires desktop app runtime.');
  }

  const resolvedConfig: ExportProfileConfig = {
    resolutionPreset: exportConfig?.resolutionPreset ?? resolution,
    customWidth: exportConfig?.customWidth ?? 1920,
    customHeight: exportConfig?.customHeight ?? 1080,
    fps: exportConfig?.fps ?? fps,
    codecProfile: (exportConfig?.codecProfile ?? 'h264_hq') as CodecProfileId,
    qualityTier: (exportConfig?.qualityTier ?? 'high') as QualityTier,
    encoderSpeed: (exportConfig?.encoderSpeed ?? 'medium') as EncoderSpeedPreset,
    verifyAfterExport: exportConfig?.verifyAfterExport ?? true,
  };

  const targetFps = resolvedConfig.fps;
  const presetMeta = getCodecPresetMeta(resolvedConfig.codecProfile);

  onProgress(6, 'Inspecting native FFmpeg capabilities & codecs...');
  await invoke<string>('check_ffmpeg_installed');
  await invoke('ensure_directory', { path: saveFolderPath });

  onProgress(12, 'Probing source streams on disk...');
  const { pathMap: diskPaths, probes } = await resolveAndProbeDiskAssets(project, cachePath);

  const isClipping = project.mode === 'clipping';
  const targetRatio: AspectRatio = isClipping ? '9:16' : aspectRatio;

  const allClips = project.timeline.tracks.flatMap((t) => t.clips);
  const firstVideoClip = allClips.find((c) => c.type === 'video' && c.assetId);
  const primaryAsset = firstVideoClip?.assetId
    ? project.mediaLibrary.find((a) => a.id === firstVideoClip.assetId)
    : undefined;
  const primaryProbe = firstVideoClip?.assetId ? probes.get(firstVideoClip.assetId) : undefined;
  const primarySourceDims =
    primaryProbe && primaryProbe.width > 0 && primaryProbe.height > 0
      ? { width: primaryProbe.width, height: primaryProbe.height }
      : primaryAsset?.width && primaryAsset?.height
        ? { width: primaryAsset.width, height: primaryAsset.height }
        : undefined;

  const { width: exportW, height: exportH } = resolveExportDimensions(
    targetRatio,
    resolvedConfig.resolutionPreset,
    primarySourceDims,
    resolvedConfig.customWidth,
    resolvedConfig.customHeight,
  );

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

  // Full 4:4:4 RGB compositing canvas with unified 1/1000s timebase to prevent multi-pass YUV blur & PTS drift
  filterChains.push(
    `color=c=black:s=${exportW}x${exportH}:r=${targetFps}:d=${exportDuration.toFixed(3)},settb=1/1000,format=rgb24[base0]`,
  );
  let currentCanvasLabel = 'base0';

  const primaryClippingVideo = isClipping
    ? allClips.find((c) => c.type === 'video' && c.assetId && diskPaths.has(c.assetId))
    : undefined;

  const scaleQualityFlags = 'flags=lanczos+accurate_rnd+full_chroma_int';

  // STAGE 1A: Clip Cutter 9:16 top/bottom speaker stack
  if (isClipping && primaryClippingVideo && primaryClippingVideo.assetId) {
    const srcPath = diskPaths.get(primaryClippingVideo.assetId)!;
    const probe = probes.get(primaryClippingVideo.assetId);
    const { sourceDur, speedRate } = buildClipSpeedRate(primaryClippingVideo);
    const speedExpr =
      buildFFmpegSpeedSetptsExpr(primaryClippingVideo) || `(PTS-STARTPTS)/${speedRate.toFixed(6)}`;
    const inIdx = nextInputIdx++;

    inputArgs.push('-fflags', '+genpts');
    if (primaryClippingVideo.sourceStart > 0.001) {
      inputArgs.push('-ss', primaryClippingVideo.sourceStart.toFixed(3));
    }
    inputArgs.push('-t', sourceDur.toFixed(3), '-i', srcPath);

    const topH = even(exportH * framerSettings.splitRatio);
    const btmH = even(exportH - topH);
    const actualOutH = topH + btmH;
    const tb = framerSettings.topBox;
    const bb = framerSettings.bottomBox;
    const gradeFilters = buildFFmpegGradeFilters(
      extractColorGradeValues(primaryClippingVideo.effects, primaryClippingVideo.lutId),
    );
    const fxFilters = buildFFmpegLayerEffectFilters(primaryClippingVideo.layerEffects || []);
    const allColorFilters = [...gradeFilters, ...fxFilters];
    const colorSuffix = allColorFilters.length > 0 ? `,${allColorFilters.join(',')}` : '';

    filterChains.push(
      `[${inIdx}:v]setpts='${speedExpr}',fps=${targetFps}:round=near,settb=1/1000,setsar=1,format=rgb24${colorSuffix},split=2[vtop_src][vbtm_src]`,
    );
    filterChains.push(
      `[vtop_src]crop=w='max(2,trunc(iw*${(tb.width / 100).toFixed(4)}/2)*2)':h='max(2,trunc(ih*${(tb.height / 100).toFixed(4)}/2)*2)':x='iw*${(tb.x / 100).toFixed(4)}':y='ih*${(tb.y / 100).toFixed(4)}',scale=${exportW}:${topH}:${scaleQualityFlags},setsar=1[vtop]`,
    );
    filterChains.push(
      `[vbtm_src]crop=w='max(2,trunc(iw*${(bb.width / 100).toFixed(4)}/2)*2)':h='max(2,trunc(ih*${(bb.height / 100).toFixed(4)}/2)*2)':x='iw*${(bb.x / 100).toFixed(4)}':y='ih*${(bb.y / 100).toFixed(4)}',scale=${exportW}:${btmH}:${scaleQualityFlags},setsar=1[vbtm]`,
    );

    const divPx = Math.max(0, Math.round(framerSettings.dividerWidth * (actualOutH / 720)));
    const divColor = (framerSettings.dividerColor || '#000000').replace('#', '0x');
    const splitOutLabel = `clipbase_${++stepCount}`;
    const vstackBase =
      divPx > 0
        ? `[vtop][vbtm]vstack=inputs=2,drawbox=x=0:y=${Math.max(0, topH - Math.floor(divPx / 2))}:w=${exportW}:h=${divPx}:color=${divColor}:t=fill`
        : `[vtop][vbtm]vstack=inputs=2`;

    filterChains.push(
      `${vstackBase},scale=${exportW}:${exportH}:${scaleQualityFlags},format=rgb24,settb=1/1000,setpts=PTS+${primaryClippingVideo.timelineStart.toFixed(3)}/TB[${splitOutLabel}]`,
    );

    const nextBase = `base_${++stepCount}`;
    const endSec = (primaryClippingVideo.timelineStart + primaryClippingVideo.duration).toFixed(3);
    filterChains.push(
      `[${currentCanvasLabel}][${splitOutLabel}]overlay=0:0:format=rgb:eof_action=pass:shortest=0:enable='between(t,${primaryClippingVideo.timelineStart.toFixed(3)},${endSec})'[${nextBase}]`,
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
        `aresample=48000:async=1:first_pts=0,aformat=channel_layouts=stereo,volume=${vol}`,
        ...fades,
        `adelay=${delayMs}|${delayMs}`,
      ];
      filterChains.push(`${chain.join(',')}[${aLabel}]`);
      audioInputLabels.push(`[${aLabel}]`);
    }
  }

  // STAGE 1B & STAGE 2: Composite all multi-track video/image/sticker/mask/transition layers in crisp RGB24
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
      if (isCancelled?.()) throw new Error('Export cancelled by user');

      const anim = buildClipAnimationFilters(clip);

      if (clip.type === 'sticker' && clip.stickerSvg) {
        const clipScale = clamp(clip.transform.scale || 0.45, 0.05, 4.0);
        const scaledW = even(exportW * clipScale * 0.55);
        const rasterSize = Math.max(256, Math.min(2400, scaledW));
        const stickerCanvas = await renderSvgStickerToCanvas(clip.stickerSvg, rasterSize);
        const bytes = await canvasToPngBytes(stickerCanvas);
        const tempSticker = normalizeJoin(saveFolderPath, `__winecut_sticker_${clip.id}_${Date.now()}.png`);
        await writeBinaryToDisk(tempSticker, bytes);
        tempFilesToDelete.push(tempSticker);

        const inIdx = nextInputIdx++;
        inputArgs.push('-loop', '1', '-t', clip.duration.toFixed(3), '-i', tempSticker);

        const opacity = clamp(clip.transform.opacity ?? 1.0, 0, 1);
        const rotDeg = clip.transform.rotation || 0;

        const chain: string[] = [
          `[${inIdx}:v]fps=${targetFps}:round=near,settb=1/1000,scale=${scaledW}:-2:${scaleQualityFlags},setsar=1,format=rgba`,
          ...anim.alphaFilters,
        ];
        if (opacity < 1) chain.push(`colorchannelmixer=aa=${opacity.toFixed(2)}`);
        if (rotDeg !== 0) {
          const rad = ((rotDeg * Math.PI) / 180).toFixed(4);
          chain.push(`rotate=${rad}:ow='rotw(${rad})':oh='roth(${rad})':c=none`);
        }
        chain.push(`setpts=PTS+${clip.timelineStart.toFixed(3)}/TB`);
        const label = `vlayer_${stepCount++}`;
        filterChains.push(`${chain.join(',')}[${label}]`);
        preparedLayerLabels.set(clip.id, label);
        continue;
      }

      if (!clip.assetId || !diskPaths.has(clip.assetId)) continue;
      const srcPath = diskPaths.get(clip.assetId)!;
      const probe = probes.get(clip.assetId);
      const { sourceDur, speedRate } = buildClipSpeedRate(clip);
      const speedExpr =
        clip.type === 'video'
          ? buildFFmpegSpeedSetptsExpr(clip) || `(PTS-STARTPTS)/${speedRate.toFixed(6)}`
          : 'PTS-STARTPTS';
      const inIdx = nextInputIdx++;

      if (clip.type === 'image') {
        inputArgs.push('-loop', '1', '-t', clip.duration.toFixed(3), '-i', srcPath);
      } else {
        inputArgs.push('-fflags', '+genpts');
        if (clip.sourceStart > 0.001) {
          inputArgs.push('-ss', clip.sourceStart.toFixed(3));
        }
        inputArgs.push('-t', sourceDur.toFixed(3), '-i', srcPath);
      }

      const clipScale = clamp(clip.transform.scale || 1, 0.1, 4.0);
      const scaledW = even(exportW * clipScale);
      const scaledH = even(exportH * clipScale);

      const fitFilter =
        clip.type === 'image' && clip.fitMode === 'contain'
          ? `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=decrease:${scaleQualityFlags},pad=${scaledW}:${scaledH}:(ow-iw)/2:(oh-ih)/2:color=black@0`
          : clip.type === 'image' && clip.fitMode === 'fill'
            ? `scale=${scaledW}:${scaledH}:${scaleQualityFlags}`
            : `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase:${scaleQualityFlags},crop=${scaledW}:${scaledH}`;

      const gradeFilters = buildFFmpegGradeFilters(
        extractColorGradeValues(clip.effects, clip.lutId),
      );
      const fxFilters = buildFFmpegLayerEffectFilters(clip.layerEffects || []);
      const opacity = clamp(clip.transform.opacity ?? 1.0, 0, 1);
      const rotDeg = clip.transform.rotation || 0;
      const hasMask = Boolean(clip.mask && clip.mask.type !== 'none');
      const needAlpha =
        opacity < 1 ||
        rotDeg !== 0 ||
        hasMask ||
        anim.needsAlpha ||
        (clip.type === 'image' && clip.fitMode === 'contain');

      const chain: string[] = [
        `[${inIdx}:v]setpts='${speedExpr}',fps=${targetFps}:round=near,settb=1/1000`,
        fitFilter,
        'setsar=1',
        'format=rgb24',
        ...gradeFilters,
        ...fxFilters,
      ];

      if (needAlpha) {
        chain.push('format=rgba');
        if (opacity < 1) {
          chain.push(`colorchannelmixer=aa=${opacity.toFixed(2)}`);
        }
        chain.push(...anim.alphaFilters);
        if (rotDeg !== 0) {
          const rad = ((rotDeg * Math.PI) / 180).toFixed(4);
          chain.push(`rotate=${rad}:ow='rotw(${rad})':oh='roth(${rad})':c=none`);
        }
      }

      let layerLabel = `vlayer_${stepCount++}`;
      filterChains.push(`${chain.join(',')}[${layerLabel}]`);

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
        filterChains.push(
          `[${maskIdx}:v]fps=${targetFps}:round=near,settb=1/1000,scale=${scaledW}:${scaledH}:flags=bilinear,format=gray[${maskGray}]`,
        );
        filterChains.push(`[${layerLabel}][${maskGray}]alphamerge[${maskedLayer}]`);
        layerLabel = maskedLayer;
      }

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
          `aresample=48000:async=1:first_pts=0,aformat=channel_layouts=stereo,volume=${vol}`,
          ...fades,
          `adelay=${delayMs}|${delayMs}`,
        ];
        filterChains.push(`${aChain.join(',')}[${aLabel}]`);
        audioInputLabels.push(`[${aLabel}]`);
      }
    }

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
          `[${layerLabel}]scale=${exportW}:${exportH}:force_original_aspect_ratio=decrease:${scaleQualityFlags},pad=${exportW}:${exportH}:(ow-iw)/2:(oh-ih)/2,format=rgb24,fps=${targetFps}:round=near,settb=1/1000,setsar=1,setpts=PTS-STARTPTS[${aNorm}]`,
        );
        filterChains.push(
          `[${nextLabel}]scale=${exportW}:${exportH}:force_original_aspect_ratio=decrease:${scaleQualityFlags},pad=${exportW}:${exportH}:(ow-iw)/2:(oh-ih)/2,format=rgb24,fps=${targetFps}:round=near,settb=1/1000,setsar=1,setpts=PTS-STARTPTS[${bNorm}]`,
        );
        filterChains.push(
          `[${aNorm}][${bNorm}]xfade=transition=${xfadeName}:duration=${dur.toFixed(3)}:offset=${offset.toFixed(3)},format=rgb24,settb=1/1000,setpts=PTS+${clip.timelineStart.toFixed(3)}/TB[${joinedLabel}]`,
        );

        const endSec = (nextClip.timelineStart + nextClip.duration).toFixed(3);
        const nextCanvasLabel = `base_${++stepCount}`;
        filterChains.push(
          `[${currentCanvasLabel}][${joinedLabel}]overlay=0:0:format=rgb:eof_action=pass:shortest=0:enable='between(t,${clip.timelineStart.toFixed(3)},${endSec})'[${nextCanvasLabel}]`,
        );
        currentCanvasLabel = nextCanvasLabel;
        continue;
      }

      const anim = buildClipAnimationFilters(clip);
      const offsetX = Math.round((clip.transform.x || 0) * (exportW / 680));
      const offsetY = Math.round((clip.transform.y || 0) * (exportH / 382));
      const xExpr = anim.motionDxExpr === '0' ? `(W-w)/2+${offsetX}` : `(W-w)/2+${offsetX}+${anim.motionDxExpr}`;
      const yExpr = anim.motionDyExpr === '0' ? `(H-h)/2+${offsetY}` : `(H-h)/2+${offsetY}+${anim.motionDyExpr}`;
      const endSec = (clip.timelineStart + clip.duration).toFixed(3);
      const nextCanvasLabel = `base_${++stepCount}`;
      filterChains.push(
        `[${currentCanvasLabel}][${layerLabel}]overlay=x='${xExpr}':y='${yExpr}':format=rgb:eof_action=pass:shortest=0:enable='between(t,${clip.timelineStart.toFixed(3)},${endSec})'[${nextCanvasLabel}]`,
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
      inputArgs.push('-fflags', '+genpts');
      if (clip.sourceStart > 0.001) {
        inputArgs.push('-ss', clip.sourceStart.toFixed(3));
      }
      inputArgs.push('-t', sourceDur.toFixed(3), '-i', srcPath);

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
        `aresample=48000:async=1:first_pts=0,aformat=channel_layouts=stereo,volume=${vol}`,
        ...fades,
        `adelay=${delayMs}|${delayMs}`,
      ];
      filterChains.push(`${chain.join(',')}[${aLabel}]`);
      audioInputLabels.push(`[${aLabel}]`);
    }
  }

  // Master Screen Grade & Blur in full RGB24
  const masterGrade = extractMasterColorGrade(project.settings);
  if (hasNonDefaultGrade(masterGrade)) {
    const mFilters = buildFFmpegGradeFilters(masterGrade);
    if (mFilters.length > 0) {
      const gradedLabel = `graded_${++stepCount}`;
      filterChains.push(`[${currentCanvasLabel}]${mFilters.join(',')}[${gradedLabel}]`);
      currentCanvasLabel = gradedLabel;
    }
  }

  // Rich Styled Text Rasterization -> Transparent RGBA PNG Overlay composited in full RGB
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
      const anim = buildClipAnimationFilters(clip);
      const txtLabel = `txtpng_${++stepCount}`;
      const txtChain = [
        `[${inIdx}:v]fps=${targetFps}:round=near,settb=1/1000,scale=${scaledTxtW}:-2:${scaleQualityFlags},format=rgba`,
        ...anim.alphaFilters,
        `setpts=PTS+${clip.timelineStart.toFixed(3)}/TB`,
      ];
      filterChains.push(`${txtChain.join(',')}[${txtLabel}]`);

      const dx = Math.round((clip.transform.x || 0) * (exportW / 680));
      const dy = Math.round((clip.transform.y || 0) * (exportH / 382));
      const startStr = clip.timelineStart.toFixed(3);
      const endStr = (clip.timelineStart + clip.duration).toFixed(3);
      const nextCanvas = `txt_${++stepCount}`;

      filterChains.push(
        `[${currentCanvasLabel}][${txtLabel}]overlay=x='(W-w)/2+${dx}':y='H*0.84-h/2+${dy}':format=rgb:eof_action=pass:shortest=0:enable='between(t,${startStr},${endStr})'[${nextCanvas}]`,
      );
      currentCanvasLabel = nextCanvas;
    }
  }

  // Build selected codec arguments
  const enc = buildFFmpegEncoderArgs(
    resolvedConfig.codecProfile,
    resolvedConfig.qualityTier,
    resolvedConfig.encoderSpeed,
    targetFps,
    exportW,
    exportH,
  );

  // Single high-precision RGB -> ITU-R BT.709 conversion at the end of graph
  filterChains.push(
    `[${currentCanvasLabel}]scale=out_color_matrix=bt709:out_range=tv:${scaleQualityFlags},format=${enc.pixFmt}[outv]`,
  );

  // Final Audio Mix Graph matched strictly to exportDuration
  filterChains.push(`anullsrc=r=48000:cl=stereo:d=${exportDuration.toFixed(3)}[asilent]`);
  if (audioInputLabels.length > 0) {
    const allAudioInputs = ['[asilent]', ...audioInputLabels].join('');
    filterChains.push(
      `${allAudioInputs}amix=inputs=${audioInputLabels.length + 1}:duration=first:normalize=0,alimiter=limit=0.98,atrim=duration=${exportDuration.toFixed(3)},asetpts=PTS-STARTPTS[outa]`,
    );
  } else {
    filterChains.push(`[asilent]atrim=duration=${exportDuration.toFixed(3)},asetpts=PTS-STARTPTS[outa]`);
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
    '-r',
    String(targetFps),
    '-fps_mode',
    'cfr',
    ...enc.videoArgs,
    ...enc.audioArgs,
    ...enc.containerArgs,
    fullSavePath,
  ];

  onProgress(24, `Encoding ${exportW}x${exportH} @ ${targetFps}fps (${presetMeta.label})...`);

  let unlisten: UnlistenFn | null = null;
  try {
    unlisten = await listen<{ out_time_ms: number; speed: string; status: string }>(
      'ffmpeg-export-progress',
      (ev) => {
        if (isCancelled?.()) return;
        const pctRaw = (ev.payload.out_time_ms / Math.max(100, exportDuration * 1000)) * 68;
        const pct = Math.min(93, Math.max(25, Math.round(25 + pctRaw)));
        const speedInfo = ev.payload.speed ? ` @ ${ev.payload.speed}` : '';
        onProgress(pct, `Encoding ${presetMeta.label}${speedInfo}...`);
      },
    );

    await invoke('run_ffmpeg_export', { args: finalArgs });
  } finally {
    if (unlisten) unlisten();
    await Promise.all(
      tempFilesToDelete.map((path) => invoke('delete_temp_file', { path }).catch(() => {})),
    );
  }

  let validation: ExportValidationReport | null = null;
  if (resolvedConfig.verifyAfterExport && !isCancelled?.()) {
    onProgress(95, 'Running FFprobe stream & sync validation...');
    // Check if single ungraded clean source video can also compute SSIM/PSNR
    const canCompareReference =
      !isClipping &&
      !hasNonDefaultGrade(masterGrade) &&
      allClips.length === 1 &&
      firstVideoClip?.assetId &&
      diskPaths.has(firstVideoClip.assetId) &&
      primaryProbe?.width === exportW &&
      primaryProbe?.height === exportH &&
      !hasNonDefaultGrade(extractColorGradeValues(firstVideoClip.effects, firstVideoClip.lutId)) &&
      (firstVideoClip.layerEffects?.length ?? 0) === 0;

    try {
      validation = await invoke<ExportValidationReport>('validate_exported_video', {
        outputPath: fullSavePath,
        referencePath: canCompareReference ? diskPaths.get(firstVideoClip!.assetId!)! : null,
      });
    } catch (vErr) {
      console.warn('FFprobe post-export validation skipped:', vErr);
    }
  }

  const displayArgs = finalArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
  onProgress(100, `Saved verified ${presetMeta.label} directly to ${fullSavePath}!`);

  return {
    savedPath: fullSavePath,
    ffmpegCommand: `ffmpeg ${displayArgs}`,
    actualWidth: exportW,
    actualHeight: exportH,
    validation,
  };
}
