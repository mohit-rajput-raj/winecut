'use client';

import React from 'react';
import { useWorkspace } from '../../lib/workspace/WorkspaceContext';
import { EditorProvider } from '../../lib/editor/EditorContext';
import { HomeDashboard } from '../workspace/HomeDashboard';
import { CreateProjectModal } from '../workspace/CreateProjectModal';
import { SettingsPage } from '../workspace/SettingsPage';
import { DesktopUpdaterNotice } from '../workspace/DesktopUpdaterNotice';
import { VideoEditor } from '../editor/VideoEditor';
import { ClippingWorkspace } from '../clipping/ClippingWorkspace';

export function StudioApp() {
  const { currentView, activeProject } = useWorkspace();

  return (
    <main className="w-screen h-screen overflow-hidden bg-neutral-950 relative">
      {/* Home Panel (CapCut-style Project Dashboard) */}
      {!activeProject && currentView === 'home' && <HomeDashboard />}

      {/* Active Workspace (Wrapped in EditorProvider synced to Top-Most WorkspaceContext) */}
      {activeProject && (
        <EditorProvider key={activeProject.id}>
          <div className={currentView === 'settings' ? 'hidden' : 'w-full h-full'}>
            {activeProject.mode === 'clipping' ? <ClippingWorkspace /> : <VideoEditor />}
          </div>
        </EditorProvider>
      )}

      {/* Professional Studio Settings Page (Preserves active project context beneath when opened!) */}
      {currentView === 'settings' && <SettingsPage />}

      {/* Create New Project Workflow Choice Modal (Clipping vs Video Editing) */}
      <CreateProjectModal />

      {/* Signed Auto-Update Prompt (Desktop Runtime Only) */}
      <DesktopUpdaterNotice />
    </main>
  );
}
