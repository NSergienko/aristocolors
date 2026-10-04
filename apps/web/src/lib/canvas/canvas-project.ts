import {
  CanvasLayerManifestSchema,
  type CanvasLayerManifest,
  type CanvasLayerItem,
  type LayerTransform,
  type BlendMode,
} from '@aristocolors/contracts';

export interface CanvasProjectSnapshot {
  readonly manifest: CanvasLayerManifest;
  readonly selectedLayerId: string | null;
}

export interface CanvasProjectState {
  readonly manifest: CanvasLayerManifest;
  readonly undoHistory: readonly CanvasProjectSnapshot[];
  readonly redoHistory: readonly CanvasProjectSnapshot[];
  readonly selectedLayerId: string | null;
}

export interface CreateCanvasProjectInput {
  readonly projectId?: string;
  readonly canvas?: {
    readonly width: number;
    readonly height: number;
    readonly dpi?: number;
  };
  readonly activeAristoColorsId?: string | null;
  readonly initialManifest?: CanvasLayerManifest;
}

export interface AddLayerInput {
  readonly id?: string;
  readonly name?: string;
  readonly sourceAssetId: string;
  readonly maskAssetId?: string | null;
  readonly isVisible?: boolean;
  readonly isLocked?: boolean;
  readonly opacity?: number;
  readonly blendMode?: BlendMode;
  readonly transform?: Partial<LayerTransform>;
  readonly metadata?: Record<string, unknown>;
  readonly selectAfterAdd?: boolean;
}

export interface UpdateLayerPropsInput {
  readonly name?: string;
  readonly isVisible?: boolean;
  readonly isLocked?: boolean;
  readonly opacity?: number;
  readonly blendMode?: BlendMode;
  readonly maskAssetId?: string | null;
  readonly metadata?: Record<string, unknown>;
}

const DEFAULT_TRANSFORM: LayerTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  originX: 'center',
  originY: 'center',
};

