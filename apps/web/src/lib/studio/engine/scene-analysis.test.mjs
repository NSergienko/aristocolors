import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, imports = {}, globals = {}) {
  const output = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(source, {
    exports: output.exports,
    require: name => {
      if (Object.hasOwn(imports, name)) return imports[name];
      throw new Error(`Unexpected module dependency: ${name}`);
    },
    ...globals,
  });
  return output.exports;
}

const engine = load('src/lib/studio/engine/scene-analysis.ts');

function pixels(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    data.set(colorAt(x, y), offset);
  }
  return { width, height, data };
}

test('sRGB to CIELAB uses the D65 reference white consistently', () => {
  const white = engine.srgbToCielab([255, 255, 255]);
  const black = engine.srgbToCielab([0, 0, 0]);
  assert(Math.abs(white[0] - 100) < 1e-4);
  assert(Math.abs(white[1]) < 1e-4);
  assert(Math.abs(white[2]) < 1e-4);
  assert.equal(JSON.stringify(black), JSON.stringify([0, 0, 0]));
});

test('palette extraction is deterministic and returns at most five weighted CIELAB clusters', () => {
  const image = pixels(20, 10, (x) => x < 10 ? [220, 30, 20, 255] : [10, 40, 210, 255]);
  const first = engine.analyzeStyle(image);
  const second = engine.analyzeStyle(image);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert(first.palette.length <= 5);
  assert.equal(JSON.stringify(first.palette.map(color => color.hex)), JSON.stringify(['#dc1e14', '#0a28d2']));
  assert(Math.abs(first.palette.reduce((sum, color) => sum + color.percentage, 0) - 100) < 1e-9);
  assert(first.palette.every(color => color.lab.length === 3 && color.percentage > 0));
});

test('background layer selection ignores a selected foreground and rejects hidden or zero-opacity backgrounds', () => {
  const foreground = { id: 'foreground', isBase: false, object: { visible: true, opacity: 1 } };
  const background = { id: 'background', isBase: true, object: { visible: true, opacity: 1 } };
  assert.equal(engine.findVisibleBackgroundLayer([foreground, background]).id, 'background');
  assert.equal(engine.findVisibleBackgroundLayer([foreground, { ...background, object: { visible: false, opacity: 1 } }]), null);
  assert.equal(engine.findVisibleBackgroundLayer([foreground, { ...background, object: { visible: true, opacity: 0 } }]), null);
  assert.equal(engine.findVisibleBackgroundLayer([foreground]), null);
});

test('missing, invalid, and fully transparent background samples use neutral D65 fallback telemetry', () => {
  const expected = {
    palette: [{ hex: '#ffffff', lab: [100, 0, 0], percentage: 100 }],
    azimuth: 45, elevation: 45, kelvin: 5500, confidence: 0, kelvinConfidence: 0,
    luminanceMean: 1, luminanceStdDev: 0, ambientTintHex: '#ffffff', accentHex: '#ffffff',
  };
  assert.deepEqual(JSON.parse(JSON.stringify(engine.analyzeStyle(null))), expected);
  assert.deepEqual(JSON.parse(JSON.stringify(engine.analyzeStyle({ width: 1, height: 1, data: [] }))), expected);
  assert.deepEqual(JSON.parse(JSON.stringify(engine.analyzeStyle(pixels(3, 2, () => [0, 0, 0, 0])))), expected);
});

test('direction and Kelvin confidence remain bounded and flat illumination has no support', () => {
  const flat = engine.analyzeStyle(pixels(24, 24, () => [120, 120, 120, 255]));
  assert.equal(flat.confidence, 0);
  assert.equal(flat.kelvinConfidence, 0);
  const directional = engine.analyzeStyle(pixels(32, 32, (x, y) => {
    const bright = x < 10 && y < 12;
    return bright ? [245, 240, 235, 255] : [40, 45, 50, 255];
  }));
  for (const value of [directional.confidence, directional.kelvinConfidence]) {
    assert(value >= 0 && value <= 1);
  }
});

test('engine analysis runs headlessly without React, DOM, or other module dependencies', () => {
  const headless = load('src/lib/studio/engine/scene-analysis.ts');
  const result = headless.analyzeStyle(pixels(1, 1, () => [128, 128, 128, 255]));
  assert.equal(result.palette.length, 1);
});

test('profile panel remains compatible with extracted scene telemetry', () => {
  const telemetry = engine.fallbackSceneTelemetry();
  const state = [];
  let hookIndex = 0;
  const React = {
    Fragment: Symbol('Fragment'),
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) {
      const index = hookIndex++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = value; }];
    },
    useEffect(effect) { effect(); },
  };
  const panelModule = load('src/components/studio/aristocolors-profile-panel.tsx', {
    react: { default: React, ...React },
    '@/lib/studio/engine/scene-analysis': {
      analyzeStyle: () => telemetry,
      fallbackSceneTelemetry: engine.fallbackSceneTelemetry,
    },
  });
  hookIndex = 0;
  panelModule.AristoColorsProfilePanel({ getSample: () => null, label: 'Scene · Background' });
  hookIndex = 0;
  const tree = panelModule.AristoColorsProfilePanel({ getSample: () => null, label: 'Scene · Background' });
  const texts = [];
  const visit = node => {
    if (typeof node === 'string' || typeof node === 'number') texts.push(String(node));
    else if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === 'object') visit(node.children);
  };
  visit(tree);
  assert(texts.includes('45°'));
  assert(texts.includes('≈ 5500K · Neutral'));
  assert(texts.includes('0'));
  assert(texts.includes('% heuristic confidence'));
});
