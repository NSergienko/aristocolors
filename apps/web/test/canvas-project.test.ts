import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CanvasLayerManifestSchema } from '@aristocolors/contracts';
import { createCanvasProject } from '../src/lib/canvas';

const ASSET_ID_1 = '00000000-0000-4000-8000-000000000001';
const ASSET_ID_2 = '00000000-0000-4000-8000-000000000002';
const MASK_ID_1 = '00000000-0000-4000-8000-000000000003';
const PROJECT_ID = '00000000-0000-4000-8000-000000000099';

describe('CanvasProject Headless Controller', () => {
  it('1. verifies all resulting manifests pass CanvasLayerManifestSchema', () => {
    const project = createCanvasProject({ projectId: PROJECT_ID });
    assert.doesNotThrow(() => CanvasLayerManifestSchema.parse(project.manifest));

    const layer = project.addLayer({
      name: 'Background',
      sourceAssetId: ASSET_ID_1,
    });
    assert.doesNotThrow(() => CanvasLayerManifestSchema.parse(project.manifest));

    project.updateLayerTransform(layer.id, { x: 100, y: 50, scaleX: 1.5 });
    assert.doesNotThrow(() => CanvasLayerManifestSchema.parse(project.manifest));

    project.updateLayerProps(layer.id, { opacity: 0.8, blendMode: 'multiply' });
    assert.doesNotThrow(() => CanvasLayerManifestSchema.parse(project.manifest));
  });

  it('2. ensures previous snapshots remain strictly immutable', () => {
    const project = createCanvasProject({ projectId: PROJECT_ID });
    const initialManifest = project.manifest;

    const layer = project.addLayer({
      name: 'Layer 1',
      sourceAssetId: ASSET_ID_1,
      transform: { x: 10 },
    });

    assert.notStrictEqual(project.manifest, initialManifest);
    assert.strictEqual(initialManifest.layers.length, 0);
    assert.strictEqual(project.manifest.layers.length, 1);

    const snapshotBeforeTransform = project.manifest;
    project.updateLayerTransform(layer.id, { x: 999 });

    assert.strictEqual(snapshotBeforeTransform.layers[0].transform.x, 10);
    assert.strictEqual(project.manifest.layers[0].transform.x, 999);
  });

  it('3. adds layer and normalizes zIndex', () => {
    const project = createCanvasProject({ projectId: PROJECT_ID });
    const l1 = project.addLayer({ name: 'L1', sourceAssetId: ASSET_ID_1 });
    const l2 = project.addLayer({ name: 'L2', sourceAssetId: ASSET_ID_2 });

    assert.strictEqual(project.manifest.layers.length, 2);
    assert.strictEqual(l1.zIndex, 0);
    assert.strictEqual(l2.zIndex, 1);
    assert.strictEqual(project.manifest.layers[0].zIndex, 0);
    assert.strictEqual(project.manifest.layers[1].zIndex, 1);
  });

  it('4. updates layer transform while keeping other properties intact', () => {
    const project = createCanvasProject({ projectId: PROJECT_ID });
    const layer = project.addLayer({
      name: 'L1',
      sourceAssetId: ASSET_ID_1,
      maskAssetId: MASK_ID_1,
    });

    const updated = project.updateLayerTransform(layer.id, { rotation: 45, scaleX: 2 });
    assert.strictEqual(updated.transform.rotation, 45);
    assert.strictEqual(updated.transform.scaleX, 2);
    assert.strictEqual(updated.transform.originX, 'center');
    assert.strictEqual(updated.name, 'L1');
    assert.strictEqual(updated.sourceAssetId, ASSET_ID_1);
    assert.strictEqual(updated.maskAssetId, MASK_ID_1);
  });

  it('5. updates allowed layer properties and rejects invalid props', () => {
    const project = createCanvasProject({ projectId: PROJECT_ID });
    const layer = project.addLayer({ name: 'L1', sourceAssetId: ASSET_ID_1 });

    const updated = project.updateLayerProps(layer.id, {
      name: 'Renamed L1',
      isVisible: false,
      isLocked: true,
      opacity: 0.5,
      blendMode: 'screen',
      maskAssetId: MASK_ID_1,
      metadata: { key: 'val' },
    });

    assert.strictEqual(updated.name, 'Renamed L1');
    assert.strictEqual(updated.isVisible, false);
    assert.strictEqual(updated.isLocked, true);
    assert.strictEqual(updated.opacity, 0.5);
    assert.strictEqual(updated.blendMode, 'screen');
    assert.strictEqual(updated.maskAssetId, MASK_ID_1);
    assert.deepStrictEqual(updated.metadata, { key: 'val' });

    // Invalid opacity (> 1) must be rejected by schema
    assert.throws(() => {
      project.updateLayerProps(layer.id, { opacity: 1.5 });
    });
  });

  it('6. reorders layers with contiguous zIndex', () => {
    const project = createCanvasProject({ projectId: PROJECT_ID });
    const l1 = project.addLayer({ name: 'L1', sourceAssetId: ASSET_ID_1 });
    const l2 = project.addLayer({ name: 'L2', sourceAssetId: ASSET_ID_2 });
    const l3 = project.addLayer({ name: 'L3', sourceAssetId: ASSET_ID_1 });

    project.reorderLayers([l3.id, l1.id, l2.id]);

    const layers = project.manifest.layers;
    assert.strictEqual(layers[0].id, l3.id);
    assert.strictEqual(layers[0].zIndex, 0);
    assert.strictEqual(layers[1].id, l1.id);
    assert.strictEqual(layers[1].zIndex, 1);
    assert.strictEqual(layers[2].id, l2.id);
    assert.strictEqual(layers[2].zIndex, 2);
  });

  it('7. handles selected layer behavior', () => {
    const project = createCanvasProject({ projectId: PROJECT_ID });
    assert.strictEqual(project.selectedLayerId, null);

    const l1 = project.addLayer({ name: 'L1', sourceAssetId: ASSET_ID_1 });
    assert.strictEqual(project.selectedLayerId, l1.id);

    const l2 = project.addLayer({
      name: 'L2',
      sourceAssetId: ASSET_ID_2,
      selectAfterAdd: false,
    });
    assert.strictEqual(project.selectedLayerId, l1.id);

    project.selectLayer(l2.id);
    assert.strictEqual(project.selectedLayerId, l2.id);

    project.selectLayer(null);
    assert.strictEqual(project.selectedLayerId, null);

    assert.throws(() => {
      project.selectLayer('00000000-0000-0000-0000-000000000000');
    });
  });

  it('8. restores exact previous manifest snapshots and selectedLayerId on undo/redo', () => {
    const project = createCanvasProject({ projectId: PROJECT_ID });
    const l1 = project.addLayer({ name: 'L1', sourceAssetId: ASSET_ID_1 });
    const l2 = project.addLayer({ name: 'L2', sourceAssetId: ASSET_ID_2 });

    project.selectLayer(l1.id);
    project.updateLayerTransform(l1.id, { x: 50 });

    const snapshotBeforeUndo = project.manifest;
    project.undo();

    assert.strictEqual(project.manifest.layers[0].transform.x, 0);
    assert.strictEqual(project.selectedLayerId, l1.id);

    project.redo();
    assert.strictEqual(project.manifest.layers[0].transform.x, 50);
    assert.strictEqual(project.selectedLayerId, l1.id);
    assert.deepStrictEqual(project.manifest, snapshotBeforeUndo);
  });

  it('9. clears redo history when a new mutation occurs after undo', () => {
    const project = createCanvasProject({ projectId: PROJECT_ID });
    const l1 = project.addLayer({ name: 'L1', sourceAssetId: ASSET_ID_1 });
    project.updateLayerTransform(l1.id, { x: 100 });

    assert.strictEqual(project.redoHistory.length, 0);
    project.undo();
    assert.strictEqual(project.redoHistory.length, 1);

    // New mutation
    project.updateLayerProps(l1.id, { name: 'Mutated after undo' });
    assert.strictEqual(project.redoHistory.length, 0);
    assert.strictEqual(project.redo(), null);
  });

  it('10. strictly preserves existing layer UUIDs and asset IDs', () => {
    const project = createCanvasProject({ projectId: PROJECT_ID });
    const layer = project.addLayer({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Preserved Layer',
      sourceAssetId: ASSET_ID_1,
      maskAssetId: MASK_ID_1,
    });

    project.updateLayerTransform(layer.id, { y: 25 });
    assert.strictEqual(project.manifest.layers[0].id, '11111111-1111-4111-8111-111111111111');
    assert.strictEqual(project.manifest.layers[0].sourceAssetId, ASSET_ID_1);
    assert.strictEqual(project.manifest.layers[0].maskAssetId, MASK_ID_1);

    project.updateLayerProps(layer.id, { opacity: 0.9 });
    assert.strictEqual(project.manifest.layers[0].id, '11111111-1111-4111-8111-111111111111');
    assert.strictEqual(project.manifest.layers[0].sourceAssetId, ASSET_ID_1);
    assert.strictEqual(project.manifest.layers[0].maskAssetId, MASK_ID_1);

    project.undo();
    assert.strictEqual(project.manifest.layers[0].id, '11111111-1111-4111-8111-111111111111');
    assert.strictEqual(project.manifest.layers[0].sourceAssetId, ASSET_ID_1);
    assert.strictEqual(project.manifest.layers[0].maskAssetId, MASK_ID_1);
  });
});
