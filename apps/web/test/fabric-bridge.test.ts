import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CanvasLayerItem, LayerTransform, BlendMode } from '@aristocolors/contracts';
import {
  layerToFabricDescriptor,
  manifestToFabricDescriptors,
  fabricToCanonicalTransform,
  fabricToCanonicalProps,
  extractFabricLayerOrder,
  blendModeToFabricComposite,
  fabricCompositeToBlendMode,
  type FabricLayerDescriptor,
  type FabricGeometry,
  type FabricLayerProps,
} from '../src/lib/canvas/fabric-bridge';
import { createCanvasProject } from '../src/lib/canvas/canvas-project';

const ASSET_ID_1 = '00000000-0000-4000-8000-000000000001';
const ASSET_ID_2 = '00000000-0000-4000-8000-000000000002';
const MASK_ID_1 = '00000000-0000-4000-8000-000000000003';
const LAYER_ID_1 = '11111111-1111-4111-8111-111111111111';

function createSampleLayer(overrides?: Partial<CanvasLayerItem>): CanvasLayerItem {
  return {
    id: LAYER_ID_1,
    name: 'Sample Layer',
    sourceAssetId: ASSET_ID_1,
    maskAssetId: MASK_ID_1,
    zIndex: 0,
    isVisible: true,
    isLocked: false,
    opacity: 0.85,
    blendMode: 'overlay',
    transform: {
      x: 150,
      y: 300,
      scaleX: 1.8,
      scaleY: 2.2,
      rotation: 75,
      originX: 'right',
      originY: 'bottom',
    },
    metadata: { tag: 'foreground' },
    ...overrides,
  };
}

