'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Canvas, FabricImage, util } from 'fabric';
import { loadStudioManifest, saveStudioManifest, pixelsToPng, type StoredStudioManifest } from './studio-project-storage';
import { removeSolidBackground } from './remove-solid-background';
import { AristoColorsProfilePanel } from './aristocolors-profile-panel';
import { applyLayerCrop, emptyCrop, type LayerCrop } from './studio-object-transform';
import { ArrangeInspector, type StackAction, type AlignAction } from './arrange-inspector';
import { HarmonizationDock, type HarmonizationSettings } from './harmonization-dock';

type LayerImage = FabricImage & { studioLayerId: string; studioCrop?: LayerCrop };
type StudioLayer = { id: string; name: string; object: LayerImage; isBase: boolean; originalSource: HTMLImageElement };
type Tool = 'move' | 'eraser' | 'brush';
type Snapshot = {
  selectedId: string | null;
  layers: { layer: StudioLayer; pixels: ReturnType<FabricImage['getElement']>; mask?: HTMLCanvasElement;
    crop: LayerCrop;
    values: Pick<FabricImage, 'left' | 'top' | 'scaleX' | 'scaleY' | 'angle' | 'opacity' | 'visible' | 'globalCompositeOperation' | 'flipX' | 'flipY'> }[];
};

function copyPixels(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  const context = copy.getContext('2d');
  if (!context) throw new Error('Unable to copy layer pixels for history.');
  context.drawImage(source, 0, 0);
  return copy;
}

interface StepOneStudioProps {
  projectId: string;
  projectTitle: string;
  initialArtworkUrl?: string;
  localImportToken?: string;
}

async function decodeImage(source: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = source;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('The selected image has no usable dimensions.');
  }
  return image;
}

