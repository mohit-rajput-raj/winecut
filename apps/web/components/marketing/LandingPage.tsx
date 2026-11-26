'use client';

import { Hero35 } from '../watermelon/hero-35';
import { Testimonials3 } from '../watermelon/testimonials-3';
import { Footer16 } from '../watermelon/footer-16';
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  Film,
  Download,
  Scissors,
  Sliders,
  Layers,
  Clock,
  RefreshCw,
  ArrowUpRight,
  Check,
  Monitor,
  Apple,
  Terminal,
  Volume2,
  Type,
  Magnet,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  formatBytes,
  fetchLatestRelease,
  filterInstallerAssets,
  groupInstallerAssetsByOS,
  RELEASES_URL,
  REPO_URL,
  type GitHubRelease,
  type TargetOS,
} from '../../lib/releases';

type ShowcaseToolId = 'timeline' | 'framer' | 'color' | 'export';

const PHOTOS = {
  heroStudio: 'https://images.unsplash.com/photo-1600353068440-6361ef3a86e8?auto=format&fit=crop&w=1600&q=85',
  productionSet: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=1400&q=85',
  podcastMics: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=1400&q=85',
  audioMixer: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=1400&q=85',
  liveStage: 'https://images.unsplash.com/photo-1618609377864-68609b857e90?auto=format&fit=crop&w=1400&q=85',
  cameraRig: 'https://images.unsplash.com/photo-1541516160071-4bb0c5af65ba?auto=format&fit=crop&w=1400&q=85',
};

const TOOL_TABS: Array<{
  id: ShowcaseToolId;
  label: string;
  headline: string;
  summary: string;
  image: string;
  imageAlt: string;
  points: string[];
}> = [
  {
    id: 'timeline',
    label: 'Timeline',
    headline: 'Edit video, audio, and captions on a millisecond ruler.',
    summary:
      'Zoom up to 1200% to inspect 20ms subdivisions, snap clips flush edge-to-edge without overlaps, and separate camera audio onto its own track.',
    image: PHOTOS.heroStudio,
    imageAlt: 'Video editing monitor displaying a dark post-production workspace',
    points: [
      'Zoom from whole-project overview down to 100ms major / 20ms minor ticks.',
      'Drag clips horizontally or vertically across tracks, or click Pack to close track gaps.',
      'Commit drags and slider changes on release so Ctrl+Z / Ctrl+Y undo one action at a time.',
    ],
  },
  {
    id: 'framer',
    label: 'Clip Framer',
    headline: 'Crop horizontal interviews into vertical 9:16 splits.',
    summary:
      'Position Top Speaker and Bottom Speaker crop boxes directly over 16:9 footage, preview the 9:16 stack in real time, and push both layers to the main editor.',
    image: PHOTOS.podcastMics,
    imageAlt: 'Dual broadcast microphones in a podcast recording room',
    points: [
      'Adjust top/bottom crop coordinates, split ratio, and divider thickness.',
      'Choose Dual Podcast Left/Right or Gameplay + Facecam presets in one click.',
      'Transfer framed speakers onto stacked Video and Overlay tracks for captioning.',
    ],
  },
  {
    id: 'color',
    label: 'Monitor & Color',
    headline: 'Align layers with guides and grade every frame.',
    summary:
      'Select overlays directly in the monitor, snap to canvas centers and sibling edges with pixel distance readouts, and tune Gaussian blur and color wheels.',
    image: PHOTOS.productionSet,
    imageAlt: 'Cinema production slate and camera setup on set',
    points: [
      'Adjust clip scale, rotation, X/Y offset, corner radius, border stroke, and drop shadow.',
      'Control Exposure, Contrast, Saturation, Temperature, Hue, Sepia, B&W, Invert, and Blur.',
      'Arrange multiple active layers into a padded grid layout automatically.',
    ],
  },
  {
    id: 'export',
    label: 'Export Engine',
    headline: 'Render constant-frame-rate MP4 files locally.',
    summary:
      'Desktop installs drive FFmpeg directly with H.264 and AAC audio. Browser sessions encode fixed-timestamp MP4 files client-side via WebCodecs.',
    image: PHOTOS.audioMixer,
    imageAlt: 'Studio audio console with hardware mixing faders',
    points: [
      'Output 720p, 1080p, or 4K at constant 30fps or 60fps in yuv420p BT.709.',
      'Choose your download destination folder on disk inside Export or Settings.',
      'No cloud upload queue — your footage stays on your machine from import to MP4.',
    ],
  },
];

