'use client';

/* eslint-disable @next/next/no-img-element */
import React from 'react';
import Link from 'next/link';
import { motion, type Variants } from 'motion/react';
import { FaApple, FaGithub, FaLinux, FaWindows } from 'react-icons/fa6';
import { Film } from 'lucide-react';

export interface Footer16Props {
  releasesUrl: string;
  repoUrl: string;
  onSelectSection: (id: string) => void;
}

const FOOTER_BG_URL = 'https://assets.watermelon.sh/footer-16-bg.avif';

const dockVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', damping: 24, stiffness: 120 },
  },
};

export function Footer16({ releasesUrl, repoUrl, onSelectSection }: Footer16Props) {
  return (
    <footer className="relative overflow-hidden bg-[#08090c] pt-24">
      {/* Atmospheric Backdrop Image + Matte Gradient */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <img
          src={FOOTER_BG_URL}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover opacity-30"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, #0b0c10 0%, rgba(11,12,16,0.45) 38%, rgba(8,9,12,0.85) 72%, rgba(8,9,12,0.98) 100%)',
          }}
        />
      </div>

      {/* Monumental Gradient Wordmark Positioned Behind Frosted Bottom Dock */}
      <div
        aria-hidden="true"
        className="pointer-events-none relative z-10 mx-auto max-w-6xl select-none px-4 sm:px-6"
      >
        <svg viewBox="0 0 1120 150" className="-mb-10 w-full sm:-mb-14">
          <defs>
            <linearGradient id="cinecraftFooterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#52525b" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#14171f" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <text
            x="50%"
            y="122"
            textAnchor="middle"
            fill="url(#cinecraftFooterGrad)"
            className="font-sans text-[134px] font-semibold tracking-tight uppercase"
          >
            CINECRAFT
          </text>
        </svg>
      </div>

      {/* Frosted Dock */}
      <motion.div
        variants={dockVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.15 }}
        className="relative z-20 border-t border-white/10 bg-[#0b0c10]/70 backdrop-blur-xs"
      >
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            {/* Brand Summary */}
            <div className="space-y-3 md:col-span-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#181b24] text-teal-400">
                  <Film className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold tracking-tight text-zinc-100">
                  CineCraft Studio
                </span>
                <span className="rounded bg-[#161922] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                  v0.1.0
                </span>
              </div>
              <p className="max-w-sm text-xs leading-relaxed text-zinc-400">
                Local-first multi-track video editor, 9:16 dual-speaker clip cutter, and constant-frame-rate MP4 exporter for Windows, macOS, Linux, and Web.
              </p>
            </div>

            {/* Navigation Columns */}
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
              <div className="space-y-2.5">
                <h3 className="font-mono text-[11px] font-semibold tracking-wider text-zinc-300 uppercase">
                  Workspace
                </h3>
                <ul className="space-y-2 text-xs text-zinc-400">
                  <li>
                    <Link href="/studio" className="transition-colors hover:text-zinc-100">
                      Open Web Studio
                    </Link>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onSelectSection('features')}
                      className="cursor-pointer transition-colors hover:text-zinc-100"
                    >
                      Editor Features
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onSelectSection('workflows')}
                      className="cursor-pointer transition-colors hover:text-zinc-100"
                    >
                      Workflows
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onSelectSection('specs')}
                      className="cursor-pointer transition-colors hover:text-zinc-100"
                    >
                      Desktop vs Web
                    </button>
                  </li>
                </ul>
              </div>

              <div className="space-y-2.5">
                <h3 className="font-mono text-[11px] font-semibold tracking-wider text-zinc-300 uppercase">
                  Installers
                </h3>
                <ul className="space-y-2 text-xs text-zinc-400">
                  <li>
                    <button
                      type="button"
                      onClick={() => onSelectSection('download')}
                      className="cursor-pointer transition-colors hover:text-zinc-100"
                    >
                      Windows (.exe / .msi)
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onSelectSection('download')}
                      className="cursor-pointer transition-colors hover:text-zinc-100"
                    >
                      macOS (.dmg)
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onSelectSection('download')}
                      className="cursor-pointer transition-colors hover:text-zinc-100"
                    >
                      Linux (.AppImage / .deb)
                    </button>
                  </li>
                </ul>
              </div>

              <div className="space-y-2.5">
                <h3 className="font-mono text-[11px] font-semibold tracking-wider text-zinc-300 uppercase">
                  Releases
                </h3>
                <ul className="space-y-2 text-xs text-zinc-400">
                  <li>
                    <a
                      href={releasesUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors hover:text-zinc-100"
                    >
                      Latest Release
                    </a>
                  </li>
                  <li>
                    <a
                      href={`${releasesUrl}/download/latest.json`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors hover:text-zinc-100"
                    >
                      Updater Manifest
                    </a>
                  </li>
                  <li>
                    <a
                      href={repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition-colors hover:text-zinc-100"
                    >
                      GitHub Repository
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 text-xs text-zinc-500 sm:flex-row sm:items-center">
            <div className="font-mono text-[11px]">
              CineCraft Studio · Local FFmpeg &amp; WebCodecs Processing
            </div>

            <div className="flex items-center gap-4 text-zinc-400">
              <button
                type="button"
                aria-label="Windows installer section"
                onClick={() => onSelectSection('download')}
                className="cursor-pointer transition-colors hover:text-zinc-100"
              >
                <FaWindows className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="macOS installer section"
                onClick={() => onSelectSection('download')}
                className="cursor-pointer transition-colors hover:text-zinc-100"
              >
                <FaApple className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Linux installer section"
                onClick={() => onSelectSection('download')}
                className="cursor-pointer transition-colors hover:text-zinc-100"
              >
                <FaLinux className="h-4 w-4" />
              </button>
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub repository"
                className="transition-colors hover:text-zinc-100"
              >
                <FaGithub className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </motion.div>
    </footer>
  );
}