export function StepOneStudio({ projectId, projectTitle, initialArtworkUrl, localImportToken }: StepOneStudioProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseReadyRef = useRef(false);
  const [layers, setLayers] = useState<StudioLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [title, setTitle] = useState(projectTitle);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('move');
  const [brushSize, setBrushSize] = useState(40);
  const [inspectorTab, setInspectorTab] = useState<'layers' | 'style'>('layers');
  const [cutoutProcessing, setCutoutProcessing] = useState<'background' | 'silhouette' | null>(null);
  const [cutoutNotice, setCutoutNotice] = useState<string | null>(null);
  const [cutoutProgress, setCutoutProgress] = useState<string | null>(null);
  const cutoutBusyRef = useRef(false);
  const exportingRef = useRef(false);
  const masksRef = useRef(new Map<string, HTMLCanvasElement>());
  const undoRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  const transformStartRef = useRef<Snapshot | null>(null);
  const [, refreshHistory] = useState(0);
  const [storageReady, setStorageReady] = useState(false);
  const [saveRevision, requestSave] = useState(0);
  const saveGenerationRef = useRef(0);
  const unsavedRef = useRef(false);
  const liveLayersRef = useRef(layers);
  liveLayersRef.current = layers;
  const storageKey = `aristocolors_project_${localImportToken ?? projectId}_manifest`;

  function captureState(): Snapshot {
    return { selectedId: selectedLayerId, layers: liveLayersRef.current.map(layer => {
      const object = layer.object;
      const source = object.getElement();
      const mask = masksRef.current.get(layer.id);
      return { layer, pixels: source instanceof HTMLCanvasElement ? copyPixels(source) : source,
        mask: mask ? copyPixels(mask) : undefined, crop: { ...(object.studioCrop ?? emptyCrop()) },
        values: { left: object.left, top: object.top, scaleX: object.scaleX, scaleY: object.scaleY,
          angle: object.angle, opacity: object.opacity, visible: object.visible,
          globalCompositeOperation: object.globalCompositeOperation, flipX: object.flipX, flipY: object.flipY } };
    }) };
  }

  function recordHistory(snapshot = captureState()) {
    unsavedRef.current = true;
    undoRef.current.push(snapshot);
    if (undoRef.current.length > 30) undoRef.current.shift();
    redoRef.current = [];
    refreshHistory(current => current + 1);
  }

  function restoreState(snapshot: Snapshot) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setTool('move');
    canvas.discardActiveObject();
    canvas.remove(...canvas.getObjects());
    masksRef.current.clear();
    for (const entry of snapshot.layers) {
      const object = entry.layer.object;
      object.setElement(entry.pixels instanceof HTMLCanvasElement ? copyPixels(entry.pixels) : entry.pixels);
      object.set(entry.values);
      applyLayerCrop(object, entry.crop);
      object.setCoords();
      if (entry.mask) masksRef.current.set(entry.layer.id, copyPixels(entry.mask));
      canvas.add(object);
    }
    const restored = snapshot.layers.map(entry => entry.layer);
    const selected = restored.find(layer => layer.id === snapshot.selectedId);
    if (selected?.object.visible) canvas.setActiveObject(selected.object);
    setLayers(restored);
    setSelectedLayerId(selected?.id ?? null);
    canvas.requestRenderAll();
    requestSave(current => current + 1);
    unsavedRef.current = true;
  }

  function historyAction(direction: 'undo' | 'redo') {
    const from = direction === 'undo' ? undoRef.current : redoRef.current;
    const to = direction === 'undo' ? redoRef.current : undoRef.current;
    if (!from.length) return;
    to.push(captureState());
    const snapshot = from.pop();
    if (snapshot) restoreState(snapshot);
    refreshHistory(current => current + 1);
  }

  function reportError(cause: unknown) {
    console.error('Studio image loading failed:', cause);
    setError(cause instanceof Error ? cause.message : String(cause));
  }

  function insertImage(canvas: Canvas, image: HTMLImageElement, name: string, isBase: boolean) {
    const id = crypto.randomUUID();
    const proportion = isBase ? 0.9 : 0.7;
    const scale = Math.min(
      canvas.getWidth() * proportion / image.naturalWidth,
      canvas.getHeight() * proportion / image.naturalHeight,
    );
    const object = new FabricImage(image, {
      left: (canvas.getWidth() - image.naturalWidth * scale) / 2,
      top: (canvas.getHeight() - image.naturalHeight * scale) / 2,
      scaleX: scale,
      scaleY: scale,
      hasControls: true,
    }) as LayerImage;
    object.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: true });
    object.studioLayerId = id;
    if (!isBase) recordHistory();
    canvas.add(object);
    if (isBase) canvas.moveObjectTo(object, 0);
    setLayers(current => [...current, { id, name, object, isBase, originalSource: image }]);
    canvas.setActiveObject(object);
    setSelectedLayerId(id);
    canvas.requestRenderAll();
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // Each mount owns its DOM, including during React development remounts.
    const mount = document.createElement('div');
    const element = document.createElement('canvas');
    mount.appendChild(element);
    host.appendChild(mount);
    const canvas = new Canvas(element, {
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      backgroundColor: '#141619',
      selection: false,
      selectionKey: [],
      preserveObjectStacking: true,
      uniformScaling: true,
      uniScaleKey: undefined,
    });
    canvasRef.current = canvas;
    baseReadyRef.current = false;
    setStorageReady(false);
    saveGenerationRef.current++;
    undoRef.current = [];
    redoRef.current = [];
    masksRef.current.clear();
    setTool('move');
    refreshHistory(current => current + 1);
    setLayers([]);
    setSelectedLayerId(null);
    setTitle(projectTitle);
    setError(null);

    const updateSelection = () => {
      const object = canvas.getActiveObject() as LayerImage | undefined;
      setSelectedLayerId(object?.studioLayerId ?? null);
    };
    canvas.on('selection:created', updateSelection);
    canvas.on('selection:updated', updateSelection);
    canvas.on('selection:cleared', updateSelection);
    const resize = new ResizeObserver(() => {
      canvas.setDimensions({ width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) });
      canvas.requestRenderAll();
    });
    resize.observe(host);

    void (async () => {
      try {
        const storedManifest = await loadStudioManifest(storageKey);
        if (canvasRef.current !== canvas) return;
        if (storedManifest) {
          const restoredLayers: StudioLayer[] = [];
          const decodeBlob = async (blob: Blob) => {
            const url = URL.createObjectURL(blob);
            try { return await decodeImage(url); }
            finally { URL.revokeObjectURL(url); }
          };
          for (const entry of storedManifest.layers) {
            const image = await decodeBlob(entry.imageSource);
            const originalSource = await decodeBlob(entry.originalSource);
            if (canvasRef.current !== canvas) return;
            const object = new FabricImage(image, { ...entry.values, hasControls: true }) as LayerImage;
            object.studioLayerId = entry.id;
            object.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: true });
            applyLayerCrop(object, entry.crop);
            restoredLayers.push({ id: entry.id, name: entry.name, isBase: entry.isBase, object, originalSource });
            if (entry.maskSource) {
              const mask = await decodeBlob(entry.maskSource);
              const maskCanvas = document.createElement('canvas');
              maskCanvas.width = mask.naturalWidth;
              maskCanvas.height = mask.naturalHeight;
              const context = maskCanvas.getContext('2d');
              if (!context) throw new Error('Unable to restore the layer mask.');
              context.drawImage(mask, 0, 0);
              masksRef.current.set(entry.id, maskCanvas);
            }
          }
          if (canvasRef.current !== canvas) return;
          restoredLayers.forEach(layer => canvas.add(layer.object));
          const selected = restoredLayers.find(layer => layer.id === storedManifest.selectedLayerId);
          if (selected?.object.visible) canvas.setActiveObject(selected.object);
          setSelectedLayerId(selected?.id ?? null);
          setLayers(restoredLayers);
          setTitle(storedManifest.title);
          baseReadyRef.current = true;
          setStorageReady(true);
          canvas.requestRenderAll();
          return;
        }
        let source = initialArtworkUrl;
        let name = projectTitle;
        if (localImportToken) {
          const stored = sessionStorage.getItem(`aristocolors:local-import:${localImportToken}`);
          if (!stored) throw new Error('The locally imported project image is unavailable.');
          const pending: unknown = JSON.parse(stored);
          if (!pending || typeof pending !== 'object' || !('dataUrl' in pending) ||
              !('name' in pending) || typeof pending.dataUrl !== 'string' ||
              typeof pending.name !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(pending.dataUrl)) {
            throw new Error('The locally imported project image is invalid.');
          }
          source = pending.dataUrl;
          name = pending.name;
        }
        if (!source) throw new Error('This project has no base artwork.');
        const image = await decodeImage(source);
        if (canvasRef.current !== canvas) return;
        setTitle(name);
        insertImage(canvas, image, name, true);
        baseReadyRef.current = true;
        setStorageReady(true);
      } catch (cause) {
        if (canvasRef.current === canvas) reportError(cause);
      }
    })();

    return () => {
      resize.disconnect();
      if (canvasRef.current === canvas) {
        canvasRef.current = null;
        baseReadyRef.current = false;
      }
      mount.remove();
      void canvas.dispose().catch(cause => console.error('Studio canvas disposal failed:', cause));
    };
  }, [projectId, projectTitle, initialArtworkUrl, localImportToken, storageKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!storageReady || !canvas || !layers.length) return;
    const generation = ++saveGenerationRef.current;
    unsavedRef.current = true;
    void (async () => {
      try {
        const savedLayers = await Promise.all(layers.map(async (layer, zIndex) => {
          const object = layer.object;
          const mask = masksRef.current.get(layer.id);
          // Copy pixels synchronously before any asynchronous PNG encoding finishes.
          const imageSource = pixelsToPng(object.getElement(), object.width, object.height);
          const originalSource = pixelsToPng(layer.originalSource, layer.originalSource.naturalWidth, layer.originalSource.naturalHeight);
          const maskSource = mask ? pixelsToPng(mask, mask.width, mask.height) : undefined;
          const values = { left: object.left, top: object.top, scaleX: object.scaleX, scaleY: object.scaleY,
            angle: object.angle, opacity: object.opacity, visible: object.visible,
            flipX: object.flipX, flipY: object.flipY,
            globalCompositeOperation: object.globalCompositeOperation as StoredStudioManifest['layers'][number]['values']['globalCompositeOperation'] };
          return { id: layer.id, name: layer.name, isBase: layer.isBase, zIndex,
            imageSource: await imageSource, originalSource: await originalSource, maskSource: await maskSource, values,
            crop: { ...(object.studioCrop ?? emptyCrop()) } };
        }));
        if (generation !== saveGenerationRef.current || canvasRef.current !== canvas) return;
        await saveStudioManifest(storageKey, { version: 1, title, selectedLayerId,
          width: canvas.getWidth(), height: canvas.getHeight(), layers: savedLayers },
          () => generation === saveGenerationRef.current && canvasRef.current === canvas);
        if (generation === saveGenerationRef.current) unsavedRef.current = false;
      } catch (cause) {
        console.error('Saving the local project failed:', cause);
        setError(`Local project save failed: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    })();
  }, [layers, selectedLayerId, storageReady, saveRevision, storageKey, title]);

  useEffect(() => {
    const protectPendingSave = (event: BeforeUnloadEvent) => {
      if (!unsavedRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectPendingSave);
    return () => window.removeEventListener('beforeunload', protectPendingSave);
  }, []);

  function deleteLayer(layer: StudioLayer) {
    const canvas = canvasRef.current;
    if (!canvas || layer.isBase) return;
    recordHistory();
    if (canvas.getActiveObject() === layer.object) canvas.discardActiveObject();
    canvas.remove(layer.object);
    setLayers(current => current.filter(currentLayer => currentLayer.id !== layer.id));
    setSelectedLayerId(current => current === layer.id ? null : current);
    canvas.requestRenderAll();
  }

  function reorderLayer(layer: StudioLayer, direction: 1 | -1) {
    const canvas = canvasRef.current;
    if (!canvas || layer.isBase) return;
    const base = layers.find(current => current.isBase);
    if (!base) return;
    canvas.moveObjectTo(base.object, 0);
    const objects = canvas.getObjects();
    const index = objects.indexOf(layer.object);
    const targetIndex = index + direction;
    if (index < 1 || targetIndex < 1 || targetIndex >= objects.length) return;
    recordHistory();

    // Move the actual Fabric object, then project that stack into the same layer collection.
    canvas.moveObjectTo(layer.object, targetIndex);
    canvas.moveObjectTo(base.object, 0);
    const order = canvas.getObjects();
    setLayers(current => [...current].sort((a, b) => order.indexOf(a.object) - order.indexOf(b.object)));
    canvas.requestRenderAll();
  }

  useEffect(() => {
    const handleDelete = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest('input, textarea, select') || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
        event.preventDefault();
        historyAction(key === 'y' || event.shiftKey ? 'redo' : 'undo');
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && ['v', 'e', 'b'].includes(key)) {
        if (key === 'v') setTool('move');
        else if (layers.some(layer => layer.id === selectedLayerId && !layer.isBase && layer.object.visible)) setTool(key === 'e' ? 'eraser' : 'brush');
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const layer = layers.find(current => current.id === selectedLayerId);
      if (!layer || layer.isBase) return;
      event.preventDefault();
      deleteLayer(layer);
    };
    window.addEventListener('keydown', handleDelete);
    return () => window.removeEventListener('keydown', handleDelete);
  }, [layers, selectedLayerId]);

  function toggleVisibility(layer: StudioLayer) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    recordHistory();
    layer.object.set('visible', !layer.object.visible);
    if (!layer.object.visible && canvas.getActiveObject() === layer.object) {
      canvas.discardActiveObject();
      setSelectedLayerId(null);
    }
    setLayers(current => [...current]);
    canvas.requestRenderAll();
  }

  async function addImage(file: File) {
    let source: string | undefined;
    try {
      if (!/^image\/(png|jpeg|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
        throw new Error('Choose a PNG, JPG, JPEG, or WebP image.');
      }
      const canvas = canvasRef.current;
      if (!canvas || !baseReadyRef.current) throw new Error('Wait for the base artwork to finish loading.');
      source = URL.createObjectURL(file);
      const image = await decodeImage(source);
      if (canvasRef.current !== canvas) return;
      insertImage(canvas, image, file.name, false);
      setError(null);
    } catch (cause) {
      reportError(cause);
    } finally {
      if (source) URL.revokeObjectURL(source);
    }
  }

  const selectedImportedLayer = layers.find(layer => layer.id === selectedLayerId && !layer.isBase);
  const selectedLayer = layers.find(layer => layer.id === selectedLayerId);

  function editSelected(change: (object: LayerImage, canvas: Canvas) => void) {
    const canvas = canvasRef.current;
    if (!canvas || !selectedLayer) return;
    recordHistory();
    setTool('move');
    change(selectedLayer.object, canvas);
    selectedLayer.object.setCoords();
    selectedLayer.object.set('dirty', true);
    setLayers(current => [...current]);
    canvas.requestRenderAll();
  }

  function arrangeSelected(action: StackAction) {
    const canvas = canvasRef.current;
    if (!canvas || !selectedLayer || selectedLayer.isBase) return;
    const stack = canvas.getObjects();
    const index = stack.indexOf(selectedLayer.object);
    const target = action === 'front' ? stack.length - 1 : action === 'back' ? 1 : action === 'forward' ? index + 1 : index - 1;
    if (target < 1 || target >= stack.length || target === index) return;
    recordHistory();
    canvas.moveObjectTo(selectedLayer.object, target);
    const base = layers.find(layer => layer.isBase);
    if (base) canvas.moveObjectTo(base.object, 0);
    const order = canvas.getObjects();
    setLayers(current => [...current].sort((a, b) => order.indexOf(a.object) - order.indexOf(b.object)));
    canvas.requestRenderAll();
  }

  function alignSelected(action: AlignAction) {
    editSelected((object, canvas) => {
      const bounds = object.getBoundingRect();
      if (action === 'left' || action === 'right' || action === 'center-x') {
        const target = action === 'left' ? 0 : action === 'right' ? canvas.getWidth() - bounds.width : (canvas.getWidth() - bounds.width) / 2;
        object.set('left', object.left + target - bounds.left);
      } else {
        const target = action === 'top' ? 0 : action === 'bottom' ? canvas.getHeight() - bounds.height : (canvas.getHeight() - bounds.height) / 2;
        object.set('top', object.top + target - bounds.top);
      }
    });
  }

  function rotateSelected(angle: number) {
    editSelected(object => {
      const center = object.getCenterPoint();
      object.set('angle', ((angle % 360) + 360) % 360);
      object.setPositionByOrigin(center, 'center', 'center');
    });
  }

  useEffect(() => {
    setTool('move');
  }, [selectedLayerId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const before = () => { transformStartRef.current = captureState(); };
    const after = () => {
      if (transformStartRef.current) recordHistory(transformStartRef.current);
      transformStartRef.current = null;
      setLayers(current => [...current]);
      unsavedRef.current = true;
      requestSave(current => current + 1);
    };
    const liveRotation = () => refreshHistory(current => current + 1);
    const overlay = () => {
      if (exportingRef.current) return;
      const context = canvas.getContext();
      for (const layer of layers) {
        const mask = masksRef.current.get(layer.id);
        if (!mask || !layer.object.visible) continue;
        context.save();
        const matrix = util.multiplyTransformMatrices(canvas.viewportTransform, layer.object.calcTransformMatrix());
        context.transform(...matrix);
        context.globalCompositeOperation = 'source-over';
        context.globalAlpha = 0.45;
        const crop = layer.object.studioCrop ?? emptyCrop();
        context.beginPath();
        context.rect(-layer.object.width / 2 + layer.object.width * crop.left / 100,
          -layer.object.height / 2 + layer.object.height * crop.top / 100,
          layer.object.width * (100 - crop.left - crop.right) / 100,
          layer.object.height * (100 - crop.top - crop.bottom) / 100);
        context.clip();
        context.drawImage(mask, -layer.object.width / 2, -layer.object.height / 2);
        context.restore();
      }
    };
    canvas.on('before:transform', before);
    canvas.on('object:modified', after);
    canvas.on('object:rotating', liveRotation);
    canvas.on('after:render', overlay);
    return () => {
      canvas.off('before:transform', before);
      canvas.off('object:modified', after);
      canvas.off('object:rotating', liveRotation);
      canvas.off('after:render', overlay);
    };
  }, [layers, selectedLayerId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const layer = layers.find(current => current.id === selectedLayerId && !current.isBase);
    if (!canvas || !layer || tool === 'move' || !layer.object.visible) return;
    const object = layer.object;
    const surface = canvas.upperCanvasEl;
    const previousCursor = surface.style.cursor;
    surface.style.cursor = 'none';
    const cursor = document.createElement('div');
    Object.assign(cursor.style, {
      position: 'fixed', pointerEvents: 'none', border: '1px solid #fff',
      borderRadius: '50%', boxShadow: '0 0 0 1px #0009', transform: 'translate(-50%, -50%)',
      zIndex: '9999', display: 'none',
    });
    document.body.appendChild(cursor);
    const updateCursor = (event: MouseEvent) => {
      const bounds = surface.getBoundingClientRect();
      const inside = event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      cursor.style.display = inside ? 'block' : 'none';
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
      cursor.style.width = `${brushSize * canvas.getZoom() * bounds.width / canvas.getWidth()}px`;
      cursor.style.height = `${brushSize * canvas.getZoom() * bounds.height / canvas.getHeight()}px`;
      return inside;
    };
    let drawing = false;
    let pixels: HTMLCanvasElement | undefined;
    let context: CanvasRenderingContext2D | null = null;
    let lastPoint: { x: number; y: number } | undefined;

    const erase = (event: MouseEvent) => {
      if (!context) return;
      const point = util.transformPoint(canvas.getScenePoint(event), util.invertTransform(object.calcTransformMatrix()));
      const next = { x: point.x + object.width / 2, y: point.y + object.height / 2 };
      const diameter = brushSize / Math.max(0.0001, Math.abs(object.scaleX));
      context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      // Closely spaced radial dabs form a continuous feathered stroke, even during fast movement.
      const radius = diameter / 2;
      const previous = lastPoint ?? next;
      const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
      const steps = Math.max(1, Math.ceil(distance / Math.max(0.5, diameter * 0.1)));
      for (let step = 1; step <= steps; step++) {
        const x = previous.x + (next.x - previous.x) * step / steps;
        const y = previous.y + (next.y - previous.y) * step / steps;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        const color = tool === 'eraser' ? '0,0,0' : '67,210,235';
        gradient.addColorStop(0, `rgba(${color},0.65)`);
        gradient.addColorStop(0.35, `rgba(${color},0.5)`);
        gradient.addColorStop(1, `rgba(${color},0)`);
        context.fillStyle = gradient;
        context.fillRect(x - radius, y - radius, diameter, diameter);
      }
      lastPoint = next;
      object.set('dirty', true);
      canvas.requestRenderAll();
    };
    // Capture drawing before Fabric's mouse handlers so erasing cannot drag/select another image.
    const start = (event: MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      updateCursor(event);
      try {
        recordHistory();
        if (!pixels) {
          pixels = tool === 'brush' ? masksRef.current.get(layer.id) : undefined;
          pixels ??= document.createElement('canvas');
          const existingMask = tool === 'brush' && masksRef.current.has(layer.id);
          if (!existingMask) {
          pixels.width = object.width;
          pixels.height = object.height;
          }
          context = pixels.getContext('2d');
          if (!context) throw new Error('Unable to create the layer eraser surface.');
          if (tool === 'eraser') {
          context.drawImage(object.getElement(), 0, 0, pixels.width, pixels.height);
          object.setElement(pixels);
          } else masksRef.current.set(layer.id, pixels);
        }
        drawing = true;
        lastPoint = undefined;
        erase(event);
      } catch (cause) {
        drawing = false;
        console.error('Layer eraser failed:', cause);
        setError(cause instanceof Error ? cause.message : String(cause));
        setTool('move');
      }
    };
    const move = (event: MouseEvent) => {
      const inside = updateCursor(event);
      if (inside) {
        surface.style.cursor = 'none';
        event.stopImmediatePropagation();
      }
      if (!drawing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      erase(event);
    };
    const stop = () => {
      if (drawing) {
        unsavedRef.current = true;
        requestSave(current => current + 1);
      }
      drawing = false; lastPoint = undefined;
    };
    const leave = () => { cursor.style.display = 'none'; };
    const blur = () => { stop(); leave(); };
    surface.addEventListener('mousedown', start, true);
    surface.addEventListener('mouseenter', updateCursor);
    surface.addEventListener('mouseleave', leave);
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', stop, true);
    window.addEventListener('blur', blur);
    return () => {
      surface.removeEventListener('mousedown', start, true);
      surface.removeEventListener('mouseenter', updateCursor);
      surface.removeEventListener('mouseleave', leave);
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', stop, true);
      window.removeEventListener('blur', blur);
      cursor.remove();
      surface.style.cursor = previousCursor;
    };
  }, [tool, brushSize, selectedLayerId, layers]);

  async function processCutout(kind: 'background' | 'silhouette') {
    const layer = selectedImportedLayer;
    const canvas = canvasRef.current;
    if (!layer || !canvas || cutoutBusyRef.current) return;
    cutoutBusyRef.current = true;
    setCutoutNotice(null);
    setCutoutProgress(null);
    setCutoutProcessing(kind);
    setTool('move');
    let url: string | undefined;
    try {
      await new Promise<void>(resolve => window.setTimeout(resolve, 30));
      const original = layer.originalSource;
      let png: Blob;
      if (kind === 'background') {
        const result = removeSolidBackground(original);
        if (!result.success) {
          setCutoutNotice(result.reason === 'complex_background'
            ? "No flat single-color background detected. Use 'Cutout Silhouette' for this image."
            : 'This image could not be processed. Your layer is unchanged. Please try again.');
          return;
        }
        png = await pixelsToPng(result.canvas, result.canvas.width, result.canvas.height);
      } else {
        const { removeBackground } = await import('@imgly/background-removal');
        const input = await pixelsToPng(original, original.naturalWidth, original.naturalHeight);
        png = await removeBackground(input, {
          device: 'cpu', proxyToWorker: false, model: 'isnet', rescale: true,
          output: { format: 'image/png', quality: 1 },
          progress: (stage, current, total) => {
            setCutoutProgress(stage.startsWith('fetch:')
              ? `Downloading silhouette model... ${total > 0 ? Math.round(current / total * 100) : 0}%`
              : 'Extracting silhouette...');
          },
        });
      }
      url = URL.createObjectURL(png);
      const result = await decodeImage(url);
      if (canvasRef.current !== canvas || !canvas.getObjects().includes(layer.object)) return;
      // Process the immutable original; retain transform and mask coordinates at original dimensions.
      const pixels = document.createElement('canvas');
      pixels.width = original.naturalWidth;
      pixels.height = original.naturalHeight;
      const context = pixels.getContext('2d');
      if (!context) throw new Error('Unable to apply the transparent cutout.');
      context.drawImage(result, 0, 0, pixels.width, pixels.height);
      recordHistory();
      layer.object.setElement(pixels);
      layer.object.set('dirty', true);
      layer.object.setCoords();
      setLayers(current => [...current]);
      setError(null);
      canvas.requestRenderAll();
    } catch (cause) {
      setCutoutNotice(kind === 'silhouette'
        ? 'Silhouette extraction could not finish. Your layer is unchanged. Check your connection and try again.'
        : 'Background removal could not finish. Your layer is unchanged. Please try again.');
    } finally {
      if (url) URL.revokeObjectURL(url);
      cutoutBusyRef.current = false;
      setCutoutProcessing(null);
      setCutoutProgress(null);
    }
  }
  function exportComposition() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      exportingRef.current = true;
      const url = canvas.toDataURL({ format: 'png', multiplier: 1 });
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'project'}-composite.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (cause) {
      console.error('Composition export failed:', cause);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      exportingRef.current = false;
      canvas.requestRenderAll();
    }
  }

  function getTelemetrySample(): HTMLCanvasElement | null {
    const canvas = canvasRef.current;
    if (!canvas || !layers.length) return null;
    const layer = layers.find(current => current.id === selectedLayerId);
    let source: CanvasImageSource;
    let width: number;
    let height: number;
    if (layer) {
      // Inspect the selected image's own pixels, even when that layer is hidden.
      source = layer.object.getElement();
      width = layer.object.width;
      height = layer.object.height;
    } else {
      const background = canvas.backgroundColor;
      try {
        exportingRef.current = true;
        canvas.backgroundColor = '';
        const scene = canvas.toCanvasElement(Math.min(1, 96 / Math.max(canvas.getWidth(), canvas.getHeight())));
        source = scene;
        width = scene.width;
        height = scene.height;
      } finally {
        exportingRef.current = false;
        canvas.backgroundColor = background;
        canvas.requestRenderAll();
      }
    }
    const sample = document.createElement('canvas');
    const ratio = Math.min(1, 96 / Math.max(width, height));
    sample.width = Math.max(1, Math.round(width * ratio));
    sample.height = Math.max(1, Math.round(height * ratio));
    const context = sample.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(source, 0, 0, sample.width, sample.height);
    return sample;
  }

  async function prepareHarmonization(settings: HarmonizationSettings) {
    if (!canvasRef.current || !layers.length) throw new Error('Wait for the project artwork to load.');
    const state = captureState();
    const encodeBlob = async (blob: Blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to encode layer source.'));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const payload = { version: 1, projectId: localImportToken ?? projectId, title, settings,
      backgroundLayerId: layers.find(layer => layer.isBase)?.id,
      layers: await Promise.all(state.layers.map(async (entry, zIndex) => ({
        id: entry.layer.id, name: entry.layer.name, zIndex, values: entry.values, crop: entry.crop,
        src: await encodeBlob(await pixelsToPng(entry.pixels, entry.layer.object.width, entry.layer.object.height)),
        mask: entry.mask ? await encodeBlob(await pixelsToPng(entry.mask, entry.mask.width, entry.mask.height)) : undefined,
      }))),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/[<>:"/\\|?*]/g, '-').trim() || 'project'}-harmonization-request.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main style={{ height: '100dvh', paddingBottom: 210, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: '#141619', color: '#e5e7eb' }}>
      <header style={{ height: 64, flexShrink: 0, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #303238' }}>
        <h1 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h1>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" disabled={!undoRef.current.length} onClick={() => historyAction('undo')} title="Undo (Ctrl+Z)" style={{ padding: '8px 12px', borderRadius: 6, background: '#20232a', color: undoRef.current.length ? '#e5e7eb' : '#626976' }}>Undo</button>
          <button type="button" disabled={!redoRef.current.length} onClick={() => historyAction('redo')} title="Redo (Ctrl+Y / Ctrl+Shift+Z)" style={{ padding: '8px 12px', borderRadius: 6, background: '#20232a', color: redoRef.current.length ? '#e5e7eb' : '#626976' }}>Redo</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => inputRef.current?.click()} style={{ padding: '9px 16px', borderRadius: 6, background: '#343842', color: '#fff', cursor: 'pointer' }}>+ Add Image</button>
          <button type="button" onClick={exportComposition} style={{ padding: '9px 16px', borderRadius: 6, background: '#343842', color: '#fff', cursor: 'pointer' }}>Export Image</button>
        </div>
        <input ref={inputRef} type="file" hidden accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void addImage(file);
        }} />
      </header>
      {error && <p role="alert" style={{ margin: 0, padding: '10px 24px', color: '#fca5a5', background: '#342026' }}>{error}</p>}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <nav aria-label="Canvas tools" style={{ width: 160, flexShrink: 0, padding: 12, borderRight: '1px solid #ffffff0a', background: '#17191e', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {([['move', 'Move / Select', 'V'], ['eraser', 'Eraser', 'E'], ['brush', 'Brush / Inpaint Mask', 'B']] as const).map(([mode, label, shortcut]) => (
            <button key={mode} type="button" title={`${label} (${shortcut})`} aria-pressed={tool === mode} disabled={mode !== 'move' && !selectedImportedLayer?.object.visible} onClick={() => setTool(mode)} style={{ padding: '10px 8px', textAlign: 'left', fontSize: 12, borderRadius: 6, border: '1px solid #ffffff14', background: tool === mode ? '#394760' : '#20232a', color: mode === 'move' || selectedImportedLayer?.object.visible ? '#e5e7eb' : '#626976', cursor: 'pointer' }}>{label} <span style={{ color: '#8792a5' }}>({shortcut})</span></button>
          ))}
          {tool !== 'move' && <div style={{ paddingTop: 12 }}>
            <label htmlFor="brush-size" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aab2c0', marginBottom: 10 }}>Brush Size <span>{brushSize}px</span></label>
            <input id="brush-size" type="range" min={10} max={150} step={1} value={brushSize} onChange={event => setBrushSize(Number(event.currentTarget.value))} style={{ width: '100%', accentColor: '#8b9fc7' }} />
          </div>}
        </nav>
        <div ref={hostRef} style={{ flex: 1, minWidth: 0, overflow: 'hidden' }} />
        <aside style={{ width: 240, flexShrink: 0, padding: '20px 10px', borderLeft: '1px solid #ffffff0a', background: '#17191e', overflowY: 'auto' }}>
          <div role="tablist" aria-label="Inspector" style={{ display: 'flex', gap: 4, margin: '0 8px 18px', padding: 3, background: '#101216', borderRadius: 6 }}>
            <button type="button" role="tab" aria-selected={inspectorTab === 'layers'} onClick={() => setInspectorTab('layers')} style={{ flex: 1, padding: 7, fontSize: 11, borderRadius: 4, background: inspectorTab === 'layers' ? '#293244' : 'transparent', color: '#c4cede', cursor: 'pointer' }}>Layers</button>
            <button type="button" role="tab" aria-selected={inspectorTab === 'style'} onClick={() => setInspectorTab('style')} style={{ flex: 1, padding: 7, fontSize: 11, borderRadius: 4, background: inspectorTab === 'style' ? '#293244' : 'transparent', color: '#c4cede', cursor: 'pointer' }}>AristoColors Profile</button>
          </div>
          {inspectorTab === 'style' ? <AristoColorsProfilePanel key={selectedLayerId ?? 'scene'} getSample={getTelemetrySample} label={selectedLayerId ? `Layer · ${layers.find(layer => layer.id === selectedLayerId)?.name ?? 'Selected image'}` : 'Scene · Visible composition'} /> : <>
          <h2 style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.6, color: '#b0b6c2', padding: '0 8px' }}>LAYERS</h2>
          <p style={{ fontSize: 11, color: '#707887', margin: '6px 8px 18px' }}>{layers.length} {layers.length === 1 ? 'layer' : 'layers'}</p>
          {[...layers].reverse().map(layer => (
            <div key={layer.id} style={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 40, padding: '0 4px', marginBottom: 3, borderRadius: 7, border: selectedLayerId === layer.id ? '1px solid #7185ad40' : '1px solid transparent', background: selectedLayerId === layer.id ? '#7185ad14' : '#ffffff02', boxShadow: selectedLayerId === layer.id ? 'inset 2px 0 #8b9fc7' : 'none' }}>
            <button type="button" className="rounded hover:bg-white/5 focus-visible:outline focus-visible:outline-1 focus-visible:outline-slate-400" aria-label={`${layer.object.visible ? 'Hide' : 'Show'} ${layer.name}`} title={layer.object.visible ? 'Visible — click to hide' : 'Hidden — click to show'} aria-pressed={layer.object.visible} onClick={() => toggleVisibility(layer)} style={{ padding: 5, border: 0, background: 'transparent', color: layer.object.visible ? '#9aa4b5' : '#515968', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {!layer.object.visible && <path d="m3 3 18 18" />}
              </svg>
            </button>
            <button type="button" aria-pressed={selectedLayerId === layer.id} onClick={() => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              if (layer.object.visible) canvas.setActiveObject(layer.object);
              else canvas.discardActiveObject();
              setSelectedLayerId(layer.id);
              canvas.requestRenderAll();
            }} title={layer.name} style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '11px 3px', border: 0, background: 'transparent', color: selectedLayerId === layer.id ? '#dce3ef' : '#aab2c0', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}>{layer.name}</button>
            {!layer.isBase && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <button type="button" className="rounded hover:bg-white/5 disabled:hover:bg-transparent" aria-label={`Move ${layer.name} up`} title="Move up" disabled={layers.indexOf(layer) === layers.length - 1} onClick={() => reorderLayer(layer, 1)} style={{ padding: 4, border: 0, background: 'transparent', color: layers.indexOf(layer) === layers.length - 1 ? '#3e4653' : '#9aa4b5', cursor: layers.indexOf(layer) === layers.length - 1 ? 'default' : 'pointer' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg></button>
              <button type="button" className="rounded hover:bg-white/5 disabled:hover:bg-transparent" aria-label={`Move ${layer.name} down`} title="Move down" disabled={layers.indexOf(layer) <= 1} onClick={() => reorderLayer(layer, -1)} style={{ padding: 4, border: 0, background: 'transparent', color: layers.indexOf(layer) <= 1 ? '#3e4653' : '#9aa4b5', cursor: layers.indexOf(layer) <= 1 ? 'default' : 'pointer' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button>
            </span>}
            {!layer.isBase && <button type="button" className="rounded hover:bg-red-400/10 hover:!text-red-300" aria-label={`Delete ${layer.name}`} title="Delete imported layer" onClick={() => deleteLayer(layer)} style={{ padding: 5, border: 0, background: 'transparent', color: '#7e8899', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>
            </button>}
            </div>
          ))}
          {selectedLayer && <ArrangeInspector object={selectedLayer.object} isBase={selectedLayer.isBase}
            canUp={layers.indexOf(selectedLayer) < layers.length - 1} canDown={layers.indexOf(selectedLayer) > 1}
            onStack={arrangeSelected} onAlign={alignSelected} onRotate={rotateSelected}
            onFlip={axis => editSelected(object => object.set(axis === 'x' ? 'flipX' : 'flipY', axis === 'x' ? !object.flipX : !object.flipY))}
            onCrop={crop => editSelected(object => applyLayerCrop(object, crop))} />}
          {selectedImportedLayer && <section aria-label="Layer appearance" style={{ margin: '20px 8px 0', paddingTop: 18, borderTop: '1px solid #ffffff0a' }}>
            <label htmlFor="layer-opacity" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#aab2c0', marginBottom: 10 }}>
              Opacity <span>{Math.round(selectedImportedLayer.object.opacity * 100)}%</span>
            </label>
            <input id="layer-opacity" type="range" min={0} max={100} step={1} value={Math.round(selectedImportedLayer.object.opacity * 100)} onChange={event => {
              recordHistory();
              selectedImportedLayer.object.set('opacity', Number(event.currentTarget.value) / 100);
              canvasRef.current?.requestRenderAll();
              setLayers(current => [...current]);
            }} style={{ width: '100%', accentColor: '#8b9fc7', cursor: 'pointer', marginBottom: 18 }} />
            <label htmlFor="layer-blend-mode" style={{ display: 'block', fontSize: 12, color: '#aab2c0', marginBottom: 8 }}>Blend mode</label>
            <select id="layer-blend-mode" value={selectedImportedLayer.object.globalCompositeOperation} onChange={event => {
              const mode = event.currentTarget.value;
              if (mode !== 'source-over' && mode !== 'multiply' && mode !== 'screen' && mode !== 'overlay' && mode !== 'lighten' && mode !== 'darken') return;
              recordHistory();
              selectedImportedLayer.object.set('globalCompositeOperation', mode);
              canvasRef.current?.requestRenderAll();
              setLayers(current => [...current]);
            }} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ffffff14', background: '#20232a', color: '#dce3ef', fontSize: 12 }}>
              <option value="source-over">Normal</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
              <option value="overlay">Overlay</option>
              <option value="lighten">Lighten</option>
              <option value="darken">Darken</option>
            </select>
            <button type="button" disabled={cutoutProcessing !== null} onClick={() => void processCutout('silhouette')} title="Isolate the subject using client-side segmentation" style={{ width: '100%', marginTop: 8, padding: '9px 10px', borderRadius: 6, border: '1px solid #ffffff14', background: '#293244', color: '#dce3ef', fontSize: 12, cursor: cutoutProcessing ? 'wait' : 'pointer' }}>{cutoutProcessing === 'silhouette' ? 'Extracting silhouette...' : 'Cutout Silhouette'}</button>
            {(cutoutNotice || cutoutProgress) && <p role="status" aria-live="polite" style={{ fontSize: 11, lineHeight: 1.6, color: '#aab8ce', marginTop: 10 }}>{cutoutNotice || cutoutProgress}</p>}
          </section>}
          </>}
        </aside>
      </div>
      <HarmonizationDock onPrepare={prepareHarmonization} />
    </main>
  );
}
