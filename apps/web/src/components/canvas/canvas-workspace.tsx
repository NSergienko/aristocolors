'use client';

import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { Canvas, FabricImage, type FabricObject } from 'fabric';
import { createCanvasProject, type CanvasProject } from '@/lib/canvas/canvas-project';
import type { StudioTool } from '@/components/studio/studio-toolstrip';

export type CanonicalFabricObject = FabricObject & {
  canonicalLayerId?: string;
  layerName?: string;
  layerType?: 'image' | 'paint';
};

export interface CanvasLayerItem {
  id: string;
  name: string;
  type: 'image' | 'paint';
  visible: boolean;
  isSelected: boolean;
}

export interface CanvasSelectionInfo {
  isSelected: boolean;
  id?: string;
  name?: string;
  type?: 'image' | 'paint';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  blendMode?: string;
  visible?: boolean;
}

export interface CanvasWorkspaceHandle {
  selectLayer: (id?: string) => void;
  updateTransform: (transform: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    rotation?: number;
    opacity?: number;
    blendMode?: string;
  }) => void;
  toggleVisibility: () => void;
  toggleLayerVisibility: (id: string) => void;
  moveLayerUp: (id: string) => void;
  moveLayerDown: (id: string) => void;
  deleteLayer: (id: string) => void;
  importImageFile: (file: File, dropCoords?: { x: number; y: number }) => void;
  addImageLayer: (dataUrl: string, filename: string, dropCoords?: { x: number; y: number }) => void;
  undo: () => void;
  redo: () => void;
  exportPng: () => void;
}

export interface CanvasWorkspaceProps {
  initialArtworkUrl?: string;
  initialArtworkName?: string;
  onSelectionChange?: (selection: CanvasSelectionInfo) => void;
  onLayersChange?: (layers: CanvasLayerItem[]) => void;
  activeTool?: StudioTool;
  zoomLevel?: string;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}

const BLEND_TO_COMPOSITE: Record<string, GlobalCompositeOperation> = {
  Normal: 'source-over',
  Multiply: 'multiply',
  Screen: 'screen',
  Overlay: 'overlay',
};

const COMPOSITE_TO_BLEND: Record<string, string> = {
  'source-over': 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
};

interface LayerTransformState {
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  opacity: number;
  globalCompositeOperation: GlobalCompositeOperation;
  visible: boolean;
}

type HistoryAction =
  | {
      type: 'layer_transform';
      layerId: string;
      before: LayerTransformState;
      after: LayerTransformState;
    }
  | {
      type: 'add_layer';
      object: CanonicalFabricObject;
    }
  | {
      type: 'delete_layer';
      object: CanonicalFabricObject;
      index: number;
      wasActive: boolean;
    }
  | {
      type: 'reorder_layer';
      fromIndex: number;
      toIndex: number;
    }
  | {
      type: 'visibility_layer';
      layerId: string;
      beforeVisible: boolean;
      afterVisible: boolean;
    }
  | {
      type: 'paint_stroke';
      object: CanonicalFabricObject;
    };

const getZoomScale = (zoom: string): number => {
  switch (zoom) {
    case '50%':
      return 0.5;
    case '75%':
      return 0.75;
    case '100%':
      return 1.0;
    case '125%':
      return 1.25;
    case '150%':
      return 1.5;
    case 'Fit':
      return 0.85;
    default:
      return 1.0;
  }
};

