#!/usr/bin/env node
/**
 * Repeatable Winecut Export Quality & FFprobe Validation Test Suite (Phase 5 & Phase 7)
 * Usage: node apps/web/scripts/export-quality-test.mjs
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winecut-export-test-'));

function runCmd(bin, args) {
  return execFileSync(bin, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function ffmpeg(args) {
  const res = spawnSync('ffmpeg', ['-y', ...args], { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`FFmpeg failed (${args.join(' ')}):\n${res.stderr}`);
  }
  return res.stderr || '';
}

function probeVideo(filePath) {
  const raw = runCmd('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    filePath,
  ]);
  const parsed = JSON.parse(raw);
  const v = parsed.streams.find((s) => s.codec_type === 'video');
  const a = parsed.streams.find((s) => s.codec_type === 'audio');
  return {
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    codec: v?.codec_name ?? '',
    pixFmt: v?.pix_fmt ?? '',
    rFps: v?.r_frame_rate ?? '',
    avgFps: v?.avg_frame_rate ?? '',
    nbFrames: Number(v?.nb_frames ?? 0),
    colorSpace: v?.color_space ?? '',
    colorPrimaries: v?.color_primaries ?? '',
    colorTransfer: v?.color_transfer ?? '',
    vDur: Number(v?.duration ?? parsed.format?.duration ?? 0),
    aDur: Number(a?.duration ?? 0),
    bitRate: Number(parsed.format?.bit_rate ?? 0),
  };
}

function compareDistortedToRef(distorted, reference, hasVmaf, durationSec) {
  const graph = hasVmaf
    ? '[0:v][1:v]ssim=shortest=1;[0:v][1:v]psnr=shortest=1;[0:v][1:v]libvmaf=shortest=1:n_threads=4'
    : '[0:v][1:v]ssim=shortest=1;[0:v][1:v]psnr=shortest=1';
  const durArgs = durationSec ? ['-t', String(durationSec)] : [];
  const res = spawnSync(
    'ffmpeg',
    [...durArgs, '-i', distorted, ...durArgs, '-i', reference, '-lavfi', graph, '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const out = `${res.stdout || ''}\n${res.stderr || ''}`;
  const ssimM = out.match(/SSIM[^\n]*All:([0-9.]+)/);
  const psnrM = out.match(/PSNR[^\n]*average:([0-9.]+)/);
  const vmafM = out.match(/VMAF score:\s*([0-9.]+)/);
  return {
    ssim: ssimM ? Number(ssimM[1]) : null,
    psnr: psnrM ? Number(psnrM[1]) : null,
    vmaf: vmafM ? Number(vmafM[1]) : null,
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

try {
  console.log(`Winecut Export Quality Suite -> ${workDir}`);
  const fltOut = runCmd('ffmpeg', ['-hide_banner', '-filters']);
  const encOut = runCmd('ffmpeg', ['-hide_banner', '-encoders']);
  const hasVmaf = fltOut.includes(' libvmaf ');
  const hasNvenc = encOut.includes('h264_nvenc');

  const refA = path.join(workDir, 'ref_a.mp4');
  const refB = path.join(workDir, 'ref_b.mp4');
  const overlayPng = path.join(workDir, 'overlay.png');
  const refLong = path.join(workDir, 'ref_long_36s.mp4');

  ffmpeg([
    '-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=30:d=3',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
    '-c:v', 'libx264', '-crf', '10', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '256k', refA,
  ]);

  ffmpeg([
    '-f', 'lavfi', '-i', 'smptehdbars=s=1920x1080:r=30:d=3',
    '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=3',
    '-c:v', 'libx264', '-crf', '10', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '256k', refB,
  ]);

  ffmpeg([
    '-f', 'lavfi', '-i', 'color=c=0x14b8a6@0.85:s=320x120:r=1:d=1',
    '-frames:v', '1', '-pix_fmt', 'rgba', overlayPng,
  ]);

  const results = [];

  // Test 1: Original video without effects (RGB24 composite + single BT.709 conversion + H.264 HQ CRF 17)
  const out1 = path.join(workDir, 'case1_original_h264_hq.mp4');
  ffmpeg([
    '-fflags', '+genpts', '-t', '3.000', '-i', refA,
    '-filter_complex',
    'color=c=black:s=1920x1080:r=30:d=3.000,settb=1/1000,format=rgb24[base0];[0:v]setpts=(PTS-STARTPTS)/1.0,fps=30:round=near,settb=1/1000,scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos+accurate_rnd+full_chroma_int,crop=1920:1080,setsar=1,format=rgb24[v0];[base0][v0]overlay=0:0:format=rgb:eof_action=pass:shortest=0[vcomp];[vcomp]scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p[outv];[0:a]atrim=duration=3.000,asetpts=PTS-STARTPTS,aresample=48000:async=1:first_pts=0[outa]',
    '-map', '[outv]', '-map', '[outa]', '-t', '3.000',
    '-c:v', 'libx264', '-profile:v', 'high', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p',
    '-r', '30', '-fps_mode', 'cfr', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '256k', out1,
  ]);
  const p1 = probeVideo(out1);
  const q1 = compareDistortedToRef(out1, refA, hasVmaf);
  assert(p1.width === 1920 && p1.height === 1080, 'Case 1 dims mismatch');
  assert(p1.nbFrames === 90, `Case 1 expected 90 frames, got ${p1.nbFrames}`);
  assert(p1.colorSpace === 'bt709', `Case 1 expected bt709, got ${p1.colorSpace}`);
  assert(q1.ssim !== null && q1.ssim >= 0.985, `Case 1 SSIM too low: ${q1.ssim}`);
  results.push({ case: '1. Original HQ (H.264 CRF 17)', ...p1, ...q1 });

  // Test 2 & 3: Color grading + Multi-effects + Velocity curve expression
  const out2 = path.join(workDir, 'case2_3_graded_fx_ramp.mp4');
  ffmpeg([
    '-fflags', '+genpts', '-t', '3.000', '-i', refA,
    '-filter_complex',
    "color=c=black:s=1920x1080:r=30:d=3.000,settb=1/1000,format=rgb24[base0];[0:v]setpts='(if(lt((PTS-STARTPTS)*TB,1.500),0.0+(PTS-STARTPTS)*TB*1.33333,2.0+((PTS-STARTPTS)*TB-1.500)*0.66667))/TB',fps=30:round=near,settb=1/1000,scale=1920:1080:flags=lanczos+accurate_rnd+full_chroma_int,setsar=1,format=rgb24,exposure=exposure=0.15:black=0,eq=brightness=0.04:contrast=1.12:saturation=1.18,unsharp=5:5:0.75:5:5:0.0,rgbashift=rh=-3:bh=3[v0];[base0][v0]overlay=0:0:format=rgb:eof_action=pass:shortest=0[vcomp];[vcomp]scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p[outv]",
    '-map', '[outv]', '-t', '3.000', '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-r', '30', '-fps_mode', 'cfr', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', out2,
  ]);
  const p2 = probeVideo(out2);
  assert(p2.width === 1920 && p2.nbFrames === 90, 'Case 2/3 cadence mismatch');
  results.push({ case: '2/3. Graded + FX + Ramp', ...p2 });

  // Test 4, 5, 6: Seam transition + Multiple layers + RGBA PNG Overlay in full RGB24
  const out4 = path.join(workDir, 'case4_5_6_xfade_layers_overlay.mp4');
  ffmpeg([
    '-fflags', '+genpts', '-t', '2.500', '-i', refA,
    '-fflags', '+genpts', '-t', '2.500', '-i', refB,
    '-loop', '1', '-t', '4.000', '-i', overlayPng,
    '-filter_complex',
    "color=c=black:s=1920x1080:r=30:d=4.400,settb=1/1000,format=rgb24[base0];[0:v]setpts=PTS-STARTPTS,fps=30:round=near,settb=1/1000,scale=1920:1080:flags=lanczos+accurate_rnd+full_chroma_int,format=rgb24,setsar=1[a];[1:v]setpts=PTS-STARTPTS,fps=30:round=near,settb=1/1000,scale=1920:1080:flags=lanczos+accurate_rnd+full_chroma_int,format=rgb24,setsar=1[b];[a][b]xfade=transition=fade:duration=0.600:offset=1.900,format=rgb24,settb=1/1000,setpts=PTS/TB[joined];[base0][joined]overlay=0:0:format=rgb:eof_action=pass:shortest=0[b1];[2:v]fps=30:round=near,settb=1/1000,format=rgba,fade=t=in:st=0:d=0.35:alpha=1,setpts=PTS+0.200/TB[ov];[b1][ov]overlay=x='(W-w)/2':y='H*0.84-h/2':format=rgb:eof_action=pass:shortest=0:enable='between(t,0.200,4.200)'[vcomp];[vcomp]scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p[outv]",
    '-map', '[outv]', '-t', '4.400', '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-r', '30', '-fps_mode', 'cfr', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', out4,
  ]);
  const p4 = probeVideo(out4);
  assert(p4.width === 1920 && p4.nbFrames === 132, `Case 4/5/6 expected 132 frames, got ${p4.nbFrames}`);
  results.push({ case: '4/5/6. xfade + RGB Overlay + RGBA PNG', ...p4 });

  // Test 7 & 8: 1440p @ 60fps CFR + Custom 4K 1s check
  const out7 = path.join(workDir, 'case7_8_1440p60.mp4');
  ffmpeg([
    '-fflags', '+genpts', '-t', '2.000', '-i', refA,
    '-filter_complex',
    'color=c=black:s=2560x1440:r=60:d=2.000,settb=1/1000,format=rgb24[base0];[0:v]fps=60:round=near,settb=1/1000,scale=2560:1440:flags=lanczos+accurate_rnd+full_chroma_int,format=rgb24[v0];[base0][v0]overlay=0:0:format=rgb[vcomp];[vcomp]scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p[outv]',
    '-map', '[outv]', '-t', '2.000', '-c:v', 'libx264', '-crf', '17', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    '-r', '60', '-fps_mode', 'cfr', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', out7,
  ]);
  const p7 = probeVideo(out7);
  assert(p7.width === 2560 && p7.height === 1440 && p7.nbFrames === 120, `Case 7/8 1440p60 mismatch: ${JSON.stringify(p7)}`);
  results.push({ case: '7/8. 1440p @ 60fps CFR', ...p7 });

  const out4k = path.join(workDir, 'case7b_4k24.mp4');
  ffmpeg([
    '-fflags', '+genpts', '-t', '1.000', '-i', refA,
    '-filter_complex',
    'scale=3840:2160:flags=lanczos+accurate_rnd+full_chroma_int,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-crf', '17', '-preset', 'ultrafast', '-r', '24', '-fps_mode', 'cfr', '-t', '1.000', out4k,
  ]);
  const p4k = probeVideo(out4k);
  assert(p4k.width === 3840 && p4k.height === 2160 && p4k.nbFrames === 24, '4K 24fps check failed');
  results.push({ case: '7b. 4K @ 24fps CFR', ...p4k });

  // Test 9: H.265 10-bit & ProRes 422 HQ (.mov) using the full RGB24 -> single BT.709 conversion pipeline
  const out9a = path.join(workDir, 'case9_hevc10.mp4');
  ffmpeg([
    '-fflags', '+genpts', '-t', '1.500', '-i', refA,
    '-filter_complex',
    'color=c=black:s=1920x1080:r=30:d=1.500,settb=1/1000,format=rgb24[base0];[0:v]fps=30:round=near,settb=1/1000,format=rgb24[v0];[base0][v0]overlay=0:0:format=rgb[vcomp];[vcomp]scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p10le[outv]',
    '-map', '[outv]', '-t', '1.500',
    '-c:v', 'libx265', '-profile:v', 'main10', '-tag:v', 'hvc1', '-pix_fmt', 'yuv420p10le', '-crf', '18', '-preset', 'fast',
    '-x265-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    out9a,
  ]);
  const p9a = probeVideo(out9a);
  const q9a = compareDistortedToRef(out9a, refA, hasVmaf, 1.5);
  assert(p9a.pixFmt === 'yuv420p10le' && p9a.codec === 'hevc', `HEVC 10-bit check failed: ${JSON.stringify(p9a)}`);
  assert(q9a.ssim !== null && q9a.ssim >= 0.985, `Case 9a SSIM too low: ${q9a.ssim}`);
  results.push({ case: '9a. H.265 Main10 (10-bit)', ...p9a, ...q9a });

  const out9b = path.join(workDir, 'case9_prores422hq.mov');
  ffmpeg([
    '-fflags', '+genpts', '-t', '1.500', '-i', refA,
    '-filter_complex',
    'color=c=black:s=1920x1080:r=30:d=1.500,settb=1/1000,format=rgb24[base0];[0:v]fps=30:round=near,settb=1/1000,format=rgb24[v0];[base0][v0]overlay=0:0:format=rgb[vcomp];[vcomp]scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv422p10le[outv];[0:a]atrim=duration=1.500,asetpts=PTS-STARTPTS[outa]',
    '-map', '[outv]', '-map', '[outa]', '-t', '1.500',
    '-c:v', 'prores_ks', '-profile:v', '3', '-vendor', 'apl0', '-pix_fmt', 'yuv422p10le',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'pcm_s16le', '-ar', '48000', out9b,
  ]);
  const p9b = probeVideo(out9b);
  const q9b = compareDistortedToRef(out9b, refA, hasVmaf, 1.5);
  assert(p9b.codec === 'prores' && p9b.pixFmt === 'yuv422p10le', `ProRes check failed: ${JSON.stringify(p9b)}`);
  assert(q9b.ssim !== null && q9b.ssim >= 0.985, `Case 9b SSIM too low: ${q9b.ssim}`);
  results.push({ case: '9b. ProRes 422 HQ (.mov)', ...p9b, ...q9b });

  if (hasNvenc) {
    try {
      const outNv = path.join(workDir, 'case9_nvenc.mp4');
      ffmpeg([
        '-i', refA, '-t', '1.000',
        '-c:v', 'h264_nvenc', '-profile:v', 'high', '-rc', 'vbr', '-cq', '18', '-b:v', '0', '-pix_fmt', 'yuv420p',
        outNv,
      ]);
      results.push({ case: '9c. H.264 NVENC GPU', ...probeVideo(outNv) });
    } catch {
      console.log('NVENC runtime driver unavailable; skipped hardware encoder test.');
    }
  }

  // Test 10: Long-duration (>34s -> 36s) audio/video sync & exact frame count check
  ffmpeg([
    '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=36',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=36',
    '-c:v', 'libx264', '-crf', '22', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', refLong,
  ]);
  const out10 = path.join(workDir, 'case10_long_36s.mp4');
  ffmpeg([
    '-fflags', '+genpts', '-t', '36.000', '-i', refLong,
    '-filter_complex',
    'color=c=black:s=1280x720:r=30:d=36.000,settb=1/1000,format=rgb24[base0];[0:v]setpts=(PTS-STARTPTS),fps=30:round=near,settb=1/1000,format=rgb24[v0];[base0][v0]overlay=0:0:format=rgb[vcomp];[vcomp]scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p[outv];[0:a]atrim=duration=36.000,asetpts=PTS-STARTPTS,aresample=48000:async=1:first_pts=0,atrim=duration=36.000,asetpts=PTS-STARTPTS[outa]',
    '-map', '[outv]', '-map', '[outa]', '-t', '36.000',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-r', '30', '-fps_mode', 'cfr', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-c:a', 'aac', '-b:a', '192k', out10,
  ]);
  const p10 = probeVideo(out10);
  const syncDelta = Math.abs(p10.vDur - p10.aDur);
  assert(p10.nbFrames === 1080, `Case 10 expected 1080 frames, got ${p10.nbFrames}`);
  assert(syncDelta < 0.05, `Case 10 A/V sync drift too large: ${syncDelta}s`);
  results.push({ case: '10. Long 36s Export & A/V Sync', ...p10, syncDelta });

  console.table(
    results.map((r) => ({
      Case: r.case,
      Res: `${r.width}x${r.height}`,
      Codec: `${r.codec} (${r.pixFmt})`,
      Frames: r.nbFrames,
      FPS: r.avgFps,
      Color: r.colorSpace || 'n/a',
      DurDiff: r.syncDelta !== undefined ? `${r.syncDelta.toFixed(4)}s` : `${Math.abs(r.vDur - r.aDur).toFixed(4)}s`,
      SSIM: r.ssim !== undefined && r.ssim !== null ? r.ssim.toFixed(4) : '-',
      PSNR: r.psnr !== undefined && r.psnr !== null ? `${r.psnr.toFixed(2)}dB` : '-',
      VMAF: r.vmaf !== undefined && r.vmaf !== null ? r.vmaf.toFixed(2) : '-',
    })),
  );
  console.log('ALL EXPORT QUALITY & PIPELINE VALIDATION TESTS PASSED.');
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
