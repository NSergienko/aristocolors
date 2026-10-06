import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const studio = fs.readFileSync('src/components/studio/step-one-studio.tsx', 'utf8');
function compile(source) {
  return ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
}
const contract = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync('src/lib/studio/harmonization-contract.ts', 'utf8')), { exports: contract.exports, require });
const { harmonizationResultSchema, getAcceptedHarmonizedImage } = contract.exports;
function method(start, end, globals) {
  return vm.runInNewContext(compile(studio.slice(studio.indexOf(start), studio.indexOf(end))) + '\n' + start.trim().replace(/^(async )?function /, '').split('(')[0], globals);
}
async function fixture() {
  const image = async color => 'data:image/png;base64,' + (await sharp({ create: { width: 16, height: 9, channels: 4, background: color } }).png().toBuffer()).toString('base64');
  return harmonizationResultSchema.parse({ success: true, resultImageUrl: await image('#cc7755'),
    review: { beforeImageUrl: await image('#888888'), backgroundImageUrl: await image('#554433'), foregroundMaskUrl: await image('#ffffff'),
      refinements: { contactShadow: 20, edgeFeather: 2, warmth: 15 }, refinedImageUrl: await image('#dd8844'), acceptedAt: '2026-10-06T00:00:00.000Z' },
    audit: { width: 16, height: 9, harmonizedAt: '2026-10-06T00:00:00.000Z', appliedIntensity: 80, lightingMatchScore: 70,
      method: 'photometric-v1', scoreMeaning: 'luminance-statistics-similarity', aspectRatio: '16:9', processedForegroundPixels: 20 } });
}

test('Finish renders the persisted accepted PNG without review canvas or original pixels', async () => {
  const result = harmonizationResultSchema.parse(JSON.parse(JSON.stringify(await fixture())));
  const component = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync('src/components/studio/harmonized-result-view.tsx', 'utf8')), {
    exports: component.exports, require: name => name === 'react' ? React : name.includes('harmonization-contract') ? contract.exports : {},
  });
  const markup = renderToStaticMarkup(React.createElement(component.exports.HarmonizedResultView, {
    result, refinements: result.review.refinements, finish: true, captureRef: { current: null },
    onReady() {}, onError() {}, onCompose() {},
  }));
  assert(markup.includes(result.review.refinedImageUrl));
  assert(!markup.includes(result.review.beforeImageUrl));
  assert(!markup.includes(result.resultImageUrl));
  assert(!markup.includes('<canvas'));
});

test('Export uses accepted pixels in every workflow step, even without Compose canvas', async () => {
  const harmonizedResult = await fixture();
  for (const currentStep of ['compose', 'harmonize', 'finish']) {
    let downloaded;
    const link = { click() { downloaded = this.href; }, remove() {} };
    const exportImage = method('  function exportComposition()', '  function getTelemetrySample()', {
      harmonizedResult, getAcceptedHarmonizedImage, currentStep, canvasRef: { current: null },
      refinementCaptureRef: { current() { throw new Error('Must not recapture accepted pixels'); } },
      exportingRef: { current: false }, title: 'Fixture', console,
      document: { createElement: () => link, body: { appendChild() {} } },
      setError(message) { throw new Error(message); },
    });
    exportImage();
    assert.equal(downloaded, harmonizedResult.review.refinedImageUrl);
  }
});

test('Harmonize / Finish navigation preserves the same accepted artifact without recapture', async () => {
  const result = await fixture();
  const globals = { currentStep: 'harmonize', harmonizedResult: result, getAcceptedHarmonizedImage,
    acceptingRef: { current: false }, harmonizationRunRef: { current: null },
    setFinishRequested() {}, setCurrentStep(step) { globals.currentStep = step; } };
  const navigate = method('  function navigateWorkflow(', '  useEffect(() => {\n    if (finishRequested', globals);
  for (const step of ['finish', 'harmonize', 'finish']) {
    navigate(step);
    assert.equal(globals.currentStep, step);
    assert.strictEqual(globals.harmonizedResult, result);
  }
});

test('Accept waits for valid pixels and persistence; failures never enter Finish', async () => {
  const result = await fixture();
  const events = [];
  let saved;
  const globals = { harmonizedResult: result, refinementReady: true, refinements: result.review.refinements,
    // Acceptance must use the displayed PNG; a renderer capture is forbidden.
    refinementCaptureRef: { current() { throw new Error('Acceptance must not recapture'); } }, acceptingRef: { current: false },
    resultRevisionRef: { current: 0 }, harmonizationRunRef: { current: null }, acceptanceRunRef: { current: null },
    AbortController, Error, harmonizationResultSchema, localImportToken: undefined, projectId: 'fixture',
    decodeImage: async src => { const metadata = await sharp(Buffer.from(src.split(',')[1], 'base64')).metadata(); return { naturalWidth: metadata.width, naturalHeight: metadata.height }; },
    storeHarmonizationResult: async (id, value) => { await Promise.resolve(); saved = structuredClone(value); events.push('stored'); },
    setAccepting() {}, setReviewError(message) { if (message) throw new Error(message); },
    setHarmonizedResult(value) { events.push('state'); assert.deepEqual(value, saved); }, setFinishRequested() {},
    setCurrentStep(step) { events.push(step); },
  };
  await method('  async function acceptRefinedComposition()', '  function navigateWorkflow(', globals)();
  assert.deepEqual(events, ['stored', 'state', 'finish']);
  assert.equal(getAcceptedHarmonizedImage(saved), result.review.refinedImageUrl);
  assert.notEqual(getAcceptedHarmonizedImage(saved), result.review.beforeImageUrl);
  events.length = 0;
  let error;
  globals.setReviewError = message => { error = message; };
  globals.storeHarmonizationResult = async () => { throw new Error('Storage unavailable'); };
  await method('  async function acceptRefinedComposition()', '  function navigateWorkflow(', globals)();
  assert.deepEqual(events, []);
  assert.equal(error, 'Storage unavailable');
  globals.decodeImage = async () => ({ naturalWidth: 1, naturalHeight: 1 });
  globals.storeHarmonizationResult = async () => { throw new Error('Invalid capture must not reach storage'); };
  await method('  async function acceptRefinedComposition()', '  function navigateWorkflow(', globals)();
  assert.deepEqual(events, []);
  assert.match(error, /resolution/);
});
