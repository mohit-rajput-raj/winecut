'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, ExternalLink, Film, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import {
  fetchLatestRelease,
  filterInstallerAssets,
  formatBytes,
  getPlatformLabel,
  RELEASES_URL,
  type GitHubRelease,
} from '../../lib/releases';

export function DownloadDirectory() {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    void fetchLatestRelease(controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      if (data) {
        setRelease(data);
        setStatus('ready');
      } else {
        setStatus('unavailable');
      }
    });
    return () => controller.abort();
  }, []);

  const installerAssets = release ? filterInstallerAssets(release.assets) : [];

  return (
    <div className="h-screen w-screen overflow-y-auto overflow-x-hidden select-text bg-[#0b0c10] text-zinc-100 custom-scrollbar">
      <header className="sticky top-0 z-30 bg-[#0b0c10]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md bg-[#151821] px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-[#1e2330] hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Home</span>
            </Link>
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-[#181b24] text-teal-400">
                <Film className="h-3.5 w-3.5" />
              </div>
              <span className="text-sm font-semibold tracking-tight text-zinc-100">
                Winecut
              </span>
            </div>
          </div>

          <Link
            href="/studio"
            className="inline-flex h-8 items-center rounded-md bg-[#151821] px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-[#1e2330] hover:text-white"
          >
            Open Web Studio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
            {release ? `Download ${release.name || release.tag_name}` : 'Download Winecut'}
          </h1>
          <p className="text-sm text-zinc-400">
            {release
              ? `Published ${new Date(release.published_at).toLocaleDateString()} · Direct installers for Windows, macOS, and Linux.`
              : 'Direct desktop installer packages for Windows, macOS, and Linux.'}
          </p>
        </div>

        {status === 'loading' && (
          <div className="flex items-center gap-2.5 rounded-xl bg-[#12151c] p-6 text-xs text-zinc-400">
            <RefreshCw className="h-4 w-4 animate-spin text-teal-400" />
            <span>Loading latest installer packages...</span>
          </div>
        )}

        {status === 'ready' && installerAssets.length > 0 && (
          <div className="space-y-2">
            {installerAssets.map((asset) => (
              <div
                key={asset.id}
                className="flex flex-col gap-3 rounded-xl bg-[#12151c] p-4 transition-colors hover:bg-[#171b24] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-zinc-100">
                    {getPlatformLabel(asset.name)}
                  </p>
                  <p className="truncate font-mono text-xs text-zinc-500">{asset.name}</p>
                </div>

                <div className="flex shrink-0 items-center gap-4">
                  <span className="font-mono text-xs text-zinc-400">
                    {formatBytes(asset.size)}
                  </span>
                  <Button
                    asChild
                    size="sm"
                    className="h-8 gap-1.5 bg-zinc-100 px-3.5 text-xs font-semibold text-zinc-950 hover:bg-white"
                  >
                    <a href={asset.browser_download_url}>
                      <Download className="h-3.5 w-3.5" />
                      <span>Download</span>
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {(status === 'unavailable' || (status === 'ready' && installerAssets.length === 0)) && (
          <div className="flex flex-col items-start justify-between gap-4 rounded-xl bg-[#12151c] p-6 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <p className="text-sm font-medium text-zinc-100">
                Release packages are not published yet or the GitHub API is temporarily unavailable.
              </p>
              <p className="text-xs text-zinc-400">
                Open GitHub Releases directly to view all published builds and release notes.
              </p>
            </div>
            <Button
              asChild
              size="sm"
              className="h-9 shrink-0 gap-1.5 bg-zinc-100 px-4 text-xs font-semibold text-zinc-950 hover:bg-white"
            >
              <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
                <span>View GitHub Releases</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