function randomUuid(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizeZIndex(layers: readonly CanvasLayerItem[]): CanvasLayerItem[] {
  return layers.map((layer, index) => ({
    ...layer,
    zIndex: index,
  }));
}

export class CanvasProject {
  private _state: CanvasProjectState;

  constructor(input?: CreateCanvasProjectInput) {
    if (input?.initialManifest) {
      this._state = {
        manifest: CanvasLayerManifestSchema.parse(input.initialManifest),
        undoHistory: [],
        redoHistory: [],
        selectedLayerId: null,
      };
      return;
    }

    const manifest: CanvasLayerManifest = CanvasLayerManifestSchema.parse({
      id: randomUuid(),
      projectId: input?.projectId ?? randomUuid(),
      version: 1,
      canvas: {
        width: input?.canvas?.width ?? 1920,
        height: input?.canvas?.height ?? 1080,
        dpi: input?.canvas?.dpi ?? 72,
      },
      layers: [],
      activeAristoColorsId: input?.activeAristoColorsId ?? null,
      updatedAt: new Date().toISOString(),
    });

    this._state = {
      manifest,
      undoHistory: [],
      redoHistory: [],
      selectedLayerId: null,
    };
  }

  get state(): CanvasProjectState {
    return this._state;
  }

  get manifest(): CanvasLayerManifest {
    return this._state.manifest;
  }

  get selectedLayerId(): string | null {
    return this._state.selectedLayerId;
  }

  get undoHistory(): readonly CanvasProjectSnapshot[] {
    return this._state.undoHistory;
  }

  get redoHistory(): readonly CanvasProjectSnapshot[] {
    return this._state.redoHistory;
  }

  private mutate(
    updater: (currentManifest: CanvasLayerManifest) => {
      manifest: CanvasLayerManifest;
      selectedLayerId?: string | null;
    }
  ): void {
    const snapshot: CanvasProjectSnapshot = {
      manifest: this._state.manifest,
      selectedLayerId: this._state.selectedLayerId,
    };

    const next = updater(this._state.manifest);
    const validated = CanvasLayerManifestSchema.parse(next.manifest);

    this._state = {
      manifest: validated,
      selectedLayerId:
        next.selectedLayerId !== undefined
          ? next.selectedLayerId
          : this._state.selectedLayerId,
      undoHistory: [...this._state.undoHistory, snapshot],
      redoHistory: [],
    };
  }

  addLayer(input: AddLayerInput): CanvasLayerItem {
    let created: CanvasLayerItem | null = null;

    this.mutate((manifest) => {
      const id = input.id ?? randomUuid();
      if (manifest.layers.some((l) => l.id === id)) {
        throw new Error(`Layer with ID "${id}" already exists`);
      }

      created = {
        id,
        name: input.name ?? `Layer ${manifest.layers.length + 1}`,
        sourceAssetId: input.sourceAssetId,
        maskAssetId: input.maskAssetId ?? null,
        zIndex: manifest.layers.length,
        isVisible: input.isVisible ?? true,
        isLocked: input.isLocked ?? false,
        opacity: input.opacity ?? 1,
        blendMode: input.blendMode ?? 'normal',
        transform: {
          ...DEFAULT_TRANSFORM,
          ...input.transform,
        },
        metadata: input.metadata,
      };

      const layers = normalizeZIndex([...manifest.layers, created]);
      const shouldSelect = input.selectAfterAdd ?? true;

      return {
        manifest: {
          ...manifest,
          version: manifest.version + 1,
          layers,
          updatedAt: new Date().toISOString(),
        },
        selectedLayerId: shouldSelect ? id : this._state.selectedLayerId,
      };
    });

    return created!;
  }

  updateLayerTransform(
    layerId: string,
    transformDelta: Partial<LayerTransform>
  ): CanvasLayerItem {
    let updated: CanvasLayerItem | null = null;

    this.mutate((manifest) => {
      const idx = manifest.layers.findIndex((l) => l.id === layerId);
      if (idx === -1) {
        throw new Error(`Layer with ID "${layerId}" not found`);
      }

      const layer = manifest.layers[idx];
      updated = {
        ...layer,
        transform: {
          ...layer.transform,
          ...transformDelta,
        },
      };

      const layers = [...manifest.layers];
      layers[idx] = updated;

      return {
        manifest: {
          ...manifest,
          version: manifest.version + 1,
          layers,
          updatedAt: new Date().toISOString(),
        },
      };
    });

    return updated!;
  }

  updateLayerProps(layerId: string, props: UpdateLayerPropsInput): CanvasLayerItem {
    let updated: CanvasLayerItem | null = null;

    this.mutate((manifest) => {
      const idx = manifest.layers.findIndex((l) => l.id === layerId);
      if (idx === -1) {
        throw new Error(`Layer with ID "${layerId}" not found`);
      }

      const layer = manifest.layers[idx];
      updated = {
        ...layer,
        ...(props.name !== undefined ? { name: props.name } : {}),
        ...(props.isVisible !== undefined ? { isVisible: props.isVisible } : {}),
        ...(props.isLocked !== undefined ? { isLocked: props.isLocked } : {}),
        ...(props.opacity !== undefined ? { opacity: props.opacity } : {}),
        ...(props.blendMode !== undefined ? { blendMode: props.blendMode } : {}),
        ...(props.maskAssetId !== undefined ? { maskAssetId: props.maskAssetId } : {}),
        ...(props.metadata !== undefined ? { metadata: props.metadata } : {}),
      };

      const layers = [...manifest.layers];
      layers[idx] = updated;

      return {
        manifest: {
          ...manifest,
          version: manifest.version + 1,
          layers,
          updatedAt: new Date().toISOString(),
        },
      };
    });

    return updated!;
  }

  reorderLayers(orderedLayerIds: readonly string[]): CanvasLayerManifest {
    this.mutate((manifest) => {
      if (orderedLayerIds.length !== manifest.layers.length) {
        throw new Error(
          `reorderLayers expected ${manifest.layers.length} IDs, got ${orderedLayerIds.length}`
        );
      }

      if (new Set(orderedLayerIds).size !== orderedLayerIds.length) {
        throw new Error('reorderLayers received duplicate layer IDs');
      }

      const map = new Map(manifest.layers.map((l) => [l.id, l]));
      for (const id of orderedLayerIds) {
        if (!map.has(id)) {
          throw new Error(`Layer with ID "${id}" does not exist in manifest`);
        }
      }

      const layers = orderedLayerIds.map((id, index) => ({
        ...map.get(id)!,
        zIndex: index,
      }));

      return {
        manifest: {
          ...manifest,
          version: manifest.version + 1,
          layers,
          updatedAt: new Date().toISOString(),
        },
      };
    });

    return this._state.manifest;
  }

  removeLayer(layerId: string): void {
    this.mutate((manifest) => {
      const index = manifest.layers.findIndex((layer) => layer.id === layerId);
      if (index === -1) throw new Error(`Layer with ID "${layerId}" not found`);
      const layers = normalizeZIndex(manifest.layers.filter((layer) => layer.id !== layerId));
      return {
        manifest: {
          ...manifest,
          layers,
          version: manifest.version + 1,
          updatedAt: new Date().toISOString(),
        },
        selectedLayerId: this.selectedLayerId === layerId
          ? (layers[Math.min(index, layers.length - 1)]?.id ?? null)
          : this.selectedLayerId,
      };
    });
  }

  /** Establish the loaded artwork as the starting state, not an undoable edit. */
  clearHistory(): void {
    this._state = { ...this._state, undoHistory: [], redoHistory: [] };
  }

  selectLayer(layerId: string | null): string | null {
    if (layerId !== null && !this._state.manifest.layers.some((l) => l.id === layerId)) {
      throw new Error(`Cannot select non-existent layer ID: "${layerId}"`);
    }

    if (this._state.selectedLayerId === layerId) {
      return layerId;
    }

    this._state = {
      ...this._state,
      selectedLayerId: layerId,
    };

    return layerId;
  }

  undo(): CanvasProjectState | null {
    if (this._state.undoHistory.length === 0) {
      return null;
    }

    const prev = this._state.undoHistory[this._state.undoHistory.length - 1];
    const currentSnapshot: CanvasProjectSnapshot = {
      manifest: this._state.manifest,
      selectedLayerId: this._state.selectedLayerId,
    };

    this._state = {
      manifest: prev.manifest,
      selectedLayerId: prev.selectedLayerId,
      undoHistory: this._state.undoHistory.slice(0, -1),
      redoHistory: [...this._state.redoHistory, currentSnapshot],
    };

    return this._state;
  }

  redo(): CanvasProjectState | null {
    if (this._state.redoHistory.length === 0) {
      return null;
    }

    const next = this._state.redoHistory[this._state.redoHistory.length - 1];
    const currentSnapshot: CanvasProjectSnapshot = {
      manifest: this._state.manifest,
      selectedLayerId: this._state.selectedLayerId,
    };

    this._state = {
      manifest: next.manifest,
      selectedLayerId: next.selectedLayerId,
      undoHistory: [...this._state.undoHistory, currentSnapshot],
      redoHistory: this._state.redoHistory.slice(0, -1),
    };

    return this._state;
  }
}

export function createCanvasProject(input?: CreateCanvasProjectInput): CanvasProject {
  return new CanvasProject(input);
}
