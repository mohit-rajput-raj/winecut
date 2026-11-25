'use client';

import { invoke } from '@tauri-apps/api/core';
import { AppSettings, EditorProject } from '../editor/types';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  cachePath: 'D:\\Editor\\cache',
  downloadsPath: 'D:\\Editor\\downloads',
  defaultResolution: '720p',
  defaultFps: 30,
  hardwareAcceleration: 'auto',
  autoSaveIntervalMs: 1200,
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  autoCaptionEngine: 'whisper-local',
  authUser: {
    isSignedIn: false,
    name: 'Local Creator',
    email: 'creator@cinecraft.local',
    plan: 'Studio Free',
    provider: 'guest',
  },
};

const LOCAL_SETTINGS_KEY = 'cinecraft_app_settings_v2';
const LOCAL_PROJECTS_KEY = 'cinecraft_projects_v2';
const IDB_NAME = 'CineCraftMediaCacheDB';
const IDB_STORE = 'media_blobs';

export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window
  );
}

function encodePathHex(filePath: string): string {
  const bytes = new TextEncoder().encode(filePath);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeJoin(base: string, ...parts: string[]): string {
  const cleanBase = (base || '').replace(/[\\/]+$/, '');
  const cleanParts = parts.map((p) => p.replace(/^[\\/]+|[\\/]+$/g, '')).filter(Boolean);
  return [cleanBase, ...cleanParts].join('\\');
}

// ---------- IndexedDB Browser Fallback for Media Caching ----------
function openMediaIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPutBlob(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openMediaIDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IDB errors silently
  }
}

async function idbGetBlob(key: string): Promise<Blob | null> {
  try {
    const db = await openMediaIDB();
    return await new Promise<Blob | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as Blob) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbDeleteBlob(key: string): Promise<void> {
  try {
    const db = await openMediaIDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

// ---------- Settings Persistence ----------
export async function loadAppSettings(): Promise<AppSettings> {
  let settings = { ...DEFAULT_APP_SETTINGS };

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        settings = {
          ...DEFAULT_APP_SETTINGS,
          ...parsed,
          authUser: { ...DEFAULT_APP_SETTINGS.authUser, ...(parsed.authUser || {}) },
        };
      }
    } catch {}
  }

  if (isTauriRuntime()) {
    try {
      const settingsFile = normalizeJoin(settings.cachePath, 'settings.json');
      const diskRaw = await invoke<string>('read_text_file', { path: settingsFile });
      if (diskRaw) {
        const parsed = JSON.parse(diskRaw);
        settings = {
          ...DEFAULT_APP_SETTINGS,
          ...parsed,
          authUser: { ...DEFAULT_APP_SETTINGS.authUser, ...(parsed.authUser || {}) },
        };
        localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
      }
    } catch {
      // First run: persist initial defaults to cachePath\settings.json
      await saveAppSettings(settings).catch(() => {});
    }
  }

  return settings;
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
  }

  if (isTauriRuntime()) {
    try {
      await invoke('ensure_directory', { path: settings.cachePath });
      await invoke('ensure_directory', { path: settings.downloadsPath });
      await invoke('ensure_directory', { path: normalizeJoin(settings.cachePath, 'projects') });
      await invoke('ensure_directory', { path: normalizeJoin(settings.cachePath, 'media') });

      const settingsFile = normalizeJoin(settings.cachePath, 'settings.json');
      await invoke('write_text_file', {
        path: settingsFile,
        content: JSON.stringify(settings, null, 2),
      });
    } catch (err) {
      console.warn('Failed to write settings to disk:', err);
    }
  }
}

// ---------- Binary Writing via Tauri Raw IPC ----------
export async function writeBinaryToDisk(targetPath: string, blobOrBytes: Blob | Uint8Array): Promise<string> {
  const uint8 =
    blobOrBytes instanceof Uint8Array
      ? blobOrBytes
      : new Uint8Array(await blobOrBytes.arrayBuffer());

  try {
    const saved = await invoke<string>('save_raw_binary_file', uint8, {
      headers: {
        'x-path-hex': encodePathHex(targetPath),
      },
    });
    return saved || targetPath;
  } catch (rawErr) {
    console.warn('Raw binary IPC failed, falling back to standard save_video_file:', rawErr);
    const arr = Array.from(uint8);
    const saved = await invoke<string>('save_video_file', {
      path: targetPath,
      data: arr,
    });
    return saved || targetPath;
  }
}

