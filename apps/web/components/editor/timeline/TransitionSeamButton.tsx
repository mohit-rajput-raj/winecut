'use client';

import React, { useEffect, useRef, useState } from 'react';
import { TransitionEdge, TransitionType } from '../../../lib/editor/types';
import { TRANSITION_PRESETS } from '../../../lib/editor/presets/bundles';
import { Plus, Trash2, ArrowRightLeft } from 'lucide-react';

interface TransitionSeamButtonProps {
  leftPx: number;
  trackId: string;
  fromClipId: string;
  toClipId: string;
  existing?: TransitionEdge;
  onSelect: (
    trackId: string,
    fromClipId: string,
    toClipId: string,
    type: TransitionType,
    duration: number,
  ) => void;
  onRemove: (transitionId: string) => void;
}

export function TransitionSeamButton({
  leftPx,
  trackId,
  fromClipId,
  toClipId,
  existing,
  onSelect,
  onRemove,
}: TransitionSeamButtonProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (ev: Event) => {
      const target = ev.target as Node | null;
      if (target && (btnRef.current?.contains(target) || popoverRef.current?.contains(target))) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('scroll', handleOutside, true);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('scroll', handleOutside, true);
    };
  }, [open]);

  const togglePopover = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const popWidth = 224;
      const clampedLeft = Math.max(
        12 + popWidth / 2,
        Math.min(window.innerWidth - 12 - popWidth / 2, rect.left + rect.width / 2),
      );
      setCoords({ left: clampedLeft, top: Math.max(12, rect.top - 8) });
    }
    setOpen((v) => !v);
  };

  return (
    <div
      style={{ left: `${leftPx}px` }}
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={togglePopover}
        title={
          existing
            ? `Transition: ${existing.type} (${existing.duration}s) — Click to edit`
            : 'Add transition between clips'
        }
        className={`flex items-center justify-center rounded-md border shadow-md transition-all cursor-pointer ${
          existing
            ? 'h-6 px-1.5 gap-1 bg-teal-600 border-teal-300 text-white text-[9px] font-mono'
            : 'h-5 w-5 bg-zinc-900/95 border-zinc-600 text-zinc-200 hover:bg-white hover:text-zinc-950'
        }`}
      >
        {existing ? (
          <>
            <ArrowRightLeft className="h-3 w-3 shrink-0" />
            <span>{existing.duration.toFixed(1)}s</span>
          </>
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
          className="fixed -translate-x-1/2 -translate-y-full w-56 rounded-lg border border-zinc-700 bg-[#12141a] p-2.5 shadow-2xl z-[80] space-y-2 text-xs"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
            <span className="font-semibold text-zinc-200 text-[11px]">Clip Transition</span>
            {existing && (
              <button
                type="button"
                onClick={() => {
                  onRemove(existing.id);
                  setOpen(false);
                }}
                className="text-red-400 hover:text-red-300 flex items-center gap-1 text-[10px] cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                <span>Remove</span>
              </button>
            )}
          </div>

          {existing && (
            <div>
              <div className="flex justify-between text-[10px] text-zinc-400 mb-0.5">
                <span>Duration</span>
                <span className="font-mono text-zinc-200">{existing.duration.toFixed(2)}s</span>
              </div>
              <input
                type="range"
                min="0.15"
                max="2.0"
                step="0.05"
                value={existing.duration}
                onChange={(e) =>
                  onSelect(trackId, fromClipId, toClipId, existing.type, parseFloat(e.target.value))
                }
                className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-teal-500"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-1 max-h-44 overflow-y-auto custom-scrollbar">
            {TRANSITION_PRESETS.map((preset) => {
              const active = existing?.type === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onSelect(
                      trackId,
                      fromClipId,
                      toClipId,
                      preset.id,
                      existing?.duration ?? preset.defaultDuration,
                    );
                    setOpen(false);
                  }}
                  className={`px-2 py-1.5 rounded border text-left text-[10px] font-medium cursor-pointer transition-colors ${
                    active
                      ? 'border-teal-500 bg-teal-950/60 text-teal-200'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
