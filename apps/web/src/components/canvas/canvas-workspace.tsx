'use client';

import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { Canvas, FabricImage, type FabricObject } from 'fabric';
import { createCanvasProject, type CanvasProject, type CanvasProjectState, type UpdateLayerPropsInput } from '@/lib/canvas/canvas-project';
import { layerToFabricDescriptor, manifestToFabricDescriptors, fabricToCanonicalTransform, fabricCompositeToBlendMode } from '@/lib/canvas/fabric-bridge';
import type { StudioTool } from '@/components/studio/studio-toolstrip';

const objectTransform = (object: FabricObject) => fabricToCanonicalTransform({
  left: object.left, top: object.top, scaleX: object.scaleX,
  scaleY: object.scaleY, angle: object.angle,
});

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
  isBase?: boolean;
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
    const canvasHostRef = useRef<HTMLDivElement | null>(null);
    const canvasElRef = useRef<HTMLCanvasElement | null>(null);
    const fabricCanvasRef = useRef<Canvas | null>(null);
    const projectRef = useRef<CanvasProject | null>(null);
    // Rendering resources survive undo/delete so redo can restore the exact image.
    // All layer properties, ordering, selection and history belong to CanvasProject.
    const imageObjectsRef = useRef(new Map<string, FabricImage & CanonicalFabricObject>());
    const synchronizingRef = useRef(false);
    const baseLayerIdRef = useRef<string | null>(null);
    const artworkReadyRef = useRef(false);
    const toolRef = useRef(activeTool);
    toolRef.current = activeTool;
    const callbacksRef = useRef({ onSelectionChange, onLayersChange, onHistoryChange });
    callbacksRef.current = { onSelectionChange, onLayersChange, onHistoryChange };
    const [imageError, setImageError] = useState('');
    const [fitScale, setFitScale] = useState(0.85);

    const publishState = (
      preview?: CanonicalFabricObject,
      state: CanvasProjectState | undefined = projectRef.current?.state
    ) => {
      if (!state) return;
      const { manifest, selectedLayerId } = state;
      const { onSelectionChange, onLayersChange, onHistoryChange } = callbacksRef.current;
      onLayersChange?.([...manifest.layers].reverse().map((layer) => ({
        id: layer.id, name: layer.name, type: 'image', visible: layer.isVisible,
        isSelected: selectedLayerId === layer.id,
      })));
      const layer = manifest.layers.find((item) => item.id === selectedLayerId);
      if (!layer) {
        onSelectionChange?.({ isSelected: false });
      } else {
        const object = imageObjectsRef.current.get(layer.id);
        const naturalWidth = typeof layer.metadata?.naturalWidth === 'number' ? layer.metadata.naturalWidth : 0;
        const naturalHeight = typeof layer.metadata?.naturalHeight === 'number' ? layer.metadata.naturalHeight : 0;
        const transform = preview?.canonicalLayerId === layer.id
          ? { ...layer.transform, ...objectTransform(preview) }
          : layer.transform;
        // Selection and dimensions can be published before any Fabric object exists.
        onSelectionChange?.({
          isSelected: true, id: layer.id, name: layer.name, type: 'image',
          x: Math.round(transform.x), y: Math.round(transform.y),
          width: Math.round((object?.width ?? naturalWidth) * transform.scaleX),
          height: Math.round((object?.height ?? naturalHeight) * transform.scaleY),
          rotation: Math.round(transform.rotation), opacity: Math.round(layer.opacity * 100),
          blendMode: layer.blendMode.charAt(0).toUpperCase() + layer.blendMode.slice(1),
          visible: layer.isVisible, isBase: layer.id === baseLayerIdRef.current,
        });
      }
      onHistoryChange?.(state.undoHistory.length > 0, state.redoHistory.length > 0);
    };

    const synchronizeFabric = () => {
      const canvas = fabricCanvasRef.current;
      const project = projectRef.current;
      if (!canvas || !project) return;
      // UI always receives canonical edits, even if a rendering operation fails.
      publishState();
      synchronizingRef.current = true;
      try {
        canvas.isDrawingMode = false;
        canvas.defaultCursor = toolRef.current === 'move' ? 'move' : 'default';
        const descriptors = manifestToFabricDescriptors(project.manifest);
        const ids = new Set(descriptors.map((descriptor) => descriptor.id));
        for (const object of canvas.getObjects() as CanonicalFabricObject[]) {
          if (!object.canonicalLayerId || !ids.has(object.canonicalLayerId)) canvas.remove(object);
        }
        for (const descriptor of descriptors) {
          const object = imageObjectsRef.current.get(descriptor.id);
          if (!object) {
            reportImageError('Cannot render layer "' + descriptor.name + '"', new Error('The image resource is unavailable.'));
            continue;
          }
          object.set({
            left: descriptor.left, top: descriptor.top,
            scaleX: descriptor.scaleX, scaleY: descriptor.scaleY, angle: descriptor.angle,
            originX: descriptor.originX, originY: descriptor.originY,
            opacity: descriptor.opacity, globalCompositeOperation: descriptor.globalCompositeOperation,
            visible: descriptor.visible, selectable: !descriptor.isLocked,
            lockMovementX: descriptor.lockMovementX, lockMovementY: descriptor.lockMovementY,
            lockRotation: descriptor.lockRotation,
            lockScalingX: descriptor.lockScalingX, lockScalingY: descriptor.lockScalingY,
            lockScalingFlip: true, hasControls: toolRef.current !== 'move', hasBorders: true,
            hoverCursor: toolRef.current === 'move' ? 'move' : 'pointer',
          });
          object.layerName = descriptor.name;
          object.setCoords();
          if (!canvas.getObjects().includes(object)) canvas.add(object);
          canvas.moveObjectTo(object, descriptor.zIndex);
        }
        const selected = project.selectedLayerId
          ? imageObjectsRef.current.get(project.selectedLayerId) : undefined;
        if (selected?.visible && selected.selectable) {
          if (canvas.getActiveObject() !== selected) canvas.setActiveObject(selected);
        } else {
          canvas.discardActiveObject();
        }
        canvas.requestRenderAll();
      } catch (error) {
        reportImageError('Could not synchronize canvas', error);
      } finally {
        synchronizingRef.current = false;
      }
    };

    const reportImageError = (stage: string, error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      setImageError(stage + ': ' + detail);
      if (process.env.NODE_ENV !== 'production') console.error('[AddImage] ' + stage, error);
    };

    const decodeImage = async (source: string) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = source;
      await image.decode();
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        throw new Error('The decoded image has no usable dimensions.');
      }
      return image;
    };

    const addDecodedImage = (
      image: HTMLImageElement, filename: string, canvas: Canvas, project: CanvasProject,
      base: boolean, dropCoords?: { x: number; y: number }
    ) => {
      const fit = Math.min(
        canvas.width * (base ? 0.85 : 0.75) / image.naturalWidth,
        canvas.height * (base ? 0.85 : 0.75) / image.naturalHeight
      );
      const scale = base ? fit : Math.min(1, fit);
      const layer = project.addLayer({
        sourceAssetId: crypto.randomUUID(),
        name: filename.replace(/^.*[\\\\/]/, '') || 'Imported Image',
        opacity: 1, blendMode: 'normal', selectAfterAdd: true,
        transform: {
          x: dropCoords?.x ?? canvas.width / 2, y: dropCoords?.y ?? canvas.height / 2,
          scaleX: scale, scaleY: scale, originX: 'center', originY: 'center',
        },
        metadata: { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight },
      });
      if (base) {
        baseLayerIdRef.current = layer.id;
        project.clearHistory();
      }
      const state = project.state;
      if (!base && process.env.NODE_ENV !== 'production') {
        console.debug('[AddImage] canonical layers: ' + state.manifest.layers.length);
      }
      // This notification is intentionally independent of all Fabric operations below.
      publishState(undefined, state);
      if (!base && process.env.NODE_ENV !== 'production') {
        console.debug('[AddImage] React layers: ' + state.manifest.layers.length);
      }

      try {
        const descriptor = layerToFabricDescriptor(layer);
        const object = new FabricImage(image, {
          left: descriptor.left, top: descriptor.top,
          scaleX: descriptor.scaleX, scaleY: descriptor.scaleY, angle: descriptor.angle,
          originX: descriptor.originX, originY: descriptor.originY,
          opacity: descriptor.opacity, globalCompositeOperation: descriptor.globalCompositeOperation,
          visible: descriptor.visible, selectable: true,
          hasControls: toolRef.current !== 'move', hasBorders: true, lockScalingFlip: true,
        }) as FabricImage & CanonicalFabricObject;
        object.canonicalLayerId = layer.id;
        object.layerName = layer.name;
        object.layerType = 'image';
        imageObjectsRef.current.set(layer.id, object);
        synchronizingRef.current = true;
        try {
          canvas.add(object);
          object.setCoords();
          canvas.setActiveObject(object);
          canvas.requestRenderAll();
        } finally {
          synchronizingRef.current = false;
        }
        if (!base && process.env.NODE_ENV !== 'production') console.debug('[AddImage] Fabric objects: ' + canvas.getObjects().length);
      } catch (error) {
        // Keep the committed manifest and its React projection visible on render failure.
        reportImageError('Could not render layer "' + layer.name + '"', error);
      }
    };

    const importImageSource = async (
      readSource: () => Promise<string>, filename: string, dropCoords?: { x: number; y: number }
    ) => {
      const canvas = fabricCanvasRef.current;
      const project = projectRef.current;
      let stage = 'Cannot import image';
      try {
        if (!canvas || !project) throw new Error('The canvas is not mounted.');
        if (!artworkReadyRef.current) throw new Error('Wait for the initial artwork to finish loading.');
        setImageError('');
        stage = 'Could not read image';
        const source = await readSource();
        stage = 'Could not decode image';
        const image = await decodeImage(source);
        if (process.env.NODE_ENV !== 'production') console.debug('[AddImage] image decoded');
        stage = 'Cannot add image layer';
        if (fabricCanvasRef.current !== canvas || projectRef.current !== project) {
          throw new Error('The Studio project changed while the image was loading.');
        }
        addDecodedImage(image, filename, canvas, project, false, dropCoords);
      } catch (error) {
        // Do not publish errors from an import belonging to a disposed project.
        if (fabricCanvasRef.current === canvas && projectRef.current === project) reportImageError(stage, error);
      }
    };

    const importImageFile = (file: File, dropCoords?: { x: number; y: number }) => {
      const supportedType = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
      const supportedFilename = /\.(png|jpe?g|webp)$/i.test(file.name);
      if (!supportedType && !supportedFilename) {
        reportImageError('Cannot import image', new Error('Choose a PNG, JPEG, or WebP image.'));
        return;
      }
      // The decoded HTMLImageElement remains the rendering resource; no upload is involved.
      try {
        const source = URL.createObjectURL(file);
        void importImageSource(() => Promise.resolve(source), file.name, dropCoords)
          .finally(() => URL.revokeObjectURL(source));
      } catch (error) {
        reportImageError('Could not open local image', error);
      }
    };

    const toggleLayerVisibility = (id: string) => {
      const project = projectRef.current;
      const layer = project?.manifest.layers.find((item) => item.id === id);
      if (!project || !layer) return;
      project.updateLayerProps(id, { isVisible: !layer.isVisible });
      synchronizeFabric();
    };

    const moveLayer = (id: string, direction: number) => {
      const project = projectRef.current;
      if (!project) return;
      const ids = project.manifest.layers.map((layer) => layer.id);
      const index = ids.indexOf(id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= ids.length) return;
      [ids[index], ids[next]] = [ids[next], ids[index]];
      project.reorderLayers(ids);
      synchronizeFabric();
    };

    useImperativeHandle(ref, () => ({
      selectLayer: (id) => {
        projectRef.current?.selectLayer(id ?? null);
        synchronizeFabric();
      },
      updateTransform: (input) => {
        const project = projectRef.current;
        const layer = project?.manifest.layers.find((item) => item.id === project.selectedLayerId);
        const object = layer ? imageObjectsRef.current.get(layer.id) : undefined;
        if (!project || !layer || !object) return;
        const transform = { ...layer.transform };
        if (Number.isFinite(input.x)) transform.x = input.x!;
        if (Number.isFinite(input.y)) transform.y = input.y!;
        if (Number.isFinite(input.rotation)) transform.rotation = input.rotation!;
        if (Number.isFinite(input.width) && input.width! > 0) transform.scaleX = input.width! / object.width;
        if (Number.isFinite(input.height) && input.height! > 0) transform.scaleY = input.height! / object.height;
        if (Object.keys(transform).some((key) => {
          const field = key as keyof typeof transform;
          return transform[field] !== layer.transform[field];
        })) project.updateLayerTransform(layer.id, transform);
        const props: UpdateLayerPropsInput = {
          ...(Number.isFinite(input.opacity) ? { opacity: Math.max(0, Math.min(1, input.opacity! / 100)) } : {}),
          ...(input.blendMode && ['Normal', 'Multiply', 'Screen', 'Overlay'].includes(input.blendMode)
            ? { blendMode: fabricCompositeToBlendMode(input.blendMode.toLowerCase()) } : {}),
        };
        if ((props.opacity !== undefined && props.opacity !== layer.opacity) ||
            (props.blendMode !== undefined && props.blendMode !== layer.blendMode)) {
          project.updateLayerProps(layer.id, props);
        }
        synchronizeFabric();
      },
      toggleVisibility: () => {
        const id = projectRef.current?.selectedLayerId;
        if (id) toggleLayerVisibility(id);
      },
      toggleLayerVisibility,
      moveLayerUp: (id) => moveLayer(id, 1),
      moveLayerDown: (id) => moveLayer(id, -1),
      deleteLayer: (id) => {
        if (id === baseLayerIdRef.current) return;
        const project = projectRef.current;
        if (!project?.manifest.layers.some((layer) => layer.id === id)) return;
        project.removeLayer(id);
        synchronizeFabric();
      },
      importImageFile,
      addImageLayer: (dataUrl, filename, dropCoords) => { void importImageSource(() => Promise.resolve(dataUrl), filename, dropCoords); },
      undo: () => { projectRef.current?.undo(); synchronizeFabric(); },
      redo: () => { projectRef.current?.redo(); synchronizeFabric(); },
      exportPng: () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        synchronizingRef.current = true;
        try {
          canvas.discardActiveObject();
          const link = document.createElement('a');
          link.download = initialArtworkName
            ? initialArtworkName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-composite.png'
            : 'aristocolors-composite.png';
          link.href = canvas.toDataURL({ format: 'png', multiplier: 1 });
          link.click();
        } finally {
          synchronizingRef.current = false;
          synchronizeFabric();
        }
      },
    }));

    useEffect(() => {
      const preventDefaultDrop = (event: DragEvent) => event.preventDefault();
      window.addEventListener('dragover', preventDefaultDrop);
      window.addEventListener('drop', preventDefaultDrop);
      return () => {
        window.removeEventListener('dragover', preventDefaultDrop);
        window.removeEventListener('drop', preventDefaultDrop);
      };
    }, []);

    useEffect(() => {
      synchronizeFabric();
    }, [activeTool]);

    useEffect(() => {
      const host = canvasHostRef.current;
      if (!host) return;
      // Fabric disposal is asynchronous. Each effect owns a separate DOM mount so
      // a Strict Mode cleanup cannot remove or dispose the next effect's canvas.
      const mount = document.createElement('div');
      const element = document.createElement('canvas');
      mount.appendChild(element);
      host.appendChild(mount);
      canvasElRef.current = element;
      const project = createCanvasProject({ canvas: { width: 800, height: 600, dpi: 72 } });
      const canvas = new Canvas(element, {
        width: project.manifest.canvas.width, height: project.manifest.canvas.height,
        preserveObjectStacking: true, selection: false, selectionKey: [],
      });
      projectRef.current = project;
      fabricCanvasRef.current = canvas;
      imageObjectsRef.current = new Map();
      baseLayerIdRef.current = null;
      setImageError('');
      const selectionChanged = () => {
        if (synchronizingRef.current || fabricCanvasRef.current !== canvas || projectRef.current !== project) return;
        const object = canvas.getActiveObject() as CanonicalFabricObject | undefined;
        project.selectLayer(object?.canonicalLayerId ?? null);
        publishState();
      };
      canvas.on('selection:created', selectionChanged);
      canvas.on('selection:updated', selectionChanged);
      canvas.on('selection:cleared', selectionChanged);
      canvas.on('object:moving', ({ target }) => publishState(target as CanonicalFabricObject));
      canvas.on('object:scaling', ({ target }) => publishState(target as CanonicalFabricObject));
      canvas.on('object:rotating', ({ target }) => publishState(target as CanonicalFabricObject));
      canvas.on('object:modified', ({ target }) => {
        if (fabricCanvasRef.current !== canvas || projectRef.current !== project) return;
        const object = target as CanonicalFabricObject | undefined;
        const layer = project.manifest.layers.find((item) => item.id === object?.canonicalLayerId);
        if (!object || !layer) return;
        const transform = objectTransform(object);
        if (Object.keys(transform).some((key) => {
          const field = key as keyof typeof transform;
          return transform[field] !== layer.transform[field];
        })) project.updateLayerTransform(layer.id, transform);
        synchronizeFabric();
      });
      publishState();
      artworkReadyRef.current = !initialArtworkUrl;
      if (initialArtworkUrl) {
        void decodeImage(initialArtworkUrl).then((image) => {
          if (fabricCanvasRef.current !== canvas || projectRef.current !== project) return;
          addDecodedImage(image, initialArtworkName || 'Project Artwork', canvas, project, true);
          artworkReadyRef.current = true;
        }).catch((error: unknown) => {
          if (fabricCanvasRef.current === canvas) reportImageError('Could not load initial artwork', error);
        });
      }
      return () => {
        // Invalidate pending decodes before disposing this project's resources.
        artworkReadyRef.current = false;
        fabricCanvasRef.current = null;
        projectRef.current = null;
        canvasElRef.current = null;
        mount.remove();
        for (const object of imageObjectsRef.current.values()) {
          if (!canvas.getObjects().includes(object)) object.dispose();
        }
        imageObjectsRef.current.clear();
        void canvas.dispose().catch((error: unknown) => {
          if (process.env.NODE_ENV !== 'production') console.error('[Studio] Canvas disposal failed', error);
        });
      };
    }, [initialArtworkUrl]);

    useEffect(() => {
      const viewport = canvasHostRef.current?.parentElement?.parentElement;
      if (!viewport) return;
      const measure = () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        setFitScale(Math.max(0.1, Math.min(
          (viewport.clientWidth - 48) / canvas.width,
          (viewport.clientHeight - 48) / canvas.height
        )));
      };
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(viewport);
      return () => observer.disconnect();
    }, []);

    const zoomScale = zoomLevel === 'Fit' ? fitScale : getZoomScale(zoomLevel);

    const handleCanvasDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const files = Array.from(e.dataTransfer.files);
      const canvas = fabricCanvasRef.current;
      const canvasEl = canvasElRef.current;

      for (const file of files) {
        if (['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)) {
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
        {imageError && <p role="alert" style={{ lineHeight: 1.4 }}>{imageError}</p>}
        <div ref={canvasHostRef} />
      </div>
    );
  }
);
