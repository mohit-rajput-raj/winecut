'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { useEditor } from '../../lib/editor/EditorContext';
import { useWorkspace } from '../../lib/workspace/WorkspaceContext';
import { EditorProject } from '../../lib/editor/types';
import { secondsToTimecode } from '../../lib/editor/time-utils';
import { buildCssFilter, buildMasterFilter, getExportDimensions } from '../../lib/editor/render-utils';
import { runNativeFFmpegExport } from '../../lib/editor/ffmpeg-export';
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
  if (Math.abs(el.currentTime - safeTarget) < 0.015 && el.readyState >= 2) {
    return;
  }
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      el.removeEventListener('seeked', onSeeked);
      resolve();
    }, 350);
    const onSeeked = () => {
      clearTimeout(timeout);
      resolve();
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
    const gain = offlineCtx.createGain();
    gain.gain.value = Math.max(0, Math.min(2, item.volume / 100));
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

  const [resolution, setResolution] = useState<'720p' | '1080p' | '4k'>(settings.defaultResolution || '720p');
  const [fps, setFps] = useState<number>(settings.defaultFps || 30);
  
  const [customSaveFolder, setCustomSaveFolder] = useState<string | null>(null);
  const [customFileName, setCustomFileName] = useState<string | null>(null);

  const saveFolderPath = customSaveFolder ?? (settings.downloadsPath || 'D:\\Editor\\downloads');
  const defaultCleanName = (project.name || 'CineCraft_Video')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  const fileName = customFileName ?? `${defaultCleanName}_${resolution}_${fps}fps.mp4`;

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
  }, [isOpen]);

  const handleCloseModal = () => {
    cancelFlagRef.current = true;
    setExportState('idle');
    setProgress(0);
    setSavedDiskPath(null);
    setFfmpegCommand('');
    setExportWarning(null);
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
    setStatusMessage(`Preparing ${resolution} @ ${fps}fps export...`);

    // 1. PREFERRED PATH: Native Frame-Exact FFmpeg Compositor (ZERO real-time playback glitches or drops!)
    if (isTauriRuntime()) {
      try {
        const res = await runNativeFFmpegExport({
          project,
          aspectRatio,
          framerSettings,
          resolution,
          fps,
          cachePath: settings.cachePath || 'D:\\Editor\\cache',
          saveFolderPath,
          fullSavePath,
          onProgress: (pct, msg) => {
            if (!cancelFlagRef.current) {
              setProgress(pct);
              setStatusMessage(msg);
            }
          },
        });

        if (cancelFlagRef.current) return;

        setFfmpegCommand(res.ffmpegCommand);
        setSavedDiskPath(res.savedPath);
        setProgress(100);
        setExportState('finished');
        setStatusMessage(`Exported smoothly with native FFmpeg CFR pipeline -> ${res.savedPath}`);
        return;
      } catch (ffErr: any) {
        console.warn('Native FFmpeg graph failed, using offline seek-stepped canvas renderer:', ffErr);
        setExportWarning(`FFmpeg direct note: ${ffErr?.message || String(ffErr)} — rendered via step-synced canvas fallback.`);
      }
    }

    // 2. FALLBACK PATH (Browser mode or FFmpeg graph fallback): Frame-Stepped Offline Seeked Canvas Renderer
    // Avoids setInterval playback jitter by waiting cleanly for each frame's `seeked` event before capture!
    const isClippingMode = project.mode === 'clipping';
    const effectiveRatio = isClippingMode ? '9:16' : aspectRatio;

    try {
      const { width: exportW, height: exportH } = getExportDimensions(effectiveRatio, resolution);
      const allClips = project.timeline.tracks.flatMap(t => t.clips);
      const exportDuration = allClips.length > 0
        ? Math.max(...allClips.map(c => c.timelineStart + c.duration))
        : (project.timeline.duration || 5);

      const offscreen = document.createElement('canvas');
      offscreen.width = exportW;
      offscreen.height = exportH;
      const ctx = offscreen.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Could not initialize Canvas 2D Context');

      setStatusMessage('Loading frame decoders for step-accurate compositing...');
      const videoElementsByClip = new Map<string, HTMLVideoElement>();
      const imageElementsByClip = new Map<string, HTMLImageElement>();

      for (const track of project.timeline.tracks) {
        for (const clip of track.clips) {
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

        if (isClippingMode) {
          const primaryClip = allClips.find(c => c.type === 'video');
          const vid = primaryClip ? videoElementsByClip.get(primaryClip.id) : undefined;
          if (primaryClip && vid) {
            const vw = vid.videoWidth || 1920;
            const vh = vid.videoHeight || 1080;
            const topH = Math.round(framerSettings.splitRatio * exportH);
            const btmH = exportH - topH;

            const tb = framerSettings.topBox;
            ctx.drawImage(vid, (tb.x / 100) * vw, (tb.y / 100) * vh, Math.max(1, (tb.width / 100) * vw), Math.max(1, (tb.height / 100) * vh), 0, 0, exportW, topH);

            const bb = framerSettings.bottomBox;
            ctx.drawImage(vid, (bb.x / 100) * vw, (bb.y / 100) * vh, Math.max(1, (bb.width / 100) * vw), Math.max(1, (bb.height / 100) * vh), 0, topH, exportW, btmH);

            if (framerSettings.dividerWidth > 0) {
              const divPx = framerSettings.dividerWidth * (exportH / 720);
              ctx.fillStyle = framerSettings.dividerColor || '#000000';
              ctx.fillRect(0, topH - divPx / 2, exportW, divPx);
            }
          }
        } else {
          ctx.save();
          if (masterFilterStr !== 'none') ctx.filter = masterFilterStr;

          for (const track of bottomToTopVideoTracks) {
            for (const clip of track.clips) {
              if (currentT < clip.timelineStart || currentT > clip.timelineStart + clip.duration) continue;

              const scaleRatioX = exportW / 680;
              const scaleRatioY = exportH / 382;
              const cx = exportW / 2 + (clip.transform.x * scaleRatioX);
              const cy = exportH / 2 + (clip.transform.y * scaleRatioY);
              const br = (clip.borderRadius || 0) * scaleRatioX;
              const bw = (clip.borderWidth || 0) * scaleRatioX;
              const bc = clip.borderColor || '#ffffff';

              const mediaEl = clip.type === 'video'
                ? videoElementsByClip.get(clip.id)
                : clip.type === 'image'
                ? imageElementsByClip.get(clip.id)
                : undefined;

              if (!mediaEl) continue;

              ctx.save();
              const cf = buildCssFilter(clip.effects);
              if (cf !== 'none') ctx.filter = masterFilterStr !== 'none' ? `${masterFilterStr} ${cf}` : cf;
              ctx.translate(cx, cy);
              ctx.rotate((clip.transform.rotation * Math.PI) / 180);
              ctx.scale(clip.transform.scale, clip.transform.scale);
              ctx.globalAlpha = clip.transform.opacity ?? 1.0;
              if (clip.dropShadow) {
                ctx.shadowColor = 'rgba(0,0,0,0.65)';
                ctx.shadowBlur = 18 * scaleRatioX;
                ctx.shadowOffsetY = 8 * scaleRatioY;
              }
              drawFittedMedia(ctx, mediaEl, exportW, exportH, clip.fitMode || 'cover', br, bw, bc);
              ctx.restore();
            }
          }
          ctx.restore();

          ctx.filter = 'none';
          for (const track of textTracks) {
            const clip = track.clips.find(c => currentT >= c.timelineStart && currentT <= c.timelineStart + c.duration);
            if (!clip?.textContent) continue;

            const fontSize = Math.max(16, Math.round((clip.fontSize || 28) * (exportH / 480)));
            ctx.save();
            ctx.font = `bold ${fontSize}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const metrics = ctx.measureText(clip.textContent);
            const boxW = metrics.width + fontSize * 1.4;
            const boxH = fontSize * 1.25 + fontSize * 0.8;
            const posX = exportW / 2 + clip.transform.x * (exportW / 680);
            const posY = exportH * 0.84 + clip.transform.y * (exportH / 382);

            ctx.translate(posX, posY);
            ctx.scale(clip.transform.scale || 1, clip.transform.scale || 1);
            ctx.fillStyle = clip.textBgColor || 'rgba(0, 0, 0, 0.75)';
            ctx.beginPath();
            ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 8 * (exportH / 720));
            ctx.fill();
            ctx.fillStyle = clip.textColor || '#ffffff';
            ctx.fillText(clip.textContent, 0, 0);
            ctx.restore();
          }
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

      // Check WebCodecs support for exact-PTS MP4 muxing (zero slow-motion / wall-clock stretch!)
      let webCodecsConfig: { codec: string; muxerCodec: 'avc' | 'vp9' } | null = null;
      const evenW = exportW % 2 === 0 ? exportW : exportW + 1;
      const evenH = exportH % 2 === 0 ? exportH : exportH + 1;
      const targetBitrate = resolution === '4k' ? 16_000_000 : resolution === '1080p' ? 8_000_000 : 4_500_000;

      if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
        const candidates: Array<{ codec: string; muxerCodec: 'avc' | 'vp9' }> = [
          { codec: 'avc1.4d002a', muxerCodec: 'avc' },
          { codec: 'avc1.4d001f', muxerCodec: 'avc' },
          { codec: 'avc1.42001f', muxerCodec: 'avc' },
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
                  activeSeekPromises.push(seekElementExact(v, (currentT - clip.timelineStart) + clip.sourceStart));
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
                if (v) activeSeekPromises.push(seekElementExact(v, (currentT - clip.timelineStart) + clip.sourceStart));
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
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-zinc-800 bg-zinc-900/40">
                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
                    Resolution (Default 720p)
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['720p', '1080p', '4k'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setResolution(r)}
                        className={`py-1.5 px-2 rounded text-xs font-mono font-medium border text-center transition-all cursor-pointer ${
                          resolution === r
                            ? 'border-blue-500 bg-blue-950/60 text-blue-200'
                            : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {r.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
                    Frame Rate (Default 30fps)
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[30, 60].map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFps(f)}
                        className={`py-1.5 px-2 rounded text-xs font-mono font-medium border text-center transition-all cursor-pointer ${
                          fps === f
                            ? 'border-blue-500 bg-blue-950/60 text-blue-200'
                            : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {f} FPS
                      </button>
                    ))}
                  </div>
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
            {resolution} · {fps} FPS · CFR
          </Badge>

          <div className="flex items-center gap-2">
            {exportState === 'rendering' ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  cancelFlagRef.current = true;
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
