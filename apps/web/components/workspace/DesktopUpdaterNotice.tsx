'use client';

import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { isTauriRuntime } from '../../lib/workspace/storage';

interface AvailableUpdate {
  version: string;
  body?: string;
  downloadAndInstall: () => Promise<void>;
}

/**
 * Checks GitHub Releases (latest.json) on desktop startup and displays a compact
 * toast notification only when a newer signed build is available.
 */
export function DesktopUpdaterNotice() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const found = await check();
        if (!cancelled && found?.available) {
          setUpdate({
            version: found.version,
            body: found.body || undefined,
            downloadAndInstall: () => found.downloadAndInstall(),
          });
        }
      } catch {
        // Silent no-op when offline or before first GitHub release is published
      }
    }, 2200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!update || dismissed) return null;

  const handleInstall = async () => {
    setInstalling(true);
    setErrorMsg(null);
    try {
      await update.downloadAndInstall();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (err: unknown) {
      setInstalling(false);
      setErrorMsg(err instanceof Error ? err.message : 'Could not install update.');
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[90] w-80 rounded-lg bg-[#161922] p-3.5 text-xs text-zinc-100 shadow-2xl shadow-black/70 select-text"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="font-semibold text-zinc-100">
            Update available: v{update.version}
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Install the signed release package and restart CineCraft Studio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss update notice"
          className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {errorMsg && (
        <p className="mt-2 text-[11px] text-rose-400">{errorMsg}</p>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          disabled={installing}
          className="rounded px-2.5 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
        >
          Later
        </button>
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing}
          className="inline-flex items-center gap-1.5 rounded bg-zinc-100 px-3 py-1 text-[11px] font-semibold text-zinc-950 hover:bg-white disabled:opacity-60 cursor-pointer"
        >
          {installing ? (
            <>
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>Installing...</span>
            </>
          ) : (
            <>
              <Download className="h-3 w-3" />
              <span>Install &amp; Restart</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
