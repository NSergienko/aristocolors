'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Canvas, StaticCanvas, FabricImage, Point, util } from 'fabric';
import { loadStudioManifest, saveStudioManifest, clearStudioManifest, pixelsToPng, type StoredStudioManifest } from './studio-project-storage';
import { removeSolidBackground } from './remove-solid-background';
import { AristoColorsProfilePanel } from './aristocolors-profile-panel';
import { applyLayerCrop, emptyCrop, type LayerCrop } from './studio-object-transform';
import { ArrangeInspector, type StackAction, type AlignAction } from './arrange-inspector';
import type { HarmonizationSettings } from './harmonization-dock';
import { CompositionPreviewModal, type CompositionPreview } from './composition-preview-modal';
import { harmonizationResultSchema, getAcceptedHarmonizedImage, type HarmonizationResult, type HarmonizationRefinements } from '@/lib/studio/harmonization-contract';
import { getCanonicalPreset } from '@/lib/studio/canonical-presets';
import { analyzeStyle, findVisibleBackgroundLayer, type ScenePixelData, type SceneTelemetry } from '@/lib/studio/engine/scene-analysis';
import { applyPixelHarmonization, type HarmonizeParameters } from '@/lib/studio/pixel-harmonizer';
import { loadHarmonizationResult, storeHarmonizationResult, clearHarmonizationResult } from './harmonization-result-storage';
import { HarmonizedResultView } from './harmonized-result-view';
import { HarmonizationReviewControls } from './harmonization-review-controls';

// Retain existing lighting/default contracts; ambient tint is sampled by the engine.
function profileRefinements(profile: ReturnType<typeof getCanonicalPreset>['profile']): HarmonizationRefinements {
  return {
    contactShadow: Math.max(40, Math.round(profile.inferredFeatures.lighting.intensity * 65)),
    edgeFeather: Math.max(8, Math.min(20, profile.deterministicFeatures.textureAnalysis.edgeBleedRadiusPx)),
    warmth: 0,
  };
}

function profileParameters(
  profile: ReturnType<typeof getCanonicalPreset>['profile'],
  intensity: number,
  values: HarmonizationRefinements,
  telemetry?: SceneTelemetry
): HarmonizeParameters {
  const light = profile.inferredFeatures.lighting;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const directionConfidence = clamp(telemetry?.confidence ?? 0, 0, 1);
  const kelvinConfidence = clamp(telemetry?.kelvinConfidence ?? 0, 0, 1);
  const signedAzimuth = (degrees: number) => ((degrees + 180) % 360 + 360) % 360 - 180;
  const azimuthDelta = telemetry?.azimuth === null || telemetry?.azimuth === undefined
    ? 0
    : signedAzimuth(telemetry.azimuth - light.azimuthDeg);
  const azimuthDeg = directionConfidence
    ? clamp(signedAzimuth(light.azimuthDeg + azimuthDelta * directionConfidence), -180, 180)
    : light.azimuthDeg;
  const elevationDeg = directionConfidence && telemetry?.elevation !== null && telemetry?.elevation !== undefined
    ? clamp(light.elevationDeg + (clamp(telemetry.elevation, 0, 90) - light.elevationDeg) * directionConfidence, 0, 90)
    : light.elevationDeg;
  const colorTempKelvin = kelvinConfidence && telemetry?.kelvin !== null && telemetry?.kelvin !== undefined
    ? clamp(light.colorTempKelvin + (clamp(telemetry.kelvin, 2000, 12500) - light.colorTempKelvin) * kelvinConfidence, 2000, 12500)
    : light.colorTempKelvin;
  return {
    colorTempKelvin,
    dominantTintHex: telemetry?.ambientTintHex ?? '#ffffff',
    ambientTintHex: telemetry?.ambientTintHex,
    accentHex: telemetry?.accentHex,
    targetLuminanceMean: telemetry?.luminanceMean,
    targetLuminanceStdDev: telemetry?.luminanceStdDev,
    azimuthDeg,
    elevationDeg,
    intensity: Math.max(0, Math.min(1, intensity / 100)),
    edgeBleedPx: values.edgeFeather,
    shadowIntensity: values.contactShadow / 100,
  };
}