export const CanvasWorkspace = forwardRef<CanvasWorkspaceHandle, CanvasWorkspaceProps>(
  function CanvasWorkspace(
    {
      initialArtworkUrl,
      initialArtworkName,
      onSelectionChange,
      onLayersChange,
      activeTool = 'select',
      zoomLevel = '100%',
      onHistoryChange,
    }: CanvasWorkspaceProps,
    ref
  ) {
    const canvasElRef = useRef<HTMLCanvasElement | null>(null);
    const fabricCanvasRef = useRef<Canvas | null>(null);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const onLayersChangeRef = useRef(onLayersChange);
    const onHistoryChangeRef = useRef(onHistoryChange);

    const undoStackRef = useRef<HistoryAction[]>([]);
    const redoStackRef = useRef<HistoryAction[]>([]);
    const currentLayerStatesRef = useRef<Map<string, LayerTransformState>>(new Map());

    useEffect(() => {
      onSelectionChangeRef.current = onSelectionChange;
    }, [onSelectionChange]);

    useEffect(() => {
      onLayersChangeRef.current = onLayersChange;
    }, [onLayersChange]);

    useEffect(() => {
      onHistoryChangeRef.current = onHistoryChange;
    }, [onHistoryChange]);

    const updateHistoryStatus = () => {
      onHistoryChangeRef.current?.(
        undoStackRef.current.length > 0,
        redoStackRef.current.length > 0
      );
    };

    const projectRef = useRef<CanvasProject | null>(null);
    if (!projectRef.current) {
      projectRef.current = createCanvasProject({
        canvas: { width: 800, height: 600, dpi: 72 },
      });
    }

    const [, setManifestVersion] = useState<number>(
      projectRef.current.manifest.version
    );

    const extractLayerState = (obj: CanonicalFabricObject): LayerTransformState => ({
      left: Math.round(obj.left ?? 0),
      top: Math.round(obj.top ?? 0),
      scaleX: obj.scaleX ?? 1,
      scaleY: obj.scaleY ?? 1,
      angle: Math.round(obj.angle ?? 0),
      opacity: obj.opacity ?? 1,
      globalCompositeOperation: (obj.globalCompositeOperation || 'source-over') as GlobalCompositeOperation,
      visible: obj.visible !== false,
    });

    const isStateEqual = (a: LayerTransformState | null, b: LayerTransformState | null) => {
      if (!a || !b) return false;
      return (
        a.left === b.left &&
        a.top === b.top &&
        Math.abs(a.scaleX - b.scaleX) < 0.001 &&
        Math.abs(a.scaleY - b.scaleY) < 0.001 &&
        a.angle === b.angle &&
        Math.abs(a.opacity - b.opacity) < 0.001 &&
        a.globalCompositeOperation === b.globalCompositeOperation &&
        a.visible === b.visible
      );
    };

    const applyLayerState = (target: CanonicalFabricObject, state: LayerTransformState) => {
      target.set({
        left: state.left,
        top: state.top,
        scaleX: state.scaleX,
        scaleY: state.scaleY,
        angle: state.angle,
        opacity: state.opacity,
        globalCompositeOperation: state.globalCompositeOperation,
        visible: state.visible,
      });
      target.setCoords();
    };

    const syncLayers = () => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const activeObj = canvas.getActiveObject() as CanonicalFabricObject | undefined;
      const objects = (canvas.getObjects() as CanonicalFabricObject[]).filter(
        (obj) => Boolean(obj.canonicalLayerId)
      );

      // Top of array in UI is topmost object in canvas (highest index)
      const layerItems: CanvasLayerItem[] = [...objects]
        .reverse()
        .map((obj) => ({
          id: obj.canonicalLayerId!,
          name: obj.layerName || 'Layer',
          type: obj.layerType || 'image',
          visible: obj.visible !== false,
          isSelected: Boolean(activeObj && activeObj.canonicalLayerId === obj.canonicalLayerId),
        }));

      onLayersChangeRef.current?.(layerItems);
    };

    const notifySelection = () => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const activeObject = canvas.getActiveObject() as CanonicalFabricObject | undefined;

      if (!activeObject || !activeObject.canonicalLayerId) {
        onSelectionChangeRef.current?.({ isSelected: false });
        return;
      }

      const layerId = activeObject.canonicalLayerId;
      const left = Math.round(activeObject.left ?? 0);
      const top = Math.round(activeObject.top ?? 0);
      const width = Math.round((activeObject.width ?? 0) * (activeObject.scaleX ?? 1));
      const height = Math.round((activeObject.height ?? 0) * (activeObject.scaleY ?? 1));
      const rotation = Math.round(activeObject.angle ?? 0);
      const opacity = Math.round((activeObject.opacity ?? 1) * 100);
      const rawComposite = (activeObject.globalCompositeOperation || 'source-over') as string;
      const blendMode = COMPOSITE_TO_BLEND[rawComposite] || 'Normal';
      const visible = activeObject.visible !== false;

      onSelectionChangeRef.current?.({
        isSelected: true,
        id: layerId,
        name: activeObject.layerName || 'Layer',
        type: activeObject.layerType || 'image',
        x: left,
        y: top,
        width,
        height,
        rotation,
        opacity,
        blendMode,
        visible,
      });
    };

    // Unified Image Import Pipeline: DataURL -> Fabric.Image -> Canvas -> Selection
    const addImageLayerFromDataUrl = (
      dataUrl: string,
      filename: string,
      dropCoords?: { x: number; y: number }
    ) => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const cleanName = filename.replace(/^.*[\\\/]/, '') || 'Imported Image';
      const imgElement = new Image();
      imgElement.crossOrigin = 'anonymous';
      imgElement.src = dataUrl;

      imgElement.onload = () => {
        const canvasWidth = canvas.width || 800;
        const canvasHeight = canvas.height || 600;
        const naturalW = imgElement.naturalWidth || 600;
        const naturalH = imgElement.naturalHeight || 400;

        // Preserve aspect ratio; scale down only if larger than 75% of artboard
        const maxW = canvasWidth * 0.75;
        const maxH = canvasHeight * 0.75;
        let scale = 1;
        if (naturalW > maxW || naturalH > maxH) {
          scale = Math.min(maxW / naturalW, maxH / naturalH);
        }

        const posX = dropCoords ? dropCoords.x : canvasWidth / 2;
        const posY = dropCoords ? dropCoords.y : canvasHeight / 2;

        const newLayerId =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        const fabricImg = new FabricImage(imgElement, {
          left: posX,
          top: posY,
          originX: 'center',
          originY: 'center',
          scaleX: scale,
          scaleY: scale,
          angle: 0,
          opacity: 1,
          visible: true,
          selectable: true,
          hasControls: activeTool !== 'move',
          hasBorders: true,
        }) as CanonicalFabricObject;

        fabricImg.canonicalLayerId = newLayerId;
        fabricImg.layerName = cleanName;
        fabricImg.layerType = 'image';

        currentLayerStatesRef.current.set(newLayerId, extractLayerState(fabricImg));

        canvas.add(fabricImg);
        canvas.setActiveObject(fabricImg);
        canvas.requestRenderAll();

        undoStackRef.current.push({
          type: 'add_layer',
          object: fabricImg,
        });
        redoStackRef.current = [];
        updateHistoryStatus();

        syncLayers();
        notifySelection();
      };
    };

    // Unified Image Import Pipeline: File -> FileReader -> addImageLayerFromDataUrl
    const importImageFile = (file: File, dropCoords?: { x: number; y: number }) => {
      const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          addImageLayerFromDataUrl(reader.result, file.name, dropCoords);
        }
      };
      reader.readAsDataURL(file);
    };

    useImperativeHandle(
      ref,
      () => ({
        selectLayer: (id?: string) => {
          const canvas = fabricCanvasRef.current;
          if (!canvas) return;

          if (!id) {
            canvas.discardActiveObject();
            canvas.requestRenderAll();
            notifySelection();
            syncLayers();
            return;
          }

          const objects = canvas.getObjects() as CanonicalFabricObject[];
          const target = objects.find((o) => o.canonicalLayerId === id);
          if (target && target.visible !== false) {
            canvas.setActiveObject(target);
            canvas.requestRenderAll();
            notifySelection();
            syncLayers();
          }
        },

        updateTransform: (transform) => {
          const canvas = fabricCanvasRef.current;
          if (!canvas) return;
          const target = canvas.getActiveObject() as CanonicalFabricObject | undefined;
          if (!target || !target.canonicalLayerId) return;

          const layerId = target.canonicalLayerId;
          const beforeState = extractLayerState(target);

          if (transform.x !== undefined && !isNaN(transform.x)) {
            target.set({ left: transform.x });
          }
          if (transform.y !== undefined && !isNaN(transform.y)) {
            target.set({ top: transform.y });
          }
          if (transform.width !== undefined && !isNaN(transform.width) && transform.width > 0) {
            const baseW = target.width || 1;
            target.set({ scaleX: transform.width / baseW });
          }
          if (transform.height !== undefined && !isNaN(transform.height) && transform.height > 0) {
            const baseH = target.height || 1;
            target.set({ scaleY: transform.height / baseH });
          }
          if (transform.rotation !== undefined && !isNaN(transform.rotation)) {
            target.set({ angle: transform.rotation });
          }
          if (transform.opacity !== undefined && !isNaN(transform.opacity)) {
            target.set({ opacity: Math.max(0, Math.min(1, transform.opacity / 100)) });
          }
          if (transform.blendMode !== undefined) {
            const comp = BLEND_TO_COMPOSITE[transform.blendMode] || 'source-over';
            target.set({ globalCompositeOperation: comp });
          }

          target.setCoords();
          canvas.requestRenderAll();

          const afterState = extractLayerState(target);
          if (!isStateEqual(beforeState, afterState)) {
            undoStackRef.current.push({
              type: 'layer_transform',
              layerId,
              before: beforeState,
              after: afterState,
            });
            redoStackRef.current = [];
            currentLayerStatesRef.current.set(layerId, afterState);
            updateHistoryStatus();
          }

          notifySelection();
          syncLayers();
        },

        toggleVisibility: () => {
          const canvas = fabricCanvasRef.current;
          if (!canvas) return;
          const target = canvas.getActiveObject() as CanonicalFabricObject | undefined;
          if (!target || !target.canonicalLayerId) return;

          const layerId = target.canonicalLayerId;
          const beforeVisible = target.visible !== false;
          const afterVisible = !beforeVisible;
          target.set({ visible: afterVisible });

          if (!afterVisible && canvas.getActiveObject() === target) {
            canvas.discardActiveObject();
          } else if (afterVisible) {
            canvas.setActiveObject(target);
          }

          undoStackRef.current.push({
            type: 'visibility_layer',
            layerId,
            beforeVisible,
            afterVisible,
          });
          redoStackRef.current = [];
          updateHistoryStatus();

          canvas.requestRenderAll();
          syncLayers();
          notifySelection();
        },

        toggleLayerVisibility: (id: string) => {
          const canvas = fabricCanvasRef.current;
          if (!canvas) return;
          const objects = (canvas as any)._objects as CanonicalFabricObject[];
          const target = objects.find((o) => o.canonicalLayerId === id);
          if (!target) return;

          const beforeVisible = target.visible !== false;
          const afterVisible = !beforeVisible;
          target.set({ visible: afterVisible });

          if (!afterVisible && canvas.getActiveObject() === target) {
            canvas.discardActiveObject();
          } else if (afterVisible) {
            canvas.setActiveObject(target);
          }

          undoStackRef.current.push({
            type: 'visibility_layer',
            layerId: id,
            beforeVisible,
            afterVisible,
          });
          redoStackRef.current = [];
          updateHistoryStatus();

          canvas.requestRenderAll();
          syncLayers();
          notifySelection();
        },

        moveLayerUp: (id: string) => {
          const canvas = fabricCanvasRef.current;
          if (!canvas) return;
          const objs = (canvas as any)._objects as CanonicalFabricObject[];
          const idx = objs.findIndex((o) => o.canonicalLayerId === id);
          if (idx === -1 || idx >= objs.length - 1) return;
          const target = objs[idx];

          objs.splice(idx, 1);
          objs.splice(idx + 1, 0, target);

          undoStackRef.current.push({
            type: 'reorder_layer',
            fromIndex: idx,
            toIndex: idx + 1,
          });
          redoStackRef.current = [];
          updateHistoryStatus();

          canvas.requestRenderAll();
          syncLayers();
        },

        moveLayerDown: (id: string) => {
          const canvas = fabricCanvasRef.current;
          if (!canvas) return;
          const objs = (canvas as any)._objects as CanonicalFabricObject[];
          const idx = objs.findIndex((o) => o.canonicalLayerId === id);
          if (idx <= 0) return;
          const target = objs[idx];

          objs.splice(idx, 1);
          objs.splice(idx - 1, 0, target);

          undoStackRef.current.push({
            type: 'reorder_layer',
            fromIndex: idx,
            toIndex: idx - 1,
          });
          redoStackRef.current = [];
          updateHistoryStatus();

          canvas.requestRenderAll();
          syncLayers();
        },

        deleteLayer: (id: string) => {
          const canvas = fabricCanvasRef.current;
          if (!canvas) return;
          const objects = (canvas as any)._objects as CanonicalFabricObject[];
          const idx = objects.findIndex((o) => o.canonicalLayerId === id);
          if (idx === -1) return;
          const target = objects[idx];

          const wasActive = canvas.getActiveObject() === target;
          if (wasActive) {
            canvas.discardActiveObject();
          }
          canvas.remove(target);

          undoStackRef.current.push({
            type: 'delete_layer',
            object: target,
            index: idx,
            wasActive,
          });
          redoStackRef.current = [];
          updateHistoryStatus();

          canvas.requestRenderAll();
          syncLayers();
          notifySelection();
        },

        importImageFile: (file: File, dropCoords?: { x: number; y: number }) => {
          importImageFile(file, dropCoords);
        },

        addImageLayer: (dataUrl: string, filename: string, dropCoords?: { x: number; y: number }) => {
          addImageLayerFromDataUrl(dataUrl, filename, dropCoords);
        },

        undo: () => {
          const canvas = fabricCanvasRef.current;
          if (!canvas || undoStackRef.current.length === 0) return;
          const action = undoStackRef.current.pop()!;

          switch (action.type) {
            case 'layer_transform': {
              const objects = (canvas as any)._objects as CanonicalFabricObject[];
              const target = objects.find((o) => o.canonicalLayerId === action.layerId);
              if (target) {
                applyLayerState(target, action.before);
                currentLayerStatesRef.current.set(action.layerId, action.before);
                if (!action.before.visible && canvas.getActiveObject() === target) {
                  canvas.discardActiveObject();
                } else if (action.before.visible) {
                  canvas.setActiveObject(target);
                }
              }
              break;
            }
            case 'add_layer': {
              if (canvas.getActiveObject() === action.object) {
                canvas.discardActiveObject();
              }
              canvas.remove(action.object);
              break;
            }
            case 'delete_layer': {
              canvas.add(action.object);
              const objs = (canvas as any)._objects as CanonicalFabricObject[];
              const currentIdx = objs.indexOf(action.object);
              if (currentIdx !== -1 && currentIdx !== action.index) {
                objs.splice(currentIdx, 1);
                const safeIdx = Math.max(0, Math.min(action.index, objs.length));
                objs.splice(safeIdx, 0, action.object);
              }
              if (action.wasActive && action.object.visible !== false) {
                canvas.setActiveObject(action.object);
              }
              break;
            }
            case 'reorder_layer': {
              const objs = (canvas as any)._objects as CanonicalFabricObject[];
              const obj = objs[action.toIndex];
              if (obj) {
                objs.splice(action.toIndex, 1);
                objs.splice(action.fromIndex, 0, obj);
              }
              break;
            }
            case 'visibility_layer': {
              const objects = (canvas as any)._objects as CanonicalFabricObject[];
              const target = objects.find((o) => o.canonicalLayerId === action.layerId);
              if (target) {
                target.set({ visible: action.beforeVisible });
                if (!action.beforeVisible && canvas.getActiveObject() === target) {
                  canvas.discardActiveObject();
                } else if (action.beforeVisible) {
                  canvas.setActiveObject(target);
                }
              }
              break;
            }
            case 'paint_stroke': {
              canvas.remove(action.object);
              break;
            }
          }

          redoStackRef.current.push(action);
          canvas.requestRenderAll();
          updateHistoryStatus();
          syncLayers();
          notifySelection();
        },

        redo: () => {
          const canvas = fabricCanvasRef.current;
          if (!canvas || redoStackRef.current.length === 0) return;
          const action = redoStackRef.current.pop()!;

          switch (action.type) {
            case 'layer_transform': {
              const objects = (canvas as any)._objects as CanonicalFabricObject[];
              const target = objects.find((o) => o.canonicalLayerId === action.layerId);
              if (target) {
                applyLayerState(target, action.after);
                currentLayerStatesRef.current.set(action.layerId, action.after);
                if (!action.after.visible && canvas.getActiveObject() === target) {
                  canvas.discardActiveObject();
                } else if (action.after.visible) {
                  canvas.setActiveObject(target);
                }
              }
              break;
            }
            case 'add_layer': {
              canvas.add(action.object);
              if (action.object.visible !== false) {
                canvas.setActiveObject(action.object);
              }
              break;
            }
            case 'delete_layer': {
              if (canvas.getActiveObject() === action.object) {
                canvas.discardActiveObject();
              }
              canvas.remove(action.object);
              break;
            }
            case 'reorder_layer': {
              const objs = (canvas as any)._objects as CanonicalFabricObject[];
              const obj = objs[action.fromIndex];
              if (obj) {
                objs.splice(action.fromIndex, 1);
                objs.splice(action.toIndex, 0, obj);
              }
              break;
            }
            case 'visibility_layer': {
              const objects = (canvas as any)._objects as CanonicalFabricObject[];
              const target = objects.find((o) => o.canonicalLayerId === action.layerId);
              if (target) {
                target.set({ visible: action.afterVisible });
                if (!action.afterVisible && canvas.getActiveObject() === target) {
                  canvas.discardActiveObject();
                } else if (action.afterVisible) {
                  canvas.setActiveObject(target);
                }
              }
              break;
            }
            case 'paint_stroke': {
              canvas.add(action.object);
              break;
            }
          }

          undoStackRef.current.push(action);
          canvas.requestRenderAll();
          updateHistoryStatus();
          syncLayers();
          notifySelection();
        },

        exportPng: () => {
          const canvas = fabricCanvasRef.current;
          if (!canvas) return;
          const active = canvas.getActiveObject();
          canvas.discardActiveObject();
          canvas.requestRenderAll();

          const dataUrl = canvas.toDataURL({
            format: 'png',
            multiplier: 1,
          });

          if (active) {
            canvas.setActiveObject(active);
            canvas.requestRenderAll();
          }

          const exportName = initialArtworkName
            ? `${initialArtworkName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-composite.png`
            : 'aristocolors-composite.png';

          const link = document.createElement('a');
          link.download = exportName;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        },
      }),
      [activeTool, initialArtworkName]
    );

    // Global drag & drop navigation prevention
    useEffect(() => {
      const preventDefaultDrop = (e: DragEvent) => {
        e.preventDefault();
      };
      window.addEventListener('dragover', preventDefaultDrop);
      window.addEventListener('drop', preventDefaultDrop);
      return () => {
        window.removeEventListener('dragover', preventDefaultDrop);
        window.removeEventListener('drop', preventDefaultDrop);
      };
    }, []);

    // Synchronize active tool controls with the Fabric canvas
    useEffect(() => {
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      if (activeTool === 'brush') {
        canvas.isDrawingMode = true;
        if (canvas.freeDrawingBrush) {
          canvas.freeDrawingBrush.color = '#00f0ff';
          canvas.freeDrawingBrush.width = 4;
        }
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        notifySelection();
        syncLayers();
      } else {
        canvas.isDrawingMode = false;
        const target = canvas.getActiveObject();
        if (target) {
          if (activeTool === 'move') {
            target.set({
              hasControls: false,
              hasBorders: true,
              lockMovementX: false,
              lockMovementY: false,
            });
          } else {
            target.set({
              hasControls: true,
              hasBorders: true,
              lockMovementX: false,
              lockMovementY: false,
            });
          }
          canvas.requestRenderAll();
        }
      }
    }, [activeTool]);

    useEffect(() => {
      const canvasEl = canvasElRef.current;
      const project = projectRef.current;
      if (!canvasEl || !project) return;

      const fabricCanvas = new Canvas(canvasEl, {
        width: project.manifest.canvas.width,
        height: project.manifest.canvas.height,
      });
      fabricCanvasRef.current = fabricCanvas;

      // Track brush drawings for undo/redo and layers panel
      fabricCanvas.on('path:created', (e: any) => {
        if (e.path) {
          const pathObj = e.path as CanonicalFabricObject;
          pathObj.canonicalLayerId =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `paint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          pathObj.layerName = 'Brush Stroke';
          pathObj.layerType = 'paint';

          undoStackRef.current.push({
            type: 'paint_stroke',
            object: pathObj,
          });
          redoStackRef.current = [];
          updateHistoryStatus();
          syncLayers();
        }
      });

      // Load project initial artwork if provided
      if (initialArtworkUrl) {
        const imgElement = new Image();
        imgElement.crossOrigin = 'anonymous';
        imgElement.src = initialArtworkUrl;

        const initFabricImage = () => {
          if (!fabricCanvasRef.current) return;
          const canvasWidth = project.manifest.canvas.width;
          const canvasHeight = project.manifest.canvas.height;
          const naturalW = imgElement.naturalWidth || 1200;
          const naturalH = imgElement.naturalHeight || 800;

          // Scale to fit artboard gracefully while preserving aspect ratio
          const scale = Math.min(
            (canvasWidth * 0.85) / naturalW,
            (canvasHeight * 0.85) / naturalH
          );

          const baseLayerId =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `base-${Date.now()}`;

          const fabricImg = new FabricImage(imgElement, {
            left: canvasWidth / 2,
            top: canvasHeight / 2,
            originX: 'center',
            originY: 'center',
            scaleX: scale,
            scaleY: scale,
            angle: 0,
            opacity: 1,
            visible: true,
            selectable: true,
            hasControls: activeTool !== 'move',
            hasBorders: true,
          }) as CanonicalFabricObject;

          fabricImg.canonicalLayerId = baseLayerId;
          fabricImg.layerName = initialArtworkName || 'Project Artwork';
          fabricImg.layerType = 'image';

          currentLayerStatesRef.current.set(baseLayerId, extractLayerState(fabricImg));

          fabricCanvas.add(fabricImg);
          fabricCanvas.setActiveObject(fabricImg);
          fabricCanvas.requestRenderAll();
          syncLayers();
          notifySelection();
        };

        if (imgElement.complete && imgElement.naturalWidth > 0) {
          initFabricImage();
        } else {
          imgElement.onload = initFabricImage;
        }
      }

      fabricCanvas.on('selection:created', () => {
        notifySelection();
        syncLayers();
      });
      fabricCanvas.on('selection:updated', () => {
        notifySelection();
        syncLayers();
      });
      fabricCanvas.on('selection:cleared', () => {
        notifySelection();
        syncLayers();
      });
      fabricCanvas.on('object:moving', () => notifySelection());
      fabricCanvas.on('object:scaling', () => notifySelection());
      fabricCanvas.on('object:rotating', () => notifySelection());

      fabricCanvas.on('object:modified', (e) => {
        const target = e.target as CanonicalFabricObject | undefined;
        if (!target || !target.canonicalLayerId) return;

        const layerId = target.canonicalLayerId;
        const prevState = currentLayerStatesRef.current.get(layerId);
        const nextState = extractLayerState(target);

        if (prevState && !isStateEqual(prevState, nextState)) {
          undoStackRef.current.push({
            type: 'layer_transform',
            layerId,
            before: prevState,
            after: nextState,
          });
          redoStackRef.current = [];
          currentLayerStatesRef.current.set(layerId, nextState);
          updateHistoryStatus();
        } else if (!prevState) {
          currentLayerStatesRef.current.set(layerId, nextState);
        }

        setManifestVersion(project.manifest.version);
        notifySelection();
        syncLayers();
      });

      return () => {
        fabricCanvas.dispose();
        fabricCanvasRef.current = null;
      };
    }, [initialArtworkUrl]);

    const zoomScale = getZoomScale(zoomLevel);

    const handleCanvasDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const files = Array.from(e.dataTransfer.files);
      const canvas = fabricCanvasRef.current;
      const canvasEl = canvasElRef.current;

      for (const file of files) {
        if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
          let dropCoords: { x: number; y: number } | undefined;
          if (canvas && canvasEl) {
            const rect = canvasEl.getBoundingClientRect();
            const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
            const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);
            dropCoords = {
              x: Math.round(Math.max(40, Math.min(canvas.width - 40, canvasX))),
              y: Math.round(Math.max(40, Math.min(canvas.height - 40, canvasY))),
            };
          }
          importImageFile(file, dropCoords);
          break;
        }
      }
    };

    return (
      <div
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
        onDrop={handleCanvasDrop}
        style={{
          display: 'inline-block',
          lineHeight: 0,
          backgroundColor: '#151821',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.45)',
          transform: `scale(${zoomScale})`,
          transformOrigin: 'center center',
          transition: 'transform 0.15s ease-out',
        }}
      >
        <canvas ref={canvasElRef} />
      </div>
    );
  }
);
