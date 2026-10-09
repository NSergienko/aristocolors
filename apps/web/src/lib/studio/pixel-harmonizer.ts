import type { HarmonizationRefinements } from './harmonization-contract';

export interface HarmonizeParameters {
  colorTempKelvin: number;
  dominantTintHex: string;
  azimuthDeg: number;
  elevationDeg: number;
  intensity: number;
  edgeBleedPx: number;
  shadowIntensity: number;
  targetLuminanceMean?: number;
  targetLuminanceStdDev?: number;
  ambientTintHex?: string;
  accentHex?: string;
}
export type ForegroundBounds = { x: number; y: number; width: number; height: number };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const srgbToLinear = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const linearToSrgb = (value: number) => value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
const linearLuminance = (r: number, g: number, b: number) => r * 0.2126 + g * 0.7152 + b * 0.0722;

function hexChannels(hex: string): number[] {
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
}

function temperatureGains(kelvin: number): number[] {
  const bias = clamp((6500 - kelvin) / 6500, -0.3, 0.45);
  return [clamp(1 + bias * 0.55, 0.75, 1.25), 1, clamp(1 - bias * 0.55, 0.75, 1.25)];
}

export function adaptForegroundPixels(
  data: Uint8ClampedArray,
  params: HarmonizeParameters,
  fallbackLuminance: number,
  effectiveTint: string
): void {
  let totalAlpha = 0;
  let sourceMean = 0;
  let sourceSquares = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    if (!alpha) continue;
    const luminance = linearLuminance(srgbToLinear(data[i] / 255), srgbToLinear(data[i + 1] / 255), srgbToLinear(data[i + 2] / 255));
    totalAlpha += alpha;
    sourceMean += luminance * alpha;
    sourceSquares += luminance * luminance * alpha;
  }
  if (!totalAlpha) return;
  sourceMean /= totalAlpha;
  const sourceDeviation = Math.sqrt(Math.max(0, sourceSquares / totalAlpha - sourceMean ** 2));
  const targetMean = clamp(params.targetLuminanceMean ?? srgbToLinear(fallbackLuminance / 255), 0, 1);
  const targetDeviation = clamp(params.targetLuminanceStdDev ?? 0.08, 0, 1);
  const contrast = clamp(targetDeviation / Math.max(0.025, sourceDeviation), 0.25, 1.75);
  const tint = hexChannels(params.ambientTintHex ?? effectiveTint);
  const tintAverage = Math.max(0.01, (tint[0] + tint[1] + tint[2]) / 3);
  const tintGains = tint.map(channel => clamp(channel / tintAverage, 0.35, 1.8));
  const ambientColor = tint.map(srgbToLinear);
  const ambientLuminance = Math.max(0.001, linearLuminance(ambientColor[0], ambientColor[1], ambientColor[2]));
  const kelvinGains = temperatureGains(clamp(params.colorTempKelvin, 2000, 12500));
  const blendWeight = Math.pow(clamp(params.intensity, 0, 1), 0.75);

  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const original = [data[i], data[i + 1], data[i + 2]].map(value => srgbToLinear(value / 255));
    const luminance = linearLuminance(original[0], original[1], original[2]);
    const matchedLuminance = clamp(targetMean + (luminance - sourceMean) * contrast, 0, 1);
    const luminanceScale = luminance > 0.0001 ? matchedLuminance / luminance : 0;
    for (let channel = 0; channel < 3; channel++) {
      const photometric = clamp(original[channel] * luminanceScale, 0, 1);
      const tinted = clamp(photometric * tintGains[channel] * kelvinGains[channel], 0, 1);
      const ambient = ambientColor[channel] * matchedLuminance / ambientLuminance;
      const adapted = photometric * 0.2 + tinted * 0.25 + ambient * 0.55;
      data[i + channel] = Math.round(clamp(linearToSrgb(original[channel] + (adapted - original[channel]) * blendWeight), 0, 1) * 255);
    }
    const graded = [0, 1, 2].map(channel => srgbToLinear(data[i + channel] / 255));
    const gradedLuminance = linearLuminance(graded[0], graded[1], graded[2]);
    const ambientWeight = clamp(params.intensity, 0, 1) * 0.55;
    if (gradedLuminance > 0.0001 && ambientWeight > 0) {
      for (let channel = 0; channel < 3; channel++) {
        const ambient = ambientColor[channel] * gradedLuminance / ambientLuminance;
        const colorAdapted = graded[channel] + (ambient - graded[channel]) * ambientWeight;
        data[i + channel] = Math.round(clamp(linearToSrgb(colorAdapted), 0, 1) * 255);
      }
    }
  }
}

/**
 * Automatically extracts the dominant ambient color and luminance profile
 * directly from the background canvas pixels around the object.
 */
