import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);

function fixture(quota = false) {
  const records = new Map();
  const local = new Map();
  const writes = [];
  const db = {
    close() {},
    transaction() {
      const transaction = {
        objectStore() {
          return {
            put(value, key) { records.set(key, structuredClone(value)); queueMicrotask(() => transaction.oncomplete?.()); },
            get(key) {
              const request = {};
              queueMicrotask(() => { request.result = records.get(key); request.onsuccess?.(); });
              return request;
            },
            openCursor() {
              const request = {};
              const entries = [...records];
              let index = 0;
              const advance = () => queueMicrotask(() => {
                const entry = entries[index++];
                request.result = entry ? { key: entry[0], value: entry[1], continue: advance } : null;
                request.onsuccess?.();
              });
              advance();
              return request;
            },
          };
        },
      };
      return transaction;
    },
  };
  const exports = {};
  const source = fs.readFileSync('src/components/studio/studio-project-storage.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(compiled, {
    exports, Blob, queueMicrotask,
    require(name) {
      if (name === '@aristocolors/contracts') return { CanvasLayerManifestSchema: { shape: { activeAristoColorsId: require('zod').z.string() } } };
      return require(name);
    },
    indexedDB: { open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess(); }); return request; } },
    localStorage: {
      get length() { return local.size; }, key(i) { return [...local.keys()][i]; }, getItem(key) { return local.get(key) ?? null; },
      setItem(key, value) { writes.push(value); if (quota) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); local.set(key, value); },
    },
  });
  const manifest = { version: 1, title: 'Edited Temple', activeAristoColorsId: 'test', selectedLayerId: 'base', width: 1920, height: 1080,
    layers: [{ id: 'base', name: 'Artwork', isBase: true, zIndex: 0, imageSource: new Blob(['edited']), originalSource: new Blob(['original']),
      crop: { top: 0, bottom: 0, left: 0, right: 0 }, values: { left: 32, top: 32, scaleX: 1, scaleY: 1, angle: 0, opacity: 1,
        visible: true, globalCompositeOperation: 'source-over', flipX: false, flipY: false } }] };
  return { ...exports, records, local, writes, manifest };
}
const key = 'aristocolors_project_proj-test_manifest';
const summary = { id: 'proj-test', updatedAt: 1000, thumbnailDataUrl: 'data:image/jpeg;base64,THUMBNAIL' };

test('local index excludes image bytes and thumbnail while IndexedDB retains them', async () => {
  const f = fixture();
  await f.saveStudioManifest(key, f.manifest, () => true, summary);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].includes('base64'), false);
  assert.equal(f.writes[0].includes('imageSource'), false);
  assert.equal(f.records.get(key).summary.thumbnailDataUrl, summary.thumbnailDataUrl);
  assert.equal((await f.loadStudioManifest(key)).layers[0].imageSource.size, 6);
});

test('quota failure resolves silently and saved layers and thumbnail remain discoverable', async () => {
  const f = fixture(true);
  f.local.set(key, '{"stale":true}');
  f.local.set('unrelated-project', 'keep');
  await f.saveStudioManifest(key, f.manifest, () => true, summary);
  const restored = await f.loadStudioManifest(key);
  assert.equal(restored.title, 'Edited Temple');
  assert.equal(restored.layers[0].values.left, 32);
  const projects = await f.listStudioProjectIndexes();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].data.thumbnailDataUrl, summary.thumbnailDataUrl);
  assert.equal(f.local.get('unrelated-project'), 'keep');
});

test('superseded save does not overwrite stored project', async () => {
  const f = fixture();
  await f.saveStudioManifest(key, f.manifest, () => false, summary);
  assert.equal(f.records.size, 0);
  assert.equal(f.writes.length, 0);
});