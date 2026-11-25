'use client';

import React, { useState } from 'react';
import { EditorHeader } from './EditorHeader';
import { EditorSidebar } from './EditorSidebar';
import { VideoPreviewCanvas } from './VideoPreviewCanvas';
import { InspectorPanel } from './InspectorPanel';
import { Timeline } from './Timeline';
import { ExportModal } from './ExportModal';
import { 
  ResizablePanelGroup, 
  ResizablePanel, 
  ResizableHandle 
} from '../ui/resizable';

export function VideoEditor() {
  const [isExportOpen, setIsExportOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden select-none">
      {/* Top Header Bar */}
      <EditorHeader onOpenExport={() => setIsExportOpen(true)} />

      {/* Resizable Editor Windows: Vertical split between Workspace & Timeline */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <ResizablePanelGroup direction="vertical" className="h-full w-full">
          {/* Top Row: Left Sidebar | Center Preview Canvas | Right Inspector */}
          <ResizablePanel defaultSize={62} minSize={30} className="min-h-0 flex flex-col">
            <ResizablePanelGroup direction="horizontal" className="h-full w-full">
              {/* Left Sidebar (Media, Text, Audio, Effects, AI Skills) */}
              <ResizablePanel defaultSize={22} minSize={12} maxSize={45} className="min-w-0 overflow-hidden flex flex-col">
                <EditorSidebar />
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Center Canvas Preview */}
              <ResizablePanel defaultSize={56} minSize={25} className="min-w-0 overflow-hidden flex flex-col">
                <VideoPreviewCanvas />
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Right Properties Inspector */}
              <ResizablePanel defaultSize={22} minSize={12} maxSize={45} className="min-w-0 overflow-hidden flex flex-col">
                <InspectorPanel />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Bottom Multi-Track Timeline */}
          <ResizablePanel defaultSize={38} minSize={20} className="min-h-0">
            <Timeline />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Export Render Modal */}
      <ExportModal 
        isOpen={isExportOpen} 
        onClose={() => setIsExportOpen(false)} 
      />
    </div>
  );
}
