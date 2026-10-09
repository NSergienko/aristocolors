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
const engine = load('src/lib/studio/pixel-harmonizer.ts');

test('all supplied canonical profiles remain valid with their configured lighting and palette weights', () => {
  const expected = [[4200, -45, 35, 14], [5600, 30, 55, 8], [3200, -70, 25, 18]];
  presets.CANONICAL_PRESETS.forEach(({ profile }, index) => {
    assert(profileContract.AristoColorsProfileSchema.safeParse(profile).success);
    const lighting = profile.inferredFeatures.lighting;
    assert.deepEqual([lighting.colorTempKelvin, lighting.azimuthDeg, lighting.elevationDeg,
      profile.deterministicFeatures.textureAnalysis.edgeBleedRadiusPx], expected[index]);
    assert(Math.abs(profile.deterministicFeatures.palette.reduce((sum, color) => sum + color.weight, 0) - 1) < 1e-9);
  });
});

function createCanvasHarness(images) {
  class TestImage {
    async decode() {
      const source = images.get(this.src);
      if (!source) throw new Error(`Unknown test image: ${this.src}`);
      this.naturalWidth = source.width;
      this.naturalHeight = source.height;
      this.pixels = source.pixels;
    }
  }

  class TestCanvas {
    constructor() {
      this.width = 0;
      this.height = 0;
      this.pixels = new Uint8ClampedArray(0);
      this.context = new TestContext(this);
    }
    set width(value) { this._width = value; this.pixels = new Uint8ClampedArray(value * (this._height ?? 0) * 4); }
    get width() { return this._width; }
    set height(value) { this._height = value; this.pixels = new Uint8ClampedArray((this._width ?? 0) * value * 4); }
    get height() { return this._height; }
    getContext() { return this.context; }
    toDataURL() { return `data:image/png;base64,${Buffer.from(this.pixels).toString('base64')}`; }
  }

  class TestContext {
    constructor(canvas) {
      this.canvas = canvas;
      this.globalAlpha = 1;
      this.globalCompositeOperation = 'source-over';
    }
    save() {}
    restore() {}
    drawImage(source, ...args) {
      const sourceWidth = source.naturalWidth ?? source.width;
      const sourceHeight = source.naturalHeight ?? source.height;
      const sourcePixels = source.pixels;
      const dx = args[0] ?? 0;
      const dy = args[1] ?? 0;
      const width = args[2] ?? sourceWidth;
      const height = args[3] ?? sourceHeight;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const tx = Math.floor(dx + x), ty = Math.floor(dy + y);
        if (tx < 0 || ty < 0 || tx >= this.canvas.width || ty >= this.canvas.height) continue;
        const sx = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / width));
        const sy = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / height));
        const si = (sy * sourceWidth + sx) * 4;
        const di = (ty * this.canvas.width + tx) * 4;
        const sourceAlpha = sourcePixels[si + 3] / 255 * this.globalAlpha;
        const destAlpha = this.canvas.pixels[di + 3] / 255;
        if (this.globalCompositeOperation === 'destination-in') {
          this.canvas.pixels[di + 3] = Math.round(destAlpha * sourceAlpha * 255);
          continue;
        }
        const resultAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
        for (let channel = 0; channel < 3; channel++) {
          this.canvas.pixels[di + channel] = resultAlpha
            ? Math.round((sourcePixels[si + channel] * sourceAlpha +
              this.canvas.pixels[di + channel] * destAlpha * (1 - sourceAlpha)) / resultAlpha)
            : 0;
        }
        this.canvas.pixels[di + 3] = Math.round(resultAlpha * 255);
      }
    }
    getImageData(x, y, width, height) {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
        const sx = x + column, sy = y + row;
        if (sx < 0 || sy < 0 || sx >= this.canvas.width || sy >= this.canvas.height) continue;
        const sourceIndex = (sy * this.canvas.width + sx) * 4;
        data.set(this.canvas.pixels.subarray(sourceIndex, sourceIndex + 4), (row * width + column) * 4);
      }
      return { data };
    }
    putImageData(imageData, x, y) {
      for (let row = 0; row < this.canvas.height; row++) for (let column = 0; column < this.canvas.width; column++) {
        const sourceIndex = (row * this.canvas.width + column) * 4;
        const targetIndex = ((row + y) * this.canvas.width + column + x) * 4;
        this.canvas.pixels.set(imageData.data.subarray(sourceIndex, sourceIndex + 4), targetIndex);
      }
    }
    beginPath() {}
    ellipse() {}
    fill() {}
  }

  const document = { createElement: tag => {
    assert.equal(tag, 'canvas');
    return new TestCanvas();
  } };
  return { Image: TestImage, document };
}

function relativeLuminance(r, g, b) {
  const linear = value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return linear(r) * 0.2126 + linear(g) * 0.7152 + linear(b) * 0.0722;
}

