import type {
  CanvasLayerItem,
  CanvasLayerManifest,
  LayerTransform,
  BlendMode,
} from '@aristocolors/contracts';
import type { UpdateLayerPropsInput } from './canvas-project';

/**
 * Fabric-compatible composite operations supported by the canonical boundary.
 */
export type FabricCompositeOperation =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion';

/**
 * Structural interface representing Fabric-compatible geometry properties.
 */
export interface FabricGeometry {
  readonly left?: number;
  readonly top?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly angle?: number;
  readonly originX?: 'left' | 'center' | 'right';
  readonly originY?: 'top' | 'center' | 'bottom';
}

/**
 * Structural interface representing Fabric-compatible mutable layer properties.
 */
export interface FabricLayerProps {
  readonly name?: string;
  readonly visible?: boolean;
  readonly isLocked?: boolean;
  readonly opacity?: number;
  readonly globalCompositeOperation?: string;
  readonly maskAssetId?: string | null;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Boundary DTO projecting a canonical CanvasLayerItem into Fabric-compatible properties.
 * Not a replacement canvas model or state owner.
 */
export interface FabricLayerDescriptor {
  readonly id: string;
  readonly name: string;
  readonly sourceAssetId: string;
  readonly maskAssetId: string | null;
  readonly zIndex: number;
  readonly left: number;
  readonly top: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly angle: number;
  readonly originX: 'left' | 'center' | 'right';
  readonly originY: 'top' | 'center' | 'bottom';
  readonly opacity: number;
  readonly globalCompositeOperation: FabricCompositeOperation;
  readonly visible: boolean;
  readonly isLocked: boolean;
  readonly lockMovementX: boolean;
  readonly lockMovementY: boolean;
  readonly lockRotation: boolean;
  readonly lockScalingX: boolean;
  readonly lockScalingY: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const BLEND_TO_COMPOSITE: Readonly<Record<BlendMode, FabricCompositeOperation>> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
};

const COMPOSITE_TO_BLEND: Readonly<Record<string, BlendMode>> = {
  'source-over': 'normal',
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
};

/**
 * Maps a canonical BlendMode to its Fabric-compatible globalCompositeOperation.
 */
export function blendModeToFabricComposite(blendMode: BlendMode): FabricCompositeOperation {
  const composite = BLEND_TO_COMPOSITE[blendMode];
  if (!composite) {
    throw new Error(`Unsupported canonical blend mode: "${blendMode}"`);
  }
  return composite;
}

/**
 * Maps a Fabric globalCompositeOperation to its canonical BlendMode.
 * Fails explicitly on unsupported composite operations.
 */
export function fabricCompositeToBlendMode(composite: string): BlendMode {
  const blendMode = COMPOSITE_TO_BLEND[composite];
  if (!blendMode) {
    throw new Error(`Unsupported composite operation for canonical blend mode: "${composite}"`);
  }
  return blendMode;
}

/**
 * Projects a canonical CanvasLayerItem to a Fabric-compatible descriptor.
 * Pure mapping function; does not mutate inputs.
 */
export function layerToFabricDescriptor(
  layer: Readonly<CanvasLayerItem>
): FabricLayerDescriptor {
  const isLocked = layer.isLocked ?? false;
  return {
    id: layer.id,
    name: layer.name,
    sourceAssetId: layer.sourceAssetId,
    maskAssetId: layer.maskAssetId ?? null,
    zIndex: layer.zIndex,
    left: layer.transform.x,
    top: layer.transform.y,
    scaleX: layer.transform.scaleX,
    scaleY: layer.transform.scaleY,
    angle: layer.transform.rotation,
    originX: layer.transform.originX,
    originY: layer.transform.originY,
    opacity: layer.opacity,
    globalCompositeOperation: blendModeToFabricComposite(layer.blendMode),
    visible: layer.isVisible,
    isLocked,
    lockMovementX: isLocked,
    lockMovementY: isLocked,
    lockRotation: isLocked,
    lockScalingX: isLocked,
    lockScalingY: isLocked,
    metadata: layer.metadata ? { ...layer.metadata } : undefined,
  };
}

/**
 * Projects an entire CanvasLayerManifest's layers to Fabric-compatible descriptors.
 */
export function manifestToFabricDescriptors(
  manifest: Readonly<CanvasLayerManifest>
): readonly FabricLayerDescriptor[] {
  return manifest.layers.map((layer) => layerToFabricDescriptor(layer));
}

/**
 * Extracts ONLY canonical LayerTransform-compatible data from a Fabric geometry object.
 * Intended to be passed to CanvasProject.updateLayerTransform().
 * Pure function; does not mutate inputs or construct full manifest.
 */
export function fabricToCanonicalTransform(
  geometry: Readonly<FabricGeometry>
): Partial<LayerTransform> {
  const transform: Partial<LayerTransform> = {};
  if (geometry.left !== undefined) {
    transform.x = geometry.left;
  }
  if (geometry.top !== undefined) {
    transform.y = geometry.top;
  }
  if (geometry.scaleX !== undefined) {
    transform.scaleX = geometry.scaleX;
  }
  if (geometry.scaleY !== undefined) {
    transform.scaleY = geometry.scaleY;
  }
  if (geometry.angle !== undefined) {
    transform.rotation = geometry.angle;
  }
  if (geometry.originX !== undefined) {
    transform.originX = geometry.originX;
  }
  if (geometry.originY !== undefined) {
    transform.originY = geometry.originY;
  }
  return transform;
}

/**
 * Extracts ONLY schema-supported mutable properties from a Fabric properties object.
 * Intended to be passed to CanvasProject.updateLayerProps().
 * Does not expose mutation of id, sourceAssetId, or zIndex.
 */
export function fabricToCanonicalProps(
  props: Readonly<FabricLayerProps>
): UpdateLayerPropsInput {
  return {
    ...(props.name !== undefined ? { name: props.name } : {}),
    ...(props.visible !== undefined ? { isVisible: props.visible } : {}),
    ...(props.isLocked !== undefined ? { isLocked: props.isLocked } : {}),
    ...(props.opacity !== undefined ? { opacity: props.opacity } : {}),
    ...(props.globalCompositeOperation !== undefined
      ? { blendMode: fabricCompositeToBlendMode(props.globalCompositeOperation) }
      : {}),
    ...(props.maskAssetId !== undefined ? { maskAssetId: props.maskAssetId } : {}),
    ...(props.metadata !== undefined ? { metadata: { ...props.metadata } } : {}),
  };
}

/**
 * Extracts canonical layer IDs from Fabric-compatible object descriptors in canvas stack order.
 * Intended to be passed to CanvasProject.reorderLayers().
 * The bridge itself does not own canonical zIndex state.
 */
export function extractFabricLayerOrder(
  descriptors: readonly { readonly id: string }[]
): readonly string[] {
  return descriptors.map((d) => d.id);
}