describe('Fabric Bridge Mapping Boundary', () => {
  it('1. maps canonical transform correctly to Fabric-compatible geometry', () => {
    const layer = createSampleLayer();
    const descriptor = layerToFabricDescriptor(layer);

    assert.strictEqual(descriptor.left, 150);
    assert.strictEqual(descriptor.top, 300);
    assert.strictEqual(descriptor.scaleX, 1.8);
    assert.strictEqual(descriptor.scaleY, 2.2);
    assert.strictEqual(descriptor.angle, 75);
    assert.strictEqual(descriptor.originX, 'right');
    assert.strictEqual(descriptor.originY, 'bottom');
  });

  it('2. extracts expected canonical transform update from Fabric geometry', () => {
    const geometry: FabricGeometry = {
      left: 400,
      top: 250,
      scaleX: 0.5,
      scaleY: 0.5,
      angle: 180,
      originX: 'center',
      originY: 'top',
    };

    const transformUpdate = fabricToCanonicalTransform(geometry);

    assert.deepStrictEqual(transformUpdate, {
      x: 400,
      y: 250,
      scaleX: 0.5,
      scaleY: 0.5,
      rotation: 180,
      originX: 'center',
      originY: 'top',
    });

    // Test partial geometry extraction
    const partial = fabricToCanonicalTransform({ left: 99, angle: 45 });
    assert.deepStrictEqual(partial, { x: 99, rotation: 45 });
  });

  it('3. ensures complex transform values survive round-trip without semantic drift', () => {
    const complexTransform: LayerTransform = {
      x: -1234.5678,
      y: 9876.5432,
      scaleX: 0.00125,
      scaleY: 45.678,
      rotation: 289.4321,
      originX: 'left',
      originY: 'bottom',
    };

    const layer = createSampleLayer({ transform: complexTransform });
    const descriptor = layerToFabricDescriptor(layer);
    const extractedTransform = fabricToCanonicalTransform(descriptor);

    assert.deepStrictEqual(extractedTransform, complexTransform);
  });

  it('4. maps every canonical BlendMode deterministically to expected composite operation', () => {
    const expectedMappings: Record<BlendMode, string> = {
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

    for (const [blend, expectedComposite] of Object.entries(expectedMappings)) {
      const composite = blendModeToFabricComposite(blend as BlendMode);
      assert.strictEqual(composite, expectedComposite);

      const layer = createSampleLayer({ blendMode: blend as BlendMode });
      const descriptor = layerToFabricDescriptor(layer);
      assert.strictEqual(descriptor.globalCompositeOperation, expectedComposite);
    }
  });

  it('5. returns exact canonical BlendMode for supported reverse composite mappings', () => {
    const reverseMappings: [string, BlendMode][] = [
      ['source-over', 'normal'],
      ['normal', 'normal'],
      ['multiply', 'multiply'],
      ['screen', 'screen'],
      ['overlay', 'overlay'],
      ['darken', 'darken'],
      ['lighten', 'lighten'],
      ['color-dodge', 'color-dodge'],
      ['color-burn', 'color-burn'],
      ['hard-light', 'hard-light'],
      ['soft-light', 'soft-light'],
      ['difference', 'difference'],
      ['exclusion', 'exclusion'],
    ];

    for (const [composite, expectedBlend] of reverseMappings) {
      assert.strictEqual(fabricCompositeToBlendMode(composite), expectedBlend);
    }

    // Also verify extraction via fabricToCanonicalProps
    const props = fabricToCanonicalProps({ globalCompositeOperation: 'screen' });
    assert.strictEqual(props.blendMode, 'screen');
  });

  it('6. fails explicitly on unsupported reverse composite values', () => {
    const unsupportedOps = ['destination-out', 'xor', 'copy', 'destination-in', 'unknown_mode', ''];

    for (const op of unsupportedOps) {
      assert.throws(
        () => fabricCompositeToBlendMode(op),
        /Unsupported composite operation for canonical blend mode/
      );
      assert.throws(
        () => fabricToCanonicalProps({ globalCompositeOperation: op }),
        /Unsupported composite operation for canonical blend mode/
      );
    }
  });

  it('7. maps isLocked consistently to required Fabric interaction lock flags', () => {
    const lockedLayer = createSampleLayer({ isLocked: true });
    const lockedDesc = layerToFabricDescriptor(lockedLayer);

    assert.strictEqual(lockedDesc.isLocked, true);
    assert.strictEqual(lockedDesc.lockMovementX, true);
    assert.strictEqual(lockedDesc.lockMovementY, true);
    assert.strictEqual(lockedDesc.lockRotation, true);
    assert.strictEqual(lockedDesc.lockScalingX, true);
    assert.strictEqual(lockedDesc.lockScalingY, true);

    const unlockedLayer = createSampleLayer({ isLocked: false });
    const unlockedDesc = layerToFabricDescriptor(unlockedLayer);

    assert.strictEqual(unlockedDesc.isLocked, false);
    assert.strictEqual(unlockedDesc.lockMovementX, false);
    assert.strictEqual(unlockedDesc.lockMovementY, false);
    assert.strictEqual(unlockedDesc.lockRotation, false);
    assert.strictEqual(unlockedDesc.lockScalingX, false);
    assert.strictEqual(unlockedDesc.lockScalingY, false);
  });

  it('8. preserves layer id, sourceAssetId, maskAssetId and identity in descriptors', () => {
    const layer = createSampleLayer({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Hero Character',
      sourceAssetId: ASSET_ID_2,
      maskAssetId: MASK_ID_1,
      zIndex: 3,
    });

    const descriptor = layerToFabricDescriptor(layer);

    assert.strictEqual(descriptor.id, '22222222-2222-4222-8222-222222222222');
    assert.strictEqual(descriptor.name, 'Hero Character');
    assert.strictEqual(descriptor.sourceAssetId, ASSET_ID_2);
    assert.strictEqual(descriptor.maskAssetId, MASK_ID_1);
    assert.strictEqual(descriptor.zIndex, 3);

    // Null mask test
    const noMaskLayer = createSampleLayer({ maskAssetId: null });
    const noMaskDesc = layerToFabricDescriptor(noMaskLayer);
    assert.strictEqual(noMaskDesc.maskAssetId, null);
  });

  it('9. produces exact ordered layer ID array for CanvasProject.reorderLayers', () => {
    const project = createCanvasProject();
    const l1 = project.addLayer({ name: 'Bottom Layer', sourceAssetId: ASSET_ID_1 });
    const l2 = project.addLayer({ name: 'Middle Layer', sourceAssetId: ASSET_ID_2 });
    const l3 = project.addLayer({ name: 'Top Layer', sourceAssetId: ASSET_ID_1 });

    const descriptors = manifestToFabricDescriptors(project.manifest);
    assert.strictEqual(descriptors.length, 3);

    // Simulate Fabric stack reorder: L3 -> L1 -> L2
    const fabricStackOrder: FabricLayerDescriptor[] = [
      descriptors[2], // L3 at bottom of new stack
      descriptors[0], // L1 in middle
      descriptors[1], // L2 at top
    ];

    const orderedIds = extractFabricLayerOrder(fabricStackOrder);
    assert.deepStrictEqual(orderedIds, [l3.id, l1.id, l2.id]);

    // Apply to canonical controller
    project.reorderLayers(orderedIds);

    const reorderedManifest = project.manifest;
    assert.strictEqual(reorderedManifest.layers[0].id, l3.id);
    assert.strictEqual(reorderedManifest.layers[0].zIndex, 0);
    assert.strictEqual(reorderedManifest.layers[1].id, l1.id);
    assert.strictEqual(reorderedManifest.layers[1].zIndex, 1);
    assert.strictEqual(reorderedManifest.layers[2].id, l2.id);
    assert.strictEqual(reorderedManifest.layers[2].zIndex, 2);
  });

  it('10. guarantees input canonical objects and descriptors are not mutated', () => {
    const originalLayer = Object.freeze(createSampleLayer({
      transform: Object.freeze({
        x: 10,
        y: 20,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        originX: 'center',
        originY: 'center',
      }),
    }));

    const descriptor = Object.freeze(layerToFabricDescriptor(originalLayer));

    // Calling mapping functions should not mutate frozen inputs
    assert.doesNotThrow(() => {
      fabricToCanonicalTransform(descriptor);
      fabricToCanonicalProps(descriptor);
      extractFabricLayerOrder([descriptor]);
      blendModeToFabricComposite(originalLayer.blendMode);
      fabricCompositeToBlendMode(descriptor.globalCompositeOperation);
    });

    assert.strictEqual(originalLayer.transform.x, 10);
    assert.strictEqual(originalLayer.transform.y, 20);
    assert.strictEqual(descriptor.left, 10);
    assert.strictEqual(descriptor.top, 20);
  });
});
