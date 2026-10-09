import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function storageFixture() {
  const records = new Map();
  const db = {
    close() {},
    transaction() {
      const transaction = {
        objectStore() {
          return {
            put(value, key) {
              records.set(key, structuredClone(value));
              queueMicrotask(() => transaction.oncomplete?.());
            },
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = records.get(key);
                request.onsuccess?.();
              });
              return request;
            },
            delete(key) {
              records.delete(key);
              queueMicrotask(() => transaction.oncomplete?.());
            },
          };
        },
      };
      return transaction;
    },
  };
  const exports = {};
  const source = fs.readFileSync('src/components/studio/harmonization-result-storage.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports,
    queueMicrotask,
    indexedDB: { open() {
      const request = {};
      queueMicrotask(() => {
        request.result = db;
        request.onsuccess?.();
      });
      return request;
    } },
    require(name) {
      assert.equal(name, '@/lib/studio/harmonization-contract');
      return { harmonizationResultSchema: { parse: value => value } };
    },
  });
  return { ...exports, records };
}

test('legacy harmonization results are not restored as current engine output', async () => {
  const storage = storageFixture();
  storage.records.set('project-a', { success: true, resultImageUrl: 'data:old-result' });

  assert.equal(await storage.loadHarmonizationResult('project-a'), null);
});

test('current harmonization results are versioned and restored', async () => {
  const storage = storageFixture();
  const result = { success: true, resultImageUrl: 'data:current-result' };
  await storage.storeHarmonizationResult('project-a', result);

  assert.deepEqual(storage.records.get('project-a'), { engineVersion: 2, result });
  assert.deepEqual(await storage.loadHarmonizationResult('project-a'), result);
});