const OS_PACKAGES: Record<
  TargetOS,
  {
    name: string;
    subtitle: string;
    primaryFormat: string;
    secondaryFormat: string;
    arch: string;
    actionLabel: string;
    note: string;
  }
> = {
  windows: {
    name: 'Windows',
    subtitle: 'Windows 10 & 11',
    primaryFormat: '.exe (NSIS Installer)',
    secondaryFormat: '.msi package included',
    arch: 'x64 (64-bit)',
    actionLabel: 'Download for Windows',
    note: 'Saves projects locally under D:\\Editor or your Windows Videos folder.',
  },
  macos: {
    name: 'macOS',
    subtitle: 'macOS 12 Monterey or later',
    primaryFormat: '.dmg Universal Disk Image',
    secondaryFormat: 'Signed updater archive (.app.tar.gz)',
    arch: 'Apple Silicon & Intel',
    actionLabel: 'Download for macOS',
    note: 'Stores cache in ~/Library/Caches/Winecut and exports in ~/Movies/Winecut.',
  },
  linux: {
    name: 'Linux',
    subtitle: 'Ubuntu, Debian, Fedora, Arch',
    primaryFormat: '.AppImage (Portable)',
    secondaryFormat: '.deb package included',
    arch: 'x86_64',
    actionLabel: 'Download for Linux',
    note: 'Make the .AppImage executable or install the .deb package with apt.',
  },
};

const WORKFLOW_CARDS = [
  {
    title: 'Split Interviews into Vertical Clips',
    description:
      'Select two speakers from one wide recording and stack them inside a 9:16 vertical frame with a configurable center divider.',
    meta: 'Clip Framer · 9:16 Export',
    image: PHOTOS.podcastMics,
    alt: 'Studio podcast microphones prepared for two speakers',
  },
  {
    title: 'Separate & Mix Speech Audio',
    description:
      'Extract audio from any video clip onto a dedicated audio lane, shift timing independently, trim fades, and boost channel gain up to 200%.',
    meta: 'Audio Track · Waveform View',
    image: PHOTOS.audioMixer,
    alt: 'Hardware audio mixer console in a studio',
  },
  {
    title: 'Stack Overlays, Images & Captions',
    description:
      'Layer picture-in-picture videos, rounded image cards with border strokes, and timed text captions in one unified monitor.',
    meta: 'Overlay Tracks · Smart Guides',
    image: PHOTOS.liveStage,
    alt: 'Concert stage production camera framing live performance',
  },
];

const emptySubscribe = () => () => {};

function detectBrowserOS(): TargetOS {
  const ua = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('linux') && !ua.includes('android')) return 'linux';
  return 'windows';
}

