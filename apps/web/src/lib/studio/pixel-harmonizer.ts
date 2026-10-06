import type { HarmonizationRefinements } from './harmonization-contract';

export interface HarmonizeParameters {
  colorTempKelvin: number;
  dominantTintHex: string;
  azimuthDeg: number;
  elevationDeg: number;
  intensity: number;
  edgeBleedPx: number;
  shadowIntensity: number;
}
export type ForegroundBounds = { x: number; y: number; width: number; height: number };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/**
 * Automatically extracts the dominant ambient color and luminance profile
 * directly from the background canvas pixels around the object.
 */
export function extractBackgroundTelemetry(
  bgCtx: CanvasRenderingContext2D,
  bgWidth: number,
  bgHeight: number,
  bounds: ForegroundBounds
): { dominantTintHex: string; avgLum: number; isWarm: boolean } {
  // Sample background around the foreground bounds
  const pad = 40;
  const sx = clamp(bounds.x - pad, 0, bgWidth - 1);
  const sy = clamp(bounds.y - pad, 0, bgHeight - 1);
  const sw = clamp(bounds.width + pad * 2, 10, bgWidth - sx);
  const sh = clamp(bounds.height + pad * 2, 10, bgHeight - sy);

  const sample = bgCtx.getImageData(sx, sy, sw, sh).data;
  let totalR = 0, totalG = 0, totalB = 0, count = 0;

  for (let i = 0; i < sample.length; i += 16) { // fast stride
    if (sample[i + 3] > 30) {
      totalR += sample[i];
      totalG += sample[i + 1];
      totalB += sample[i + 2];
      count++;
    }
  }

  if (count === 0) return { dominantTintHex: '#e08a68', avgLum: 128, isWarm: true };

  const avgR = Math.round(totalR / count);
  const avgG = Math.round(totalG / count);
  const avgB = Math.round(totalB / count);
  const avgLum = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
  const isWarm = avgR > avgB;

  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  const dominantTintHex = `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;

  return { dominantTintHex, avgLum, isWarm };
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
  const effectiveTint = params.dominantTintHex && params.dominantTintHex !== '#ffffff'
    ? params.dominantTintHex
    : bgTelemetry.dominantTintHex;

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

  // 2. Pure LERP Photometric color grading (No muddy desaturation)
  const { canvas: fgCanvas, context: fgCtx } = surface(
    Math.max(1, Math.round(foregroundBounds.width)),
    Math.max(1, Math.round(foregroundBounds.height))
  );
  fgCtx.drawImage(fg, 0, 0, fgCanvas.width, fgCanvas.height);
  const imgData = fgCtx.getImageData(0, 0, fgCanvas.width, fgCanvas.height);
  const data = imgData.data;

  const tintR = parseInt(effectiveTint.slice(1, 3), 16);
  const tintG = parseInt(effectiveTint.slice(3, 5), 16);
  const tintB = parseInt(effectiveTint.slice(5, 7), 16);

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (!alpha) continue;

    const rawR = data[i];
    const rawG = data[i + 1];
    const rawB = data[i + 2];

    // Ambient light multiply + overlay
    const gradedR = (rawR * (0.65 + 0.35 * (tintR / 255)));
    const gradedG = (rawG * (0.65 + 0.35 * (tintG / 255)));
    const gradedB = (rawB * (0.65 + 0.35 * (tintB / 255)));

    // Pure LERP between pristine raw and harmonized tone
    data[i] = clamp(Math.round(rawR * (1 - blendWeight) + gradedR * blendWeight), 0, 255);
    data[i + 1] = clamp(Math.round(rawG * (1 - blendWeight) + gradedG * blendWeight), 0, 255);
    data[i + 2] = clamp(Math.round(rawB * (1 - blendWeight) + gradedB * blendWeight), 0, 255);
  }
  fgCtx.putImageData(imgData, 0, 0);

  // 3. Composite with edge softness
  ctx.save();
  if (params.edgeBleedPx > 0 && blendWeight > 0.05) {
    ctx.shadowColor = effectiveTint;
    ctx.shadowBlur = Math.max(2, params.edgeBleedPx * 0.5 * blendWeight);
  }
  ctx.drawImage(fgCanvas, foregroundBounds.x, foregroundBounds.y, foregroundBounds.width, foregroundBounds.height);
  ctx.restore();

  return canvas.toDataURL('image/png');
}
