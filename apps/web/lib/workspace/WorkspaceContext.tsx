'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppSettings, AspectRatio, EditorProject, ProjectMode } from '../editor/types';
import { DEFAULT_FRAMER_SETTINGS, INITIAL_TRACKS } from '../editor/sample-data';
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  saveAppSettings,
  loadAllSavedProjects,
  saveProjectJson,
  deleteSavedProject,
  rehydrateProjectMedia,
  cacheMediaFile,
  fetchCacheStats,
} from './storage';

export type WorkspaceView = 'home' | 'workspace' | 'settings';

interface WorkspaceContextType {
  currentView: WorkspaceView;
  settings: AppSettings;
  savedProjects: EditorProject[];
  activeProject: EditorProject | null;
  isLoading: boolean;
  isOpeningProject: boolean;
  cacheStats: { bytes: number; files: number };

  // Create New Modal control
  isCreateModalOpen: boolean;
  openCreateModal: () => void;
  closeCreateModal: () => void;

  // Navigation & Actions
  navigateToHome: () => Promise<void>;
  navigateToSettings: () => void;
  returnFromSettings: () => void;
  createProject: (options: { name: string; mode: ProjectMode; aspectRatio?: AspectRatio }) => Promise<void>;
  openProject: (projectId: string) => Promise<void>;
  duplicateProject: (projectId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  renameProject: (projectId: string, newName: string) => Promise<void>;
  saveProjectSnapshot: (project: EditorProject) => Promise<void>;
  switchActiveProjectMode: (mode: ProjectMode, updatedProject?: EditorProject) => Promise<void>;
  cacheAssetForActiveProject: (assetId: string, fileName: string, blob: Blob) => Promise<string | undefined>;
  updateAppSettings: (updates: Partial<AppSettings>) => Promise<void>;
  refreshCacheStats: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [currentView, setCurrentView] = useState<WorkspaceView>('home');
  const [previousView, setPreviousView] = useState<'home' | 'workspace'>('home');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [savedProjects, setSavedProjects] = useState<EditorProject[]>([]);
  const [activeProject, setActiveProject] = useState<EditorProject | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOpeningProject, setIsOpeningProject] = useState<boolean>(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [cacheStats, setCacheStats] = useState<{ bytes: number; files: number }>({ bytes: 0, files: 0 });

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const refreshCacheStats = useCallback(async (overridePath?: string) => {
    const stats = await fetchCacheStats(overridePath || settingsRef.current.cachePath);
    setCacheStats(stats);
  }, []);

  // Boot Workspace: load settings (from D:\Editor\cache\settings.json + localStorage) & saved projects
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const loadedSettings = await loadAppSettings();
        if (!mounted) return;
        setSettings(loadedSettings);

        const projects = await loadAllSavedProjects(loadedSettings.cachePath);
        if (!mounted) return;
        setSavedProjects(projects);

        const stats = await fetchCacheStats(loadedSettings.cachePath);
        if (!mounted) return;
        setCacheStats(stats);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const openCreateModal = useCallback(() => setIsCreateModalOpen(true), []);
  const closeCreateModal = useCallback(() => setIsCreateModalOpen(false), []);

  const saveProjectSnapshot = useCallback(async (project: EditorProject) => {
    const now = new Date().toISOString();
    const updated: EditorProject = {
      ...project,
      updatedAt: now,
    };

    // Update Thumbnail automatically from first asset if not already set
    if (!updated.thumbnailUrl && updated.mediaLibrary.length > 0) {
      const thumb = updated.mediaLibrary.find((a) => a.thumbnailUrl)?.thumbnailUrl;
      if (thumb) updated.thumbnailUrl = thumb;
    }

    setSavedProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === updated.id);
      const next = idx >= 0
        ? prev.map((p) => (p.id === updated.id ? updated : p))
        : [updated, ...prev];
      return [...next].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });

    // Update activeProject ref metadata only if same ID
    setActiveProject((prev) => (prev && prev.id === updated.id ? updated : prev));

