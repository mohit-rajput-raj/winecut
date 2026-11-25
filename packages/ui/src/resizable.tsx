"use client";

import * as React from "react";
import * as ResizablePrimitive from "react-resizable-panels";
import { cn } from "./lib/utils";

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) => (
  <ResizablePrimitive.PanelGroup
    className={cn(
      "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
      className
    )}
    {...props}
  />
);

const ResizablePanel = ResizablePrimitive.Panel;

interface ResizableHandleProps extends React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> {
  withHandle?: boolean;
}

const ResizableHandle = ({
  withHandle = true,
  className,
  ...props
}: ResizableHandleProps) => (
  <ResizablePrimitive.PanelResizeHandle
    className={cn(
      "group relative flex items-center justify-center transition-colors select-none z-30",
      // Horizontal separator above Timeline: 100% full width across the entire screen, 8px height, row-resize cursor
      "data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:h-2 data-[panel-group-direction=vertical]:cursor-row-resize data-[panel-group-direction=vertical]:bg-zinc-900 data-[panel-group-direction=vertical]:border-y data-[panel-group-direction=vertical]:border-zinc-800 data-[panel-group-direction=vertical]:hover:bg-zinc-800 data-[panel-group-direction=vertical]:active:bg-zinc-700",
      // Vertical separator between sidebar / canvas / inspector: full height, 6px width, col-resize cursor
      "data-[panel-group-direction=horizontal]:h-full data-[panel-group-direction=horizontal]:w-1.5 data-[panel-group-direction=horizontal]:cursor-col-resize data-[panel-group-direction=horizontal]:bg-zinc-900 data-[panel-group-direction=horizontal]:border-x data-[panel-group-direction=horizontal]:border-zinc-800 data-[panel-group-direction=horizontal]:hover:bg-zinc-800 data-[panel-group-direction=horizontal]:active:bg-zinc-700",
      className
    )}
    {...props}
  >
    {withHandle && (
      <>
        {/* Horizontal grip pill for vertical group: centered horizontally across full width of timeline */}
        <div className="hidden data-[panel-group-direction=vertical]:block w-20 h-1 rounded-full bg-zinc-600 group-hover:bg-zinc-300 group-active:bg-white transition-colors pointer-events-none" />

        {/* Vertical grip pill for horizontal group: centered vertically in divider */}
        <div className="hidden data-[panel-group-direction=horizontal]:block h-8 w-1 rounded-full bg-zinc-600 group-hover:bg-zinc-300 group-active:bg-white transition-colors pointer-events-none" />
      </>
    )}
  </ResizablePrimitive.PanelResizeHandle>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