test('dark cyberpunk telemetry darkens and tints a bright transparent cutout in the returned composite', async () => {
  const bgUrl = 'data:image/png;base64,BACKGROUND';
  const fgUrl = 'data:image/png;base64,FOREGROUND';
  const bgPixels = new Uint8ClampedArray(4 * 4 * 4);
  const fgPixels = new Uint8ClampedArray(2 * 2 * 4);
  for (let i = 0; i < bgPixels.length; i += 4) bgPixels.set([10, 14, 32, 255], i);
  for (let i = 0; i < fgPixels.length; i += 4) fgPixels.set([235, 225, 210, 255], i);
  fgPixels.set([235, 225, 210, 0], 12);
  const images = new Map([
    [bgUrl, { width: 4, height: 4, pixels: bgPixels }],
    [fgUrl, { width: 2, height: 2, pixels: fgPixels }],
  ]);
  const harness = load('src/lib/studio/pixel-harmonizer.ts', {}, createCanvasHarness(images));
  const unharmonized = new Uint8ClampedArray(bgPixels);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    const src = (y * 2 + x) * 4;
    const dst = ((y + 1) * 4 + x + 1) * 4;
    if (fgPixels[src + 3]) unharmonized.set(fgPixels.subarray(src, src + 4), dst);
  }
  const outputUrl = await harness.applyPixelHarmonization(bgUrl, fgUrl, { x: 1, y: 1, width: 2, height: 2 }, {
    colorTempKelvin: 7200,
    dominantTintHex: '#00d8ff',
    ambientTintHex: '#00d8ff',
    accentHex: '#00d8ff',
    targetLuminanceMean: 0.012,
    targetLuminanceStdDev: 0.006,
    azimuthDeg: 45,
    elevationDeg: 35,
    intensity: 1,
    edgeBleedPx: 0,
    shadowIntensity: 0,
  });
  const output = new Uint8ClampedArray(Buffer.from(outputUrl.split(',')[1], 'base64'));
  const foregroundPixel = (1 * 4 + 1) * 4;
  assert(relativeLuminance(output[foregroundPixel], output[foregroundPixel + 1], output[foregroundPixel + 2]) <
    relativeLuminance(fgPixels[0], fgPixels[1], fgPixels[2]) * 0.2,
  'dark-scene exposure matching should substantially reduce foreground luminance');
  assert(output[foregroundPixel + 2] > output[foregroundPixel],
    'foreground channels should shift toward the cyan ambient tint');
  assert.notDeepEqual(output, unharmonized,
    'the harmonized output composite should differ numerically from the unharmonized composite');
  assert.equal(output[((2 * 4) + 2) * 4 + 3], 255, 'transparent cutout pixels must reveal the background');
});

test('local dark cyan lighting overrides brighter global telemetry and shifts a pink cutout', async () => {
  const bgUrl = 'data:image/png;base64,LOCAL-BACKGROUND';
  const fgUrl = 'data:image/png;base64,PINK-FOREGROUND';
  const bgPixels = new Uint8ClampedArray(4 * 4 * 4);
  const fgPixels = new Uint8ClampedArray(2 * 2 * 4);
  for (let i = 0; i < bgPixels.length; i += 4) bgPixels.set([18, 52, 72, 255], i);
  for (let i = 0; i < fgPixels.length; i += 4) fgPixels.set([255, 50, 180, 255], i);
  const images = new Map([
    [bgUrl, { width: 4, height: 4, pixels: bgPixels }],
    [fgUrl, { width: 2, height: 2, pixels: fgPixels }],
  ]);
  const harness = load('src/lib/studio/pixel-harmonizer.ts', {}, createCanvasHarness(images));
  const outputUrl = await harness.applyPixelHarmonization(bgUrl, fgUrl, { x: 1, y: 1, width: 2, height: 2 }, {
    colorTempKelvin: 7200,
    dominantTintHex: '#ffffff',
    ambientTintHex: '#ffffff',
    accentHex: '#ff00ff',
    targetLuminanceMean: 0.7,
    targetLuminanceStdDev: 0.3,
    azimuthDeg: 45,
    elevationDeg: 35,
    intensity: 0.8,
    edgeBleedPx: 0,
    shadowIntensity: 0,
  });
  const output = new Uint8ClampedArray(Buffer.from(outputUrl.split(',')[1], 'base64'));
  const index = (1 * 4 + 1) * 4;
  const sourceLuminance = relativeLuminance(fgPixels[0], fgPixels[1], fgPixels[2]);
  const resultLuminance = relativeLuminance(output[index], output[index + 1], output[index + 2]);
  assert(resultLuminance < sourceLuminance * 0.5,
    'local dark background luminance must take priority over brighter global scene telemetry');
  assert(output[index + 2] / Math.max(1, output[index]) >
    fgPixels[2] / fgPixels[0] * 1.3,
  `local cyan ambient light must shift pink foreground away from magenta (source ${fgPixels[2] / fgPixels[0]}, result ${output[index + 2] / Math.max(1, output[index])})`);
});
