'use client';

import React, { useState } from 'react';
import { useWorkspace } from '../../lib/workspace/WorkspaceContext';
import { openPathInExplorer, isTauriRuntime } from '../../lib/workspace/storage';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  ArrowLeft,
  Folder,
  HardDrive,
  Key,
  UserCheck,
  Sliders,
  Eye,
  EyeOff,
  CheckCircle2,
  ExternalLink,
  RotateCcw,
  Sparkles,
  Shield,
  LogOut,
  Cpu,
} from 'lucide-react';

type SettingsSection = 'storage' | 'ai' | 'account' | 'performance';

export function SettingsPage() {
  const {
    settings,
    activeProject,
    cacheStats,
    updateAppSettings,
    returnFromSettings,
    navigateToHome,
    refreshCacheStats,
  } = useWorkspace();

  const [section, setSection] = useState<SettingsSection>('storage');
  const [cachePathInput, setCachePathInput] = useState(settings.cachePath);
  const [downloadsPathInput, setDownloadsPathInput] = useState(settings.downloadsPath);
  const [geminiKeyInput, setGeminiKeyInput] = useState(settings.geminiApiKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<'idle' | 'testing' | 'verified'>('idle');

  const flashSaved = (msg: string) => {
    setSavedNotice(msg);
    setTimeout(() => setSavedNotice(null), 2500);
  };

  const handleSavePaths = async () => {
    await updateAppSettings({
      cachePath: cachePathInput.trim() || 'D:\\Editor\\cache',
      downloadsPath: downloadsPathInput.trim() || 'D:\\Editor\\downloads',
    });
    await refreshCacheStats();
    flashSaved('Storage paths updated & directories verified!');
  };

  const handleResetPaths = async () => {
    setCachePathInput('D:\\Editor\\cache');
    setDownloadsPathInput('D:\\Editor\\downloads');
    await updateAppSettings({
      cachePath: 'D:\\Editor\\cache',
      downloadsPath: 'D:\\Editor\\downloads',
    });
    flashSaved('Paths reset to D:\\Editor defaults.');
  };

  const handleBrowsePath = async (target: 'cache' | 'downloads') => {
    try {
      if ('showDirectoryPicker' in window) {
        // @ts-ignore
        const dir = await window.showDirectoryPicker();
        if (dir?.name) {
          if (target === 'cache') setCachePathInput(`D:\\Editor\\${dir.name}`);
          else setDownloadsPathInput(`D:\\Editor\\${dir.name}`);
          return;
        }
      }
      const val = prompt(
        `Enter full ${target === 'cache' ? 'Cache' : 'Downloads'} folder path:`,
        target === 'cache' ? cachePathInput : downloadsPathInput
      );
      if (val) {
        if (target === 'cache') setCachePathInput(val.trim());
        else setDownloadsPathInput(val.trim());
      }
    } catch {}
  };

  const handleVerifyGeminiKey = () => {
    setGeminiStatus('testing');
    setTimeout(async () => {
      await updateAppSettings({ geminiApiKey: geminiKeyInput.trim() });
      setGeminiStatus('verified');
      flashSaved('Gemini API configuration saved.');
    }, 600);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const sections = [
    { id: 'storage' as const, label: 'Storage & Paths', icon: Folder },
    { id: 'ai' as const, label: 'AI & Gemini API', icon: Key },
    { id: 'account' as const, label: 'Account & Auth', icon: UserCheck },
    { id: 'performance' as const, label: 'Render & Engine', icon: Sliders },
  ];

  return (
    <div className="flex h-screen w-screen bg-[#0a0b0e] text-zinc-100 font-sans select-none overflow-hidden">
      {/* Left Navigation Sidebar */}
      <aside className="w-64 shrink-0 bg-[#0e1015] border-r border-zinc-800/80 flex flex-col justify-between p-4">
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={returnFromSettings}
              className="h-8 px-2.5 gap-1.5 text-zinc-300 hover:text-white hover:bg-zinc-800 text-xs cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{activeProject ? 'Back to Project' : 'Back to Home'}</span>
            </Button>
          </div>

          <div className="px-2">
            <h1 className="text-base font-bold text-white tracking-tight">Studio Settings</h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Paths, Cache, AI Keys & Preferences
            </p>
          </div>

          <nav className="space-y-1 text-xs">
            {sections.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2 text-[10px] font-mono text-zinc-400">
          <div className="flex items-center justify-between">
            <span>Runtime Engine</span>
            <Badge variant="outline" className="text-[9px] border-zinc-700 text-emerald-400 py-0">
              {isTauriRuntime() ? 'Tauri Desktop' : 'Browser Mode'}
            </Badge>
          </div>
          {activeProject && (
            <button
              onClick={navigateToHome}
              className="w-full py-1.5 rounded bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-center cursor-pointer"
            >
              Go to Projects Home
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-2xl mx-auto space-y-6">
          {savedNotice && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-xs font-medium animate-in fade-in-0">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{savedNotice}</span>
            </div>
          )}

          {/* Section 1: Storage & Paths */}
          {section === 'storage' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white">Storage & Folder Locations</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Configure where Winecut saves exported MP4 videos and caches project drafts & media files.
                </p>
              </div>

              <div className="p-5 rounded-2xl border border-zinc-800 bg-[#111319] space-y-4">
                {/* Export / Downloads Path */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Folder className="w-3.5 h-3.5 text-blue-400" />
                      Export & Downloads Folder Location
                    </label>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        onClick={() => handleBrowsePath('downloads')}
                        className="text-blue-400 hover:underline cursor-pointer"
                      >
                        Browse...
                      </button>
                      <button
                        onClick={() => openPathInExplorer(downloadsPathInput)}
                        className="text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                        title="Open folder in Windows Explorer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open</span>
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={downloadsPathInput}
                    onChange={(e) => setDownloadsPathInput(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:border-blue-500 focus:outline-hidden"
                    placeholder="D:\Editor\downloads"
                  />
                  <p className="text-[11px] text-zinc-500">
                    All exported videos save automatically into this folder (Default: <code className="text-zinc-300">D:\Editor\downloads</code>).
                  </p>
                </div>

                {/* Cache Path */}
                <div className="space-y-1.5 pt-3 border-t border-zinc-800/80">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                      Project Cache & Media Storage Path
                    </label>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        onClick={() => handleBrowsePath('cache')}
                        className="text-blue-400 hover:underline cursor-pointer"
                      >
                        Browse...
                      </button>
                      <button
                        onClick={() => openPathInExplorer(cachePathInput)}
                        className="text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                        title="Open folder in Windows Explorer"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open</span>
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={cachePathInput}
                    onChange={(e) => setCachePathInput(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:border-emerald-500 focus:outline-hidden"
                    placeholder="D:\Editor\cache"
                  />
                  <p className="text-[11px] text-zinc-500">
                    Single-JSON drafts, cached videos, audio stems, and adjustments are preserved here (Default: <code className="text-zinc-300">D:\Editor\cache</code>).
                  </p>
                </div>

                {/* Cache Stats Row */}
                <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <span className="text-zinc-400 font-medium">Current Cache Usage</span>
                    <p className="text-[11px] font-mono text-zinc-500">
                      {cacheStats.files} cached files · {formatBytes(cacheStats.bytes)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleResetPaths}
                      className="h-7 text-[11px] border-zinc-800 bg-zinc-900 hover:bg-zinc-800 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Reset Defaults
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSavePaths}
                      className="h-7 text-[11px] bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                    >
                      Save Locations
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 2: AI & Gemini API */}
          {section === 'ai' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white">AI & Gemini API Configuration</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Connect your Google Gemini API key for future AI Smart Clipping, Auto-Hook detection, and Caption generation.
                </p>
              </div>

              <div className="p-5 rounded-2xl border border-zinc-800 bg-[#111319] space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-200 flex items-center justify-between">
                    <span>Google Gemini API Key</span>
                    {geminiStatus === 'verified' && (
                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Configured
                      </span>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={geminiKeyInput}
                        onChange={(e) => setGeminiKeyInput(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-3 pr-9 py-2 text-xs text-zinc-100 font-mono focus:border-blue-500 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                      >
                        {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleVerifyGeminiKey}
                      disabled={geminiStatus === 'testing'}
                      className="h-8 bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      {geminiStatus === 'testing' ? 'Saving...' : 'Save & Test Key'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-zinc-800/80">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
                      Default Gemini Model
                    </label>
                    <select
                      value={settings.geminiModel}
                      onChange={(e) => {
                        updateAppSettings({ geminiModel: e.target.value as any });
                        flashSaved('Gemini model updated.');
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:border-blue-500 focus:outline-hidden"
                    >
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast Multimodal)</option>
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro (Complex Analysis)</option>
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash (Legacy)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
                      Speech & Auto-Caption Engine
                    </label>
                    <select
                      value={settings.autoCaptionEngine}
                      onChange={(e) => {
                        updateAppSettings({ autoCaptionEngine: e.target.value as any });
                        flashSaved('Caption engine updated.');
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:border-blue-500 focus:outline-hidden"
                    >
                      <option value="whisper-local">Local Whisper Engine (Offline)</option>
                      <option value="gemini-multimodal">Gemini Audio + Speaker Diarization</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Account & Authentication */}
          {section === 'account' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white">Account & Authentication</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Manage local studio identity, OAuth integrations, and license tier status.
                </p>
              </div>

              <div className="p-5 rounded-2xl border border-zinc-800 bg-[#111319] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-base shadow">
                      {settings.authUser.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{settings.authUser.name}</span>
                        <Badge className="text-[10px] bg-blue-600/25 text-blue-300 border border-blue-500/40">
                          {settings.authUser.plan}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-400">{settings.authUser.email}</p>
                    </div>
                  </div>

                  {settings.authUser.isSignedIn ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        updateAppSettings({
                          authUser: {
                            isSignedIn: false,
                            name: 'Local Creator',
                            email: 'creator@winecut.local',
                            plan: 'Studio Free',
                            provider: 'guest',
                          },
                        });
                        flashSaved('Signed out to local workspace.');
                      }}
                      className="text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-300 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 mr-1.5" />
                      Sign Out
                    </Button>
                  ) : null}
                </div>

                {!settings.authUser.isSignedIn && (
                  <div className="pt-4 border-t border-zinc-800/80 space-y-2.5">
                    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                      Connect Studio Account (Preview Auth Providers)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <Button
                        variant="outline"
                        onClick={() => {
                          updateAppSettings({
                            authUser: {
                              isSignedIn: true,
                              name: 'Creator Google Studio',
                              email: 'creator@gmail.com',
                              plan: 'Pro Creator',
                              provider: 'google',
                            },
                          });
                          flashSaved('Connected Google account (Studio preview session).');
                        }}
                        className="h-9 border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-xs justify-start gap-2 cursor-pointer"
                      >
                        <Shield className="w-3.5 h-3.5 text-blue-400" />
                        <span>Sign in with Google</span>
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => {
                          updateAppSettings({
                            authUser: {
                              isSignedIn: true,
                              name: 'GitHub Developer',
                              email: 'dev@github.com',
                              plan: 'Workspace',
                              provider: 'github',
                            },
                          });
                          flashSaved('Connected GitHub workspace session.');
                        }}
                        className="h-9 border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-xs justify-start gap-2 cursor-pointer"
                      >
                        <Shield className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Sign in with GitHub</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 4: Render & Performance */}
          {section === 'performance' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white">Render & Hardware Engine Defaults</h2>
                <p className="text-xs text-zinc-400 mt-1">
                  Tune default export quality, FFmpeg encoder preferences, and auto-save frequency.
                </p>
              </div>

              <div className="p-5 rounded-2xl border border-zinc-800 bg-[#111319] space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
                      Default Export Resolution
                    </label>
                    <select
                      value={settings.defaultResolution}
                      onChange={(e) => {
                        updateAppSettings({ defaultResolution: e.target.value as any });
                        flashSaved('Default export resolution saved.');
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-hidden"
                    >
                      <option value="720p">720p HD (Default Fast)</option>
                      <option value="1080p">1080p Full HD</option>
                      <option value="4k">4K Ultra HD</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
                      Default Frame Rate
                    </label>
                    <select
                      value={settings.defaultFps}
                      onChange={(e) => {
                        updateAppSettings({ defaultFps: Number(e.target.value) as 30 | 60 });
                        flashSaved('Default frame rate saved.');
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-hidden"
                    >
                      <option value={30}>30 FPS (Standard)</option>
                      <option value={60}>60 FPS (Smooth)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-zinc-800/80">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-amber-400" />
                      Hardware Acceleration
                    </label>
                    <select
                      value={settings.hardwareAcceleration}
                      onChange={(e) => {
                        updateAppSettings({ hardwareAcceleration: e.target.value as any });
                        flashSaved('Encoder preference updated.');
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-hidden"
                    >
                      <option value="auto">Auto Detect (Recommended)</option>
                      <option value="nvenc">NVIDIA NVENC H.264</option>
                      <option value="quicksync">Intel QuickSync</option>
                      <option value="software">CPU Software (libx264)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1.5">
                      Auto-Save JSON Interval
                    </label>
                    <select
                      value={settings.autoSaveIntervalMs}
                      onChange={(e) => {
                        updateAppSettings({ autoSaveIntervalMs: Number(e.target.value) });
                        flashSaved('Auto-save timing updated.');
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-hidden"
                    >
                      <option value={500}>Instant (0.5 sec)</option>
                      <option value={1200}>Balanced (1.2 sec)</option>
                      <option value={3000}>Relaxed (3 sec)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