// ---------- Media Cache Persistence (D:\Editor\cache\media\<projectId>\...) ----------
export async function cacheMediaFile(
  cachePath: string,
  projectId: string,
  assetId: string,
  fileName: string,
  blob: Blob
): Promise<string | undefined> {
  // Always persist in IndexedDB as quick local cache fallback
  await idbPutBlob(assetId, blob);

  if (isTauriRuntime()) {
    try {
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const mediaPath = normalizeJoin(cachePath, 'media', projectId, `${assetId}_${safeName}`);
      await writeBinaryToDisk(mediaPath, blob);
      return mediaPath;
    } catch (err) {
      console.warn('Failed to cache media asset to disk:', err);
    }
  }
  return undefined;
}

export async function rehydrateProjectMedia(project: EditorProject): Promise<EditorProject> {
  if (!project.mediaLibrary || project.mediaLibrary.length === 0) {
    return project;
  }

  const hydratedAssets = await Promise.all(
    project.mediaLibrary.map(async (asset) => {
      // Try Tauri disk cache first if cachedFilePath exists
      if (isTauriRuntime() && asset.cachedFilePath) {
        try {
          const responseBytes = await invoke<ArrayBuffer>('read_raw_binary_file', {
            path: asset.cachedFilePath,
          });
          if (responseBytes && (responseBytes as ArrayBuffer).byteLength > 0) {
            const mime =
              asset.mimeType ||
              (asset.type === 'video'
                ? 'video/mp4'
                : asset.type === 'audio'
                ? 'audio/mpeg'
                : 'image/png');
            const blob = new Blob([responseBytes], { type: mime });
            const freshUrl = URL.createObjectURL(blob);
            return {
              ...asset,
              url: freshUrl,
              thumbnailUrl: asset.type === 'image' ? freshUrl : asset.thumbnailUrl,
            };
          }
        } catch (err) {
          console.warn(`Disk cache read failed for ${asset.cachedFilePath}, trying IDB:`, err);
        }
      }

      // Fallback to IndexedDB cache
      const idbBlob = await idbGetBlob(asset.id);
      if (idbBlob) {
        const freshUrl = URL.createObjectURL(idbBlob);
        return {
          ...asset,
          url: freshUrl,
          thumbnailUrl: asset.type === 'image' ? freshUrl : asset.thumbnailUrl,
        };
      }

      return asset;
    })
  );

  return {
    ...project,
    mediaLibrary: hydratedAssets,
  };
}

// ---------- Single JSON Project Persistence ----------
function serializeProjectForDisk(project: EditorProject): EditorProject {
  // Keep every clip, track, adjustment, transform, effect, framerSettings, and cachedFilePath!
  // Note: Do not strip anything except ephemeral object blob URLs aren't valid across restarts;
  // rehydrateProjectMedia restores fresh blob URLs from cachedFilePath / IDB cleanly.
  return {
    ...project,
    updatedAt: new Date().toISOString(),
  };
}

export async function saveProjectJson(cachePath: string, project: EditorProject): Promise<void> {
  const snapshot = serializeProjectForDisk(project);
  const jsonText = JSON.stringify(snapshot, null, 2);

  // Update localStorage cache list
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_PROJECTS_KEY);
      const map: Record<string, EditorProject> = raw ? JSON.parse(raw) : {};
      map[snapshot.id] = snapshot;
      localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(map));
    } catch {
      // Storage quota warning: trim inline thumbnails if localStorage exceeds 5MB
      try {
        const raw = localStorage.getItem(LOCAL_PROJECTS_KEY);
        const map: Record<string, EditorProject> = raw ? JSON.parse(raw) : {};
        map[snapshot.id] = {
          ...snapshot,
          mediaLibrary: snapshot.mediaLibrary.map((a) => ({ ...a, thumbnailUrl: undefined })),
        };
        localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(map));
      } catch {}
    }
  }

  // Persist to D:\Editor\cache\projects\<projectId>.json in Tauri desktop
  if (isTauriRuntime()) {
    try {
      const jsonPath = normalizeJoin(cachePath, 'projects', `${snapshot.id}.json`);
      await invoke('write_text_file', {
        path: jsonPath,
        content: jsonText,
      });
    } catch (err) {
      console.error('Failed to save project JSON to disk:', err);
    }
  }
}

