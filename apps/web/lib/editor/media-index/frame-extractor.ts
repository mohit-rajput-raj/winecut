const MAX_CACHED_FRAMES = 220;
const frameCache = new Map<string, HTMLCanvasElement>();
const assetListeners = new Map<string, Set<() => void>>();

interface SeekJob {
  key: string;
  timeSec: number;
}

interface AssetWorkerState {
  url: string;
  video: HTMLVideoElement;
  queue: SeekJob[];
  queuedKeys: Set<string>;
  running: boolean;
  ready: boolean;
}

const assetWorkers = new Map<string, AssetWorkerState>();

function notifyFrameReady(assetId: string): void {
  const subs = assetListeners.get(assetId);
  if (!subs) return;
  for (const cb of subs) cb();
}

export function subscribeFilmstrip(assetId: string, cb: () => void): () => void {
  let subs = assetListeners.get(assetId);
  if (!subs) {
    subs = new Set();
    assetListeners.set(assetId, subs);
  }
  subs.add(cb);
  return () => {
    subs?.delete(cb);
  };
}

export function getFrameBucketMs(zoomLevel: number): number {
  if (zoomLevel >= 3.0) return 80;
  if (zoomLevel >= 1.5) return 150;
  if (zoomLevel >= 0.75) return 250;
  return 500;
}

export function buildFrameCacheKey(assetId: string, timeSec: number, bucketMs: number): string {
  const ms = Math.max(0, Math.round((timeSec * 1000) / bucketMs) * bucketMs);
  return `${assetId}__${ms}`;
}

export function getCachedVideoFrame(
  assetId: string,
  timeSec: number,
  bucketMs: number,
): HTMLCanvasElement | undefined {
  const key = buildFrameCacheKey(assetId, timeSec, bucketMs);
  const hit = frameCache.get(key);
  if (hit) {
    // Refresh LRU order
    frameCache.delete(key);
    frameCache.set(key, hit);
    return hit;
  }
  return undefined;
}

/**
 * Finds the nearest cached frame if an exact timestamp bucket isn't decoded yet so strips never flash blank.
 */
export function getNearestCachedFrame(
  assetId: string,
  timeSec: number,
): HTMLCanvasElement | undefined {
  const prefix = `${assetId}__`;
  const targetMs = timeSec * 1000;
  let bestCanvas: HTMLCanvasElement | undefined;
  let bestDist = Infinity;

  for (const [k, canvas] of frameCache.entries()) {
    if (!k.startsWith(prefix)) continue;
    const ms = Number(k.slice(prefix.length));
    if (!Number.isFinite(ms)) continue;
    const dist = Math.abs(ms - targetMs);
    if (dist < bestDist) {
      bestDist = dist;
      bestCanvas = canvas;
    }
  }
  return bestCanvas;
}

function insertFrameIntoCache(key: string, canvas: HTMLCanvasElement): void {
  if (frameCache.has(key)) frameCache.delete(key);
  frameCache.set(key, canvas);
  while (frameCache.size > MAX_CACHED_FRAMES) {
    const oldest = frameCache.keys().next().value;
    if (oldest !== undefined) frameCache.delete(oldest);
    else break;
  }
}

function getOrCreateWorker(assetId: string, url: string): AssetWorkerState | null {
  if (typeof document === 'undefined') return null;
  let worker = assetWorkers.get(assetId);
  if (worker && worker.url === url) return worker;

  const video = document.createElement('video');
  video.src = url;
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';

  worker = {
    url,
    video,
    queue: [],
    queuedKeys: new Set(),
    running: false,
    ready: false,
  };
  assetWorkers.set(assetId, worker);
  return worker;
}

function seekSingleFrame(video: HTMLVideoElement, targetTime: number): Promise<void> {
  return new Promise((resolve) => {
    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : targetTime + 1;
    const clamped = Math.max(0, Math.min(Math.max(0, dur - 0.02), targetTime));

    if (video.readyState >= 2 && Math.abs(video.currentTime - clamped) < 0.03) {
      resolve();
      return;
    }

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', done);
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(done, 450);
    video.addEventListener('seeked', done, { once: true });
    video.addEventListener('error', done, { once: true });

    try {
      video.currentTime = clamped;
    } catch {
      done();
    }
  });
}

async function processWorkerQueue(assetId: string, worker: AssetWorkerState): Promise<void> {
  if (worker.running) return;
  worker.running = true;

  try {
    if (!worker.ready && worker.video.readyState < 1) {
      await new Promise<void>((resolve) => {
        const finish = () => {
          worker.video.removeEventListener('loadeddata', finish);
          worker.video.removeEventListener('error', finish);
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(finish, 1800);
        worker.video.addEventListener('loadeddata', finish, { once: true });
        worker.video.addEventListener('error', finish, { once: true });
      });
      worker.ready = true;
    }

    while (worker.queue.length > 0) {
      const job = worker.queue.shift()!;
      worker.queuedKeys.delete(job.key);

      if (frameCache.has(job.key)) continue;

      await seekSingleFrame(worker.video, job.timeSec);
      const vw = worker.video.videoWidth;
      const vh = worker.video.videoHeight;
      if (vw > 0 && vh > 0) {
        const thumbW = 112;
        const thumbH = Math.max(36, Math.round((thumbW * vh) / vw));
        const off = document.createElement('canvas');
        off.width = thumbW;
        off.height = thumbH;
        const ctx = off.getContext('2d');
        if (ctx) {
          ctx.drawImage(worker.video, 0, 0, thumbW, thumbH);
          insertFrameIntoCache(job.key, off);
        }
      }
      // Yield cleanly between seeks so timeline playback stays silky
      if (worker.queue.length % 3 === 0) {
        notifyFrameReady(assetId);
        await new Promise((r) => setTimeout(r, 12));
      }
    }
    notifyFrameReady(assetId);
  } finally {
    worker.running = false;
  }
}

export function queueVideoFrames(
  assetId: string,
  url: string,
  timesSec: number[],
  bucketMs: number,
): void {
  if (!assetId || !url || timesSec.length === 0) return;
  const worker = getOrCreateWorker(assetId, url);
  if (!worker) return;

  let added = false;
  // Cap pending queue per asset to avoid lagging far behind rapid zoom gestures
  if (worker.queue.length > 48) {
    worker.queue.splice(0, worker.queue.length - 16);
    worker.queuedKeys.clear();
    for (const q of worker.queue) worker.queuedKeys.add(q.key);
  }

  for (const t of timesSec) {
    const key = buildFrameCacheKey(assetId, t, bucketMs);
    if (frameCache.has(key) || worker.queuedKeys.has(key)) continue;
    const ms = Math.max(0, Math.round((t * 1000) / bucketMs) * bucketMs);
    worker.queue.push({ key, timeSec: ms / 1000 });
    worker.queuedKeys.add(key);
    added = true;
  }

  if (added && !worker.running) {
    void processWorkerQueue(assetId, worker);
  }
}
