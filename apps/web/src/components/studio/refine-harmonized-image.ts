import type { HarmonizationRefinements } from '@/lib/studio/harmonization-contract';

export function refineHarmonizedImage(after: ImageData, background: ImageData, mask: HTMLCanvasElement, values: HarmonizationRefinements, backgroundLab: [number, number, number] = [50, 0, 0]): string {
  // Convert the background's CIELAB chroma at neutral lightness into an RGB tint (D65).
  const inverse = (value: number) => value ** 3 > 216 / 24389 ? value ** 3 : (116 * value - 16) / (24389 / 27);
  const fy = (50 + 16) / 116;
  const x = 0.95047 * inverse(fy + backgroundLab[1] / 500), y = inverse(fy), z = 1.08883 * inverse(fy - backgroundLab[2] / 200);
  const tint = [3.2404542 * x - 1.5371385 * y - 0.4985314 * z, -0.969266 * x + 1.8760108 * y + 0.041556 * z, 0.0556434 * x - 0.2040259 * y + 1.0572252 * z]
    .map(value => Math.max(0, Math.min(255, (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055) * 255)));
  const tintMean = (tint[0] + tint[1] + tint[2]) / 3;
  const { width, height } = after;
  const surface = () => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas; };
  const output = surface(), blurred = surface(), shadowSource = surface(), shadows = surface();
  const context = output.getContext('2d'), maskContext = mask.getContext('2d'), blurContext = blurred.getContext('2d');
  const shadowContext = shadowSource.getContext('2d'), shadowsContext = shadows.getContext('2d');
  if (!context || !maskContext || !blurContext || !shadowContext || !shadowsContext) throw new Error('Unable to refine the composition.');
  const alpha = maskContext.getImageData(0, 0, width, height).data;
  blurContext.filter = `blur(${values.edgeFeather}px)`;
  blurContext.drawImage(mask, 0, 0);
  const feather = blurContext.getImageData(0, 0, width, height).data;
  // Deterministic contact shadows follow the lower silhouette edges of imported objects.
  const radius = Math.max(2, Math.round(Math.min(width, height) * 0.006));
  shadowContext.fillStyle = '#000';
  if (values.contactShadow > 0) {
    for (let y = 0; y < height - 1; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (alpha[i + 3] > 128 && alpha[i + width * 4 + 3] <= 128) shadowContext.fillRect(x, y + 1, 1, radius);
    }
  }
  shadowsContext.filter = `blur(${radius}px)`;
  shadowsContext.drawImage(shadowSource, 0, 0);
  const shadow = shadowsContext.getImageData(0, 0, width, height).data;
  const pixels = new Uint8ClampedArray(after.data);
  for (let i = 0; i < pixels.length; i += 4) {
    const coverage = alpha[i + 3] / 255;
    const retained = values.edgeFeather > 0 && coverage > 0 ? Math.min(1, feather[i + 3] / alpha[i + 3]) : 1;
    const shade = shadow[i + 3] / 255 * values.contactShadow / 100 * 0.6 * (1 - coverage);
    for (let channel = 0; channel < 3; channel++) {
      const warmth = coverage * (values.warmth / 50 * 18 * (channel === 0 ? 1 : channel === 2 ? -1 : 0.15) + (tint[channel] - tintMean) * Math.abs(values.warmth / 50) * 0.12);
      const adjusted = Math.max(0, Math.min(255, after.data[i + channel] + warmth));
      pixels[i + channel] = (background.data[i + channel] + (adjusted - background.data[i + channel]) * retained) * (1 - shade);
    }
  }
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  return output.toDataURL('image/png');
}
