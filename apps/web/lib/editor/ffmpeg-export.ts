'use client';

/**
 * Native Frame-Exact FFmpeg Export Graph Builder
 * Follows FFmpeg docs (https://ffmpeg.org/ffmpeg.html) & ffmpeg-skill best practices:
 * - Probes actual stream presence via ffprobe (avoids empty audio stream errors)
 * - Normalizes VFR sources using `fps` filter + `-fps_mode cfr`
 * - Uses BT.709 color compliance + yuv420p for universal playback
 * - Applies trim, eq color grading, gblur, crop/vstack (Clipping), overlay eof_action=pass,
 *   drawtext with explicit Windows fontfile, and synchronized amix + alimiter audio.
 */

import { invoke } from '@tauri-apps/api/core';
import { AspectRatio, EditorProject, Effect, FramerSettings } from './types';
import { getExportDimensions } from './render-utils';
import { cacheMediaFile, isTauriRuntime, normalizeJoin } from '../workspace/storage';

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

function escapeDrawtextText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function cssColorToFFmpeg(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  const trimmed = color.trim();
  if (trimmed.startsWith('#')) return trimmed;
  const rgbaMatch = trimmed.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (rgbaMatch) {
    const r = clamp(Math.round(Number(rgbaMatch[1])), 0, 255).toString(16).padStart(2, '0');
    const g = clamp(Math.round(Number(rgbaMatch[2])), 0, 255).toString(16).padStart(2, '0');
    const b = clamp(Math.round(Number(rgbaMatch[3])), 0, 255).toString(16).padStart(2, '0');
    const a = rgbaMatch[4] !== undefined ? clamp(Number(rgbaMatch[4]), 0, 1) : 1;
    return a < 1 ? `0x${r}${g}${b}@${a.toFixed(2)}` : `#${r}${g}${b}`;
  }
  return trimmed;
}

function getClipEffect(effects: Effect[] = [], name: string, fallback: number): number {
  const found = effects.find((e) => (e.type === name || e.id === name) && e.enabled);
  return found ? found.value : fallback;
}

function buildClipFFmpegFilters(effects: Effect[] = []): string[] {
  const filters: string[] = [];
  const brightness = getClipEffect(effects, 'brightness', 100);
  const contrast = getClipEffect(effects, 'contrast', 100);
  const saturation = getClipEffect(effects, 'saturation', 100);
  const blur = getClipEffect(effects, 'blur', 0);
  const hue = getClipEffect(effects, 'hue', 0);
  const grayscale = getClipEffect(effects, 'grayscale', 0);
  const sepia = getClipEffect(effects, 'sepia', 0);
  const invert = getClipEffect(effects, 'invert', 0);
  const temperature = getClipEffect(effects, 'temperature', 0);

  if (brightness !== 100 || contrast !== 100 || saturation !== 100) {
    const eqB = clamp((brightness - 100) / 100, -1, 1).toFixed(2);
    const eqC = clamp(contrast / 100, 0, 3).toFixed(2);
    const eqS = clamp(saturation / 100, 0, 3).toFixed(2);
    filters.push(`eq=brightness=${eqB}:contrast=${eqC}:saturation=${eqS}`);
  }

  if (hue !== 0) {
    filters.push(`hue=h=${hue}`);
  }

  if (grayscale >= 50) {
    filters.push('hue=s=0');
  }

  if (sepia >= 30) {
    filters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
  }

  if (temperature !== 0) {
    const shift = clamp(temperature / 150, -0.5, 0.5).toFixed(2);
    const negShift = (-Number(shift)).toFixed(2);
    filters.push(`colorbalance=rs=${shift}:bs=${negShift}`);
  }

  if (invert >= 50) {
    filters.push('negate');
  }

  if (blur > 0) {
    filters.push(`gblur=sigma=${clamp(blur, 0.1, 40).toFixed(1)}`);
  }

  return filters;
}

/**
 * Ensures every media asset referenced by active clips exists as an actual readable file on disk.
 * Automatically re-materializes from in-memory blob URL if the cached file is missing or unreadable.
 */
