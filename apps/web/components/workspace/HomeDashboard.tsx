'use client';

import React, { useState, useMemo } from 'react';
import { useWorkspace } from '../../lib/workspace/WorkspaceContext';
import { secondsToTimecode } from '../../lib/editor/time-utils';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Plus,
  Film,
  Scissors,
  Settings,
  FolderOpen,
  Trash2,
  Copy,
  Edit3,
  Clock,
  HardDrive,
  Search,
  Layers,
  Sparkles,
  Check,
  X,
} from 'lucide-react';

export function HomeDashboard() {
  const {
    settings,
    savedProjects,
    isLoading,
    isOpeningProject,
    cacheStats,
    openCreateModal,
    createProject,
    openProject,
    duplicateProject,
    deleteProject,
    renameProject,
    navigateToSettings,
  } = useWorkspace();

  const [filterMode, setFilterMode] = useState<'all' | 'editing' | 'clipping'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState<string>('');

  const filteredProjects = useMemo(() => {
    return savedProjects.filter((p) => {
      const mode = p.mode || 'editing';
      if (filterMode !== 'all' && mode !== filterMode) return false;
      if (searchQuery.trim() && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [savedProjects, filterMode, searchQuery]);

  const formatCacheSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleStartRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameText(currentName);
  };

  const handleConfirmRename = async (id: string, e?: React.FormEvent) => {
    e?.preventDefault();
    if (renameText.trim()) {
      await renameProject(id, renameText.trim());
    }
    setRenamingId(null);
  };

  return (
    <div className="flex h-screen w-screen bg-[#0a0b0e] text-zinc-100 font-sans select-none overflow-hidden">
      {/* Left Studio Navigation Rail */}
      <aside className="w-60 shrink-0 bg-[#0e1015] border-r border-zinc-800/80 flex flex-col justify-between p-4">
        <div className="space-y-6">
          {/* Brand Logo */}
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight leading-none">
                Winecut
              </h1>
              <span className="text-[10px] font-mono text-zinc-500">
                Desktop NLE · v2.0
              </span>
            </div>
          </div>

          {/* Primary Nav */}
          <nav className="space-y-1 text-xs">
            <button
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-zinc-800/90 text-white font-semibold cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-blue-400" />
              <span>Projects Home</span>
            </button>

            <button
              onClick={navigateToSettings}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <Settings className="w-4 h-4 text-zinc-400" />
              <span>Settings & Paths</span>
            </button>
          </nav>

          {/* Account Badge */}
          <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">Workspace User</span>
              <Badge variant="outline" className="text-[9px] border-blue-800/60 text-blue-300 bg-blue-950/40 py-0">
                {settings.authUser.plan}
              </Badge>
            </div>
            <p className="text-xs font-medium text-zinc-200 truncate">{settings.authUser.name}</p>
            <p className="text-[10px] text-zinc-500 truncate">{settings.authUser.email}</p>
          </div>
        </div>

        {/* Bottom Storage Status Card */}
        <div
          onClick={navigateToSettings}
          className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800/80 hover:border-zinc-700 cursor-pointer transition-colors space-y-2"
          title="Click to configure Cache & Downloads paths"
        >
          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>Local Storage</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-400">
              {formatCacheSize(cacheStats.bytes)}
            </span>
          </div>
          <div className="space-y-1 text-[10px] font-mono text-zinc-500">
            <div className="truncate" title={settings.cachePath}>
              Cache: <span className="text-zinc-300">{settings.cachePath}</span>
            </div>
            <div className="truncate" title={settings.downloadsPath}>
              Out: <span className="text-zinc-300">{settings.downloadsPath}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 border-b border-zinc-800/80 px-6 flex items-center justify-between bg-[#0c0d11]/80 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-zinc-100">Welcome back</span>
            <Badge variant="outline" className="text-[10px] font-mono border-zinc-800 text-zinc-400">
              {savedProjects.length} {savedProjects.length === 1 ? 'Project' : 'Projects'} in Cache
            </Badge>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={navigateToSettings}
              className="h-8 gap-1.5 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 text-xs cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </Button>
            <Button
              size="sm"
              onClick={openCreateModal}
              className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs px-4 shadow cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create New</span>
            </Button>
          </div>
        </header>

        {/* Scrollable Workspace Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* CapCut-Style Hero Launcher Banner */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <button
              onClick={openCreateModal}
              className="lg:col-span-2 group relative overflow-hidden rounded-2xl border border-blue-500/40 bg-gradient-to-r from-blue-600/25 via-indigo-600/20 to-zinc-900 p-6 text-left hover:border-blue-400 transition-all shadow-lg cursor-pointer flex items-center justify-between"
            >
              <div className="space-y-2 z-10">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-[10px] font-mono uppercase tracking-wider">
                  <Sparkles className="w-3 h-3" />
                  <span>New Workspace</span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Create New Project
                </h2>
                <p className="text-xs text-zinc-300 max-w-md leading-relaxed">
                  Start a new <span className="text-blue-300 font-semibold">Video Editing</span> project or open the <span className="text-emerald-300 font-semibold">Clip Cutter</span> wireframe workspace. Cached locally for instant resume.
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-blue-600 group-hover:scale-105 group-hover:bg-blue-500 transition-all flex items-center justify-center text-white shadow-xl shrink-0">
                <Plus className="w-6 h-6" />
              </div>
            </button>

            {/* Quick Mode Shortcuts */}
            <div className="grid grid-rows-2 gap-3">
              <button
                onClick={() => createProject({ name: `Video_Project_${savedProjects.length + 1}`, mode: 'editing', aspectRatio: '16:9' })}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-blue-500/50 px-4 py-3 text-left flex items-center gap-3 transition-all cursor-pointer"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-950 border border-blue-800/60 flex items-center justify-center text-blue-400 shrink-0">
                  <Film className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white">Quick Video Edit</div>
                  <div className="text-[10px] text-zinc-400 truncate">Timeline · Overlays · Grading</div>
                </div>
              </button>

              <button
                onClick={() => createProject({ name: `Clip_Cutter_${savedProjects.length + 1}`, mode: 'clipping', aspectRatio: '9:16' })}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-emerald-500/50 px-4 py-3 text-left flex items-center gap-3 transition-all cursor-pointer"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-950 border border-emerald-800/60 flex items-center justify-center text-emerald-400 shrink-0">
                  <Scissors className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white">Quick Clip Cutter</div>
                  <div className="text-[10px] text-zinc-400 truncate">Top/Bottom Speaker Wireframe</div>
                </div>
              </button>
            </div>
          </div>

          {/* Saved & Under Construction Projects Section */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-bold text-zinc-100">
                  Saved & Under Construction
                </h3>
                <div className="flex items-center bg-zinc-900 p-0.5 rounded-lg border border-zinc-800 text-[11px]">
                  {[
                    { id: 'all' as const, label: 'All' },
                    { id: 'editing' as const, label: 'Video Edits' },
                    { id: 'clipping' as const, label: 'Clipping' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setFilterMode(tab.id)}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                        filterMode === tab.id
                          ? 'bg-zinc-800 text-white shadow-xs'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search drafts & projects..."
                  className="w-full bg-zinc-900/70 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-hidden"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="h-48 rounded-2xl border border-zinc-800/80 bg-zinc-900/20 flex items-center justify-center text-xs text-zinc-400 font-mono">
                Loading cached projects from {settings.cachePath}...
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="h-56 rounded-2xl border-2 border-dashed border-zinc-800/80 bg-zinc-900/20 flex flex-col items-center justify-center gap-3 text-center p-6">
                <div className="w-11 h-11 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-300">No saved projects yet</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Click &ldquo;Create New&rdquo; to start editing or clipping. Projects auto-save into {settings.cachePath}.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={openCreateModal}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Create First Project
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProjects.map((proj) => {
                  const isClipping = proj.mode === 'clipping';
                  const clipCount = proj.timeline.tracks.reduce((sum, t) => sum + t.clips.length, 0);
                  const allClips = proj.timeline.tracks.flatMap((t) => t.clips);
                  const activeDuration = allClips.length > 0
                    ? Math.max(...allClips.map((c) => c.timelineStart + c.duration))
                    : 0;
                  const thumb = proj.thumbnailUrl || proj.mediaLibrary.find((m) => m.thumbnailUrl)?.thumbnailUrl;

                  return (
                    <div
                      key={proj.id}
                      onClick={() => !isOpeningProject && openProject(proj.id)}
                      className="group rounded-xl border border-zinc-800/90 bg-[#111319] hover:border-blue-500/60 overflow-hidden flex flex-col transition-all hover:shadow-[0_8px_28px_rgba(0,0,0,0.6)] cursor-pointer"
                    >
                      {/* Thumbnail Area */}
                      <div className="aspect-video bg-zinc-950 relative overflow-hidden flex items-center justify-center border-b border-zinc-800/80">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={proj.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 text-zinc-600">
                            {isClipping ? (
                              <Scissors className="w-7 h-7 text-emerald-500/50" />
                            ) : (
                              <Film className="w-7 h-7 text-blue-500/50" />
                            )}
                            <span className="text-[10px] font-mono">Empty Timeline</span>
                          </div>
                        )}

                        {/* Top Left Mode Badge */}
                        <div className="absolute top-2 left-2 flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold backdrop-blur-md border ${
                              isClipping
                                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                                : 'bg-blue-950/80 border-blue-500/50 text-blue-300'
                            }`}
                          >
                            {isClipping ? 'Clip Cutter' : 'Video Edit'}
                          </span>
                        </div>

                        {/* Top Right Aspect & Duration */}
                        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/75 px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-200">
                          <span>{proj.settings.aspectRatio}</span>
                          <span>·</span>
                          <span>{secondsToTimecode(activeDuration, proj.settings.fps)}</span>
                        </div>

                        {/* Hover Actions */}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          <button
                            onClick={(e) => handleStartRename(proj.id, proj.name, e)}
                            className="p-1.5 rounded-md bg-black/75 text-zinc-300 hover:text-white hover:bg-zinc-800"
                            title="Rename Project"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateProject(proj.id);
                            }}
                            className="p-1.5 rounded-md bg-black/75 text-zinc-300 hover:text-white hover:bg-zinc-800"
                            title="Duplicate Project"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteProject(proj.id);
                            }}
                            className="p-1.5 rounded-md bg-black/75 text-zinc-300 hover:text-red-400 hover:bg-zinc-800"
                            title="Delete Project & Cached Media"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Card Details */}
                      <div className="p-3 space-y-1.5">
                        {renamingId === proj.id ? (
                          <form
                            onSubmit={(e) => handleConfirmRename(proj.id, e)}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1"
                          >
                            <input
                              type="text"
                              autoFocus
                              value={renameText}
                              onChange={(e) => setRenameText(e.target.value)}
                              className="flex-1 bg-zinc-950 border border-blue-500 rounded px-2 py-0.5 text-xs text-white focus:outline-hidden"
                            />
                            <button type="submit" className="p-1 text-emerald-400 hover:text-emerald-300">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingId(null)}
                              className="p-1 text-zinc-400 hover:text-white"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </form>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-bold text-white truncate" title={proj.name}>
                              {proj.name}
                            </h4>
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40 shrink-0">
                              Draft
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3 text-zinc-500" />
                            {clipCount} clips · {proj.mediaLibrary.length} media
                          </span>
                          <span className="flex items-center gap-1 text-zinc-500">
                            <Clock className="w-3 h-3" />
                            {new Date(proj.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
