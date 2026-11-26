export interface WaveformPeakData {
  assetId: string;
  sampleRatePerSec: number;
  duration: number;
  peaks: Float32Array;
}

const peakCache = new Map<string, WaveformPeakData>();
const inflight = new Map<string, Promise<WaveformPeakData | null>>();
const listeners = new Map<string, Set<() => void>>();

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

function notifyAsset(assetId: string): void {
  const subs = listeners.get(assetId);
  if (!subs) return;
  for (const cb of subs) cb();
}

export function subscribeWaveform(assetId: string, cb: () => void): () => void {
  let subs = listeners.get(assetId);
  if (!subs) {
    subs = new Set();
    listeners.set(assetId, subs);
  }
  subs.add(cb);
  return () => {
    subs?.delete(cb);
  };
}

export function getCachedWaveform(assetId: string): WaveformPeakData | undefined {
  return peakCache.get(assetId);
}

/**
 * Decodes genuine audio channel PCM amplitudes into a compact 120Hz peak envelope per assetId.
 */
export async function requestAssetWaveform(
  assetId: string,
  url: string,
): Promise<WaveformPeakData | null> {
  if (!assetId || !url) return null;
  const cached = peakCache.get(assetId);
  if (cached) return cached;

  const existing = inflight.get(assetId);
  if (existing) return existing;

  const task = (async (): Promise<WaveformPeakData | null> => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return null;

      const resp = await fetch(url);
      if (!resp.ok) return null;
      // Guard WebView RAM on unusually giant local video assets (> 120 MB)
      const clHeader = Number(resp.headers.get('content-length') || 0);
      if (clHeader > 120 * 1024 * 1024) return null;
      const buf = await resp.arrayBuffer();
      if (buf.byteLength > 120 * 1024 * 1024) return null;

      const audioBuf = await ctx.decodeAudioData(buf);
      const duration = Math.max(0.1, audioBuf.duration);
      const sampleRatePerSec = 120;
      const bucketCount = Math.max(12, Math.ceil(duration * sampleRatePerSec));
      const peaks = new Float32Array(bucketCount);

      const channels: Float32Array[] = [];
      for (let ch = 0; ch < Math.min(2, audioBuf.numberOfChannels); ch++) {
        channels.push(audioBuf.getChannelData(ch));
      }

      const samplesPerBucket = Math.max(1, Math.floor(audioBuf.length / bucketCount));
      let globalMax = 0.001;

      for (let b = 0; b < bucketCount; b++) {
        const start = b * samplesPerBucket;
        const end = Math.min(audioBuf.length, start + samplesPerBucket);
        const stride = Math.max(1, Math.floor((end - start) / 16));
        let maxAbs = 0;
        let sumSq = 0;
        let count = 0;

        for (let i = start; i < end; i += stride) {
          let mono = 0;
          for (let ch = 0; ch < channels.length; ch++) {
            mono += Math.abs(channels[ch]![i] ?? 0);
          }
          mono /= Math.max(1, channels.length);
          if (mono > maxAbs) maxAbs = mono;
          sumSq += mono * mono;
          count++;
        }

        const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
        // Blend RMS and transient peak for authentic musical + speech readability
        const combined = rms * 0.55 + maxAbs * 0.45;
        peaks[b] = combined;
        if (combined > globalMax) globalMax = combined;
      }

      // Gentle normalization keeping quiet pauses visibly quieter than loud speech
      const normFactor = globalMax > 0.05 ? 1 / globalMax : 1;
      for (let b = 0; b < bucketCount; b++) {
        peaks[b] = Math.min(1, peaks[b]! * normFactor);
      }

      const data: WaveformPeakData = {
        assetId,
        sampleRatePerSec,
        duration,
        peaks,
      };
      peakCache.set(assetId, data);
      notifyAsset(assetId);
      return data;
    } catch {
      return null;
    } finally {
      inflight.delete(assetId);
    }
  })();

  inflight.set(assetId, task);
  return task;
}

/**
 * Samples the peak amplitude within an exact [startSec, endSec] range of the audio asset.
 */
export function sampleWaveformRange(
  data: WaveformPeakData,
  startSec: number,
  endSec: number,
): number {
  const len = data.peaks.length;
  if (len === 0) return 0;
  const idx0 = Math.max(0, Math.min(len - 1, Math.floor(startSec * data.sampleRatePerSec)));
  const idx1 = Math.max(idx0, Math.min(len - 1, Math.ceil(endSec * data.sampleRatePerSec)));
  let peak = 0;
  for (let i = idx0; i <= idx1; i++) {
    const val = data.peaks[i] ?? 0;
    if (val > peak) peak = val;
  }
  return peak;
}
