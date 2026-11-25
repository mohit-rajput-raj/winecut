'use client';

import React, { useState } from 'react';
import { useWorkspace } from '../../lib/workspace/WorkspaceContext';
import { AspectRatio, ProjectMode } from '../../lib/editor/types';
import { Button } from '../ui/button';
import {
  X,
  Film,
  Scissors,
  Sparkles,
  Layers,
  Monitor,
  Smartphone,
  Square,
  ArrowRight,
  Check,
} from 'lucide-react';

export function CreateProjectModal() {
  const { isCreateModalOpen, closeCreateModal, createProject, savedProjects } = useWorkspace();

  const [selectedMode, setSelectedMode] = useState<ProjectMode>('editing');
  const [customProjectName, setCustomProjectName] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [isCreating, setIsCreating] = useState(false);

  const defaultName = selectedMode === 'clipping'
    ? `Clip_Cutter_${String(savedProjects.length + 1).padStart(2, '0')}`
    : `Video_Project_${String(savedProjects.length + 1).padStart(2, '0')}`;
  const projectName = customProjectName ?? defaultName;

  const handleSelectMode = (mode: ProjectMode) => {
    setSelectedMode(mode);
    setAspectRatio(mode === 'clipping' ? '9:16' : '16:9');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating) return;
    setIsCreating(true);
    try {
      await createProject({
        name: projectName,
        mode: selectedMode,
        aspectRatio,
      });
      setCustomProjectName(null);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isCreateModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in-0 duration-150">
      <form
        onSubmit={handleSubmit}
        className="bg-[#111216] border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col gap-5 text-zinc-200 font-sans"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Create New Project</h2>
              <p className="text-xs text-zinc-400">
                Choose between Full Video Editing or Dual-Speaker Clipping
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeCreateModal}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selection Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Option 1: Video Editing */}
          <button
            type="button"
            onClick={() => handleSelectMode('editing')}
            className={`text-left p-4 rounded-xl border-2 transition-all relative flex flex-col gap-3 cursor-pointer ${
              selectedMode === 'editing'
                ? 'border-blue-500 bg-blue-950/25 shadow-[0_0_24px_rgba(59,130,246,0.18)]'
                : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <Film className="w-5 h-5" />
              </div>
              {selectedMode === 'editing' && (
                <span className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </span>
              )}
            </div>

            <div>
              <h3 className="text-sm font-bold text-white">Video Editing</h3>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Full multi-track timeline studio with layer overlays, color grading, CapCut image styling, text captions, and audio mixing.
              </p>
            </div>

            <div className="mt-auto pt-2 border-t border-zinc-800/80 flex flex-wrap gap-1.5 text-[10px] font-mono text-zinc-400">
              <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 flex items-center gap-1">
                <Layers className="w-2.5 h-2.5 text-blue-400" />
                Timeline & Overlays
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                Color & Image FX
              </span>
            </div>
          </button>

          {/* Option 2: Clipping (Clip Cutter Wireframe) */}
          <button
            type="button"
            onClick={() => handleSelectMode('clipping')}
            className={`text-left p-4 rounded-xl border-2 transition-all relative flex flex-col gap-3 cursor-pointer ${
              selectedMode === 'clipping'
                ? 'border-emerald-500 bg-emerald-950/25 shadow-[0_0_24px_rgba(16,185,129,0.18)]'
                : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Scissors className="w-5 h-5" />
              </div>
              {selectedMode === 'clipping' && (
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <Check className="w-3.5 h-3.5" />
                </span>
              )}
            </div>

            <div>
              <h3 className="text-sm font-bold text-white">Clipping (Clip Cutter)</h3>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                Dedicated Podcast & Shorts wireframe clip cutter with interactive Top/Bottom Speaker crop boxes and live 9:16 split output.
              </p>
            </div>

            <div className="mt-auto pt-2 border-t border-zinc-800/80 flex flex-wrap gap-1.5 text-[10px] font-mono text-zinc-400">
              <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-emerald-900/60 text-emerald-400">
                Speaker Wireframe Cutter
              </span>
              <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800">
                9:16 Split Short
              </span>
            </div>
          </button>
        </div>

        {/* Project Name & Target Aspect Ratio */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-800">
          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setCustomProjectName(e.target.value)}
              placeholder="Enter project name..."
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
              Canvas Format
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: '16:9', value: '16:9' as AspectRatio, icon: Monitor },
                { label: '9:16', value: '9:16' as AspectRatio, icon: Smartphone },
                { label: '1:1', value: '1:1' as AspectRatio, icon: Square },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = aspectRatio === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAspectRatio(opt.value)}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-mono border transition-all cursor-pointer ${
                      active
                        ? 'bg-zinc-800 border-zinc-500 text-white font-semibold'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={closeCreateModal}
            className="text-xs text-zinc-400 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isCreating}
            className={`text-xs px-5 py-2 font-semibold text-white flex items-center gap-2 cursor-pointer ${
              selectedMode === 'clipping'
                ? 'bg-emerald-600 hover:bg-emerald-500'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            <span>Open {selectedMode === 'clipping' ? 'Clip Cutter' : 'Video Editor'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </form>
    </div>
  );
}
