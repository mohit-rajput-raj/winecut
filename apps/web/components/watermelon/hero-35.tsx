'use client';

/* eslint-disable @next/next/no-img-element */
import React from 'react';
import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import { ArrowRight, Download, Film } from 'lucide-react';

export interface Hero35Props {
  downloadLabel: string;
  downloadUrl: string;
  isDirectDownload?: boolean;
  packageSummary: string;
  onSelectSection: (id: string) => void;
}

const HERO_BG_URL = 'https://assets.watermelon.sh/hero-35-bg.avif';
const TITLE_WORDS = ['Cut', 'Every', 'Frame', 'With', 'Precision.'];

const navVariants: Variants = {
  hidden: { opacity: 0, y: -18, filter: 'blur(6px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { type: 'spring', damping: 22, stiffness: 150, delay: 0.1 },
  },
};

const titleContainerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.28,
    },
  },
};

const titleWordVariants: Variants = {
  hidden: { opacity: 0, y: 28, filter: 'blur(10px)', rotateX: 8 },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    rotateX: 0,
    transition: {
      type: 'spring',
      damping: 20,
      stiffness: 110,
      mass: 0.85,
    },
  },
};

const statsVariants: Variants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: {
      type: 'spring',
      damping: 22,
      stiffness: 130,
      delay: 0.85,
    },
  },
};

const rightContainerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.6,
    },
  },
};

const rightItemVariants: Variants = {
  hidden: { opacity: 0, x: 18, filter: 'blur(6px)' },
  show: {
    opacity: 1,
    x: 0,
    filter: 'blur(0px)',
    transition: {
      type: 'spring',
      damping: 20,
      stiffness: 130,
    },
  },
};

function DotGridMark() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 text-zinc-400"
      viewBox="0 0 12 12"
      fill="currentColor"
    >
      <circle cx="3" cy="3" r="1.4" />
      <circle cx="9" cy="3" r="1.4" />
      <circle cx="3" cy="9" r="1.4" />
      <circle cx="9" cy="9" r="1.4" />
    </svg>
  );
}

export function Hero35({
  downloadLabel,
  downloadUrl,
  isDirectDownload = false,
  packageSummary,
  onSelectSection,
}: Hero35Props) {
  return (
    <section className="relative flex min-h-[82vh] w-full flex-col justify-between overflow-hidden bg-[#0b0c10]">
      {/* Atmospheric Backdrop + Matte Legibility Fade */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <img
          src={HERO_BG_URL}
          alt="Winecut atmospheric dark production backdrop"
          loading="eager"
          className="h-full w-full object-cover object-center opacity-55"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(11,12,16,0.72) 0%, rgba(11,12,16,0.42) 45%, rgba(11,12,16,0.92) 85%, #0b0c10 100%)',
          }}
        />
      </div>

      {/* Top Navigation */}
      <motion.header
        variants={navVariants}
        initial="hidden"
        animate="show"
        className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#181b24]/90 text-teal-400">
            <Film className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-zinc-100">
            Winecut
          </span>
          <span className="rounded bg-[#161922]/90 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
            v0.1.0
          </span>
        </div>

        <nav
          aria-label="Primary sections"
          className="hidden items-center gap-6 text-[11px] font-medium tracking-wider text-zinc-300 uppercase md:flex"
        >
          <button
            type="button"
            onClick={() => onSelectSection('features')}
            className="cursor-pointer transition-colors hover:text-white"
          >
            Features
          </button>
          <button
            type="button"
            onClick={() => onSelectSection('workflows')}
            className="cursor-pointer transition-colors hover:text-white"
          >
            Workflows
          </button>
          <button
            type="button"
            onClick={() => onSelectSection('specs')}
            className="cursor-pointer transition-colors hover:text-white"
          >
            Desktop &amp; Web
          </button>
          <button
            type="button"
            onClick={() => onSelectSection('download')}
            className="cursor-pointer transition-colors hover:text-white"
          >
            Download
          </button>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/studio"
            className="inline-flex h-8 items-center rounded-full bg-[#151821]/85 px-3.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-[#1e2330] hover:text-white"
          >
            Open Web Studio
          </Link>
          <button
            type="button"
            onClick={() => onSelectSection('download')}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-zinc-100 px-3.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-white"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Install</span>
          </button>
        </div>
      </motion.header>

      {/* Bottom Split Hero Body */}
      <div className="relative z-20 mx-auto w-full max-w-6xl px-4 pt-12 pb-16 sm:px-6 lg:pt-20 lg:pb-20">
        <div className="grid grid-cols-1 items-end gap-10 lg:grid-cols-12">
          {/* Left: Display Heading & Key Telemetry */}
          <div className="space-y-8 lg:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#151821]/90 px-3 py-1 text-[11px] font-medium text-zinc-300">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
              <span>Desktop App · Windows, macOS, Linux · Web Studio</span>
            </div>

            <motion.h1
              variants={titleContainerVariants}
              initial="hidden"
              animate="show"
              style={{ perspective: '800px' }}
              className="flex flex-wrap gap-x-3 gap-y-1 text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl lg:text-[58px] lg:leading-[1.06]"
            >
              {TITLE_WORDS.map((word) => (
                <motion.span
                  key={word}
                  variants={titleWordVariants}
                  className="inline-block"
                >
                  {word}
                </motion.span>
              ))}
            </motion.h1>

            <motion.div
              variants={statsVariants}
              initial="hidden"
              animate="show"
              className="flex flex-wrap items-center gap-8 pt-1"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-mono text-2xl font-semibold tabular-nums text-zinc-100">
                  <DotGridMark />
                  <span>20ms</span>
                </div>
                <p className="text-xs text-zinc-400">
                  Zoomed timeline ruler granularity
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2 font-mono text-2xl font-semibold tabular-nums text-zinc-100">
                  <DotGridMark />
                  <span>60 FPS</span>
                </div>
                <p className="text-xs text-zinc-400">
                  Constant-frame-rate local MP4 export
                </p>
              </div>
            </motion.div>
          </div>

          {/* Right: Direct Task Description & CTAs */}
          <motion.div
            variants={rightContainerVariants}
            initial="hidden"
            animate="show"
            className="space-y-6 lg:col-span-5"
          >
            <motion.p
              variants={rightItemVariants}
              className="text-sm leading-relaxed text-zinc-300 sm:text-base"
            >
              Edit multi-track video, crop two speakers into 9:16 vertical splits, align captions with canvas snap guides, and render locally with native FFmpeg or WebCodecs.
            </motion.p>

            <motion.div
              variants={rightItemVariants}
              className="flex flex-wrap items-center gap-3"
            >
              <a
                href={downloadUrl}
                target={isDirectDownload ? undefined : '_blank'}
                rel={isDirectDownload ? undefined : 'noopener noreferrer'}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-zinc-100 px-5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-white"
              >
                <Download className="h-4 w-4" />
                <span>{downloadLabel}</span>
              </a>

              <Link
                href="/studio"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#181b24]/95 px-5 text-xs font-medium text-zinc-100 transition-colors hover:bg-[#222735]"
              >
                <span>Open Web Studio</span>
                <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
              </Link>
            </motion.div>

            <motion.div
              variants={rightItemVariants}
              className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-zinc-400"
            >
              <span>{packageSummary}</span>
              <button
                type="button"
                onClick={() => onSelectSection('download')}
                className="cursor-pointer text-zinc-300 underline-offset-4 hover:text-white hover:underline"
              >
                All installers
              </button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
