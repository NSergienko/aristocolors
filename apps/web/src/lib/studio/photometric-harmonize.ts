import sharp from 'sharp';
import type { HarmonizationRequest, HarmonizationResult } from './harmonization-contract';

const MAX_PIXELS = 8_000_000;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const rgb = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
const luminance = (r: number, g: number, b: number) => (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;

async function decode(src: string) {
  const input = Buffer.from(src.slice(src.indexOf(',') + 1), 'base64');
  const decoder = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' });
  const metadata = await decoder.metadata();
  if (!['png', 'jpeg'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) throw new Error('Only single-frame PNG/JPEG images are supported.');
  return decoder.toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

export async function harmonizePhotometrically(request: HarmonizationRequest, signal?: AbortSignal): Promise<HarmonizationResult> {
  signal?.throwIfAborted();
  const composite = await decode(request.compositeImage);
  const background = await decode(request.backgroundImage);
  const foreground = await decode(request.foregroundImage);
  const { width, height } = composite.info;
  if ([background, foreground].some(image => image.info.width !== width || image.info.height !== height)) throw new Error('Composite and layer composites must have identical dimensions.');
  const amount = request.intensity / 100;
  const original = Buffer.from(foreground.data);
  const output = Buffer.from(original);
  let weight = 0, sum = 0, sumSquares = 0;
  const sourceChannels = [0, 0, 0];
  for (let i = 0; i < original.length; i += 4) {
    const alpha = original[i + 3] / 255;
    const light = luminance(original[i], original[i + 1], original[i + 2]);
    weight += alpha; sum += light * alpha; sumSquares += light * light * alpha;
    for (let channel = 0; channel < 3; channel++) sourceChannels[channel] += original[i + channel] / 255 * alpha;
  }
  const sourceMean = weight ? sum / weight : 0;
  const sourceDeviation = weight ? Math.sqrt(Math.max(0, sumSquares / weight - sourceMean ** 2)) : 0;
  const paletteWeight = request.telemetry.palette.reduce((sum, swatch) => sum + swatch.percentage, 0) || 1;
  const targetMean = request.telemetry.palette.reduce((sum, swatch) => sum + luminance(...rgb(swatch.hex) as [number, number, number]) * swatch.percentage, 0) / paletteWeight;
  const targetDeviation = Math.sqrt(request.telemetry.palette.reduce((sum, swatch) => sum + (luminance(...rgb(swatch.hex) as [number, number, number]) - targetMean) ** 2 * swatch.percentage, 0) / paletteWeight);
  const exposure = clamp(targetMean / Math.max(0.05, sourceMean), 0.65, 1.35);
  const contrast = clamp(targetDeviation / Math.max(0.04, sourceDeviation), 0.75, 1.25);
  const dominant = rgb(request.telemetry.dominantHex);
  const ambient = [0, 1, 2].map(channel => (dominant[channel] * 0.6 + request.telemetry.palette.reduce((sum, color) => sum + rgb(color.hex)[channel] * color.percentage, 0) / paletteWeight * 0.4) / 255);
  const ambientLight = Math.max(0.04, ambient[0] * 0.2126 + ambient[1] * 0.7152 + ambient[2] * 0.0722);
  const tint = rgb(request.telemetry.lighting.highlightTint);
  const tintMean = Math.max(1, (tint[0] + tint[1] + tint[2]) / 3);
  const temperature = request.telemetry.lighting.kelvin === null ? 0 : clamp((6500 - request.telemetry.lighting.kelvin) / 6500, -0.3, 0.3);
  const gains = tint.map((channel, index) => {
    const foregroundChroma = weight ? sourceChannels[index] / weight / Math.max(0.04, sourceMean) : 1;
    const ambientGain = clamp(ambient[index] / ambientLight / Math.max(0.15, foregroundChroma), 0.55, 1.6);
    return clamp(1 + (ambientGain - 1) * 0.75 + (channel / tintMean - 1) * 0.08 + (index === 0 ? temperature : index === 2 ? -temperature : 0) * 0.16, 0.6, 1.55);
  });
  const gamma = clamp(Math.log(Math.max(0.08, targetMean)) / Math.log(clamp(sourceMean, 0.08, 0.92)), 0.85, 1.25);
  const direction = request.telemetry.lighting.azimuth === null ? null : request.telemetry.lighting.azimuth * Math.PI / 180;
  let processed = 0, resultSum = 0;
  for (let y = 0; y < height; y++) {
    signal?.throwIfAborted();
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!original[i + 3]) continue;
      processed++;
      const directionalGain = direction === null ? 1 : 1 + 0.025 * request.telemetry.lighting.confidence / 100 * Math.cos((request.telemetry.lighting.elevation ?? 0) * Math.PI / 180) * (Math.cos(direction) * (x / width - 0.5) - Math.sin(direction) * (y / height - 0.5));
      for (let channel = 0; channel < 3; channel++) {
        const value = original[i + channel] / 255;
        const adjusted = clamp(Math.pow(clamp((value - sourceMean) * contrast + sourceMean, 0, 1), gamma) * Math.sqrt(exposure) * gains[channel] * directionalGain, 0, 1);
        output[i + channel] = Math.round(adjusted * 255);
      }
      // Feather only existing outer alpha edges; opaque interior pixels and the base remain intact.
      let alpha = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < width && yy >= 0 && yy < height) { alpha += original[(yy * width + xx) * 4 + 3]; count++; }
      }
      output[i + 3] = Math.round(original[i + 3] + (Math.min(original[i + 3], alpha / count) - original[i + 3]) * 0.4);
      resultSum += luminance(original[i] + (output[i] - original[i]) * amount, original[i + 1] + (output[i + 1] - original[i + 1]) * amount, original[i + 2] + (output[i + 2] - original[i + 2]) * amount) * original[i + 3] / 255;
    }
  }
  const raw = { width, height, channels: 4 as const };
  // Apply foreground-only colour deltas to the real composite, preserving its blend modes and base pixels.
  const mixed = Buffer.from(composite.data);
  for (let i = 0; i < mixed.length; i += 4) {
    const alpha = original[i + 3] / 255;
    if (!alpha) continue;
    const retained = output[i + 3] / original[i + 3];
    for (let channel = 0; channel < 3; channel++) {
      const value = composite.data[i + channel] + (output[i + channel] - original[i + channel]) * alpha;
      const feathered = background.data[i + channel] + (value - background.data[i + channel]) * retained;
      mixed[i + channel] = Math.round(clamp(composite.data[i + channel] + (feathered - composite.data[i + channel]) * amount, 0, 255));
    }
  }
  const [rw, rh] = request.aspectRatio.split(':').map(Number);
  const frameUnit = Math.ceil(Math.max(width / rw, height / rh));
  const targetWidth = frameUnit * rw;
  const targetHeight = frameUnit * rh;
  if (targetWidth * targetHeight > MAX_PIXELS) throw new Error('The target aspect-ratio frame is too large. Reduce canvas resolution.');
  const png = await sharp(mixed, { raw }).resize(targetWidth, targetHeight, { fit: 'contain', background: '#141619' }).png().toBuffer();
  const before = await sharp(composite.data, { raw }).resize(targetWidth, targetHeight, { fit: 'contain', background: '#141619' }).png().toBuffer();
  const base = await sharp(background.data, { raw }).resize(targetWidth, targetHeight, { fit: 'contain', background: '#141619' }).png().toBuffer();
  const alphaMask = Buffer.alloc(original.length);
  for (let i = 0; i < original.length; i += 4) { alphaMask[i] = alphaMask[i + 1] = alphaMask[i + 2] = 255; alphaMask[i + 3] = original[i + 3]; }
  const mask = await sharp(alphaMask, { raw }).resize(targetWidth, targetHeight, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  signal?.throwIfAborted();
  return { success: true, resultImageUrl: `data:image/png;base64,${png.toString('base64')}`,
    review: { beforeImageUrl: `data:image/png;base64,${before.toString('base64')}`, backgroundImageUrl: `data:image/png;base64,${base.toString('base64')}`,
      foregroundMaskUrl: `data:image/png;base64,${mask.toString('base64')}`,
      backgroundLab: [0, 1, 2].map(channel => request.telemetry.palette.reduce((sum, color) => sum + color.lab[channel] * color.percentage, 0) / paletteWeight) as [number, number, number],
      lightingAzimuth: request.telemetry.lighting.azimuth,
      refinements: { contactShadow: 0, edgeFeather: 0, warmth: 0 } }, audit: {
    harmonizedAt: new Date().toISOString(), appliedIntensity: request.intensity, method: 'photometric-v1',
    lightingMatchScore: weight ? Math.round(clamp(100 * (1 - Math.abs(resultSum / weight - targetMean)), 0, 100)) : null,
    scoreMeaning: 'luminance-statistics-similarity', width: targetWidth, height: targetHeight,
    aspectRatio: request.aspectRatio, processedForegroundPixels: processed,
  } };
}