export async function loadAllSavedProjects(cachePath: string): Promise<EditorProject[]> {
  const byId = new Map<string, EditorProject>();

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_PROJECTS_KEY);
      if (raw) {
        const map: Record<string, EditorProject> = JSON.parse(raw);
        for (const p of Object.values(map)) {
          if (p?.id) byId.set(p.id, p);
        }
      }
    } catch {}
  }

  if (isTauriRuntime()) {
    try {
      const jsonStrings = await invoke<string[]>('list_cached_projects', {
        cacheDir: cachePath,
      });
      for (const str of jsonStrings) {
        try {
          const parsed = JSON.parse(str) as EditorProject;
          if (parsed?.id) {
            const existing = byId.get(parsed.id);
            if (!existing || new Date(parsed.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
              byId.set(parsed.id, parsed);
            }
          }
        } catch {}
      }
    } catch (err) {
      console.warn('Could not list cached projects from disk:', err);
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function deleteSavedProject(cachePath: string, project: EditorProject): Promise<void> {
  for (const asset of project.mediaLibrary || []) {
    await idbDeleteBlob(asset.id);
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_PROJECTS_KEY);
      if (raw) {
        const map: Record<string, EditorProject> = JSON.parse(raw);
        delete map[project.id];
        localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(map));
      }
    } catch {}
  }

  if (isTauriRuntime()) {
    try {
      await invoke('delete_cached_project', {
        cacheDir: cachePath,
        projectId: project.id,
      });
    } catch (err) {
      console.warn('Failed to delete project from disk cache:', err);
    }
  }
}

// ---------- Export File Saving + FFmpeg Pipeline ----------
export interface ExportSaveResult {
  savedPath: string;
  savedToDisk: boolean;
  usedFfmpeg: boolean;
  ffmpegCommand: string;
  ffmpegError?: string;
}

export async function saveExportedVideoToDisk({
  fullSavePath,
  saveFolderPath,
  renderedBlob,
  mimeType,
  fps,
}: {
  fullSavePath: string;
  saveFolderPath: string;
  renderedBlob: Blob;
  mimeType: string;
  fps: number;
}): Promise<ExportSaveResult> {
  const isMp4Source = mimeType.toLowerCase().includes('mp4');
  const tempExt = isMp4Source ? 'mp4' : 'webm';
  const tempFileName = `__cinecraft_temp_${Date.now()}.${tempExt}`;
  const tempPath = normalizeJoin(saveFolderPath, tempFileName);

  const cmdPreview = `ffmpeg -y -i "${tempPath}" -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 20 -r ${fps} -c:a aac -b:a 192k -movflags +faststart "${fullSavePath}"`;

  if (!isTauriRuntime()) {
    return {
      savedPath: fullSavePath,
      savedToDisk: false,
      usedFfmpeg: false,
      ffmpegCommand: cmdPreview,
      ffmpegError: 'Not running in Tauri desktop runtime; downloaded via browser instead.',
    };
  }

  await invoke('ensure_directory', { path: saveFolderPath });

  // Write the rendered composite blob directly via binary IPC
  await writeBinaryToDisk(tempPath, renderedBlob);

  // Run FFmpeg transcode into crisp H.264 MP4 at fullSavePath
  const ffmpegArgs = [
    '-y',
    '-i', tempPath,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    '-crf', '20',
    '-r', String(fps),
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    fullSavePath,
  ];

  try {
    await invoke('run_ffmpeg_export', { args: ffmpegArgs });
    await invoke('delete_temp_file', { path: tempPath }).catch(() => {});
    return {
      savedPath: fullSavePath,
      savedToDisk: true,
      usedFfmpeg: true,
      ffmpegCommand: cmdPreview,
    };
  } catch (ffErr: any) {
    // Fallback: save rendered blob directly as final file if FFmpeg transcode fails
    const errMsg = ffErr?.message || String(ffErr);
    await writeBinaryToDisk(fullSavePath, renderedBlob);
    await invoke('delete_temp_file', { path: tempPath }).catch(() => {});
    return {
      savedPath: fullSavePath,
      savedToDisk: true,
      usedFfmpeg: false,
      ffmpegCommand: cmdPreview,
      ffmpegError: errMsg,
    };
  }
}

export async function openPathInExplorer(path: string): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke('open_in_explorer', { path });
  } catch (err) {
    console.warn('Could not open Explorer:', err);
  }
}

export async function fetchCacheStats(cachePath: string): Promise<{ bytes: number; files: number }> {
  if (!isTauriRuntime()) return { bytes: 0, files: 0 };
  try {
    return await invoke<{ bytes: number; files: number }>('get_cache_stats', {
      cacheDir: cachePath,
    });
  } catch {
    return { bytes: 0, files: 0 };
  }
}
