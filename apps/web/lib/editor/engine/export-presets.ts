import { AspectRatio, MediaAsset } from '../types';

export type ResolutionPreset = 'source' | '720p' | '1080p' | '1440p' | '4k' | 'custom';

export type CodecProfileId =
  | 'h264_hq'
  | 'h265_8bit'
  | 'h265_10bit'
  | 'prores_422'
  | 'prores_422_hq'
  | 'h264_nvenc';

export type QualityTier = 'archive' | 'high' | 'standard' | 'compact';
export type EncoderSpeedPreset = 'slow' | 'medium' | 'fast';

export interface ExportProfileConfig {
  resolutionPreset: ResolutionPreset;
  customWidth: number;
  customHeight: number;
  fps: number;
  codecProfile: CodecProfileId;
  qualityTier: QualityTier;
  encoderSpeed: EncoderSpeedPreset;
  verifyAfterExport: boolean;
}

export interface CodecPresetMetadata {
  id: CodecProfileId;
  label: string;
  extension: 'mp4' | 'mov';
  pixFmt: 'yuv420p' | 'yuv420p10le' | 'yuv422p10le';
  description: string;
  requiresGpu?: 'nvenc';
}

export const CODEC_PRESETS: CodecPresetMetadata[] = [
  {
    id: 'h264_hq',
    label: 'H.264 High Quality (MP4)',
    extension: 'mp4',
    pixFmt: 'yuv420p',
    description: 'libx264 High Profile, CRF quality-based, BT.709',
  },
  {
    id: 'h265_8bit',
    label: 'H.265 HEVC 8-bit (MP4)',
    extension: 'mp4',
    pixFmt: 'yuv420p',
    description: 'libx265 high efficiency with hvc1 tag',
  },
  {
    id: 'h265_10bit',
    label: 'H.265 HEVC 10-bit (MP4)',
    extension: 'mp4',
    pixFmt: 'yuv420p10le',
    description: 'libx265 Main10 reduces banding on gradients & fades',
  },
  {
    id: 'prores_422',
    label: 'Apple ProRes 422 (MOV)',
    extension: 'mov',
    pixFmt: 'yuv422p10le',
    description: '10-bit 4:2:2 visually lossless intermediate + PCM audio',
  },
  {
    id: 'prores_422_hq',
    label: 'Apple ProRes 422 HQ (MOV)',
    extension: 'mov',
    pixFmt: 'yuv422p10le',
    description: 'Mastering-grade 10-bit 4:2:2 intra-frame + PCM audio',
  },
  {
    id: 'h264_nvenc',
    label: 'H.264 NVENC GPU (MP4)',
    extension: 'mp4',
    pixFmt: 'yuv420p',
    description: 'NVIDIA hardware VBR CQ encoding',
    requiresGpu: 'nvenc',
  },
];

export const QUALITY_TIER_META: Record<
  QualityTier,
  { label: string; crf264: number; crf265: number; cqNvenc: number; bitrateMult: number }
> = {
  archive: { label: 'Master (CRF 14)', crf264: 14, crf265: 16, cqNvenc: 15, bitrateMult: 1.65 },
  high: { label: 'High (CRF 17)', crf264: 17, crf265: 19, cqNvenc: 18, bitrateMult: 1.25 },
  standard: { label: 'Balanced (CRF 20)', crf264: 20, crf265: 22, cqNvenc: 21, bitrateMult: 1.0 },
  compact: { label: 'Compact (CRF 23)', crf264: 23, crf265: 25, cqNvenc: 24, bitrateMult: 0.72 },
};

export function snapEvenDimension(val: number, min: number = 128, max: number = 7680): number {
  const clamped = Math.max(min, Math.min(max, Math.round(val)));
  return clamped % 2 === 0 ? clamped : clamped + 1;
}

export function getCodecPresetMeta(id: CodecProfileId): CodecPresetMetadata {
  return CODEC_PRESETS.find((c) => c.id === id) ?? CODEC_PRESETS[0]!;
}

/**
 * Resolves exact export frame dimensions while preserving aspect ratio cleanly
 * and honoring "Source Original", standard 720p/1080p/1440p/4K presets, or custom dimensions.
 */
export function resolveExportDimensions(
  aspectRatio: AspectRatio,
  preset: ResolutionPreset,
  primaryAsset?: Pick<MediaAsset, 'width' | 'height'>,
  customWidth?: number,
  customHeight?: number,
): { width: number; height: number } {
  if (preset === 'custom') {
    return {
      width: snapEvenDimension(customWidth || 1920),
      height: snapEvenDimension(customHeight || 1080),
    };
  }

  if (preset === 'source' && primaryAsset?.width && primaryAsset?.height) {
    const srcW = snapEvenDimension(primaryAsset.width);
    const srcH = snapEvenDimension(primaryAsset.height);
    if (aspectRatio === '9:16' && srcW > srcH) {
      // If vertical target was forced (e.g. Clip Cutter), preserve source short/long detail without upscaling
      return { width: snapEvenDimension(Math.round((srcH * 9) / 16)), height: srcH };
    }
    return { width: srcW, height: srcH };
  }

  const normalizedPreset: '720p' | '1080p' | '1440p' | '4k' =
    preset === 'source' ? '1080p' : preset;

  const shortSide =
    normalizedPreset === '4k'
      ? 2160
      : normalizedPreset === '1440p'
        ? 1440
        : normalizedPreset === '1080p'
          ? 1080
          : 720;

  if (aspectRatio === '9:16') {
    return { width: shortSide, height: snapEvenDimension((shortSide * 16) / 9) };
  }
  if (aspectRatio === '1:1') {
    return { width: shortSide, height: shortSide };
  }
  if (aspectRatio === '4:5') {
    return { width: shortSide, height: snapEvenDimension((shortSide * 5) / 4) };
  }
  return { width: snapEvenDimension((shortSide * 16) / 9), height: shortSide };
}

