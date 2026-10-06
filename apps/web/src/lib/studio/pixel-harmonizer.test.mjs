import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
function load(path, imports = {}, globals = {}) {
  const output = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, { exports: output.exports, require: name => imports[name] ?? require(name), ...globals });
  return output.exports;
}
const profileContract = load('../../packages/aristocolors-contracts/src/profile.ts');
const presets = load('src/lib/studio/canonical-presets.ts', { '@aristocolors/contracts': profileContract });
const engine = load('src/lib/studio/pixel-harmonizer.ts', { './canonical-presets': presets });

test('all three supplied presets validate and retain their exact lighting and palette weights', () => {
  const expected = [[4200, -45, 35, 14], [5600, 30, 55, 8], [3200, -70, 25, 18]];
  presets.CANONICAL_PRESETS.forEach(({ profile }, index) => {
    assert(profileContract.AristoColorsProfileSchema.safeParse(profile).success);
    const lighting = profile.inferredFeatures.lighting;
    assert.deepEqual([lighting.colorTempKelvin, lighting.azimuthDeg, lighting.elevationDeg,
      profile.deterministicFeatures.textureAnalysis.edgeBleedRadiusPx], expected[index]);
    assert(Math.abs(profile.deterministicFeatures.palette.reduce((sum, color) => sum + color.weight, 0) - 1) < 1e-9);
  });
  assert.equal(presets.getCanonicalPreset().profile.id, '7a5e921d-3b84-4e20-912f-682054a10001');
  assert.equal(presets.primaryAccent(presets.getCanonicalPreset().profile), '#00F0FF');
});

test('Kelvin and slider parameters retain signed direction and produce warm RGB gains', () => {
  const warm = engine.kelvinToRgbMultipliers(3200);
  const neutral = engine.kelvinToRgbMultipliers(5600);
  assert(warm.r > warm.b);
  assert(warm.b < neutral.b);
  const profile = presets.getCanonicalPreset().profile;
  const values = engine.profileRefinements(profile);
  assert.equal(values.edgeFeather, 14);
  assert.equal(values.contactShadow, 55);
  const params = engine.profileParameters(profile, 80, { ...values, warmth: 10 });
  assert.equal(params.colorTempKelvin, 3800);
  assert.equal(params.azimuthDeg, -45);
  assert.equal(params.intensity, 0.8);
});

test('pixel loop bakes temperature/tint without changing alpha; processing surfaces stay detached', async () => {
  // Canvas interface harness for the CPU pixel loop; this is not browser rendering acceptance.
  const surfaces = [];
  class Image {
    naturalWidth = 2; naturalHeight = 1;
    async decode() {}
  }
  const document = { createElement(tag) {
    assert.equal(tag, 'canvas');
    const data = new Uint8ClampedArray([200, 180, 160, 255, 40, 60, 80, 0]);
    const context = { drawImage() {}, getImageData: () => ({ data }), putImageData() {}, save() {}, restore() {} };
    const canvas = { getContext: () => context, toDataURL: () => 'data:image/png;base64,QkFLRUQ=', data };
    surfaces.push(canvas); return canvas;
  } };
  const harness = load('src/lib/studio/pixel-harmonizer.ts', { './canonical-presets': presets }, { Image, document });
  const params = engine.profileParameters(presets.getCanonicalPreset().profile, 80, { contactShadow: 0, edgeFeather: 0, warmth: 0 });
  const output = await harness.applyPixelHarmonization('data:image/png;base64,Qkc=', 'data:image/png;base64,Rkc=', { x: 0, y: 0, width: 2, height: 1 }, params);
  assert.equal(output, 'data:image/png;base64,QkFLRUQ=');
  assert.equal(surfaces.length, 2);
  assert(surfaces[1].data[0] < 200);
  assert(surfaces[1].data[2] < 160);
  assert.equal(surfaces[1].data[3], 255);
  assert.equal(surfaces[1].data[7], 0);
});
