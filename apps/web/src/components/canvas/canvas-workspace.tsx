'use client';

import { useEffect, useRef, useState } from 'react';
import { Canvas, Rect, type FabricObject } from 'fabric';
import { createCanvasProject, type CanvasProject } from '@/lib/canvas/canvas-project';
import {
  layerToFabricDescriptor,
  fabricToCanonicalTransform,
  type FabricGeometry,
} from '@/lib/canvas/fabric-bridge';

const TEST_LAYER_ID = '00000000-0000-0000-0000-000000000002';
const TEST_SOURCE_ASSET_ID = '00000000-0000-0000-0000-000000000001';

type CanonicalFabricObject = FabricObject & {
  canonicalLayerId?: string;
};

export function CanvasWorkspace() {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);

  const projectRef = useRef<CanvasProject | null>(null);
  if (!projectRef.current) {
    const project = createCanvasProject({
      canvas: { width: 800, height: 600, dpi: 72 },
    });
    project.addLayer({
      id: TEST_LAYER_ID,
      name: 'Test Rectangle',
      sourceAssetId: TEST_SOURCE_ASSET_ID,
      transform: {
        x: 400,
        y: 300,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        originX: 'center',
        originY: 'center',
      },
    });
    projectRef.current = project;
  }

  const [manifestVersion, setManifestVersion] = useState<number>(
    projectRef.current.manifest.version
  );

  useEffect(() => {
    const canvasEl = canvasElRef.current;
    const project = projectRef.current;
    if (!canvasEl || !project) return;

    const fabricCanvas = new Canvas(canvasEl, {
      width: project.manifest.canvas.width,
      height: project.manifest.canvas.height,
    });
    fabricCanvasRef.current = fabricCanvas;

    const canonicalLayer = project.manifest.layers.find((l) => l.id === TEST_LAYER_ID);
    if (canonicalLayer) {
      const descriptor = layerToFabricDescriptor(canonicalLayer);

      const rect = new Rect({
        left: descriptor.left,
        top: descriptor.top,
        width: 200,
        height: 120,
        fill: '#3b82f6',
        stroke: '#1d4ed8',
        strokeWidth: 2,
        scaleX: descriptor.scaleX,
        scaleY: descriptor.scaleY,
        angle: descriptor.angle,
        originX: descriptor.originX,
        originY: descriptor.originY,
        opacity: descriptor.opacity,
        globalCompositeOperation: descriptor.globalCompositeOperation,
        visible: descriptor.visible,
        hasControls: true,
        hasBorders: true,
        selectable: true,
      }) as CanonicalFabricObject;

      rect.canonicalLayerId = descriptor.id;

      fabricCanvas.add(rect);
      fabricCanvas.setActiveObject(rect);
      fabricCanvas.renderAll();
    }

    fabricCanvas.on('object:modified', (e) => {
      const target = e.target as CanonicalFabricObject | undefined;
      if (!target || !target.canonicalLayerId) return;

      const layerId = target.canonicalLayerId;

      const geometry: FabricGeometry = {
        left: target.left,
        top: target.top,
        scaleX: target.scaleX,
        scaleY: target.scaleY,
        angle: target.angle,
        originX: target.originX as 'left' | 'center' | 'right',
        originY: target.originY as 'top' | 'center' | 'bottom',
      };

      const transformDelta = fabricToCanonicalTransform(geometry);
      const updatedLayer = project.updateLayerTransform(layerId, transformDelta);

      const canonicalDescriptor = layerToFabricDescriptor(updatedLayer);
      target.set({
        left: canonicalDescriptor.left,
        top: canonicalDescriptor.top,
        scaleX: canonicalDescriptor.scaleX,
        scaleY: canonicalDescriptor.scaleY,
        angle: canonicalDescriptor.angle,
        originX: canonicalDescriptor.originX,
        originY: canonicalDescriptor.originY,
      });
      target.setCoords();
      fabricCanvas.requestRenderAll();

      setManifestVersion(project.manifest.version);
    });

    return () => {
      fabricCanvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, []);

  return (
    <div>
      <h1>AristoColors Canvas Workspace</h1>
      <p>Manifest Version: {manifestVersion}</p>
      <div style={{ border: '1px solid #ccc', display: 'inline-block' }}>
        <canvas ref={canvasElRef} />
      </div>
    </div>
  );
}
