export interface ScenePixelData {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface SceneTelemetry {
  palette: { hex: string; lab: number[]; percentage: number }[];
  azimuth: number | null;
  elevation: number | null;
  kelvin: number | null;
  confidence: number;
  kelvinConfidence: number;
  luminanceMean: number;
  luminanceStdDev: number;
  ambientTintHex: string;
  accentHex: string;
}

export interface BackgroundLayerCandidate {
  isBase: boolean;
  object: { visible: boolean; opacity: number };
}

type Color = { rgb: number[]; lab: number[]; weight: number; x: number; y: number; luminance: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function findVisibleBackgroundLayer<T extends BackgroundLayerCandidate>(layers: readonly T[]): T | null {
  const background = layers.find(layer => layer.isBase);
  return background && background.object.visible && background.object.opacity > 0 ? background : null;
}

function xyz(rgb: number[]) {
  const [r, g, b] = rgb.map(value => value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
  return [0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b];
}

export function srgbToCielab(rgb: number[]) {
  const white = [0.95047, 1, 1.08883];
  const [x, y, z] = xyz(rgb).map((value, index) => {
    const ratio = value / white[index];
    return ratio > 216 / 24389 ? Math.cbrt(ratio) : (24389 / 27 * ratio + 16) / 116;
  });
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const distance = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0);

export function fallbackSceneTelemetry(): SceneTelemetry {
  return {
    palette: [{ hex: '#ffffff', lab: [100, 0, 0], percentage: 100 }],
    azimuth: 45,
    elevation: 45,
    kelvin: 5500,
    confidence: 0,
    kelvinConfidence: 0,
    luminanceMean: 1,
    luminanceStdDev: 0,
    ambientTintHex: '#ffffff',
    accentHex: '#ffffff',
  };
}

export function analyzeStyle(image: ScenePixelData | null): SceneTelemetry {
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) ||
      image.width <= 0 || image.height <= 0 || image.data.length < image.width * image.height * 4) {
    return fallbackSceneTelemetry();
  }

  const pixels = image.data;
  const colors: Color[] = [];
  for (let offset = 0; offset < image.width * image.height * 4; offset += 4) {
    const weight = pixels[offset + 3] / 255;
    if (weight <= 0.01) continue;
    const rgb = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
    const index = offset / 4;
    colors.push({ rgb, lab: srgbToCielab(rgb), weight, x: (index % image.width) / image.width,
      y: Math.floor(index / image.width) / image.height, luminance: xyz(rgb)[1] });
  }
  if (!colors.length) return fallbackSceneTelemetry();

  // Fixed farthest-point initialization and fixed iteration count make the palette repeatable.
  const centers = [colors[0].lab];
  while (centers.length < 5) {
    let best = colors[0];
    let maximum = 0;
    for (const color of colors) {
      const score = Math.min(...centers.map(center => distance(color.lab, center)));
      if (score > maximum) { maximum = score; best = color; }
    }
    if (maximum < 1) break;
    centers.push(best.lab);
  }
  let groups = centers.map(() => ({ weight: 0, rgb: [0, 0, 0], lab: [0, 0, 0] }));
  for (let iteration = 0; iteration < 8; iteration++) {
    groups = centers.map(() => ({ weight: 0, rgb: [0, 0, 0], lab: [0, 0, 0] }));
    for (const color of colors) {
      let closest = 0;
      for (let index = 1; index < centers.length; index++) {
        if (distance(color.lab, centers[index]) < distance(color.lab, centers[closest])) closest = index;
      }
      const group = groups[closest];
      group.weight += color.weight;
      for (let channel = 0; channel < 3; channel++) {
        group.rgb[channel] += color.rgb[channel] * color.weight;
        group.lab[channel] += color.lab[channel] * color.weight;
      }
    }
    groups.forEach((group, index) => { if (group.weight) centers[index] = group.lab.map(value => value / group.weight); });
  }
  const total = colors.reduce((sum, color) => sum + color.weight, 0);
  const luminanceMean = colors.reduce((sum, color) => sum + color.luminance * color.weight, 0) / total;
  const luminanceStdDev = Math.sqrt(colors.reduce((sum, color) =>
    sum + (color.luminance - luminanceMean) ** 2 * color.weight, 0) / total);
  const palette = groups.filter(group => group.weight > 0).sort((a, b) => b.weight - a.weight).map(group => ({
    hex: '#' + group.rgb.map(value => Math.round(value / group.weight).toString(16).padStart(2, '0')).join(''),
    lab: group.lab.map(value => value / group.weight), percentage: group.weight / total * 100,
  }));
  const chromaticSwatches = groups.filter(group => group.weight > 0 &&
    Math.hypot(group.lab[1] / group.weight, group.lab[2] / group.weight) > 20)
    .sort((a, b) => b.weight - a.weight);
  const accentHex = chromaticSwatches.length
    ? '#' + chromaticSwatches[0].rgb.map(value => Math.round(value / chromaticSwatches[0].weight).toString(16).padStart(2, '0')).join('')
    : palette[0].hex;
  const average = colors.reduce((sum, color) => sum + color.luminance * color.weight, 0) / total;
  const contrast = Math.sqrt(colors.reduce((sum, color) => sum + (color.luminance - average) ** 2 * color.weight, 0) / total);
  const brightTotal = colors.reduce((sum, color) => sum + color.luminance ** 3 * color.weight, 0);
  const centroid = (axis: 'x' | 'y', bright: boolean) => colors.reduce((sum, color) =>
    sum + color[axis] * color.weight * (bright ? color.luminance ** 3 : 1), 0) / (bright ? brightTotal : total);
  const dx = brightTotal ? centroid('x', true) - centroid('x', false) : 0;
  const dy = brightTotal ? centroid('y', true) - centroid('y', false) : 0;
  const displacement = Math.hypot(dx, dy);
  const directional = contrast > 0.03 && displacement > 0.025;
  const highlights = colors.filter(color => color.luminance > average + contrast &&
    Math.max(...color.rgb) - Math.min(...color.rgb) < 60);
  let kelvin: number | null = null;
  let kelvinConfidence = 0;
  if (highlights.length > 5) {
    const weight = highlights.reduce((sum, color) => sum + color.weight, 0);
    const rgb = [0, 1, 2].map(channel => highlights.reduce((sum, color) => sum + color.rgb[channel] * color.weight, 0) / weight);
    const [x, y, z] = xyz(rgb);
    const n = (x / (x + y + z) - 0.332) / (0.1858 - y / (x + y + z));
    const estimate = 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33;
    if (Number.isFinite(estimate) && estimate >= 2000 && estimate <= 12500) {
      kelvin = Math.round(estimate / 100) * 100;
      const averageChroma = highlights.reduce((sum, color) =>
        sum + (Math.max(...color.rgb) - Math.min(...color.rgb)) * color.weight, 0) / weight;
      kelvinConfidence = clamp((weight - 5) / 27, 0, 1) * clamp(1 - averageChroma / 60, 0, 1);
    }
  }
  // Direction confidence combines contrast and centroid displacement beyond their detection thresholds
  // with alpha-weighted sample support (saturating at 64 pixels). Kelvin confidence combines qualifying
  // highlight support (saturating at 32 pixels beyond the six-pixel minimum) with highlight neutrality.
  const confidence = directional
    ? clamp((contrast - 0.03) / 0.12, 0, 1) *
      clamp((displacement - 0.025) / 0.15, 0, 1) *
      clamp(total / 64, 0, 1)
    : 0;
  return { palette, azimuth: directional ? Math.round((Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360) : null,
    elevation: directional ? Math.round(Math.atan2(Math.max(0, -dy), 0.5) * 180 / Math.PI) : null,
    kelvin, confidence, kelvinConfidence, luminanceMean, luminanceStdDev,
    ambientTintHex: accentHex, accentHex };
}
