import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const origin = process.env.STUDIO_TEST_ORIGIN ?? 'http://localhost:3000';
async function fixture() {
  const width = 160, height = 90;
  const foreground = Buffer.alloc(width * height * 4);
  for (let y = 20; y < 60; y++) for (let x = 40; x < 100; x++) {
    const i = (y * width + x) * 4;
    foreground.set([210, 180, 150, 255], i);
  }
  const background = await sharp({ create: { width, height, channels: 4, background: '#606060' } }).png().toBuffer();
  const foregroundImage = await sharp(foreground, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const composite = await sharp(background).composite([{ input: foregroundImage }]).png().toBuffer();
  const url = buffer => `data:image/png;base64,${buffer.toString('base64')}`;
  return { projectId: 'api-regression-fixture', compositeImage: url(composite), backgroundImage: url(background), foregroundImage: url(foregroundImage),
    intensity: 100, aspectRatio: '16:9', telemetry: {
      lighting: { azimuth: 0, elevation: 30, highlightTint: '#ffddbb', kelvin: 4200, confidence: 35 },
      palette: [{ hex: '#606060', lab: [40, 0, 0], percentage: 100 }], dominantHex: '#606060',
    } };
}
async function post(body) {
  return fetch(`${origin}/api/studio/harmonize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
async function pixels(url) { return sharp(Buffer.from(url.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer(); }

test('live endpoint adjusts foreground, preserves base, and returns audit', async () => {
  const input = await fixture();
  const response = await post(input);
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(result.success, true);
  assert.equal(result.audit.appliedIntensity, 100);
  assert.equal(result.audit.processedForegroundPixels, 2400);
  const before = await pixels(input.compositeImage), after = await pixels(result.resultImageUrl);
  assert.deepEqual(after.subarray(0, 4), before.subarray(0, 4));
  const center = (40 * 160 + 70) * 4;
  assert.notDeepEqual(after.subarray(center, center + 3), before.subarray(center, center + 3));
});
test('zero intensity preserves composite pixels', async () => {
  const input = { ...await fixture(), intensity: 0 };
  const response = await post(input);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(await pixels(result.resultImageUrl), await pixels(input.compositeImage));
});
test('all ratio frames contain the complete composition', async () => {
  for (const aspectRatio of ['1:1', '9:16']) {
    const response = await post({ ...await fixture(), aspectRatio });
    assert.equal(response.status, 200);
    const result = await response.json();
    const [rw, rh] = aspectRatio.split(':').map(Number);
    assert.equal(result.audit.width * rh, result.audit.height * rw);
    assert.ok(result.audit.width >= 160 && result.audit.height >= 90);
  }
});
test('invalid intensity and missing telemetry are rejected', async () => {
  assert.equal((await post({ ...await fixture(), intensity: 101 })).status, 400);
  assert.equal((await post({ projectId: 'missing' })).status, 400);
});
test('undecodable image returns clean error JSON', async () => {
  const response = await post({ ...await fixture(), foregroundImage: 'data:image/png;base64,aW52YWxpZA==' });
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(typeof body.error, 'string');
});

test('review assets preserve Before and align foreground alpha with After', async () => {
  const input = await fixture();
  const response = await post(input);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(await pixels(result.review.beforeImageUrl), await pixels(input.compositeImage));
  const mask = await pixels(result.review.foregroundMaskUrl);
  assert.equal(mask[3], 0);
  assert.equal(mask[(40 * 160 + 70) * 4 + 3], 255);
  for (const key of ['beforeImageUrl', 'backgroundImageUrl', 'foregroundMaskUrl']) {
    const metadata = await sharp(Buffer.from(result.review[key].split(',')[1], 'base64')).metadata();
    assert.equal(metadata.width, result.audit.width);
    assert.equal(metadata.height, result.audit.height);
  }
});

test('copper ambient palette produces a noticeable foreground grade without changing base pixels', async () => {
  const input = await fixture();
  input.intensity = 80;
  input.telemetry.dominantHex = '#83654b';
  input.telemetry.palette = [{ hex: '#83654b', lab: [45, 10, 20], percentage: 100 }];
  input.telemetry.lighting.azimuth = 85;
  const response = await post(input);
  assert.equal(response.status, 200);
  const result = await response.json();
  const before = await pixels(input.compositeImage), after = await pixels(result.resultImageUrl);
  const i = (40 * 160 + 70) * 4;
  const delta = [0, 1, 2].reduce((sum, channel) => sum + Math.abs(before[i + channel] - after[i + channel]), 0) / 3;
  assert.ok(delta > 25, `Expected noticeable foreground grade; mean RGB delta=${delta}`);
  assert.deepEqual(before.subarray(0, 4), after.subarray(0, 4));
  assert.equal(result.review.lightingAzimuth, 85);
});
