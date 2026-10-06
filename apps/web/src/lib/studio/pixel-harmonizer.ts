import type { AristoColorsProfile } from '@aristocolors/contracts';
import type { HarmonizationRefinements } from './harmonization-contract';
import { primaryAccent } from './canonical-presets';

export interface HarmonizeParameters {
  colorTempKelvin: number; dominantTintHex: string; azimuthDeg: number; elevationDeg: number;
  intensity: number; edgeBleedPx: number; shadowIntensity: number;
}
export type ForegroundBounds = { x: number; y: number; width: number; height: number };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function kelvinToRgbMultipliers(kelvin: number): { r: number; g: number; b: number } {
  const temp = clamp(kelvin, 1000, 40000) / 100;
  return temp <= 66 ? {
    r: 1, g: clamp(99.4708025861 * Math.log(temp) - 161.1195681661, 0, 255) / 255,
    b: temp <= 19 ? 0 : clamp(138.5177312231 * Math.log(temp - 10) - 305.0447927307, 0, 255) / 255,
  } : {
    r: clamp(329.698727446 * (temp - 60) ** -0.1332047592, 0, 255) / 255,
    g: clamp(288.1221695283 * (temp - 60) ** -0.0755148492, 0, 255) / 255, b: 1,
  };
}

export function profileRefinements(profile: AristoColorsProfile): HarmonizationRefinements {
  return { contactShadow: Math.round(profile.inferredFeatures.lighting.intensity * 60),
    edgeFeather: Math.min(20, profile.deterministicFeatures.textureAnalysis.edgeBleedRadiusPx), warmth: 0 };
}
export function profileParameters(profile: AristoColorsProfile, intensity: number, values: HarmonizationRefinements): HarmonizeParameters {
  const light = profile.inferredFeatures.lighting;
  return { colorTempKelvin: clamp(light.colorTempKelvin - values.warmth * 40, 1000, 40000),
    dominantTintHex: primaryAccent(profile), azimuthDeg: light.azimuthDeg, elevationDeg: light.elevationDeg,
    intensity: clamp(intensity / 100, 0, 1), edgeBleedPx: values.edgeFeather, shadowIntensity: values.contactShadow / 100 };
}

async function decode(source: string): Promise<HTMLImageElement> {
  if (!/^data:image\/(png|jpeg);base64,/.test(source)) throw new Error('Harmonization requires a self-contained PNG/JPEG data URL.');
  const image = new Image(); image.src = source; await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('The harmonization image is empty.');
  return image;
}
function surface(width: number, height: number) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D context unavailable.');
  return { canvas, context };
}

export async function applyPixelHarmonization(baseCompositeDataUrl: string, foregroundCutoutDataUrl: string,
  foregroundBounds: ForegroundBounds, params: HarmonizeParameters): Promise<string> {
  if (Object.values(params).some(value => typeof value === 'number' && !Number.isFinite(value)) ||
      !/^#[0-9a-f]{6}$/i.test(params.dominantTintHex) ||
      !Object.values(foregroundBounds).every(Number.isFinite) || foregroundBounds.width <= 0 || foregroundBounds.height <= 0) {
    throw new Error('Invalid pixel harmonization parameters.');
  }
  const [bg, fg] = await Promise.all([decode(baseCompositeDataUrl), decode(foregroundCutoutDataUrl)]);
  if (bg.naturalWidth * bg.naturalHeight > 8_000_000) throw new Error('The composition exceeds the 8 megapixel processing limit.');
  const { canvas, context: ctx } = surface(bg.naturalWidth, bg.naturalHeight);
  ctx.drawImage(bg, 0, 0);
  const amount = clamp(params.intensity, 0, 1);
  if (params.shadowIntensity > 0 && amount > 0) {
    ctx.save();
    const rad = params.azimuthDeg * Math.PI / 180;
    const dist = (1 - clamp(params.elevationDeg, 0, 90) / 90) * 28 + 4;
    ctx.filter = `blur(${Math.max(4, params.edgeBleedPx)}px)`;
    ctx.globalAlpha = Math.min(0.85, params.shadowIntensity * 0.75) * amount;
    ctx.fillStyle = '#05070B'; ctx.beginPath();
    ctx.ellipse(foregroundBounds.x + foregroundBounds.width / 2 - Math.cos(rad) * dist,
      foregroundBounds.y + foregroundBounds.height + Math.sin(rad) * dist * 0.45,
      foregroundBounds.width * 0.45, foregroundBounds.height * 0.08, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.restore();
  }
  const { canvas: graded, context } = surface(Math.max(1, Math.round(foregroundBounds.width)), Math.max(1, Math.round(foregroundBounds.height)));
  context.drawImage(fg, 0, 0, graded.width, graded.height);
  const image = context.getImageData(0, 0, graded.width, graded.height);
  const gain = kelvinToRgbMultipliers(params.colorTempKelvin);
  const tint = [1, 3, 5].map(offset => parseInt(params.dominantTintHex.slice(offset, offset + 2), 16) / 255);
  const gains = [gain.r, gain.g, gain.b];
  for (let i = 0; i < image.data.length; i += 4) {
    if (!image.data[i + 3]) continue;
    for (let channel = 0; channel < 3; channel++) {
      image.data[i + channel] = clamp(image.data[i + channel] * (1 - amount * 0.65 + gains[channel] * amount * 0.65)
        * (1 - amount * 0.25 + tint[channel] * amount * 0.25), 0, 255);
    }
  }
  context.putImageData(image, 0, 0);
  ctx.save();
  if (params.edgeBleedPx > 0 && amount > 0) {
    ctx.shadowColor = params.dominantTintHex; ctx.shadowBlur = params.edgeBleedPx * 0.5 * amount;
  }
  ctx.drawImage(graded, foregroundBounds.x, foregroundBounds.y, foregroundBounds.width, foregroundBounds.height);
  ctx.restore();
  return canvas.toDataURL('image/png');
}