/**
 * Builds deterministic FFmpeg output encoder flags for each configured codec & quality tier.
 */
export function buildFFmpegEncoderArgs(
  profileId: CodecProfileId,
  qualityTier: QualityTier,
  speed: EncoderSpeedPreset,
  fps: number,
  width: number,
  height: number,
): { videoArgs: string[]; audioArgs: string[]; containerArgs: string[]; pixFmt: string } {
  const tier = QUALITY_TIER_META[qualityTier];
  const gop = Math.max(12, Math.round(fps * 2));
  const pixels = width * height;
  const h264Level = pixels > 2560 * 1440 ? '5.2' : pixels > 1920 * 1080 ? '5.0' : '4.2';

  const colorFlags = [
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-color_range',
    'tv',
  ];

  if (profileId === 'prores_422' || profileId === 'prores_422_hq') {
    const proresProfile = profileId === 'prores_422_hq' ? '3' : '2';
    return {
      pixFmt: 'yuv422p10le',
      videoArgs: [
        '-c:v',
        'prores_ks',
        '-profile:v',
        proresProfile,
        '-vendor',
        'apl0',
        '-bits_per_mb',
        profileId === 'prores_422_hq' ? '8000' : '5000',
        '-pix_fmt',
        'yuv422p10le',
        ...colorFlags,
      ],
      audioArgs: ['-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2'],
      containerArgs: [],
    };
  }

  if (profileId === 'h265_8bit' || profileId === 'h265_10bit') {
    const is10Bit = profileId === 'h265_10bit';
    const pixFmt = is10Bit ? 'yuv420p10le' : 'yuv420p';
    return {
      pixFmt,
      videoArgs: [
        '-c:v',
        'libx265',
        ...(is10Bit ? ['-profile:v', 'main10'] : []),
        '-tag:v',
        'hvc1',
        '-pix_fmt',
        pixFmt,
        '-preset',
        speed,
        '-crf',
        String(tier.crf265),
        '-g',
        String(gop),
        '-x265-params',
        `keyint=${gop}:min-keyint=${fps}:colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited`,
        ...colorFlags,
      ],
      audioArgs: ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2'],
      containerArgs: ['-movflags', '+faststart'],
    };
  }

  if (profileId === 'h264_nvenc') {
    return {
      pixFmt: 'yuv420p',
      videoArgs: [
        '-c:v',
        'h264_nvenc',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        speed === 'slow' ? 'p7' : speed === 'fast' ? 'p4' : 'p6',
        '-rc',
        'vbr',
        '-cq',
        String(tier.cqNvenc),
        '-b:v',
        '0',
        '-spatial_aq',
        '1',
        '-temporal_aq',
        '1',
        '-g',
        String(gop),
        ...colorFlags,
      ],
      audioArgs: ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2'],
      containerArgs: ['-movflags', '+faststart'],
    };
  }

  // Default: libx264 High Quality CRF
  return {
    pixFmt: 'yuv420p',
    videoArgs: [
      '-c:v',
      'libx264',
      '-profile:v',
      'high',
      '-level:v',
      h264Level,
      '-pix_fmt',
      'yuv420p',
      '-preset',
      speed,
      '-crf',
      String(tier.crf264),
      '-g',
      String(gop),
      '-bf',
      '2',
      ...colorFlags,
    ],
    audioArgs: ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2'],
    containerArgs: ['-movflags', '+faststart'],
  };
}

/**
 * Computes appropriate target bitrates for WebCodecs hardware/software fallback
 * scaled smoothly by resolution pixel area, frame rate, and quality tier.
 */
export function computeWebCodecsTargetBitrate(
  width: number,
  height: number,
  fps: number,
  qualityTier: QualityTier,
): number {
  const pixelRatio = (width * height) / (1920 * 1080);
  const fpsFactor = fps >= 50 ? 1.45 : fps <= 25 ? 0.85 : 1.0;
  const base1080p = 18_000_000;
  const scaled = base1080p * Math.max(0.45, pixelRatio) * fpsFactor * QUALITY_TIER_META[qualityTier].bitrateMult;
  return Math.max(6_000_000, Math.min(95_000_000, Math.round(scaled)));
}

export function replaceFileExtension(fileName: string, ext: 'mp4' | 'mov'): string {
  const clean = fileName.trim() || 'Winecut_Export';
  if (/\.(mp4|mov|mkv|webm)$/i.test(clean)) {
    return clean.replace(/\.(mp4|mov|mkv|webm)$/i, `.${ext}`);
  }
  return `${clean}.${ext}`;
}
