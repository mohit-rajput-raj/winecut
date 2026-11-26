'use client';

import React, { useRef } from 'react';
import { SpeedCurveConfig, TimelineClip } from '../../../lib/editor/types';
import {
  SPEED_CURVE_PRESETS,
  evaluateSpeedAtNorm,
  normalizeSpeedPoints,
} from '../../../lib/editor/engine/velocity';
import { Gauge } from 'lucide-react';

interface SpeedGraphTabProps {
  clip: TimelineClip;
  onUpdateSpeedCurve: (clipId: string, curve: SpeedCurveConfig) => void;
  beginTx: (label?: string) => void;
  endTx: () => void;
}

const GRAPH_W = 240;
const GRAPH_H = 128;
const MAX_SPEED = 5.0;
const MIN_SPEED = 0.2;

function speedToY(speed: number): number {
  const norm = Math.max(0, Math.min(1, (speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)));
  return GRAPH_H - 12 - norm * (GRAPH_H - 24);
}

function yToSpeed(y: number): number {
  const norm = Math.max(0, Math.min(1, (GRAPH_H - 12 - y) / (GRAPH_H - 24)));
  return Number((MIN_SPEED + norm * (MAX_SPEED - MIN_SPEED)).toFixed(2));
}

export function SpeedGraphTab({
  clip,
  onUpdateSpeedCurve,
  beginTx,
  endTx,
}: SpeedGraphTabProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const curve = clip.speedCurve || {
    presetId: 'normal',
    points: SPEED_CURVE_PRESETS[0]!.points,
  };
  const points = normalizeSpeedPoints(curve.points);

  // Sample smooth SVG curve path across 64 subdivisions
  const pathPoints: string[] = [];
  for (let i = 0; i <= 64; i++) {
    const u = i / 64;
    const sp = evaluateSpeedAtNorm({ points }, u);
    const x = 10 + u * (GRAPH_W - 20);
    const y = speedToY(sp);
    pathPoints.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }

  const startDragPoint = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    beginTx('Adjust velocity graph point');

    const onMove = (ev: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      const relX = ((ev.clientX - rect.left) / rect.width) * GRAPH_W;
      const relY = ((ev.clientY - rect.top) / rect.height) * GRAPH_H;
      const nextSpeed = yToSpeed(relY);

      const isEdge = index === 0 || index === points.length - 1;
      const minT = index > 0 ? points[index - 1]!.t + 0.04 : 0;
      const maxT = index < points.length - 1 ? points[index + 1]!.t - 0.04 : 1;
      const rawT = Math.max(0, Math.min(1, (relX - 10) / (GRAPH_W - 20)));
      const nextT = isEdge ? points[index]!.t : Number(Math.max(minT, Math.min(maxT, rawT)).toFixed(2));

      const nextPts = points.map((p, idx) =>
        idx === index ? { t: nextT, speed: nextSpeed } : p,
      );
      onUpdateSpeedCurve(clip.id, { presetId: 'custom', points: nextPts });
    };

    const onUp = () => {
      endTx();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
          <Gauge className="h-3.5 w-3.5" />
          <span>Velocity Curve Graph</span>
        </span>
        <span className="font-mono text-[10px] text-zinc-400">
          {clip.duration.toFixed(2)}s out
        </span>
      </div>

      {/* Curve Preset Grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {SPEED_CURVE_PRESETS.map((preset) => {
          const active = (curve.presetId || 'normal') === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() =>
                onUpdateSpeedCurve(clip.id, {
                  presetId: preset.id,
                  points: preset.points.map((p) => ({ ...p })),
                })
              }
              className={`cursor-pointer rounded border py-1.5 px-1.5 text-[10px] font-medium transition-colors ${
                active
                  ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800/70'
              }`}
              title={preset.description}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Interactive Velocity SVG Graph */}
      <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2 space-y-2">
        <div className="flex justify-between font-mono text-[9px] text-zinc-500">
          <span>5.0x Fast</span>
          <span>Drag nodes vertically/horizontally</span>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
          className="h-32 w-full select-none rounded bg-[#0c0e13]"
        >
          {/* 1.0x Baseline Reference */}
          <line
            x1="10"
            x2={GRAPH_W - 10}
            y1={speedToY(1)}
            y2={speedToY(1)}
            stroke="rgba(255,255,255,0.16)"
            strokeDasharray="3 3"
          />
          <text
            x="12"
            y={speedToY(1) - 4}
            fill="rgba(255,255,255,0.4)"
            fontSize="8"
            fontFamily="monospace"
          >
            1.0x
          </text>

          {/* Interpolated Speed Curve */}
          <path
            d={pathPoints.join(' ')}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.2"
            strokeLinecap="round"
          />

          {/* Interactive Draggable Control Points */}
          {points.map((pt, idx) => {
            const cx = 10 + pt.t * (GRAPH_W - 20);
            const cy = speedToY(pt.speed);
            return (
              <g key={idx} className="cursor-grab active:cursor-grabbing">
                <circle
                  cx={cx}
                  cy={cy}
                  r={7}
                  fill="transparent"
                  onMouseDown={(e) => startDragPoint(idx, e)}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill="#ffffff"
                  stroke="#10b981"
                  strokeWidth="2"
                  onMouseDown={(e) => startDragPoint(idx, e)}
                />
              </g>
            );
          })}
        </svg>

        <div className="flex items-center justify-between font-mono text-[9px] text-zinc-500">
          <span>0.2x Slow-Mo</span>
          <span>
            Range: {points.map((p) => `${p.speed.toFixed(1)}x`).join(' · ')}
          </span>
        </div>
      </div>
    </div>
  );
}
