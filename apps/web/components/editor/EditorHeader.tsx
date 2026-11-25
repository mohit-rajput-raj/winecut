'use client';

import React, { useState } from 'react';
import { useEditor } from '../../lib/editor/EditorContext';
import { useWorkspace } from '../../lib/workspace/WorkspaceContext';
import { AspectRatio } from '../../lib/editor/types';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { 
  RotateCcw, 
  RotateCw, 
  Download, 
  Sparkles, 
  Magnet, 
  Smartphone, 
  Monitor, 
  Square,
  Film,
  ChevronDown,
  ArrowLeft,
  Settings,
  Check,
  Save
} from 'lucide-react';

interface EditorHeaderProps {
  onOpenExport: () => void;
}

export function EditorHeader({ onOpenExport }: EditorHeaderProps) {
  const { navigateToHome, navigateToSettings } = useWorkspace();
  const { 
    project, 
    aspectRatio, 
    setAspectRatio, 
    canUndo, 
    canRedo, 
    undo, 
    redo, 
    snapping, 
    setSnapping,
    applySkill,
    saveNow
  } = useEditor();

  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const handleBackHome = async () => {
    await saveNow();
    await navigateToHome();
  };

  const handleManualSave = async () => {
    await saveNow();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
  };

  const ratios: { label: string; value: AspectRatio; icon: React.ComponentType<{ className?: string }> }[] = [
    { label: '16:9', value: '16:9', icon: Monitor },
    { label: '9:16', value: '9:16', icon: Smartphone },
    { label: '1:1', value: '1:1', icon: Square },
  ];

  return (
    <header className="h-12 bg-zinc-950 border-b border-zinc-800 px-3 flex items-center justify-between text-zinc-100 select-none z-30 relative">
      {/* Left: Back Home + Branding & Status */}
      <div className="flex items-center gap-2.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBackHome}
          className="h-7 px-2 gap-1 text-zinc-400 hover:text-white hover:bg-zinc-900 text-xs cursor-pointer"
          title="Save & Return to Projects Home"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Projects</span>
        </Button>

        <div className="h-4 w-[1px] bg-zinc-800" />

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-zinc-100 flex items-center justify-center text-zinc-950 shadow-sm">
            <Film className="w-4 h-4 fill-zinc-950" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold tracking-tight text-zinc-100 leading-none">
              Winecut
            </span>
            <span className="text-[10px] text-zinc-400 font-mono leading-tight">
              Studio
            </span>
          </div>
        </div>

        <div className="h-4 w-[1px] bg-zinc-800 mx-0.5" />

        {/* Project Name and Resolution Tag */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-300 max-w-[140px] truncate">
            {project.name}
          </span>
          <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5 border-zinc-800 text-zinc-400 hidden md:inline-flex">
            {project.settings.fps} FPS · {project.settings.width}x{project.settings.height}
          </Badge>
        </div>
      </div>

      {/* Center: Aspect Ratio & Snapping */}
      <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-md p-0.5">
        {ratios.map(r => {
          const Icon = r.icon;
          const isSelected = aspectRatio === r.value;
          return (
            <button
              key={r.value}
              onClick={() => setAspectRatio(r.value)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-zinc-800 text-zinc-50 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{r.label}</span>
            </button>
          );
        })}

        <div className="h-3.5 w-[1px] bg-zinc-800 mx-0.5" />

        <button
          onClick={() => setSnapping(!snapping)}
          title="Toggle Magnetic Snapping (S)"
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
            snapping
              ? 'bg-zinc-800 text-blue-400'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Magnet className="w-3.5 h-3.5" />
          <span className="text-[11px]">Snap</span>
        </button>
      </div>

      {/* Right: History, AI Menu & Export */}
      <div className="flex items-center gap-2">
        {/* Undo / Redo */}
        <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={undo}
            disabled={!canUndo}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={redo}
            disabled={!canRedo}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
            title="Redo (Ctrl+Y)"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* AI Actions Dropdown */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAiMenuOpen(!aiMenuOpen)}
            className="h-8 gap-1.5 border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 text-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>AI Copilot</span>
            <ChevronDown className="w-3 h-3 text-zinc-400" />
          </Button>

          {aiMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-60 rounded-lg border border-zinc-800 bg-zinc-900 p-1.5 shadow-xl z-50 animate-in fade-in-0 zoom-in-95">
              <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Automated Skills
              </div>
              <button
                onClick={() => { applySkill('auto-subtitles'); setAiMenuOpen(false); }}
                className="w-full text-left px-2 py-1.5 rounded-md hover:bg-zinc-800 text-xs text-zinc-200 flex items-center justify-between"
              >
                <span>Auto Subtitles (Whisper)</span>
                <span className="text-[10px] font-mono text-zinc-400">AI</span>
              </button>
              <button
                onClick={() => { applySkill('jump-cut-silence'); setAiMenuOpen(false); }}
                className="w-full text-left px-2 py-1.5 rounded-md hover:bg-zinc-800 text-xs text-zinc-200 flex items-center justify-between"
              >
                <span>Silence Jump Cutter</span>
                <span className="text-[10px] font-mono text-zinc-400">AUDIO</span>
              </button>
              <button
                onClick={() => { applySkill('lut-cinematic'); setAiMenuOpen(false); }}
                className="w-full text-left px-2 py-1.5 rounded-md hover:bg-zinc-800 text-xs text-zinc-200 flex items-center justify-between"
              >
                <span>Cinematic Color Grading</span>
                <span className="text-[10px] font-mono text-zinc-400">COLOR</span>
              </button>
              <button
                onClick={() => { applySkill('speed-ramp'); setAiMenuOpen(false); }}
                className="w-full text-left px-2 py-1.5 rounded-md hover:bg-zinc-800 text-xs text-zinc-200 flex items-center justify-between"
              >
                <span>Dynamic Speed Ramping</span>
                <span className="text-[10px] font-mono text-zinc-400">FX</span>
              </button>
            </div>
          )}
        </div>

        {/* Save & Settings */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleManualSave}
          className="h-8 gap-1 text-xs text-zinc-400 hover:text-white cursor-pointer"
          title="Save Project JSON to Cache Now"
        >
          {savedFlash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
          <span className="hidden lg:inline">{savedFlash ? 'Saved' : 'Save'}</span>
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={navigateToSettings}
          className="h-8 w-8 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
          title="Studio Settings (Paths, Cache, AI Keys)"
        >
          <Settings className="w-3.5 h-3.5" />
        </Button>

        {/* Export Button */}
        <Button
          variant="default"
          size="sm"
          onClick={onOpenExport}
          className="h-8 gap-1.5 bg-zinc-100 text-zinc-900 hover:bg-white font-medium text-xs shadow-sm cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </Button>
      </div>
    </header>
  );
}