type LayerImage = FabricImage & { studioLayerId: string; studioCrop?: LayerCrop };
type StudioLayer = { id: string; name: string; object: LayerImage; isBase: boolean; originalSource: HTMLImageElement };
type Tool = 'move' | 'eraser' | 'brush';
type Snapshot = {
  selectedId: string | null;
  layers: { layer: StudioLayer; pixels: ReturnType<FabricImage['getElement']>; mask?: HTMLCanvasElement;
    crop: LayerCrop;
    values: Pick<FabricImage, 'left' | 'top' | 'scaleX' | 'scaleY' | 'angle' | 'opacity' | 'visible' | 'globalCompositeOperation' | 'flipX' | 'flipY' | 'lockMovementX' | 'lockMovementY' | 'lockRotation' | 'lockScalingX' | 'lockScalingY' | 'hasControls' | 'selectable' | 'evented'> }[];
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
  const viewModeRef = useRef<'fit' | 'actual'>('fit');
  const fitViewRef = useRef<(() => void) | null>(null);
  const [viewMode, setViewMode] = useState<'fit' | 'actual'>('fit');
  const canvasRef = useRef<Canvas | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseReadyRef = useRef(false);
  const [layers, setLayers] = useState<StudioLayer[]>([]);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const assetLoadingRef = useRef(false);
  const [assetLoading, setAssetLoading] = useState(false);
  const STUDIO_PRESET_ASSETS = [
    { id: 'preset-temple', name: 'Forgotten Temple', url: '/artwork/forgotten-temple.png' },
    { id: 'preset-cyberpunk', name: 'Cyberpunk District', url: '/artwork/cyberpunk-district-recon.jpg' },
    { id: 'preset-desert', name: 'Desert Sentinel', url: '/artwork/desert-sentinel.jpg' },
    { id: 'preset-memory', name: 'Memory Architecture', url: '/artwork/memory-architecture.jpg' },
    { id: 'preset-obsidian', name: 'Obsidian Product Plate', url: '/artwork/obsidian-product.jpg' },
  ];

  async function addPresetFromLibrary(name: string, url: string) {
    const canvas = canvasRef.current;
    if (!canvas || !baseReadyRef.current || assetLoadingRef.current) return;
    const epoch = editEpochRef.current;
    assetLoadingRef.current = true;
    setAssetLoading(true);
    try {
      const image = await decodeImage(url);
      if (canvasRef.current !== canvas || epoch !== editEpochRef.current) return;
      insertImage(canvas, image, name, false);
      setShowAssetModal(false);
      setError(null);
    } catch (cause) {
      reportError(cause);
    } finally {
      assetLoadingRef.current = false;
      setAssetLoading(false);
    }
  }

  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [title, setTitle] = useState(projectTitle);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CompositionPreview | null>(null);
  const [harmonizedResult, setHarmonizedResult] = useState<HarmonizationResult | null>(null);
  const activeProfileIdRef = useRef(getCanonicalPreset().profile.id);
  const resultRevisionRef = useRef(0);
  const harmonizationInvalidationRef = useRef<Promise<void>>(Promise.resolve());
  const [refinements, setRefinements] = useState<HarmonizationRefinements>({ contactShadow: 0, edgeFeather: 0, warmth: 0 });
  const [refinementReady, setRefinementReady] = useState(false);
  const refinementPendingRef = useRef(false);
  const harmonizedViewportRef = useRef<HTMLDivElement>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const acceptingRef = useRef(false);
  const [finishRequested, setFinishRequested] = useState(false);
  const acceptanceRunRef = useRef<AbortController | null>(null);
  const refinementJobRef = useRef(0);
  const refinementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelRefinement() {
    refinementJobRef.current++;
    refinementPendingRef.current = false;
    if (refinementTimerRef.current) clearTimeout(refinementTimerRef.current);
    refinementTimerRef.current = null;
  }
  useEffect(() => () => cancelRefinement(), []);
  function updateRefinements(values: HarmonizationRefinements, intensity = harmonizationSettingsRef.current.intensity,
    profileId = activeProfileIdRef.current) {
    if (harmonizationRunRef.current || acceptingRef.current) return;
    setRefinements(values); setRefinementReady(false); setReviewError(null);
    cancelRefinement();
    refinementPendingRef.current = true;
    const job = refinementJobRef.current;
    const result = harmonizedResult;
    const inputs = result?.review?.pixelInputs;
    if (!result?.review || !inputs) { refinementPendingRef.current = false; setReviewError('Run Harmonize Scene again to use canonical pixel processing.'); return; }
    const preset = getCanonicalPreset(profileId);
    const nextInputs = { ...inputs, profileId: preset.profile.id! };
    harmonizationSettingsRef.current = { ...harmonizationSettingsRef.current, intensity };
    const draft = { ...result, audit: { ...result.audit, appliedIntensity: intensity }, review: { ...result.review,
      acceptedImageUrl: getAcceptedHarmonizedImage(result) ?? undefined,
      pixelInputs: nextInputs, refinements: values } };
    setHarmonizedResult(draft);
    refinementTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const profile = preset.profile;
          const image = await applyPixelHarmonization(result.review!.backgroundImageUrl, inputs.foregroundImageUrl,
            inputs.foregroundBounds, profileParameters(profile, intensity, values, analyzeStyle(getTelemetrySample())));
          await decodeImage(image);
          if (job !== refinementJobRef.current) return;
          const next = harmonizationResultSchema.parse({ ...draft, review: { ...draft.review,
            refinements: values, refinedImageUrl: image } });
          refinementPendingRef.current = false;
          setHarmonizedResult(next); setRefinementReady(true);
        } catch (cause) {
          if (job === refinementJobRef.current) {
            refinementPendingRef.current = false;
            setReviewError(cause instanceof Error ? cause.message : 'Unable to bake the harmonized image.');
          }
        }
      })();
    }, 100);
  }
  useEffect(() => {
    if (harmonizedResult) {
      harmonizationSettingsRef.current = { aspectRatio: harmonizedResult.audit.aspectRatio, intensity: harmonizedResult.audit.appliedIntensity };
    }
    setRefinements(harmonizedResult?.review?.refinements ?? { contactShadow: 0, edgeFeather: 0, warmth: 0 });
    setRefinementReady(!!harmonizedResult?.review?.refinedImageUrl && !refinementPendingRef.current);
    setReviewError(null);
  }, [harmonizedResult?.audit.harmonizedAt]);

  async function acceptRefinedComposition() {
    if (!harmonizedResult?.review?.refinedImageUrl || !refinementReady || refinementPendingRef.current || acceptingRef.current || harmonizationRunRef.current) return;
    const afterImage = harmonizedViewportRef.current?.querySelector<HTMLImageElement>('img[alt="After harmonization"]');
    const displayedImageUrl = afterImage?.getAttribute('src');
    if (!afterImage || displayedImageUrl !== harmonizedResult.review.refinedImageUrl) {
      setReviewError('Wait for the latest After image to finish displaying, then accept again.');
      return;
    }
    // Freeze the exact loaded After source; acceptance never rebakes or uses resultImageUrl.
    cancelRefinement();
    const reviewSnapshot = harmonizedResult;
    acceptingRef.current = true;
    resultRevisionRef.current++;
    const run = new AbortController();
    acceptanceRunRef.current = run;
    setAccepting(true); setReviewError(null);
    try {
      const refinedImageUrl = displayedImageUrl;
      await afterImage.decode();
      run.signal.throwIfAborted();
      if ((afterImage.currentSrc || afterImage.src) !== refinedImageUrl) {
        throw new Error('The After preview source changed during acceptance. Please retry.');
      }
      if (afterImage.naturalWidth !== reviewSnapshot.audit.width || afterImage.naturalHeight !== reviewSnapshot.audit.height) {
        throw new Error('The accepted image does not match the harmonized composition resolution. Please retry.');
      }
      const accepted = harmonizationResultSchema.parse({ ...reviewSnapshot, review: { ...reviewSnapshot.review,
        refinedImageUrl, acceptedImageUrl: refinedImageUrl, acceptedAt: new Date().toISOString() } });
      await storeHarmonizationResult(localImportToken ?? projectId, accepted, run.signal);
      run.signal.throwIfAborted();
      setHarmonizedResult(accepted);
      setFinishRequested(false);
      setCurrentStep('finish');
    } catch (cause) { if (!run.signal.aborted) setReviewError(cause instanceof Error ? cause.message : 'Unable to save the refined piece. Please retry.'); }
    finally { if (acceptanceRunRef.current === run) { acceptanceRunRef.current = null; acceptingRef.current = false; setAccepting(false); } }
  }
  function navigateWorkflow(step: 'compose' | 'harmonize' | 'finish') {
    if (acceptingRef.current || harmonizationRunRef.current) return;
    if (step !== 'finish') {
      setFinishRequested(false);
      setCurrentStep(step);
      return;
    }
    if (currentStep === 'finish') return;
    if (currentStep !== 'harmonize' && getAcceptedHarmonizedImage(harmonizedResult)) {
      setFinishRequested(false);
      setCurrentStep('finish');
      return;
    }
    setCurrentStep('harmonize');
    if (harmonizedResult?.review) setFinishRequested(true);
  }
  useEffect(() => {
    if (finishRequested && currentStep === 'harmonize' && refinementReady && !reviewError && !accepting) {
      setFinishRequested(false);
      void acceptRefinedComposition();
    }
  });
  const harmonizationRunRef = useRef<AbortController | null>(null);
  const harmonizationSettingsRef = useRef<HarmonizationSettings>({ aspectRatio: '16:9', intensity: 80 });
  const [harmonizationState, setHarmonizationState] = useState<{ busy: boolean; progress: number; stage: string; error: string | null; notice: string | null }>({ busy: false, progress: 0, stage: '', error: null, notice: null });

  useEffect(() => () => { harmonizationRunRef.current?.abort(); harmonizationRunRef.current = null; acceptanceRunRef.current?.abort(); acceptanceRunRef.current = null; }, []);

  async function startHarmonization(settings = harmonizationSettingsRef.current) {
    if (harmonizationRunRef.current || acceptingRef.current) return;
    harmonizationSettingsRef.current = settings;
    setError(null);
    invalidateHarmonizedResult();
    const editRevision = resultRevisionRef.current;
    const run = new AbortController();
    harmonizationRunRef.current = run;
    setHarmonizationState({ busy: true, progress: 0, stage: 'Analyzing AristoColors...', error: null, notice: null });
    try {
      await harmonizationInvalidationRef.current;
      run.signal.throwIfAborted();
      const result = await prepareHarmonization(settings, run.signal, progress => {
        if (harmonizationRunRef.current === run) setHarmonizationState(current => ({ ...current, progress, stage: progress < 50 ? 'Analyzing AristoColors...' : 'Harmonizing composite...' }));
      });
      run.signal.throwIfAborted();
      if (resultRevisionRef.current !== editRevision) {
        throw new Error('The composition changed while harmonization was running. Run Harmonize again to process the latest pixels.');
      }
      await storeHarmonizationResult(localImportToken ?? projectId, result, run.signal);
      if (run.signal.aborted) {
        await clearHarmonizationResult(localImportToken ?? projectId);
        run.signal.throwIfAborted();
      }
      if (!run.signal.aborted && harmonizationRunRef.current === run) {
        if (resultRevisionRef.current !== editRevision) {
          await harmonizationInvalidationRef.current;
          throw new Error('The composition changed while harmonization was running. Run Harmonize again to process the latest pixels.');
        }
        setHarmonizedResult(result);
        setCurrentStep('harmonize');
        setHarmonizationState({ busy: false, progress: 100, stage: '', error: null, notice: 'Photometric harmonization complete.' });
      }
    } catch (cause) {
      if (harmonizationRunRef.current === run) setError(run.signal.aborted ? 'Preparation cancelled.' : cause instanceof Error ? cause.message : 'Unable to harmonize this scene.');
      if (harmonizationRunRef.current === run) setHarmonizationState({ busy: false, progress: 0, stage: '', error: run.signal.aborted ? 'Preparation cancelled.' : cause instanceof Error ? cause.message : 'Unable to prepare the scene request.', notice: null });
    } finally {
      if (harmonizationRunRef.current === run) harmonizationRunRef.current = null;
    }
  }
  const [tool, setTool] = useState<Tool>('move');
  const [brushSize, setBrushSize] = useState(40);
  const [inspectorTab, setInspectorTab] = useState<'layers' | 'transform' | 'style'>('layers');
  const [currentStep, setCurrentStep] = useState<'compose' | 'harmonize' | 'finish'>('compose');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'unsaved' | 'failed'>('idle');
  const [resetting, setResetting] = useState(false);
  const editEpochRef = useRef(0);
  const suppressSaveRef = useRef(false);
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

  useEffect(() => {
    let active = true;
    const epoch = editEpochRef.current;
    const revision = resultRevisionRef.current;
    void loadHarmonizationResult(localImportToken ?? projectId).then(result => {
      if (active && epoch === editEpochRef.current && revision === resultRevisionRef.current) setHarmonizedResult(result);
    }).catch(cause => { if (active) console.error('Unable to restore harmonized result:', cause); });
    return () => { active = false; };
  }, [localImportToken, projectId]);

  function captureState(): Snapshot {
    return { selectedId: selectedLayerId, layers: liveLayersRef.current.map(layer => {
      const object = layer.object;
      const source = object.getElement();
      const mask = masksRef.current.get(layer.id);
      return { layer, pixels: source instanceof HTMLCanvasElement ? copyPixels(source) : source,
        mask: mask ? copyPixels(mask) : undefined, crop: { ...(object.studioCrop ?? emptyCrop()) },
        values: { left: object.left, top: object.top, scaleX: object.scaleX, scaleY: object.scaleY,
          angle: object.angle, opacity: object.opacity, visible: object.visible,
          globalCompositeOperation: object.globalCompositeOperation, flipX: object.flipX, flipY: object.flipY, lockMovementX: object.lockMovementX, lockMovementY: object.lockMovementY, lockRotation: object.lockRotation, lockScalingX: object.lockScalingX, lockScalingY: object.lockScalingY, hasControls: object.hasControls, selectable: object.selectable, evented: object.evented } };
    }) };
  }

  function invalidateHarmonizedResult() {
    cancelRefinement();
    resultRevisionRef.current++;
    setHarmonizedResult(null);
    setRefinementReady(false);
    setReviewError(null);
    setFinishRequested(false);
    const clearResult = harmonizationInvalidationRef.current.catch(() => undefined)
      .then(() => clearHarmonizationResult(localImportToken ?? projectId));
    harmonizationInvalidationRef.current = clearResult;
    void clearResult.catch(cause => {
      console.error('Unable to clear a stale harmonization result:', cause);
      setError(`Unable to clear stale harmonization result: ${cause instanceof Error ? cause.message : String(cause)}`);
    });
  }

  function recordHistory(snapshot = captureState()) {
    invalidateHarmonizedResult();
    saveGenerationRef.current++;
    suppressSaveRef.current = false;
    setSaveStatus('unsaved');
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
    if (selected?.object.visible && selected.object.selectable) canvas.setActiveObject(selected.object);
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
    const scale = Math.min(
      canvas.getWidth() / image.naturalWidth,
      canvas.getHeight() / image.naturalHeight,
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
    suppressSaveRef.current = false;
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
    const fitCanvas = () => {
      const availableWidth = Math.max(1, host.clientWidth || window.innerWidth - 520);
      const availableHeight = Math.max(1, host.clientHeight || window.innerHeight - 80);
      const canvasWidth = canvas.getWidth();
      const canvasHeight = canvas.getHeight();
      const scale = viewModeRef.current === 'actual' ? 1 : Math.min(
        Math.max(1, availableWidth - 64) / canvasWidth,
        Math.max(1, availableHeight - 64) / canvasHeight,
      );
      canvas.setZoom(scale);
      const panX = viewModeRef.current === 'actual' ? 0 : (availableWidth - canvasWidth * scale) / 2;
      const panY = viewModeRef.current === 'actual' ? 0 : (availableHeight - canvasHeight * scale) / 2;
      canvas.absolutePan(new Point(-panX, -panY));
      mount.style.width = `${viewModeRef.current === 'actual' ? canvasWidth : availableWidth}px`;
      mount.style.height = `${viewModeRef.current === 'actual' ? canvasHeight : availableHeight}px`;
      mount.style.position = 'relative';
      mount.style.overflow = 'hidden';
      mount.style.flexShrink = '0';
      host.style.overflow = viewModeRef.current === 'actual' ? 'auto' : 'hidden';
      host.style.alignItems = viewModeRef.current === 'actual' ? 'flex-start' : 'center';
      host.style.justifyContent = viewModeRef.current === 'actual' ? 'flex-start' : 'center';
      canvas.requestRenderAll();
    };
    fitViewRef.current = fitCanvas;
    fitCanvas();
    const resize = new ResizeObserver(fitCanvas);
    resize.observe(host);

    void (async () => {
      try {
        const storedManifest = await loadStudioManifest(storageKey);
        if (canvasRef.current !== canvas) return;
        if (storedManifest) {
          activeProfileIdRef.current = getCanonicalPreset(storedManifest.activeAristoColorsId).profile.id;
          canvas.setDimensions({ width: storedManifest.width, height: storedManifest.height });
          fitCanvas();
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
          if (selected?.object.visible && selected.object.selectable) canvas.setActiveObject(selected.object);
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
        let presetDimensions: { width: number; height: number } | undefined;
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
          const canvasWidth = 'canvasWidth' in pending ? pending.canvasWidth : undefined;
          const canvasHeight = 'canvasHeight' in pending ? pending.canvasHeight : undefined;
          if (canvasWidth !== undefined || canvasHeight !== undefined) {
            if (typeof canvasWidth !== 'number' || !Number.isFinite(canvasWidth) || canvasWidth <= 0 ||
                typeof canvasHeight !== 'number' || !Number.isFinite(canvasHeight) || canvasHeight <= 0) {
              throw new Error('The selected canvas dimensions are invalid.');
            }
            presetDimensions = { width: canvasWidth, height: canvasHeight };
          }
        }
        if (!source) throw new Error('This project has no base artwork.');
        const image = await decodeImage(source);
        if (canvasRef.current !== canvas) return;
        if (presetDimensions) {
          canvas.setDimensions(presetDimensions);
          fitCanvas();
        }
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
      if (fitViewRef.current === fitCanvas) fitViewRef.current = null;
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
    if (!storageReady || !canvas || !layers.length || suppressSaveRef.current) return;
    const generation = ++saveGenerationRef.current;
    unsavedRef.current = true;
    setSaveStatus('saving');
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
        const thumbnailMultiplier = Math.min(1, 480 / canvas.getWidth(), 270 / canvas.getHeight());
        await saveStudioManifest(storageKey, { version: 1, title, selectedLayerId,
          activeAristoColorsId: activeProfileIdRef.current,
          width: canvas.getWidth(), height: canvas.getHeight(), layers: savedLayers },
          () => generation === saveGenerationRef.current && canvasRef.current === canvas && !suppressSaveRef.current,
          { id: localImportToken ?? projectId, updatedAt: Date.now(),
            thumbnailDataUrl: canvas.toDataURL({ format: 'jpeg', quality: 0.72, multiplier: thumbnailMultiplier }) });
        if (generation === saveGenerationRef.current && !suppressSaveRef.current) {
          unsavedRef.current = false;
          setSaveStatus('saved');
        }
      } catch (cause) {
        console.error('Saving the local project failed:', cause);
        setError(`Local project save failed: ${cause instanceof Error ? cause.message : String(cause)}`);
        if (generation === saveGenerationRef.current) setSaveStatus('failed');
      }
    })();
  }, [layers, selectedLayerId, storageReady, saveRevision, storageKey, title]);

  function saveProject() {
    if (!storageReady || !layers.length || resetting) return;
    suppressSaveRef.current = false;
    setSaveStatus('saving');
    unsavedRef.current = true;
    requestSave(current => current + 1);
  }

  async function resetCanvas() {
    const canvas = canvasRef.current;
    const base = layers.find(layer => layer.isBase);
    if (!canvas || !base || resetting) return;
    if (!window.confirm('Reset this canvas to its original artwork? Added layers and the saved composition will be removed.')) return;
    setResetting(true);
    cancelRefinement();
    resultRevisionRef.current++;
    setFinishRequested(false);
    acceptanceRunRef.current?.abort();
    acceptanceRunRef.current = null;
    acceptingRef.current = false;
    setAccepting(false);
    harmonizationRunRef.current?.abort();
    harmonizationRunRef.current = null;
    setHarmonizationState({ busy: false, progress: 0, stage: '', error: null, notice: null });
    editEpochRef.current++;
    suppressSaveRef.current = true;
    saveGenerationRef.current++;
    setTool('move');
    try {
      await clearStudioManifest(storageKey);
      await clearHarmonizationResult(localImportToken ?? projectId);
      setHarmonizedResult(null);
      if (canvasRef.current !== canvas) return;
      canvas.discardActiveObject();
      canvas.remove(...canvas.getObjects().filter(object => object !== base.object));
      const image = base.originalSource;
      base.object.setElement(image);
      const scale = Math.min(canvas.getWidth() * 0.9 / image.naturalWidth, canvas.getHeight() * 0.9 / image.naturalHeight);
      base.object.set({ left: (canvas.getWidth() - image.naturalWidth * scale) / 2,
        top: (canvas.getHeight() - image.naturalHeight * scale) / 2, scaleX: scale, scaleY: scale,
        angle: 0, flipX: false, flipY: false, opacity: 1, globalCompositeOperation: 'source-over', visible: true });
      applyLayerCrop(base.object, emptyCrop());
      base.object.setCoords();
      canvas.moveObjectTo(base.object, 0);
      masksRef.current.clear();
      undoRef.current = [];
      redoRef.current = [];
      transformStartRef.current = null;
      canvas.setActiveObject(base.object);
      setLayers([base]);
      setSelectedLayerId(base.id);
      setCurrentStep('compose');
      setCutoutNotice(null);
      setError(null);
      setSaveStatus('idle');
      unsavedRef.current = false;
      canvas.requestRenderAll();
    } catch (cause) {
      suppressSaveRef.current = false;
      setError(`Canvas reset failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally { setResetting(false); }
  }

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
    masksRef.current.delete(layer.id);
    setLayers(current => current.filter(currentLayer => currentLayer.id !== layer.id));
    setSelectedLayerId(current => current === layer.id ? null : current);
    canvas.requestRenderAll();
  }

  const clipboardLayerRef = useRef<{ object: LayerImage; source: HTMLImageElement; name: string; crop: LayerCrop; mask?: HTMLCanvasElement } | null>(null);

  function cloneLayer(source: NonNullable<typeof clipboardLayerRef.current>, paste = false) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const original = source.object;
      const pixels = original.getElement();
      const object = new FabricImage(pixels instanceof HTMLCanvasElement ? copyPixels(pixels) : pixels, {
        width: original.width, height: original.height, scaleX: original.scaleX, scaleY: original.scaleY,
        angle: original.angle, flipX: original.flipX, flipY: original.flipY, opacity: original.opacity,
        skewX: original.skewX, skewY: original.skewY, originX: original.originX, originY: original.originY,
        cropX: original.cropX, cropY: original.cropY, visible: original.visible,
        globalCompositeOperation: original.globalCompositeOperation,
      }) as LayerImage;
      const id = crypto.randomUUID();
      object.studioLayerId = id;
      object.set({ left: (source.object.left ?? 0) + 24, top: (source.object.top ?? 0) + 24,
        lockMovementX: false, lockMovementY: false, lockRotation: false,
        lockScalingX: false, lockScalingY: false, hasControls: true, selectable: true, evented: true });
      applyLayerCrop(object, source.crop);
      object.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: true });
      if (paste) {
        const center = canvas.getVpCenter();
        const bounds = object.getBoundingRect();
        object.set({ left: object.left + center.x - bounds.left - bounds.width / 2,
          top: object.top + center.y - bounds.top - bounds.height / 2 });
      }
      object.setCoords();
      recordHistory();
      if (source.mask) masksRef.current.set(id, copyPixels(source.mask));
      canvas.add(object);
      canvas.setActiveObject(object);
      setLayers(current => [...current, { id, name: `${source.name} (${paste ? 'Paste' : 'Copy'})`,
        object, originalSource: source.source, isBase: false }]);
      setSelectedLayerId(id);
      setTool('move');
      canvas.requestRenderAll();
    } catch (cause) { reportError(cause); }
  }

  async function handleAutoCutout(layer: StudioLayer) {
    const canvas = canvasRef.current;
    if (!canvas || layer.isBase || cutoutBusyRef.current) return;
    const epoch = editEpochRef.current;
    cutoutBusyRef.current = true;
    setCutoutProcessing('background');
    setCutoutNotice(null);
    setTool('move');
    try {
      const result = removeSolidBackground(layer.originalSource);
      if (!result.success) {
        throw new Error('Unable to automatically isolate subject. Use the Eraser tool for complex backgrounds.');
      }
      const transparentDataUrl = result.canvas.toDataURL('image/png');
      const transparentImg = await decodeImage(transparentDataUrl);
      if (canvasRef.current !== canvas || editEpochRef.current !== epoch || !canvas.getObjects().includes(layer.object)) return;
      recordHistory();
      layer.object.setElement(transparentImg);
      layer.object.set('dirty', true);
      layer.object.setCoords();
      setLayers(current => [...current]);
      canvas.requestRenderAll();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Cutout failed');
    } finally {
      cutoutBusyRef.current = false;
      setCutoutProcessing(null);
    }
  }
  function duplicateLayer(layer: StudioLayer) {
    const canvas = canvasRef.current;
    if (!canvas || layer.isBase) return;
    recordHistory();

    // Use the active layer's in-memory pixels without rendering or reloading them.
    const sourceElement = layer.object.getElement() as HTMLImageElement | HTMLCanvasElement;
    if (!sourceElement) return;

    const clonedObj = new FabricImage(sourceElement, {
      left: (layer.object.left ?? 0) + 32,
      top: (layer.object.top ?? 0) + 32,
      scaleX: layer.object.scaleX,
      scaleY: layer.object.scaleY,
      angle: layer.object.angle,
      flipX: layer.object.flipX,
      flipY: layer.object.flipY,
      opacity: layer.object.opacity,
      hasControls: true,
    }) as LayerImage;

    clonedObj.studioLayerId = crypto.randomUUID();
    applyLayerCrop(clonedObj, { ...(layer.object.studioCrop ?? emptyCrop()) });
    clonedObj.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false, mtr: true });
    clonedObj.setCoords();

    canvas.add(clonedObj);
    canvas.setActiveObject(clonedObj);

    const newLayer: StudioLayer = {
      id: clonedObj.studioLayerId,
      name: `${layer.name} (Copy)`,
      object: clonedObj,
      originalSource: layer.originalSource,
      isBase: false,
    };
    const mask = masksRef.current.get(layer.id);
    if (mask) masksRef.current.set(newLayer.id, copyPixels(mask));
    setLayers(current => [...current, newLayer]);
    setSelectedLayerId(newLayer.id);
    canvas.requestRenderAll();
  }
  function toggleLock(layer: StudioLayer) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    recordHistory();
    const locked = !layer.object.lockMovementX;
    layer.object.set({ lockMovementX: locked, lockMovementY: locked, lockRotation: locked,
      lockScalingX: locked, lockScalingY: locked, hasControls: !locked, selectable: !locked, evented: !locked });
    if (locked && canvas.getActiveObject() === layer.object) canvas.discardActiveObject();
    if (locked && selectedLayerId === layer.id) setSelectedLayerId(null);
    setLayers(current => [...current]);
    canvas.requestRenderAll();
  }

  function copySelectedLayer() {
    const layer = layers.find(current => current.id === selectedLayerId);
    if (!layer || layer.isBase) return;
    const pixels = layer.object.getElement();
    const original = layer.object;
    const properties = {
      left: original.left, top: original.top, width: original.width, height: original.height,
      scaleX: original.scaleX, scaleY: original.scaleY, angle: original.angle,
      skewX: original.skewX, skewY: original.skewY, flipX: original.flipX, flipY: original.flipY,
      originX: original.originX, originY: original.originY, opacity: original.opacity,
      visible: original.visible, globalCompositeOperation: original.globalCompositeOperation,
      cropX: original.cropX, cropY: original.cropY,
    };
    const object = new FabricImage(pixels instanceof HTMLCanvasElement ? copyPixels(pixels) : pixels,
      properties) as LayerImage;
    const mask = masksRef.current.get(layer.id);
    clipboardLayerRef.current = { object, source: layer.originalSource, name: layer.name,
      crop: { ...(layer.object.studioCrop ?? emptyCrop()) }, mask: mask ? copyPixels(mask) : undefined };
  }

  function pasteLayer() {
    if (clipboardLayerRef.current) return cloneLayer(clipboardLayerRef.current, true);
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
      if (showAssetModal) {
        if (event.key === 'Escape') { event.preventDefault(); setShowAssetModal(false); }
        return;
      }
      if (resetting || currentStep !== 'compose') return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest('input, textarea, select') || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && ['c', 'v', 'd'].includes(key)) {
        const layer = layers.find(current => current.id === selectedLayerId);
        if (key === 'v' ? !clipboardLayerRef.current : !layer || layer.isBase) return;
        event.preventDefault();
        if (event.repeat) return;
        if (key === 'c') copySelectedLayer();
        else if (key === 'v') void pasteLayer();
        else if (layer) void duplicateLayer(layer);
        return;
      }
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
  }, [layers, selectedLayerId, resetting, currentStep, showAssetModal]);

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
    const epoch = editEpochRef.current;
    let source: string | undefined;
    try {
      if (!/^image\/(png|jpeg|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
        throw new Error('Choose a PNG, JPG, JPEG, or WebP image.');
      }
      const canvas = canvasRef.current;
      if (!canvas || !baseReadyRef.current) throw new Error('Wait for the base artwork to finish loading.');
      source = URL.createObjectURL(file);
      const image = await decodeImage(source);
      if (canvasRef.current !== canvas || epoch !== editEpochRef.current) return;
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
    const epoch = editEpochRef.current;
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
      if (canvasRef.current !== canvas || epoch !== editEpochRef.current || !canvas.getObjects().includes(layer.object)) return;
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
  function openCompositionPreview() {
    const canvas = canvasRef.current;
    if (!canvas || !baseReadyRef.current) return;
    try {
      exportingRef.current = true;
      setPreview({ src: canvas.toDataURL({ format: 'png', multiplier: 1 }), width: canvas.getWidth(), height: canvas.getHeight() });
    } catch (cause) {
      console.error('Composition preview failed:', cause);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      exportingRef.current = false;
      canvas.requestRenderAll();
    }
  }

  function exportComposition() {
    const canvas = canvasRef.current;
    try {
      exportingRef.current = true;
      let url: string;
      const acceptedImage = getAcceptedHarmonizedImage(harmonizedResult);
      if (currentStep === 'finish') {
        if (!acceptedImage) throw new Error('Accept the Harmonize result before exporting Finish.');
        url = acceptedImage;
      } else if (currentStep === 'harmonize') {
        if (!refinementReady || !harmonizedResult?.review?.refinedImageUrl) throw new Error('Wait for the harmonized image to finish processing before exporting.');
        url = harmonizedResult.review.refinedImageUrl;
      } else if (acceptedImage) {
        url = acceptedImage;
      } else {
        if (!canvas) throw new Error('Wait for the composition canvas to load before exporting.');
        url = canvas.toDataURL({ format: 'png', multiplier: 1 });
      }
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
      canvas?.requestRenderAll();
    }
  }

  function getTelemetrySample(): ScenePixelData | null {
    const layer = findVisibleBackgroundLayer(layers);
    if (!layer) return null;
    try {
      const source = layer.object.getElement();
      const width = layer.object.width;
      const height = layer.object.height;
      if (!width || !height) return null;
      const ratio = Math.min(1, 96 / Math.max(width, height));
      const sample = document.createElement('canvas');
      sample.width = Math.max(1, Math.round(width * ratio));
      sample.height = Math.max(1, Math.round(height * ratio));
      const context = sample.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(source, 0, 0, sample.width, sample.height);
      const pixels = context.getImageData(0, 0, sample.width, sample.height);
      return { width: sample.width, height: sample.height, data: pixels.data };
    } catch {
      return null;
    }
  }

  async function prepareHarmonization(settings: HarmonizationSettings, signal: AbortSignal, onProgress: (progress: number) => void): Promise<HarmonizationResult> {
    signal.throwIfAborted();
    const canvas = canvasRef.current;
    const base = layers.find(layer => layer.isBase);
    if (!canvas || !base || !baseReadyRef.current) throw new Error('Wait for the project artwork to load.');
    const width = canvas.getWidth(), height = canvas.getHeight();
    let compositeImage: string;
    try {
      exportingRef.current = true;
      compositeImage = canvas.toDataURL({ format: 'png', multiplier: 1 });
    } finally {
      exportingRef.current = false;
      canvas.requestRenderAll();
    }
    // Copy decoded pixels directly: Fabric clone() reloads src, which may be a revoked import blob URL.
    const clones = layers.map(layer => {
      const original = layer.object;
      const pixels = document.createElement('canvas');
      pixels.width = original.width;
      pixels.height = original.height;
      const context = pixels.getContext('2d');
      if (!context) throw new Error('Unable to copy layer pixels for harmonization.');
      context.drawImage(original.getElement(), 0, 0, pixels.width, pixels.height);
      const mask = masksRef.current.get(layer.id);
      if (mask) {
        context.globalCompositeOperation = 'destination-in';
        context.drawImage(mask, 0, 0, pixels.width, pixels.height);
        context.globalCompositeOperation = 'source-over';
      }
      const object = new FabricImage(pixels, {
        left: original.left, top: original.top, originX: original.originX, originY: original.originY,
        scaleX: original.scaleX, scaleY: original.scaleY, angle: original.angle,
        skewX: original.skewX, skewY: original.skewY, flipX: original.flipX, flipY: original.flipY,
        opacity: original.opacity, visible: original.visible, globalCompositeOperation: original.globalCompositeOperation,
      });
      applyLayerCrop(object, { ...(original.studioCrop ?? emptyCrop()) });
      return { isBase: layer.isBase, object };
    });
    signal.throwIfAborted();
    const background = new StaticCanvas(undefined, { width, height, backgroundColor: canvas.backgroundColor, renderOnAddRemove: false });
    const foreground = new StaticCanvas(undefined, { width, height, backgroundColor: '', renderOnAddRemove: false });
    try {
      for (const entry of clones) (entry.isBase ? background : foreground).add(entry.object);
      const preset = getCanonicalPreset(activeProfileIdRef.current);
      const values = profileRefinements(preset.profile);
      const backgroundTelemetry = analyzeStyle(getTelemetrySample());
      const [rw, rh] = settings.aspectRatio.split(':').map(Number);
      const unit = Math.ceil(Math.max(width / rw, height / rh));
      const targetWidth = unit * rw, targetHeight = unit * rh;
      if (targetWidth * targetHeight > 8_000_000) throw new Error('The target frame exceeds the 8 megapixel processing limit.');
      const offsetX = Math.floor((targetWidth - width) / 2), offsetY = Math.floor((targetHeight - height) / 2);
      const frame = (source: CanvasImageSource, transparent = false) => {
        const output = document.createElement('canvas'); output.width = targetWidth; output.height = targetHeight;
        const context = output.getContext('2d');
        if (!context) throw new Error('Unable to create the harmonization frame.');
        if (!transparent) { context.fillStyle = '#141619'; context.fillRect(0, 0, targetWidth, targetHeight); }
        context.drawImage(source, offsetX, offsetY); return output;
      };
      const foregroundCanvas = foreground.toCanvasElement();
      const fgContext = foregroundCanvas.getContext('2d');
      if (!fgContext) throw new Error('Unable to read foreground pixels.');
      const pixels = fgContext.getImageData(0, 0, width, height).data;
      let left = width, top = height, right = -1, bottom = -1;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (pixels[(y * width + x) * 4 + 3]) {
          left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
      }
      if (right < left) throw new Error('Add a visible foreground image before harmonizing.');
      const cutout = document.createElement('canvas'); cutout.width = right - left + 1; cutout.height = bottom - top + 1;
      const cutoutContext = cutout.getContext('2d');
      if (!cutoutContext) throw new Error('Unable to capture the foreground cutout.');
      cutoutContext.drawImage(foregroundCanvas, left, top, cutout.width, cutout.height, 0, 0, cutout.width, cutout.height);
      const foregroundImageUrl = cutout.toDataURL('image/png');
      const foregroundBounds = { x: left + offsetX, y: top + offsetY, width: cutout.width, height: cutout.height };
      const backgroundImageUrl = frame(background.toCanvasElement()).toDataURL('image/png');
      const beforeImageUrl = frame(await decodeImage(compositeImage)).toDataURL('image/png');
      signal.throwIfAborted(); onProgress(50);
      const refinedImageUrl = await applyPixelHarmonization(backgroundImageUrl, foregroundImageUrl,
        foregroundBounds, profileParameters(preset.profile, settings.intensity, values, backgroundTelemetry));
      signal.throwIfAborted(); await decodeImage(refinedImageUrl); signal.throwIfAborted(); onProgress(95);
      const palette = preset.profile.deterministicFeatures.palette;
      return harmonizationResultSchema.parse({ success: true, resultImageUrl: refinedImageUrl,
        review: { beforeImageUrl, backgroundImageUrl, foregroundMaskUrl: frame(foregroundCanvas, true).toDataURL('image/png'),
          pixelInputs: { profileId: preset.profile.id, foregroundImageUrl, foregroundBounds },
          backgroundLab: ['l', 'a', 'b'].map(key => palette.reduce((sum, color) => sum + color.lab[key as keyof typeof color.lab] * color.weight, 0)),
          lightingAzimuth: (preset.profile.inferredFeatures.lighting.azimuthDeg + 360) % 360,
          refinements: values, refinedImageUrl },
        audit: { harmonizedAt: new Date().toISOString(), appliedIntensity: settings.intensity, lightingMatchScore: null,
          method: 'pixel-v1', scoreMeaning: 'luminance-statistics-similarity', width: targetWidth, height: targetHeight,
          aspectRatio: settings.aspectRatio, processedForegroundPixels: pixels.reduce((sum, alpha, index) => sum + (index % 4 === 3 && alpha > 0 ? 1 : 0), 0) } });
    } finally {
      await background.dispose();
      await foreground.dispose();
    }
  }
  return (
    <main aria-busy={resetting} style={{ height: '100dvh', overflow: 'hidden', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: '#141619', color: '#e5e7eb', pointerEvents: resetting ? 'none' : undefined }}>
      <header className="h-14" style={{ height: 56, minHeight: 56, maxHeight: 56, flexShrink: 0, padding: '0 16px', gap: 16, display: 'flex', alignItems: 'center', borderBottom: '1px solid #ffffff0a', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 0', minWidth: 0 }}>
        <Link href="/projects" style={{ color: '#b8c8df', fontSize: 12, whiteSpace: 'nowrap' }}>← Back</Link>
        <h1 title={title} style={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
        <button className="!bg-zinc-900/40 hover:!bg-zinc-800/70 !text-zinc-300 !border-zinc-800 rounded-md transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/60 disabled:!text-zinc-600 disabled:hover:!bg-zinc-900/40 disabled:cursor-not-allowed aria-pressed:!bg-cyan-400/10 aria-pressed:!text-cyan-200 [&[aria-selected=true]]:!bg-cyan-400/10 [&[aria-selected=true]]:!text-cyan-200 [&[aria-current=step]]:!bg-cyan-400/10 [&[aria-current=step]]:!text-cyan-200" type="button" aria-label="Save project" title="Auto-save status · click to save now" disabled={!storageReady || resetting || saveStatus === 'saving'} onClick={saveProject} style={{ padding: '3px 6px', borderRadius: 4, background: 'transparent', color: saveStatus === 'failed' ? '#eaa8a8' : '#819c99', fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer' }}>{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '● Saved' : saveStatus === 'failed' ? 'Save failed' : 'Auto-save'}</button>
        </div>
        <div aria-label="Workflow steps" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {([['compose', '01 Compose'], ['harmonize', '02 Harmonize'], ['finish', '03 Finish']] as const).map(([step, label]) =>
            <button className="transition-colors duration-150 hover:!bg-[#1f1f23] hover:!border-[#3f3f46] focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/50" key={step} type="button" aria-current={currentStep === step ? 'step' : undefined} onClick={() => navigateWorkflow(step)} style={{ height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, lineHeight: 1, padding: '0 10px', borderRadius: 5, border: currentStep === step ? '1px solid #22d3ee' : '1px solid #27272a', background: currentStep === step ? 'rgba(8, 145, 178, 0.2)' : '#18181b', color: currentStep === step ? '#f4f4f5' : '#a1a1aa', whiteSpace: 'nowrap', cursor: 'pointer' }}>{label}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: '1 1 0', justifyContent: 'flex-end', minWidth: 'max-content' }}>
          <button className="!bg-zinc-900/40 hover:!bg-zinc-800/70 !text-zinc-300 !border-zinc-800 rounded-md transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/60 disabled:!text-zinc-600 disabled:hover:!bg-zinc-900/40 disabled:cursor-not-allowed aria-pressed:!bg-cyan-400/10 aria-pressed:!text-cyan-200 [&[aria-selected=true]]:!bg-cyan-400/10 [&[aria-selected=true]]:!text-cyan-200 [&[aria-current=step]]:!bg-cyan-400/10 [&[aria-current=step]]:!text-cyan-200" type="button" aria-label="Undo" disabled={!undoRef.current.length} onClick={() => historyAction('undo')} title="Undo (Ctrl+Z)" style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 5, background: 'transparent', color: undoRef.current.length ? '#b7c7df' : '#4a5260', cursor: 'pointer' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 4-5 5 5 5M4 9h10a6 6 0 0 1 0 12" /></svg></button>
          <button className="!bg-zinc-900/40 hover:!bg-zinc-800/70 !text-zinc-300 !border-zinc-800 rounded-md transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/60 disabled:!text-zinc-600 disabled:hover:!bg-zinc-900/40 disabled:cursor-not-allowed aria-pressed:!bg-cyan-400/10 aria-pressed:!text-cyan-200 [&[aria-selected=true]]:!bg-cyan-400/10 [&[aria-selected=true]]:!text-cyan-200 [&[aria-current=step]]:!bg-cyan-400/10 [&[aria-current=step]]:!text-cyan-200" type="button" aria-label="Redo" disabled={!redoRef.current.length} onClick={() => historyAction('redo')} title="Redo (Ctrl+Y)" style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 5, background: 'transparent', color: redoRef.current.length ? '#b7c7df' : '#4a5260', cursor: 'pointer' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 4 5 5-5 5M20 9H10a6 6 0 0 0 0 12" /></svg></button>
          <button type="button" onClick={openCompositionPreview} disabled={!layers.length} className="text-zinc-200 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40" style={{ height: 30, background: '#18181b', color: '#e4e4e7', border: '1px solid #27272a', padding: '0 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Preview</button>
          <button className="hover:!bg-cyan-200 !bg-cyan-300/80 !text-zinc-950 !border-cyan-200/20 transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-200 disabled:opacity-40 disabled:cursor-not-allowed" type="button" onClick={exportComposition} style={{ height: 30, padding: '0 12px', borderRadius: 5, background: '#8ccbd8', color: '#101b28', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer' }}>Export Image</button>
        </div>
        <input ref={inputRef} type="file" hidden accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void addImage(file);
        }} />
      </header>
      {error && <p role="alert" style={{ margin: 0, padding: '10px 24px', color: '#fca5a5', background: '#342026' }}>{error}</p>}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
        <nav aria-label="Canvas tools" className="w-64" style={{ width: 256, flexShrink: 0, padding: 12, borderRight: '1px solid #ffffff0a', background: '#17191e', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
            <button type="button" onClick={() => inputRef.current?.click()} style={{ padding: '9px 4px', borderRadius: 6, background: '#8ccbd8', color: '#101b28', fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>+ Upload</button>
            <button type="button" onClick={() => setShowAssetModal(true)} aria-haspopup="dialog" style={{ padding: '9px 4px', borderRadius: 6, border: '1px solid #ffffff1e', background: '#1e222a', color: '#dce7f8', fontSize: 11, fontWeight: 500, cursor: 'pointer', textAlign: 'center' }}>Library</button>
          </div>
          {([['move', 'Move / Select', 'V'], ['eraser', 'Eraser', 'E'], ['brush', 'Brush / Inpaint Mask', 'B']] as const).map(([mode, label, shortcut]) => (
            <button className="!bg-zinc-900/40 hover:!bg-zinc-800/70 !text-zinc-300 !border-zinc-800 rounded-md transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/60 disabled:!text-zinc-600 disabled:hover:!bg-zinc-900/40 disabled:cursor-not-allowed aria-pressed:!bg-cyan-400/10 aria-pressed:!text-cyan-200 [&[aria-selected=true]]:!bg-cyan-400/10 [&[aria-selected=true]]:!text-cyan-200 [&[aria-current=step]]:!bg-cyan-400/10 [&[aria-current=step]]:!text-cyan-200" key={mode} type="button" title={`${label} (${shortcut})`} aria-pressed={tool === mode} disabled={mode !== 'move' && !selectedImportedLayer?.object.visible} onClick={() => setTool(mode)} style={{ padding: '10px 8px', textAlign: 'left', fontSize: 12, borderRadius: 6, border: '1px solid #ffffff14', background: tool === mode ? '#394760' : '#20232a', color: mode === 'move' || selectedImportedLayer?.object.visible ? '#e5e7eb' : '#626976', cursor: 'pointer' }}>{label} <span style={{ color: '#8792a5' }}>({shortcut})</span></button>
          ))}
          {tool !== 'move' && <div style={{ paddingTop: 12 }}>
            <label htmlFor="brush-size" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aab2c0', marginBottom: 10 }}>Brush Size <span>{brushSize}px</span></label>
            <input className="!accent-cyan-300/80" id="brush-size" type="range" min={10} max={150} step={1} value={brushSize} onChange={event => setBrushSize(Number(event.currentTarget.value))} style={{ width: '100%', accentColor: '#8b9fc7' }} />
          </div>}
          {currentStep === 'compose' && (
            <button
              type="button"
              onClick={() => void startHarmonization({ aspectRatio: harmonizationSettingsRef.current?.aspectRatio ?? '16:9', intensity: harmonizationSettingsRef.current?.intensity ?? 80 })}
              disabled={harmonizationState.busy || !layers.length}
              style={{
                marginTop: 12,
                padding: '10px 6px',
                borderRadius: 6,
                border: '1px solid #9ee9f455',
                background: '#80cbd9',
                color: '#0b1723',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {harmonizationState.busy ? 'Harmonizing…' : '⚡ Proceed to Harmonize →'}
            </button>
          )}
          <div style={{ marginTop: 'auto', display: 'grid', gap: 8, paddingTop: 16 }}>
            <button className="!bg-zinc-900/40 hover:!bg-zinc-800/70 !text-zinc-300 !border-zinc-800 rounded-md transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/60 disabled:!text-zinc-600 disabled:hover:!bg-zinc-900/40 disabled:cursor-not-allowed aria-pressed:!bg-cyan-400/10 aria-pressed:!text-cyan-200 [&[aria-selected=true]]:!bg-cyan-400/10 [&[aria-selected=true]]:!text-cyan-200 [&[aria-current=step]]:!bg-cyan-400/10 [&[aria-current=step]]:!text-cyan-200" type="button" aria-pressed={viewMode === 'actual'} title="Toggle fitted view and 100% pixel view" onClick={() => {
              const next = viewModeRef.current === 'fit' ? 'actual' : 'fit';
              viewModeRef.current = next;
              setViewMode(next);
              fitViewRef.current?.();
            }} style={{ padding: '8px 6px', borderRadius: 5, border: '1px solid #ffffff12', background: '#ffffff04', color: '#b7c7db', fontSize: 11, cursor: 'pointer' }}>{viewMode === 'fit' ? 'Fit to Screen · Switch to 100%' : '100% · Switch to Fit'}</button>
            <button className="!bg-zinc-900/40 hover:!bg-zinc-800/70 !text-zinc-300 !border-zinc-800 rounded-md transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/60 disabled:!text-zinc-600 disabled:hover:!bg-zinc-900/40 disabled:cursor-not-allowed aria-pressed:!bg-cyan-400/10 aria-pressed:!text-cyan-200 [&[aria-selected=true]]:!bg-cyan-400/10 [&[aria-selected=true]]:!text-cyan-200 [&[aria-current=step]]:!bg-cyan-400/10 [&[aria-current=step]]:!text-cyan-200" type="button" disabled={!storageReady || resetting} onClick={() => void resetCanvas()} style={{ padding: 8, borderRadius: 5, background: 'transparent', color: '#929fb2', fontSize: 11, cursor: 'pointer' }}>{resetting ? 'Resetting…' : '↺ Reset Canvas'}</button>
          </div>
        </nav>
        <div ref={harmonizedViewportRef} className="flex-1 h-full min-h-0 relative flex items-center justify-center px-2 py-2" style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, padding: 8, overflow: 'hidden' }}>
          <div ref={hostRef} className="max-h-[calc(100vh-68px)]" style={{ width: '100%', height: '100%', maxHeight: 'calc(100dvh - 68px)', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }} />
          {currentStep !== 'compose' && harmonizedResult && <HarmonizedResultView result={harmonizedResult} onError={setReviewError} finish={currentStep === 'finish'} onCompose={() => navigateWorkflow('compose')} />}
          {currentStep !== 'compose' && !harmonizedResult && <section style={{ position: 'absolute', inset: 8, background: '#141619', display: 'grid', placeItems: 'center', padding: 24, color: '#a1a1aa' }}><p>Run Harmonize Scene to create a composition for review.</p></section>}
        </div>
        <aside className="overflow-y-auto max-h-[calc(100vh-100px)]" style={{ width: 240, flexShrink: 0, padding: '12px 10px', maxHeight: 'calc(100dvh - 100px)', borderLeft: '1px solid #ffffff0a', background: '#17191e', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {currentStep === 'harmonize' ? <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}><HarmonizationReviewControls
              values={refinements}
              onChange={updateRefinements}
              profileId={harmonizedResult?.review?.pixelInputs?.profileId ?? activeProfileIdRef.current}
              onProfileSelect={id => {
                const preset = getCanonicalPreset(id);
                activeProfileIdRef.current = id;
                requestSave(current => current + 1);
                updateRefinements(profileRefinements(preset.profile), harmonizationSettingsRef.current.intensity, id);
              }}
              intensity={harmonizedResult?.audit.appliedIntensity ?? harmonizationSettingsRef.current.intensity}
              onIntensityChange={value => updateRefinements(refinements, value)}
              onReHarmonize={() => void startHarmonization(harmonizationSettingsRef.current)}
              available={!!harmonizedResult?.review?.pixelInputs && !harmonizationState.busy}
              busy={harmonizationState.busy || accepting}
              saving={accepting}
              ready={refinementReady && !reviewError}
              error={reviewError ?? harmonizationState.error}
              onAccept={() => void acceptRefinedComposition()}
            /></div> : currentStep === 'finish' ? (
  <section
    aria-label="Finish and Export Dock"
    style={{ display: 'flex', flexDirection: 'column', gap: 14, color: '#dce7f8', fontSize: 11, height: '100%', overflowY: 'auto' }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h2 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#82c9da', margin: 0 }}>
        03 Finish & Export
      </h2>
      <span style={{ fontSize: 10, color: '#00E599', fontWeight: 600 }}>● Ready</span>
    </div>

    {/* Artwork Specification Card */}
    <div style={{ padding: '10px 12px', background: '#141619', border: '1px solid #ffffff12', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: '#94a3b8' }}>Status</span>
        <span style={{ color: '#00E599', fontWeight: 600 }}>Baked Master</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: '#94a3b8' }}>Resolution</span>
        <span style={{ color: '#e2e8f0', fontWeight: 500 }}>
          {harmonizedResult?.audit.width ? `${harmonizedResult.audit.width} × ${harmonizedResult.audit.height}px` : 'Canvas Native'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: '#94a3b8' }}>Color Treatment</span>
        <span style={{ color: '#38bdf8', fontWeight: 500 }}>Photometric Blend</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: '#94a3b8' }}>Applied Intensity</span>
        <span style={{ color: '#e2e8f0' }}>{harmonizedResult?.audit.appliedIntensity ?? 80}%</span>
      </div>
    </div>

    {/* Export Options & Actions */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 6, borderTop: '1px solid #ffffff0f' }}>
      <button
        type="button"
        onClick={exportComposition}
        style={{
          width: '100%',
          padding: '12px 6px',
          borderRadius: 7,
          border: '1px solid #82c9da55',
          background: '#80cbd9',
          color: '#0b1723',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          boxShadow: '0 2px 10px rgba(130, 201, 218, 0.2)',
        }}
      >
        <span> Download Master Image</span>
      </button>

      <p style={{ margin: 0, fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>
        Exports lossless full-resolution PNG with baked lighting and contact shadows.
      </p>
    </div>

    {/* Workflow Revision Navigation */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #ffffff0f' }}>
      <span style={{ fontSize: 10, color: '#a1a1aa', textTransform: 'uppercase', fontWeight: 600 }}>Revision Controls</span>
      <button
        type="button"
        onClick={() => navigateWorkflow('harmonize')}
        style={{
          width: '100%',
          padding: '8px 4px',
          borderRadius: 6,
          border: '1px solid #ffffff14',
          background: '#1e222a',
          color: '#cbd5e1',
          fontSize: 11,
          fontWeight: 500,
          cursor: 'pointer',
          textAlign: 'left',
          paddingLeft: 10,
        }}
      >
        ← Revise in Harmonize
      </button>
      <button
        type="button"
        onClick={() => navigateWorkflow('compose')}
        style={{
          width: '100%',
          padding: '8px 4px',
          borderRadius: 6,
          border: '1px solid #ffffff14',
          background: '#141619',
          color: '#94a3b8',
          fontSize: 11,
          cursor: 'pointer',
          textAlign: 'left',
          paddingLeft: 10,
        }}
      >
        ← Back to Compose (Layers)
      </button>
    </div>

    {reviewError && (
      <p role="alert" style={{ margin: 0, padding: 8, borderRadius: 4, background: '#451a1a', color: '#fca5a5', fontSize: 10 }}>
        {reviewError}
      </p>
    )}
  </section>
) : <>
          <div role="tablist" aria-label="Inspector" style={{ display: 'flex', flexShrink: 0, gap: 2, marginBottom: 12, padding: 3, background: '#101216', borderRadius: 6 }}>
            {([['layers', 'Layers'], ['transform', 'Transform'], ['style', 'AristoColors']] as const).map(([tab, label]) =>
              <button key={tab} type="button" role="tab" aria-selected={inspectorTab === tab} disabled={tab === 'transform' && !selectedLayer} onClick={() => setInspectorTab(tab)} style={{ flex: 1, minWidth: 0, padding: '7px 3px', fontSize: 11, borderRadius: 4, border: '1px solid #3f3f46', background: inspectorTab === tab ? '#3f3f46' : '#18181b', color: inspectorTab === tab ? '#ffffff' : '#a1a1aa', cursor: tab === 'transform' && !selectedLayer ? 'default' : 'pointer' }}>{label}</button>)}
          </div>
          <div role="tabpanel" aria-label={inspectorTab === 'style' ? 'AristoColors' : inspectorTab === 'transform' ? 'Transform' : 'Layers'} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          {inspectorTab === 'style' ? <AristoColorsProfilePanel key={selectedLayerId ?? 'scene'} getSample={getTelemetrySample} label={selectedLayerId ? `Layer · ${layers.find(layer => layer.id === selectedLayerId)?.name ?? 'Selected image'}` : 'Scene · Visible composition'} /> : inspectorTab === 'transform' ? <>
          <p role="status" style={{ padding: '0 8px', marginBottom: 10, fontSize: 12, color: '#d4d4d8', overflowWrap: 'anywhere' }}>Target: {selectedLayer ? selectedLayer.name + ' / Image' : 'None selected'}</p>
          {selectedLayer && <ArrangeInspector object={selectedLayer.object} isBase={selectedLayer.isBase}
            canUp={layers.indexOf(selectedLayer) < layers.length - 1} canDown={layers.indexOf(selectedLayer) > 1}
            onStack={arrangeSelected} onAlign={alignSelected} onRotate={rotateSelected}
            onFlip={axis => editSelected(object => object.set(axis === 'x' ? 'flipX' : 'flipY', axis === 'x' ? !object.flipX : !object.flipY))}
            onCrop={crop => editSelected(object => applyLayerCrop(object, crop))} />}
          {!selectedLayer && <p style={{ padding: 8, fontSize: 12, color: '#8796ac' }}>Select a layer to transform it.</p>}
          </> : <>
          <h2 className="!text-xs !font-medium uppercase !tracking-wider !text-zinc-400 !mb-2" style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1.6, color: '#b0b6c2', padding: '0 8px' }}>LAYERS</h2>
          <p style={{ fontSize: 11, color: '#707887', margin: '6px 8px 18px' }}>{layers.length} {layers.length === 1 ? 'layer' : 'layers'}</p>
          {[...layers].reverse().map(layer => (
            <div key={layer.id} style={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 40, padding: '0 4px', marginBottom: 3, borderRadius: 7, border: selectedLayerId === layer.id ? '1px solid #22d3ee80' : '1px solid transparent', background: selectedLayerId === layer.id ? '#08334466' : '#ffffff02', boxShadow: selectedLayerId === layer.id ? 'inset 2px 0 #22d3ee' : 'none' }}>
            <button className="!bg-zinc-900/40 hover:!bg-zinc-800/70 !text-zinc-300 !border-zinc-800 rounded-md transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/60 disabled:!text-zinc-600 disabled:hover:!bg-zinc-900/40 disabled:cursor-not-allowed aria-pressed:!bg-cyan-400/10 aria-pressed:!text-cyan-200 [&[aria-selected=true]]:!bg-cyan-400/10 [&[aria-selected=true]]:!text-cyan-200 [&[aria-current=step]]:!bg-cyan-400/10 [&[aria-current=step]]:!text-cyan-200" type="button" aria-label={`${layer.object.visible ? 'Hide' : 'Show'} ${layer.name}`} title={layer.object.visible ? 'Visible — click to hide' : 'Hidden — click to show'} aria-pressed={layer.object.visible} onClick={() => toggleVisibility(layer)} style={{ padding: 5, border: 0, background: 'transparent', color: layer.object.visible ? '#9aa4b5' : '#515968', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {!layer.object.visible && <path d="m3 3 18 18" />}
              </svg>
            </button>
            <button className="!bg-zinc-900/40 hover:!bg-zinc-800/70 !text-zinc-300 !border-zinc-800 rounded-md transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/60 disabled:!text-zinc-600 disabled:hover:!bg-zinc-900/40 disabled:cursor-not-allowed aria-pressed:!bg-cyan-400/10 aria-pressed:!text-white aria-pressed:font-medium [&[aria-selected=true]]:!bg-cyan-400/10 [&[aria-selected=true]]:!text-cyan-200 [&[aria-current=step]]:!bg-cyan-400/10 [&[aria-current=step]]:!text-cyan-200" type="button" aria-pressed={selectedLayerId === layer.id} onClick={() => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              if (!layer.object.selectable) return;
              if (layer.object.visible) canvas.setActiveObject(layer.object);
              else canvas.discardActiveObject();
              setSelectedLayerId(layer.id);
              canvas.requestRenderAll();
            }} title={layer.name} style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '11px 3px', border: 0, background: 'transparent', color: selectedLayerId === layer.id ? '#ffffff' : '#aab2c0', fontWeight: selectedLayerId === layer.id ? 500 : 400, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}>{layer.name}</button>
            <button className="!flex !items-center !justify-center !bg-zinc-800 !text-zinc-200 !rounded-md hover:!bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" type="button" aria-label={`${layer.object.lockMovementX ? 'Unlock' : 'Lock'} ${layer.name}`} title={layer.object.lockMovementX ? 'Unlock layer' : 'Lock layer'} aria-pressed={layer.object.lockMovementX} onClick={() => toggleLock(layer)} style={{ width: 28, height: 28, minWidth: 28, padding: 5, border: '1px solid #52525b', background: '#27272a', color: layer.object.lockMovementX ? '#22d3ee' : '#9aa4b5', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d={layer.object.lockMovementX ? 'M8 10V6a4 4 0 0 1 8 0v4' : 'M8 10V6a4 4 0 0 1 8 0'} /></svg>
            </button>
            {!layer.isBase && <button className="!flex !items-center !justify-center !bg-zinc-800 !text-zinc-200 !rounded-md hover:!bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300" type="button" aria-label={`Duplicate ${layer.name}`} title="Duplicate layer (Ctrl+D)" onClick={() => void duplicateLayer(layer)} style={{ width: 28, height: 28, minWidth: 28, padding: 5, border: '1px solid #52525b', background: '#27272a', color: '#e4e4e7', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></svg>
            </button>}
            {!layer.isBase && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <button className="!bg-zinc-900/40 hover:!bg-zinc-800/70 !text-zinc-300 !border-zinc-800 rounded-md transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/60 disabled:!text-zinc-600 disabled:hover:!bg-zinc-900/40 disabled:cursor-not-allowed aria-pressed:!bg-cyan-400/10 aria-pressed:!text-cyan-200 [&[aria-selected=true]]:!bg-cyan-400/10 [&[aria-selected=true]]:!text-cyan-200 [&[aria-current=step]]:!bg-cyan-400/10 [&[aria-current=step]]:!text-cyan-200" type="button" aria-label={`Move ${layer.name} up`} title="Move up" disabled={layers.indexOf(layer) === layers.length - 1} onClick={() => reorderLayer(layer, 1)} style={{ padding: 4, border: 0, background: 'transparent', color: layers.indexOf(layer) === layers.length - 1 ? '#3e4653' : '#9aa4b5', cursor: layers.indexOf(layer) === layers.length - 1 ? 'default' : 'pointer' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg></button>
              <button className="!bg-zinc-900/40 hover:!bg-zinc-800/70 !text-zinc-300 !border-zinc-800 rounded-md transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/60 disabled:!text-zinc-600 disabled:hover:!bg-zinc-900/40 disabled:cursor-not-allowed aria-pressed:!bg-cyan-400/10 aria-pressed:!text-cyan-200 [&[aria-selected=true]]:!bg-cyan-400/10 [&[aria-selected=true]]:!text-cyan-200 [&[aria-current=step]]:!bg-cyan-400/10 [&[aria-current=step]]:!text-cyan-200" type="button" aria-label={`Move ${layer.name} down`} title="Move down" disabled={layers.indexOf(layer) <= 1} onClick={() => reorderLayer(layer, -1)} style={{ padding: 4, border: 0, background: 'transparent', color: layers.indexOf(layer) <= 1 ? '#3e4653' : '#9aa4b5', cursor: layers.indexOf(layer) <= 1 ? 'default' : 'pointer' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button>
            </span>}
            {!layer.isBase && <button className="!bg-zinc-900/40 hover:!bg-zinc-800/70 !text-zinc-300 !border-zinc-800 rounded-md transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/60 disabled:!text-zinc-600 disabled:hover:!bg-zinc-900/40 disabled:cursor-not-allowed aria-pressed:!bg-cyan-400/10 aria-pressed:!text-cyan-200 [&[aria-selected=true]]:!bg-cyan-400/10 [&[aria-selected=true]]:!text-cyan-200 [&[aria-current=step]]:!bg-cyan-400/10 [&[aria-current=step]]:!text-cyan-200" type="button" aria-label={`Delete ${layer.name}`} title="Delete imported layer" onClick={() => deleteLayer(layer)} style={{ padding: 5, border: 0, background: 'transparent', color: '#7e8899', cursor: 'pointer', flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>
            </button>}
            </div>
          ))}
          {selectedImportedLayer && (
            <div style={{ margin: '8px 0 12px' }}>
              <button
                type="button"
                onClick={() => void handleAutoCutout(selectedImportedLayer)}
                style={{
                  width: '100%',
                  padding: '8px 8px',
                  borderRadius: 6,
                  border: '1px solid #38bdf866',
                  background: '#0d2836',
                  color: '#38bdf8',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <span>✂️ Auto-Cutout / Remove BG</span>
              </button>
            </div>
          )}
          {selectedImportedLayer && <section aria-label="Layer appearance" style={{ margin: '20px 8px 0', paddingTop: 18, borderTop: '1px solid #ffffff0a' }}>
            <label htmlFor="layer-opacity" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#aab2c0', marginBottom: 10 }}>
              Opacity <span>{Math.round(selectedImportedLayer.object.opacity * 100)}%</span>
            </label>
            <input className="!accent-cyan-300/80" id="layer-opacity" type="range" min={0} max={100} step={1} value={Math.round(selectedImportedLayer.object.opacity * 100)} onChange={event => {
              recordHistory();
              selectedImportedLayer.object.set('opacity', Number(event.currentTarget.value) / 100);
              canvasRef.current?.requestRenderAll();
              setLayers(current => [...current]);
            }} style={{ width: '100%', accentColor: '#8b9fc7', cursor: 'pointer', marginBottom: 18 }} />
            <label htmlFor="layer-blend-mode" style={{ display: 'block', fontSize: 12, color: '#aab2c0', marginBottom: 8 }}>Blend mode</label>
            <select className="!bg-zinc-900 !text-zinc-300 !border-zinc-800 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/60 transition-colors" id="layer-blend-mode" value={selectedImportedLayer.object.globalCompositeOperation} onChange={event => {
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
            <button className="!bg-zinc-900/40 hover:!bg-zinc-800/70 !text-zinc-300 !border-zinc-800 rounded-md transition-colors duration-150 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300/60 disabled:!text-zinc-600 disabled:hover:!bg-zinc-900/40 disabled:cursor-not-allowed aria-pressed:!bg-cyan-400/10 aria-pressed:!text-cyan-200 [&[aria-selected=true]]:!bg-cyan-400/10 [&[aria-selected=true]]:!text-cyan-200 [&[aria-current=step]]:!bg-cyan-400/10 [&[aria-current=step]]:!text-cyan-200" type="button" disabled={cutoutProcessing !== null} onClick={() => void processCutout('silhouette')} title="Isolate the subject using client-side segmentation" style={{ width: '100%', marginTop: 8, padding: '9px 10px', borderRadius: 6, border: '1px solid #ffffff14', background: '#293244', color: '#dce3ef', fontSize: 12, cursor: cutoutProcessing ? 'wait' : 'pointer' }}>{cutoutProcessing === 'silhouette' ? 'Extracting silhouette...' : 'Cutout Silhouette'}</button>
            {(cutoutNotice || cutoutProgress) && <p role="status" aria-live="polite" style={{ fontSize: 11, lineHeight: 1.6, color: '#aab8ce', marginTop: 10 }}>{cutoutNotice || cutoutProgress}</p>}
          </section>}
          </>}
          </div>
          </>}
        </aside>
      </div>
      {preview && <CompositionPreviewModal snapshot={preview} onClose={() => setPreview(null)} onProceed={() => {
        setPreview(null);
        void startHarmonization();
      }} />}
      {showAssetModal && (
        <div role="dialog" aria-modal="true" aria-label="Preset Asset Library"
          style={{ position: 'fixed', inset: 0, background: 'rgba(5, 7, 11, 0.75)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}
          onClick={() => setShowAssetModal(false)}>
          <div style={{ background: '#17191e', border: '1px solid #ffffff1a', borderRadius: 12, padding: 20, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', color: '#e2e8f0', display: 'flex', flexDirection: 'column', gap: 16 }} onClick={event => event.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>Preset Asset Library</h2>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>Click any background plate or reference asset to insert directly as a canvas layer.</p>
              </div>
              <button type="button" autoFocus aria-label="Close asset library" onClick={() => setShowAssetModal(false)} style={{ background: 'transparent', border: 0, color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
              {STUDIO_PRESET_ASSETS.map(asset => (
                <button key={asset.id} type="button" disabled={assetLoading} onClick={() => void addPresetFromLibrary(asset.name, asset.url)}
                  style={{ display: 'flex', flexDirection: 'column', background: '#0f1115', border: '1px solid #ffffff12', borderRadius: 8, overflow: 'hidden', cursor: assetLoading ? 'wait' : 'pointer', textAlign: 'left', transition: 'transform 0.15s, border-color 0.15s' }}>
                  <div style={{ width: '100%', height: 80, background: '#1c1f26', overflow: 'hidden' }}>
                    <img src={asset.url} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ padding: '6px 8px' }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: '#cbd5e1', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</span>
                  </div>
                </button>
              ))}
            </div>
            {assetLoading && <p role="status" style={{ margin: 0, fontSize: 11 }}>Adding asset...</p>}
          </div>
        </div>
      )}
    </main>
  );
}