export function LandingPage() {
  const autoOS = useSyncExternalStore(emptySubscribe, detectBrowserOS, () => 'windows' as TargetOS);
  const [manualOS, setManualOS] = useState<TargetOS | null>(null);
  const detectedOS = manualOS ?? autoOS;
  const [selectedTool, setSelectedTool] = useState<ShowcaseToolId>('timeline');
  const [latestRelease, setLatestRelease] = useState<GitHubRelease | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchLatestRelease(controller.signal).then((release) => {
      if (release) {
        setLatestRelease(release);
      }
    });
    return () => controller.abort();
  }, []);

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const activeTool = TOOL_TABS.find((t) => t.id === selectedTool) || TOOL_TABS[0]!;
  const currentOSInfo = OS_PACKAGES[detectedOS];
  const releaseTag = latestRelease?.tag_name || 'v0.1.0';
  const installerAssets = latestRelease ? filterInstallerAssets(latestRelease.assets) : [];
  const osDownloads = groupInstallerAssetsByOS(installerAssets);
  const heroPrimaryAsset = osDownloads[detectedOS].primary;
  const heroDownloadUrl = heroPrimaryAsset?.browser_download_url || RELEASES_URL;
  const heroPackageSummary = heroPrimaryAsset
    ? `${releaseTag} · ${heroPrimaryAsset.name} · ${formatBytes(heroPrimaryAsset.size)}`
    : `${releaseTag} · ${currentOSInfo.primaryFormat} · ${currentOSInfo.arch} · Signed auto-updates`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Winecut',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Windows 10, Windows 11, macOS 12+, Linux x86_64, Web Browser',
    softwareVersion: releaseTag.replace(/^v/, ''),
    description:
      'Local-first multi-track video editor, 9:16 dual-speaker clip cutter, and constant-frame-rate MP4 exporter.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    downloadUrl: heroDownloadUrl,
  };

  return (
    <div className="h-screen w-screen overflow-y-auto overflow-x-hidden select-text bg-[#0b0c10] text-zinc-100 custom-scrollbar">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Hero35
        downloadLabel={currentOSInfo.actionLabel}
        downloadUrl={heroDownloadUrl}
        isDirectDownload={Boolean(heroPrimaryAsset)}
        packageSummary={heroPackageSummary}
        onSelectSection={scrollToSection}
      />

      <main>
        {/* Real Studio Reference Showcase */}
        <section id="features" className="mx-auto max-w-6xl px-4 pt-4 pb-16 sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#151821] px-3 py-1 font-mono text-[10px] tracking-wider text-zinc-400 uppercase">
                <span>Live Workspace Interface</span>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                Media bin, monitor guides, inspector, and millisecond timeline in one frame
              </h2>
              <p className="text-sm text-zinc-400">
                Inspect source footage on the left, align overlays with smart center guides in the monitor, adjust filters on the right, and trim tracks below.
              </p>
            </div>

            <Link
              href="/studio"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#161922] px-4 text-xs font-medium text-zinc-200 transition-colors hover:bg-[#1f2430] hover:text-white"
            >
              <span>Launch Web Studio</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-zinc-400" />
            </Link>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl bg-[#12151c] p-2 sm:p-3 shadow-[0_28px_80px_rgba(0,0,0,0.72),inset_0px_1px_0px_0px_rgba(255,255,255,0.06)]">
            <img
              src="/studio/Screenshot%202026-11-25%20190655.png"
              alt="Winecut real editor workspace showing media bin, monitor smart guides, inspector sliders, and multi-track timeline"
              loading="eager"
              className="w-full rounded-xl object-cover"
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-[#12151c] p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                <Magnet className="h-3.5 w-3.5 text-teal-400" />
                <span>Smart Monitor Guides</span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-400">
                Snap layers to Center X, Center Y, edges, and equal spacing without manual pixel math.
              </p>
            </div>

            <div className="rounded-xl bg-[#12151c] p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                <Type className="h-3.5 w-3.5 text-teal-400" />
                <span>Clickable Overlays &amp; Text</span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-400">
                Click captions or picture-in-picture videos on canvas to highlight their timeline bar and inspector.
              </p>
            </div>

            <div className="rounded-xl bg-[#12151c] p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                <Volume2 className="h-3.5 w-3.5 text-teal-400" />
                <span>Audio Track Extraction</span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-400">
                Split embedded dialogue onto an independent track with gain control and waveform preview.
              </p>
            </div>

            <div className="rounded-xl bg-[#12151c] p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-100">
                <Film className="h-3.5 w-3.5 text-teal-400" />
                <span>Single-JSON Persistence</span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-400">
                Save and reopen projects with cached footage, crop geometry, filter sliders, and Ctrl+Z history intact.
              </p>
            </div>
          </div>
        </section>

        {/* Interactive Filmora-Style Tooling Switcher */}
        <section id="tools" className="bg-[#101218] py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                  Four tools in one workspace
                </h2>
                <p className="max-w-xl text-sm text-zinc-400">
                  Select a tool to inspect what it controls in the editor.
                </p>
              </div>

              <div role="tablist" aria-label="Editor tools" className="flex flex-wrap gap-1.5 rounded-lg bg-[#0b0c10] p-1">
                {TOOL_TABS.map((tab) => {
                  const isActive = tab.id === selectedTool;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setSelectedTool(tab.id)}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#1d222d] text-zinc-50'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 items-center gap-8 rounded-2xl bg-[#161922] p-6 lg:grid-cols-12 lg:p-8">
              <div className="space-y-5 lg:col-span-5">
                <div className="inline-flex items-center gap-2 rounded bg-[#101218] px-2.5 py-1 font-mono text-[11px] text-teal-300">
                  {selectedTool === 'timeline' && <Clock className="h-3.5 w-3.5" />}
                  {selectedTool === 'framer' && <Scissors className="h-3.5 w-3.5" />}
                  {selectedTool === 'color' && <Sliders className="h-3.5 w-3.5" />}
                  {selectedTool === 'export' && <Layers className="h-3.5 w-3.5" />}
                  <span>{activeTool.label}</span>
                </div>

                <h3 className="text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">
                  {activeTool.headline}
                </h3>

                <p className="text-sm leading-relaxed text-zinc-400">
                  {activeTool.summary}
                </p>

                <ul className="space-y-2.5 pt-1">
                  {activeTool.points.map((pt) => (
                    <li key={pt} className="flex items-start gap-2.5 text-xs text-zinc-300 leading-relaxed">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>

                <div className="pt-2">
                  <Button
                    asChild
                    size="sm"
                    variant="secondary"
                    className="h-8 bg-[#222736] px-4 text-xs text-zinc-100 hover:bg-[#2a3042]"
                  >
                    <Link href="/studio">Try {activeTool.label} in Web Studio</Link>
                  </Button>
                </div>
              </div>

              <div className="lg:col-span-7">
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-[#0b0c10] shadow-xl shadow-black/50">
                  <img
                    src={activeTool.image}
                    alt={activeTool.imageAlt}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  {/* Contextual Min-UI Overlay matching active tab */}
                  {selectedTool === 'framer' && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-between gap-4 bg-black/35 p-6">
                      <div className="h-4/5 w-[44%] rounded-md bg-teal-500/15 ring-2 ring-teal-400">
                        <span className="inline-block rounded-br bg-teal-700 px-2 py-0.5 text-[10px] font-medium text-white">
                          Top Speaker
                        </span>
                      </div>
                      <div className="h-4/5 w-[44%] rounded-md bg-zinc-200/10 ring-2 ring-zinc-300">
                        <span className="inline-block rounded-br bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-white">
                          Bottom Speaker
                        </span>
                      </div>
                    </div>
                  )}
                  {selectedTool === 'color' && (
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent p-4 flex items-end justify-between">
                      <div className="inline-flex items-center gap-2 rounded bg-black/70 px-2.5 py-1 font-mono text-[10px] text-zinc-200">
                        <Magnet className="h-3 w-3 text-teal-400" />
                        <span>Snapped to center · Blur 8px · Saturation 125%</span>
                      </div>
                    </div>
                  )}
                  {selectedTool === 'export' && (
                    <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-lg bg-[#0d0f14]/90 p-3 font-mono text-[10px] text-zinc-300">
                      ffmpeg -y -i clip.mp4 -/filter_complex graph.txt -c:v libx264 -r 30 -fps_mode cfr -pix_fmt yuv420p out.mp4
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Creator Workflows Gallery */}
        <section id="workflows" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
              Built for real post-production jobs
            </h2>
            <p className="text-sm text-zinc-400">
              Start a vertical clip cut project or a full multi-track timeline from the same project library.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
            {WORKFLOW_CARDS.map((card) => (
              <article
                key={card.title}
                className="flex flex-col overflow-hidden rounded-xl bg-[#12151c] transition-colors hover:bg-[#171a24]"
              >
                <div className="aspect-[16/10] w-full overflow-hidden bg-[#0b0c10]">
                  <img
                    src={card.image}
                    alt={card.alt}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col justify-between p-5 space-y-3">
                  <div className="space-y-1.5">
                    <h3 className="text-base font-semibold text-zinc-100">{card.title}</h3>
                    <p className="text-xs leading-relaxed text-zinc-400">{card.description}</p>
                  </div>
                  <div className="font-mono text-[10px] text-teal-400/90">{card.meta}</div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Desktop vs Browser Comparison */}
        <section id="specs" className="bg-[#101218] py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                Desktop app and Web Studio
              </h2>
              <p className="text-sm text-zinc-400">
                Both environments share one editor interface and project JSON format.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="rounded-xl bg-[#161922] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-zinc-100">Desktop App (Windows, macOS, Linux)</h3>
                  <span className="rounded bg-[#0f766e]/25 px-2 py-0.5 font-mono text-[10px] text-teal-300">
                    Native FFmpeg
                  </span>
                </div>
                <ul className="space-y-2.5 text-xs text-zinc-300">
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
                    <span>Encodes multi-track timelines directly with native FFmpeg CFR H.264 and AAC audio.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
                    <span>Saves exports straight to your chosen disk folder and opens them in Explorer or Finder.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
                    <span>Persists project JSON files and cached source footage locally without browser storage limits.</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-xl bg-[#161922] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-zinc-100">Web Studio (Chrome &amp; Edge)</h3>
                  <span className="rounded bg-[#101218] px-2 py-0.5 font-mono text-[10px] text-zinc-300">
                    WebCodecs MP4
                  </span>
                </div>
                <ul className="space-y-2.5 text-xs text-zinc-300">
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
                    <span>Open and edit directly at <span className="font-mono text-zinc-100">/studio</span> with no installation step.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-400" />
                    <span>Encodes exact-duration MP4 video client-side via WebCodecs and downloads the file.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <span>Stores imported blobs in browser IndexedDB for offline reload within the same browser.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Dedicated OS Download Section */}
        <section id="download" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                Download Winecut
              </h2>
              <p className="text-sm text-zinc-400">
                Download {releaseTag} installers directly for your operating system, or open{' '}
                <Link href="/download" className="text-zinc-200 underline-offset-4 hover:underline">
                  all installer packages
                </Link>
                .
              </p>
            </div>

            {/* OS Filter Switcher */}
            <div className="inline-flex rounded-lg bg-[#151821] p-1 text-xs">
              {(['windows', 'macos', 'linux'] as TargetOS[]).map((osKey) => (
                <button
                  key={osKey}
                  type="button"
                  onClick={() => setManualOS(osKey)}
                  className={`rounded-md px-3 py-1.5 font-medium capitalize transition-colors cursor-pointer ${
                    detectedOS === osKey
                      ? 'bg-[#232836] text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {OS_PACKAGES[osKey].name}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
            {(['windows', 'macos', 'linux'] as TargetOS[]).map((osKey) => {
              const pkg = OS_PACKAGES[osKey];
              const isSelected = detectedOS === osKey;
              const osRelease = osDownloads[osKey];
              const primaryAsset = osRelease.primary;
              const secondaryAsset = osRelease.secondary;
              const downloadHref = primaryAsset?.browser_download_url || RELEASES_URL;

              return (
                <div
                  key={osKey}
                  className={`flex flex-col justify-between rounded-2xl p-6 transition-colors ${
                    isSelected ? 'bg-[#191d27]' : 'bg-[#12141b]'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#101218] text-zinc-200">
                          {osKey === 'windows' && <Monitor className="h-4 w-4" />}
                          {osKey === 'macos' && <Apple className="h-4 w-4" />}
                          {osKey === 'linux' && <Terminal className="h-4 w-4" />}
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-zinc-100">{pkg.name}</h3>
                          <p className="text-[11px] text-zinc-400">{pkg.subtitle}</p>
                        </div>
                      </div>
                      {isSelected && (
                        <span className="rounded bg-[#0f766e]/25 px-2 py-0.5 font-mono text-[10px] text-teal-300">
                          Selected
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 rounded-lg bg-[#0d0f14] p-3 font-mono text-[11px] text-zinc-300">
                      <div className="truncate">
                        {primaryAsset ? primaryAsset.name : pkg.primaryFormat}
                      </div>
                      <div className="text-zinc-500">
                        {primaryAsset
                          ? `${formatBytes(primaryAsset.size)} · ${releaseTag}`
                          : pkg.secondaryFormat}
                      </div>
                      <div className="text-zinc-500">Arch: {pkg.arch}</div>
                    </div>

                    <p className="text-xs leading-relaxed text-zinc-400">{pkg.note}</p>
                  </div>

                  <div className="space-y-2 pt-6">
                    <Button
                      asChild
                      className={`w-full justify-center gap-2 text-xs font-semibold ${
                        isSelected
                          ? 'bg-zinc-100 text-zinc-950 hover:bg-white'
                          : 'bg-[#1f2430] text-zinc-100 hover:bg-[#2a3040]'
                      }`}
                    >
                      <a
                        href={downloadHref}
                        target={primaryAsset ? undefined : '_blank'}
                        rel={primaryAsset ? undefined : 'noopener noreferrer'}
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>
                          {primaryAsset
                            ? `${pkg.actionLabel} (${formatBytes(primaryAsset.size)})`
                            : pkg.actionLabel}
                        </span>
                      </a>
                    </Button>

                    {secondaryAsset && (
                      <a
                        href={secondaryAsset.browser_download_url}
                        className="flex items-center justify-center rounded-md bg-[#0d0f14] px-3 py-1.5 font-mono text-[11px] text-zinc-400 transition-colors hover:bg-[#151923] hover:text-zinc-200"
                      >
                        {secondaryAsset.name} ({formatBytes(secondaryAsset.size)})
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Automatic Updates + Setup Clarity Strip */}
          <div className="mt-6 grid grid-cols-1 gap-4 rounded-xl bg-[#12141b] p-5 md:grid-cols-2">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#191d27] text-teal-400">
                <RefreshCw className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-zinc-100">Automatic Update Notifications</h3>
                <p className="text-xs leading-relaxed text-zinc-400">
                  Desktop installs check <span className="font-mono text-zinc-300">latest.json</span> on GitHub Releases automatically and prompt you to install and restart when a newer signed build is published.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#191d27] text-zinc-300">
                <Terminal className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-zinc-100">Desktop Export Requirement</h3>
                <p className="text-xs leading-relaxed text-zinc-400">
                  Install <span className="font-mono text-zinc-300">ffmpeg</span> and <span className="font-mono text-zinc-300">ffprobe</span> on your system PATH to run native MP4 exports, or use Web Studio with WebCodecs.
                </p>
              </div>
            </div>
          </div>
        </section>
        <Testimonials3 />
      </main>

      <Footer16
        releasesUrl={RELEASES_URL}
        repoUrl={REPO_URL}
        onSelectSection={scrollToSection}
      />
    </div>
  );
}