    await saveProjectJson(settingsRef.current.cachePath, updated);
  }, []);

  const navigateToHome = useCallback(async () => {
    const projects = await loadAllSavedProjects(settingsRef.current.cachePath);
    setSavedProjects(projects);
    await refreshCacheStats();
    setActiveProject(null);
    setCurrentView('home');
  }, [refreshCacheStats]);

  const navigateToSettings = useCallback(() => {
    if (currentView !== 'settings') {
      setPreviousView(currentView === 'workspace' ? 'workspace' : 'home');
      setCurrentView('settings');
      refreshCacheStats();
    }
  }, [currentView, refreshCacheStats]);

  const returnFromSettings = useCallback(() => {
    setCurrentView(previousView === 'workspace' && activeProject ? 'workspace' : 'home');
  }, [previousView, activeProject]);

  const createProject = useCallback(
    async ({ name, mode, aspectRatio }: { name: string; mode: ProjectMode; aspectRatio?: AspectRatio }) => {
      const resolvedRatio: AspectRatio = aspectRatio || (mode === 'clipping' ? '9:16' : '16:9');
      let width: number;
      let height: number;
      if (resolvedRatio === '9:16') {
        width = 1080;
        height = 1920;
      } else if (resolvedRatio === '1:1') {
        width = 1080;
        height = 1080;
      } else if (resolvedRatio === '4:5') {
        width = 1080;
        height = 1350;
      } else {
        width = 1920;
        height = 1080;
      }

      const now = new Date().toISOString();
      const newProject: EditorProject = {
        id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim() || (mode === 'clipping' ? 'Podcast_Clip_01' : 'Video_Project_01'),
        version: '0.2.0',
        mode,
        status: 'in_progress',
        settings: {
          width,
          height,
          fps: settingsRef.current.defaultFps || 30,
          aspectRatio: resolvedRatio,
          duration: 30,
          sampleRate: 48000,
        },
        timeline: {
          tracks: structuredClone(INITIAL_TRACKS),
          duration: 30,
          fps: settingsRef.current.defaultFps || 30,
        },
        mediaLibrary: [],
        framerSettings: structuredClone(DEFAULT_FRAMER_SETTINGS),
        lastPlayheadTime: 0,
        createdAt: now,
        updatedAt: now,
      };

      await saveProjectSnapshot(newProject);
      setActiveProject(newProject);
      setIsCreateModalOpen(false);
      setCurrentView('workspace');
    },
    [saveProjectSnapshot]
  );

  const openProject = useCallback(async (projectId: string) => {
    setIsOpeningProject(true);
    try {
      const projects = await loadAllSavedProjects(settingsRef.current.cachePath);
      const target = projects.find((p) => p.id === projectId);
      if (!target) return;

      // Rehydrate cached media binaries from D:\Editor\cache\media\<projectId> (or IDB)
      const hydrated = await rehydrateProjectMedia(target);
      setActiveProject(hydrated);
      setCurrentView('workspace');
    } finally {
      setIsOpeningProject(false);
    }
  }, []);

  const duplicateProject = useCallback(async (projectId: string) => {
    const src = savedProjects.find((p) => p.id === projectId);
    if (!src) return;
    const now = new Date().toISOString();
    const copy: EditorProject = {
      ...structuredClone(src),
      id: `proj-${Date.now()}-copy`,
      name: `${src.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
    };
    await saveProjectSnapshot(copy);
  }, [savedProjects, saveProjectSnapshot]);

  const deleteProject = useCallback(async (projectId: string) => {
    const target = savedProjects.find((p) => p.id === projectId);
    if (!target) return;
    await deleteSavedProject(settingsRef.current.cachePath, target);
    setSavedProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (activeProject?.id === projectId) {
      setActiveProject(null);
      setCurrentView('home');
    }
    await refreshCacheStats();
  }, [savedProjects, activeProject, refreshCacheStats]);

  const renameProject = useCallback(async (projectId: string, newName: string) => {
    const clean = newName.trim();
    if (!clean) return;
    const target = savedProjects.find((p) => p.id === projectId);
    if (!target) return;
    await saveProjectSnapshot({ ...target, name: clean });
  }, [savedProjects, saveProjectSnapshot]);

  const switchActiveProjectMode = useCallback(
    async (mode: ProjectMode, updatedProject?: EditorProject) => {
      const base = updatedProject || activeProject;
      if (!base) return;
      const nextProj: EditorProject = {
        ...base,
        mode,
        updatedAt: new Date().toISOString(),
      };
      await saveProjectSnapshot(nextProj);
      setActiveProject(nextProj);
      setCurrentView('workspace');
    },
    [activeProject, saveProjectSnapshot]
  );

  const cacheAssetForActiveProject = useCallback(
    async (assetId: string, fileName: string, blob: Blob) => {
      const pid = activeProject?.id || 'default';
      const path = await cacheMediaFile(settingsRef.current.cachePath, pid, assetId, fileName, blob);
      await refreshCacheStats();
      return path;
    },
    [activeProject?.id, refreshCacheStats]
  );

  const updateAppSettings = useCallback(async (updates: Partial<AppSettings>) => {
    const nextSettings: AppSettings = {
      ...settingsRef.current,
      ...updates,
      authUser: {
        ...settingsRef.current.authUser,
        ...(updates.authUser || {}),
      },
    };
    setSettings(nextSettings);
    await saveAppSettings(nextSettings);

    // If cache path changed, reload projects from the new cache location
    if (updates.cachePath && updates.cachePath !== settingsRef.current.cachePath) {
      const projects = await loadAllSavedProjects(nextSettings.cachePath);
      setSavedProjects(projects);
      await refreshCacheStats(nextSettings.cachePath);
    }
  }, [refreshCacheStats]);

  return (
    <WorkspaceContext.Provider
      value={{
        currentView,
        settings,
        savedProjects,
        activeProject,
        isLoading,
        isOpeningProject,
        cacheStats,
        isCreateModalOpen,
        openCreateModal,
        closeCreateModal,
        navigateToHome,
        navigateToSettings,
        returnFromSettings,
        createProject,
        openProject,
        duplicateProject,
        deleteProject,
        renameProject,
        saveProjectSnapshot,
        switchActiveProjectMode,
        cacheAssetForActiveProject,
        updateAppSettings,
        refreshCacheStats,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