export function extractBackgroundTelemetry(
  bgCtx: CanvasRenderingContext2D,
  bgWidth: number,
  bgHeight: number,
  bounds: ForegroundBounds
): { ambientTintHex: string; avgLum: number; luminanceMean: number; luminanceStdDev: number; sampleCount: number; isWarm: boolean } {
  // Sample background around the foreground bounds
  const pad = 40;
  const sx = clamp(bounds.x - pad, 0, bgWidth - 1);
  const sy = clamp(bounds.y - pad, 0, bgHeight - 1);
  const sw = clamp(bounds.width + pad * 2, 10, bgWidth - sx);
  const sh = clamp(bounds.height + pad * 2, 10, bgHeight - sy);

  const sample = bgCtx.getImageData(sx, sy, sw, sh).data;
  let totalR = 0, totalG = 0, totalB = 0, totalLuminance = 0, totalLuminanceSquared = 0, count = 0;

  for (let i = 0; i < sample.length; i += 16) { // fast stride
    if (sample[i + 3] > 30) {
      totalR += sample[i];
      totalG += sample[i + 1];
      totalB += sample[i + 2];
      const luminance = linearLuminance(
        srgbToLinear(sample[i] / 255),
        srgbToLinear(sample[i + 1] / 255),
        srgbToLinear(sample[i + 2] / 255)
      );
      totalLuminance += luminance;
      totalLuminanceSquared += luminance * luminance;
      count++;
    }
  }

  if (count === 0) return {
    ambientTintHex: '#808080', avgLum: 128, luminanceMean: srgbToLinear(128 / 255),
    luminanceStdDev: 0, sampleCount: 0, isWarm: false,
  };

  const avgR = Math.round(totalR / count);
  const avgG = Math.round(totalG / count);
  const avgB = Math.round(totalB / count);
  const avgLum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
  const luminanceMean = totalLuminance / count;
  const isWarm = avgR > avgB;

  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  const ambientTintHex = `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;

  return {
    ambientTintHex,
    avgLum,
    luminanceMean,
    luminanceStdDev: Math.sqrt(Math.max(0, totalLuminanceSquared / count - luminanceMean ** 2)),
    sampleCount: count,
    isWarm,
  };
}

async function decode(source: string): Promise<HTMLImageElement> {
  if (!/^data:image\/(png|jpeg);base64,/.test(source)) {
    throw new Error('Harmonization requires a self-contained PNG/JPEG data URL.');
  }
  const image = new Image();
  image.src = source;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('The harmonization image is empty.');
  }
  return image;
}

function surface(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D context unavailable.');
  return { canvas, context };
}

export async function applyPixelHarmonization(
  baseCompositeDataUrl: string,
  foregroundCutoutDataUrl: string,
  foregroundBounds: ForegroundBounds,
  params: HarmonizeParameters
): Promise<string> {
  const [bg, fg] = await Promise.all([decode(baseCompositeDataUrl), decode(foregroundCutoutDataUrl)]);
  if (bg.naturalWidth * bg.naturalHeight > 8_000_000) {
    throw new Error('The composition exceeds the 8 megapixel processing limit.');
  }

  const { canvas, context: ctx } = surface(bg.naturalWidth, bg.naturalHeight);
  ctx.drawImage(bg, 0, 0);

  // Automatically sample background ambient tone around object
  const bgTelemetry = extractBackgroundTelemetry(ctx, bg.naturalWidth, bg.naturalHeight, foregroundBounds);
  const effectiveTint = bgTelemetry.sampleCount
    ? bgTelemetry.ambientTintHex
    : params.ambientTintHex && params.ambientTintHex !== '#ffffff'
      ? params.ambientTintHex
      : params.dominantTintHex && params.dominantTintHex !== '#ffffff'
        ? params.dominantTintHex
        : '#808080';

  const rawAmount = clamp(params.intensity, 0, 1);
  if (rawAmount <= 0.001) {
    // 0% Intensity = pure original raw cutout
    ctx.drawImage(fg, foregroundBounds.x, foregroundBounds.y, foregroundBounds.width, foregroundBounds.height);
    return canvas.toDataURL('image/png');
  }

  // Smooth natural perceptual curve
  const blendWeight = Math.pow(rawAmount, 0.75);

  // 1. Synthesize directional contact shadow matching scene
  const shadowPower = Math.max(0, params.shadowIntensity) * blendWeight;
  if (shadowPower > 0.02) {
    ctx.save();
    const rad = (params.azimuthDeg * Math.PI) / 180;
    const dist = (1 - clamp(params.elevationDeg, 0, 90) / 90) * 30 + 6;
    const blurPx = Math.max(4, params.edgeBleedPx * 0.9);
    ctx.filter = `blur(${blurPx}px)`;
    ctx.globalAlpha = Math.min(0.85, shadowPower * 0.8);
    ctx.fillStyle = '#06080E';
    ctx.beginPath();
    ctx.ellipse(
      foregroundBounds.x + foregroundBounds.width / 2 - Math.cos(rad) * dist,
      foregroundBounds.y + foregroundBounds.height + Math.sin(rad) * dist * 0.45,
      foregroundBounds.width * 0.46,
      Math.max(6, foregroundBounds.height * 0.09),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }

  // 2. Match foreground luminance statistics, then apply ambient and temperature gains.
  const { canvas: fgCanvas, context: fgCtx } = surface(
    Math.max(1, Math.round(foregroundBounds.width)),
    Math.max(1, Math.round(foregroundBounds.height))
  );
  fgCtx.drawImage(fg, 0, 0, fgCanvas.width, fgCanvas.height);
  const imgData = fgCtx.getImageData(0, 0, fgCanvas.width, fgCanvas.height);
  const data = imgData.data;

  adaptForegroundPixels(data, {
    ...params,
    targetLuminanceMean: bgTelemetry.sampleCount ? bgTelemetry.luminanceMean : params.targetLuminanceMean,
    targetLuminanceStdDev: bgTelemetry.sampleCount ? bgTelemetry.luminanceStdDev : params.targetLuminanceStdDev,
    ambientTintHex: effectiveTint,
  }, bgTelemetry.avgLum, effectiveTint);
  fgCtx.putImageData(imgData, 0, 0);

  // 3. Composite with edge softness
  ctx.save();
  if (params.edgeBleedPx > 0 && blendWeight > 0.05) {
    ctx.shadowColor = params.accentHex ?? effectiveTint;
    ctx.shadowBlur = Math.max(2, params.edgeBleedPx * 0.5 * blendWeight);
  }
  ctx.drawImage(fgCanvas, foregroundBounds.x, foregroundBounds.y, foregroundBounds.width, foregroundBounds.height);
  ctx.restore();

  return canvas.toDataURL('image/png');
}
