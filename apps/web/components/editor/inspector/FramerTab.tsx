'use client';

import React from 'react';
import { FramerBox, FramerSettings } from '../../../lib/editor/types';
import { RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '../../ui/button';

interface FramerTabProps {
  framerSettings: FramerSettings;
  updateFramerSettings: (updates: Partial<FramerSettings>) => void;
  updateFramerBox: (boxId: 'top' | 'bottom', updates: Partial<FramerBox>) => void;
  sendClipperToEditor: () => Promise<void>;
  beginHistoryTransaction: (label?: string) => void;
  endHistoryTransaction: () => void;
  rangeTx: (label: string) => {
    onPointerDown: () => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
  };
}

export function FramerTab({
  framerSettings,
  updateFramerSettings,
  updateFramerBox,
  sendClipperToEditor,
  beginHistoryTransaction,
  endHistoryTransaction,
  rangeTx,
}: FramerTabProps) {
  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Smart Cut Framer</span>
        </span>
        <button
          type="button"
          onClick={() => {
            beginHistoryTransaction('Reset dual speaker framing');
            updateFramerSettings({
              splitRatio: 0.5,
              dividerWidth: 2,
              dividerColor: '#000000',
              viewMode: 'framing_crop',
            });
            updateFramerBox('top', { x: 6, y: 8, width: 42, height: 84 });
            updateFramerBox('bottom', { x: 52, y: 8, width: 42, height: 84 });
            endHistoryTransaction();
          }}
          className="flex cursor-pointer items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-200"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reset</span>
        </button>
      </div>

      {/* View Mode */}
      <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-zinc-300">Target Aspect Ratio</span>
          <span className="rounded border border-emerald-800/80 bg-emerald-950/80 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
            9:16 Vertical Short
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => updateFramerSettings({ viewMode: 'framing_crop' })}
            className={`cursor-pointer rounded border px-2 py-1.5 text-[11px] font-medium transition-all ${
              framerSettings.viewMode === 'framing_crop'
                ? 'border-emerald-500 bg-emerald-600/30 text-emerald-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Framing Crop Boxes
          </button>
          <button
            type="button"
            onClick={() => updateFramerSettings({ viewMode: 'split_preview' })}
            className={`cursor-pointer rounded border px-2 py-1.5 text-[11px] font-medium transition-all ${
              framerSettings.viewMode === 'split_preview'
                ? 'border-emerald-500 bg-emerald-600/30 text-emerald-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            9:16 Split Preview
          </button>
        </div>
      </div>

      {/* Top & Bottom Boxes */}
      {(['top', 'bottom'] as const).map((boxKey) => {
        const box = boxKey === 'top' ? framerSettings.topBox : framerSettings.bottomBox;
        const isTop = boxKey === 'top';
        return (
          <div key={boxKey} className="space-y-2">
            <div
              className={`flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider ${
                isTop ? 'text-emerald-400' : 'text-sky-400'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    isTop ? 'bg-emerald-500' : 'bg-sky-500'
                  }`}
                />
                <span>{isTop ? 'Top Speaker (Box 1)' : 'Bottom Speaker (Box 2)'}</span>
              </span>
              <span className="font-mono text-[10px] text-zinc-400">
                {Math.round(box.width)}% × {Math.round(box.height)}%
              </span>
            </div>

            <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="grid grid-cols-2 gap-2">
                {(['x', 'y', 'width', 'height'] as const).map((field) => {
                  const maxVal = field === 'width' ? 90 : field === 'height' ? 100 : 80;
                  const minVal = field === 'width' || field === 'height' ? 20 : 0;
                  return (
                    <div key={field}>
                      <div className="mb-0.5 flex justify-between text-[10px] uppercase text-zinc-400">
                        <span>{field}</span>
                        <span className="font-mono text-zinc-200">{Math.round(box[field])}%</span>
                      </div>
                      <input
                        type="range"
                        min={minVal}
                        max={maxVal}
                        value={box[field]}
                        {...rangeTx(`Adjust ${boxKey} box ${field}`)}
                        onChange={(e) =>
                          updateFramerBox(boxKey, {
                            [field]: parseInt(e.target.value, 10) || minVal,
                          })
                        }
                        className="h-1 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-emerald-500"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* Split Ratio & Divider */}
      <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5">
        <div>
          <div className="mb-1 flex justify-between text-[10px] text-zinc-400">
            <span>Split Ratio</span>
            <span className="font-mono text-zinc-200">
              {Math.round(framerSettings.splitRatio * 100)}% /{' '}
              {Math.round((1 - framerSettings.splitRatio) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.3"
            max="0.7"
            step="0.05"
            value={framerSettings.splitRatio}
            {...rangeTx('Adjust split ratio')}
            onChange={(e) =>
              updateFramerSettings({ splitRatio: parseFloat(e.target.value) })
            }
            className="h-1 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-blue-500"
          />
        </div>

        <div>
          <div className="mb-1 flex justify-between text-[10px] text-zinc-400">
            <span>Divider Width</span>
            <span className="font-mono text-zinc-200">{framerSettings.dividerWidth}px</span>
          </div>
          <input
            type="range"
            min="0"
            max="8"
            value={framerSettings.dividerWidth}
            {...rangeTx('Adjust divider thickness')}
            onChange={(e) =>
              updateFramerSettings({ dividerWidth: parseInt(e.target.value, 10) || 0 })
            }
            className="h-1 w-full cursor-pointer appearance-none rounded bg-zinc-800 accent-blue-500"
          />
        </div>
      </div>

      <Button
        onClick={sendClipperToEditor}
        className="w-full cursor-pointer rounded-lg bg-emerald-600 py-2.5 text-xs font-medium text-white hover:bg-emerald-500"
      >
        <Sparkles className="mr-1.5 h-4 w-4" />
        <span>Convert to Full Timeline Layers (9:16)</span>
      </Button>
    </div>
  );
}
