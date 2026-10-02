'use client';

import React, { useState, useRef } from 'react';
import { StudioTopbar } from './studio-topbar';
import { StudioToolstrip, type StudioTool } from './studio-toolstrip';
import { StudioInspector } from './studio-inspector';
import { GenerationDock } from './generation-dock';
import {
  CanvasWorkspace,
  type CanvasSelectionInfo,
  type CanvasLayerItem,
  type CanvasWorkspaceHandle,
} from '@/components/canvas/canvas-workspace';

export interface StudioShellProps {
  projectId?: string;
  projectTitle?: string;
  initialArtworkUrl?: string;
}

export const StudioShell: React.FC<StudioShellProps> = ({
  projectTitle = 'Obsidian Product Launch',
  initialArtworkUrl,
}) => {
  const canvasRef = useRef<CanvasWorkspaceHandle | null>(null);
  const [selection, setSelection] = useState<CanvasSelectionInfo | null>(null);
  const [layers, setLayers] = useState<CanvasLayerItem[]>([]);
  const [activeTool, setActiveTool] = useState<StudioTool>('select');
  const [zoomLevel, setZoomLevel] = useState<string>('100%');
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);

  // Single unified image import pipeline for Add Image button
  const handleAddImage = (file: File) => {
    canvasRef.current?.importImageFile(file);
  };

  const handleMainDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        canvasRef.current?.importImageFile(file);
        break;
      }
    }
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: '#090a0d',
        color: 'var(--text-primary)',
      }}
    >
      {/* 1. TOP: Studio Topbar (50px) */}
      <StudioTopbar
        projectTitle={projectTitle}
        zoomLevel={zoomLevel}
        onZoomChange={setZoomLevel}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => canvasRef.current?.undo()}
        onRedo={() => canvasRef.current?.redo()}
        onExport={() => canvasRef.current?.exportPng()}
        onAddImage={handleAddImage}
      />

      {/* 2. CENTER ROW: Toolstrip (48px) + Fabric Canvas + Inspector (320px) */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Left: Toolstrip (48px) */}
        <StudioToolstrip activeTool={activeTool} onToolSelect={setActiveTool} />

        {/* Center: Canvas Viewport (dominant creative workspace with drag & drop) */}
        <main
          aria-label="Canvas Workspace"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={handleMainDrop}
          style={{
            flex: 1,
            minWidth: 0,
            backgroundColor: '#0c0e14',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
            position: 'relative',
          }}
        >
          <CanvasWorkspace
            ref={canvasRef}
            initialArtworkUrl={initialArtworkUrl}
            initialArtworkName={projectTitle}
            onSelectionChange={setSelection}
            onLayersChange={setLayers}
            activeTool={activeTool}
            zoomLevel={zoomLevel}
            onHistoryChange={(undoable, redoable) => {
              setCanUndo(undoable);
              setCanRedo(redoable);
            }}
          />
        </main>

        {/* Right: Inspector (320px) */}
        <StudioInspector
          selection={selection}
          layers={layers}
          onSelectLayer={(id) => canvasRef.current?.selectLayer(id)}
          onUpdateTransform={(t) => canvasRef.current?.updateTransform(t)}
          onToggleVisibility={(id) => {
            if (id) {
              canvasRef.current?.toggleLayerVisibility(id);
            } else {
              canvasRef.current?.toggleVisibility();
            }
          }}
          onMoveLayerUp={(id) => canvasRef.current?.moveLayerUp(id)}
          onMoveLayerDown={(id) => canvasRef.current?.moveLayerDown(id)}
          onDeleteLayer={(id) => canvasRef.current?.deleteLayer(id)}
        />
      </div>

      {/* 3. BOTTOM: Generation Dock (160px) */}
      <GenerationDock />
    </div>
  );
};
