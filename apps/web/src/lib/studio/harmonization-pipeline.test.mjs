import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const studio = fs.readFileSync('src/components/studio/step-one-studio.tsx', 'utf8');
function compile(source) {
  return ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  } }).outputText;
}

function extract(start, end, globals, functionName) {
  const source = studio.slice(studio.indexOf(start), studio.indexOf(end));
  const name = functionName ?? start.trim().replace(/^async function |^function /, '').split('(')[0];
  return vm.runInNewContext(`${compile(source)}\n${name}`, globals);
}

test('Compose edits invalidate the in-memory and persisted harmonized artifact', async () => {
  const cleared = [];
  const events = [];
  const globals = {
    harmonizationInvalidationRef: { current: Promise.resolve() },
    resultRevisionRef: { current: 0 },
    refinementJobRef: { current: 0 },
    refinementTimerRef: { current: null },
    localImportToken: 'local-project',
    projectId: 'project-a',
    console,
    clearTimeout,
    clearHarmonizationResult: async id => { cleared.push(id); },
    cancelRefinement() { events.push('cancel-refinement'); },
    setHarmonizedResult(value) { events.push(['result', value]); },
    setRefinementReady(value) { events.push(['ready', value]); },
    setReviewError(value) { events.push(['review-error', value]); },
    setFinishRequested(value) { events.push(['finish-requested', value]); },
    setError(value) { events.push(['error', value]); },
    saveGenerationRef: { current: 0 },
    suppressSaveRef: { current: true },
    setSaveStatus(value) { events.push(['save-status', value]); },
    unsavedRef: { current: false },
    undoRef: { current: [] },
    redoRef: { current: ['redo'] },
    refreshHistory(update) { events.push(['history', update(0)]); },
    captureState: () => ({ snapshot: true }),
  };
  const recordHistory = extract(
    '  function invalidateHarmonizedResult()',
    '  function restoreState(',
    globals,
    'recordHistory'
  );

  recordHistory();
  await globals.harmonizationInvalidationRef.current;

  assert.equal(globals.resultRevisionRef.current, 1);
  assert.deepEqual(cleared, ['local-project']);
  assert.deepEqual(globals.undoRef.current, [{ snapshot: true }]);
  assert.equal(Array.from(globals.redoRef.current).length, 0);
  assert(events.some(event => Array.isArray(event) && event[0] === 'result' && event[1] === null));
  assert(events.some(event => Array.isArray(event) && event[0] === 'ready' && event[1] === false));
});

test('a Compose edit during harmonization prevents stale pixels from being stored or reviewed', async () => {
  let stored = false;
  let error = null;
  const states = [];
  const globals = {
    harmonizationRunRef: { current: null },
    acceptingRef: { current: false },
    harmonizationSettingsRef: { current: { aspectRatio: '16:9', intensity: 80 } },
    resultRevisionRef: { current: 0 },
    harmonizationInvalidationRef: { current: Promise.resolve() },
    localImportToken: undefined,
    projectId: 'project-a',
    AbortController,
    console,
    cancelRefinement() {},
    invalidateHarmonizedResult() { globals.resultRevisionRef.current += 1; },
    setError(value) { error = value; },
    setFinishRequested() {},
    setHarmonizationState(value) { states.push(value); },
    async prepareHarmonization() {
      globals.resultRevisionRef.current += 1;
      return { resultImageUrl: 'stale-pixels' };
    },
    storeHarmonizationResult: async () => { stored = true; },
    setHarmonizedResult() { throw new Error('Stale result must not reach review.'); },
    setCurrentStep() { throw new Error('Stale result must not enter Review.'); },
  };
  const start = extract(
    '  async function startHarmonization(',
    '  const [tool,',
    globals
  );

  await start({ aspectRatio: '16:9', intensity: 80 });

  assert.equal(stored, false);
  assert.equal(error, 'The composition changed while harmonization was running. Run Harmonize again to process the latest pixels.');
  assert.equal(states.at(-1).busy, false);
  assert.equal(globals.harmonizationRunRef.current, null);
});