async function resolveAndProbeDiskAssets(
  project: EditorProject,
  cachePath: string
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
        const p = await invoke<ProbeResult>('probe_media_streams', { path: diskPath });
        if (p.has_video || p.has_audio) {
          probe = p;
        }
      } catch {
        probe = null;
      }
    }

    if (!probe && asset.url) {
      const res = await fetch(asset.url);
      const blob = await res.blob();
      const savedPath = await cacheMediaFile(cachePath, project.id, asset.id, asset.name, blob);
      if (savedPath) {
        diskPath = savedPath;
        try {
          probe = await invoke<ProbeResult>('probe_media_streams', { path: savedPath });
        } catch {
          probe = null;
        }
      }
    }

    if (diskPath) {
      pathMap.set(assetId, diskPath);
      probes.set(
        assetId,
        probe || {
          has_video: asset.type !== 'audio',
          has_audio: asset.type !== 'image',
          duration: asset.duration || 0,
          width: asset.width || 1920,
          height: asset.height || 1080,
        }
      );
    }
  }
  return { pathMap, probes };
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
    throw new Error('Native FFmpeg CLI execution requires Tauri desktop runtime.');
  }

  await invoke('ensure_directory', { path: saveFolderPath });
  onProgress(10, 'Preparing & verifying cached media streams on disk...');

  const { pathMap: diskPaths, probes } = await resolveAndProbeDiskAssets(project, cachePath);
  onProgress(22, 'Building frame-accurate FFmpeg filter graph...');

  const isClipping = project.mode === 'clipping';
  const targetRatio: AspectRatio = isClipping ? '9:16' : aspectRatio;
  const { width: exportW, height: exportH } = getExportDimensions(targetRatio, resolution);

  const allClips = project.timeline.tracks.flatMap((t) => t.clips);
  const exportDuration = allClips.length > 0
    ? Math.max(...allClips.map((c) => c.timelineStart + c.duration))
    : Math.max(1, project.timeline.duration || 5);

  const inputArgs: string[] = [];
  const filterChains: string[] = [];
  const audioInputLabels: string[] = [];
  let nextInputIdx = 0;

  // Dedicated Windows TrueType bold font path (avoid drawtext family lookup crash)
  const windowsBoldFont = 'C\\:/Windows/Fonts/arialbd.ttf';

  if (isClipping) {
    // =========================================================
    // MODE A: CLIPPING (9:16 Top Speaker + Bottom Speaker Crop)
    // =========================================================
    const primaryClip = allClips.find((c) => c.type === 'video' && c.assetId && diskPaths.has(c.assetId));
    if (!primaryClip || !primaryClip.assetId) {
      throw new Error('No cached source video found for Clipping export.');
    }
    const srcPath = diskPaths.get(primaryClip.assetId)!;
    const probe = probes.get(primaryClip.assetId);

    inputArgs.push('-accurate_seek', '-ss', primaryClip.sourceStart.toFixed(3), '-t', primaryClip.duration.toFixed(3), '-i', srcPath);

    const topH = even(exportH * framerSettings.splitRatio);
    const btmH = even(exportH - topH);
    const actualOutH = topH + btmH;
    const tb = framerSettings.topBox;
    const bb = framerSettings.bottomBox;

    filterChains.push(`[0:v]setpts=PTS-STARTPTS,fps=${fps},setsar=1,split=2[vtop_src][vbtm_src]`);
    filterChains.push(
      `[vtop_src]crop=w='max(2,trunc(iw*${(tb.width / 100).toFixed(4)}/2)*2)':h='max(2,trunc(ih*${(tb.height / 100).toFixed(4)}/2)*2)':x='iw*${(tb.x / 100).toFixed(4)}':y='ih*${(tb.y / 100).toFixed(4)}',scale=${exportW}:${topH}:flags=lanczos,setsar=1[vtop]`
    );
    filterChains.push(
      `[vbtm_src]crop=w='max(2,trunc(iw*${(bb.width / 100).toFixed(4)}/2)*2)':h='max(2,trunc(ih*${(bb.height / 100).toFixed(4)}/2)*2)':x='iw*${(bb.x / 100).toFixed(4)}':y='ih*${(bb.y / 100).toFixed(4)}',scale=${exportW}:${btmH}:flags=lanczos,setsar=1[vbtm]`
    );

    const divPx = Math.max(0, Math.round(framerSettings.dividerWidth * (actualOutH / 720)));
    const divColor = (framerSettings.dividerColor || '#000000').replace('#', '0x');
    if (divPx > 0) {
      filterChains.push(
        `[vtop][vbtm]vstack=inputs=2,drawbox=x=0:y=${Math.max(0, topH - Math.floor(divPx / 2))}:w=${exportW}:h=${divPx}:color=${divColor}:t=fill,format=yuv420p[outv]`
      );
    } else {
      filterChains.push('[vtop][vbtm]vstack=inputs=2,format=yuv420p[outv]');
    }

    if (probe?.has_audio && !primaryClip.muted && (primaryClip.volume ?? 100) > 0) {
      const vol = clamp((primaryClip.volume ?? 100) / 100, 0, 2).toFixed(2);
      filterChains.push(
        `[0:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=${vol},alimiter=limit=0.98[outa]`
      );
    } else {
      filterChains.push(`anullsrc=r=48000:cl=stereo:d=${primaryClip.duration.toFixed(3)}[outa]`);
    }
  } else {
    // =========================================================
    // MODE B: FULL MULTI-TRACK VIDEO EDITOR COMPOSITE
    // =========================================================
    filterChains.push(
      `color=c=black:s=${exportW}x${exportH}:r=${fps}:d=${exportDuration.toFixed(3)},format=yuv420p[base0]`
    );
    let currentCanvasLabel = 'base0';
    let stepCount = 0;

    // 1. Visual Tracks sorted bottom-to-top
    const bottomToTopVideoTracks = [...project.timeline.tracks.filter((t) => t.type === 'video' && t.visible)].reverse();

    for (const track of bottomToTopVideoTracks) {
      for (const clip of track.clips) {
        if (!clip.assetId || !diskPaths.has(clip.assetId)) continue;
        const srcPath = diskPaths.get(clip.assetId)!;
        const probe = probes.get(clip.assetId);
        const inIdx = nextInputIdx++;

        if (clip.type === 'image') {
          inputArgs.push('-loop', '1', '-t', clip.duration.toFixed(3), '-i', srcPath);
        } else {
          inputArgs.push('-accurate_seek', '-ss', clip.sourceStart.toFixed(3), '-t', clip.duration.toFixed(3), '-i', srcPath);
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

        const extraFilters = buildClipFFmpegFilters(clip.effects);
        const opacity = clamp(clip.transform.opacity ?? 1.0, 0, 1);
        const rotDeg = clip.transform.rotation || 0;
        const needAlpha = opacity < 1 || rotDeg !== 0 || (clip.type === 'image' && clip.fitMode === 'contain');

        const chain: string[] = [
          `[${inIdx}:v]setpts=PTS-STARTPTS,fps=${fps},setpts=PTS+${clip.timelineStart.toFixed(3)}/TB`,
          fitFilter,
          'setsar=1',
          ...extraFilters,
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

        const layerLabel = `vlayer_${stepCount}`;
        filterChains.push(`${chain.join(',')}[${layerLabel}]`);

        // Overlay onto composite canvas (matching VideoPreviewCanvas proportions ~680x382 -> scaled cleanly to exportW x exportH)
        const offsetX = Math.round((clip.transform.x || 0) * (exportW / 680));
        const offsetY = Math.round((clip.transform.y || 0) * (exportH / 382));
        const endSec = (clip.timelineStart + clip.duration).toFixed(3);
        const nextCanvasLabel = `base_${++stepCount}`;

        filterChains.push(
          `[${currentCanvasLabel}][${layerLabel}]overlay=x=(W-w)/2+${offsetX}:y=(H-h)/2+${offsetY}:eof_action=pass:shortest=0:enable='between(t,${clip.timelineStart.toFixed(3)},${endSec})'[${nextCanvasLabel}]`
        );
        currentCanvasLabel = nextCanvasLabel;

        // If unmuted video clip has an audio stream, attach synchronized audio chain
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
          filterChains.push(
            `[${inIdx}:a]atrim=duration=${clip.duration.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=${vol},adelay=${delayMs}|${delayMs}[${aLabel}]`
          );
          audioInputLabels.push(`[${aLabel}]`);
        }
      }
    }

    // 2. Standalone Audio Tracks
    const audioTracks = project.timeline.tracks.filter((t) => t.type === 'audio' && !t.muted);
    for (const track of audioTracks) {
      for (const clip of track.clips) {
        if (!clip.assetId || !diskPaths.has(clip.assetId)) continue;
        if (clip.muted || (clip.volume ?? 100) <= 0) continue;
        const srcPath = diskPaths.get(clip.assetId)!;
        const probe = probes.get(clip.assetId);
        if (probe && !probe.has_audio) continue;

        const inIdx = nextInputIdx++;
        inputArgs.push('-accurate_seek', '-ss', clip.sourceStart.toFixed(3), '-t', clip.duration.toFixed(3), '-i', srcPath);

        const aLabel = `aud_${audioInputLabels.length}`;
        const vol = clamp((clip.volume ?? 100) / 100, 0, 2).toFixed(2);
        const delayMs = Math.max(0, Math.round(clip.timelineStart * 1000));
        filterChains.push(
          `[${inIdx}:a]atrim=duration=${clip.duration.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=${vol},adelay=${delayMs}|${delayMs}[${aLabel}]`
        );
        audioInputLabels.push(`[${aLabel}]`);
      }
    }

    // 3. Master Screen Blur & Canvas Color Grading
    const masterBlur = project.settings.screenBlur ?? 0;
    const mb = project.settings.masterBrightness ?? 100;
    const mc = project.settings.masterContrast ?? 100;
    const ms = project.settings.masterSaturation ?? 100;
    const mh = project.settings.masterHue ?? 0;

    if (masterBlur > 0 || mb !== 100 || mc !== 100 || ms !== 100 || mh !== 0) {
      const mFilters: string[] = [];
      if (mb !== 100 || mc !== 100 || ms !== 100) {
        mFilters.push(
          `eq=brightness=${clamp((mb - 100) / 100, -1, 1).toFixed(2)}:contrast=${clamp(mc / 100, 0, 3).toFixed(2)}:saturation=${clamp(ms / 100, 0, 3).toFixed(2)}`
        );
      }
      if (mh !== 0) mFilters.push(`hue=h=${mh}`);
      if (masterBlur > 0) mFilters.push(`gblur=sigma=${clamp(masterBlur, 0.1, 40).toFixed(1)}`);

      const gradedLabel = `graded_${++stepCount}`;
      filterChains.push(`[${currentCanvasLabel}]${mFilters.join(',')}[${gradedLabel}]`);
      currentCanvasLabel = gradedLabel;
    }

    // 4. Burn in Subtitles / Text Captions (Applied AFTER resize/grading per gotchas.md!)
    const textTracks = project.timeline.tracks.filter((t) => t.type === 'text' && t.visible);
    for (const track of textTracks) {
      for (const clip of track.clips) {
        if (!clip.textContent) continue;
        const safeText = escapeDrawtextText(clip.textContent);
        const fontSize = Math.max(16, Math.round((clip.fontSize || 28) * (exportH / 480)));
        const fontColor = cssColorToFFmpeg(clip.textColor, '#ffffff');
        const boxColor = cssColorToFFmpeg(clip.textBgColor, 'black@0.75');
        const dx = Math.round((clip.transform.x || 0) * (exportW / 680));
        const dy = Math.round((clip.transform.y || 0) * (exportH / 382));
        const startStr = clip.timelineStart.toFixed(3);
        const endStr = (clip.timelineStart + clip.duration).toFixed(3);
        const nextTxtLabel = `txt_${++stepCount}`;

        filterChains.push(
          `[${currentCanvasLabel}]drawtext=fontfile='${windowsBoldFont}':text='${safeText}':fontsize=${fontSize}:fontcolor=${fontColor}:box=1:boxcolor=${boxColor}:boxborderw=14:x=(w-text_w)/2+${dx}:y=h*0.84-text_h/2+${dy}:enable='between(t,${startStr},${endStr})'[${nextTxtLabel}]`
        );
        currentCanvasLabel = nextTxtLabel;
      }
    }

    filterChains.push(`[${currentCanvasLabel}]format=yuv420p[outv]`);

    // 5. Final Audio Mix Graph
    filterChains.push(`anullsrc=r=48000:cl=stereo:d=${exportDuration.toFixed(3)}[asilent]`);
    if (audioInputLabels.length > 0) {
      const allAudioInputs = ['[asilent]', ...audioInputLabels].join('');
      filterChains.push(
        `${allAudioInputs}amix=inputs=${audioInputLabels.length + 1}:duration=first:normalize=0,alimiter=limit=0.98[outa]`
      );
    } else {
      filterChains.push('[asilent]acopy[outa]');
    }
  }

  // Write filter graph file and pass via FFmpeg 8+/2026 native file-argument syntax `-/filter_complex`
  const filterGraphText = filterChains.join(';\n');
  const tempFilterFile = normalizeJoin(saveFolderPath, `__cinecraft_filter_${Date.now()}.txt`);
  await invoke('write_text_file', { path: tempFilterFile, content: filterGraphText });

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
    await invoke('delete_temp_file', { path: tempFilterFile }).catch(() => {});
  }

  const displayArgs = finalArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ');
  onProgress(100, `Saved crisp CFR MP4 directly to ${fullSavePath}!`);

  return {
    savedPath: fullSavePath,
    ffmpegCommand: `ffmpeg ${displayArgs}`,
  };
}
