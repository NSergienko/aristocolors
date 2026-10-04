// Boundary-connected magic-wand removal with a dominant perimeter color.
export type SolidBackgroundResult =
  | { success: true; canvas: HTMLCanvasElement }
  | { success: false; reason: 'complex_background' | 'processing_failed' };

export function removeSolidBackground(source: HTMLImageElement): SolidBackgroundResult {
  try {
  const canvas = document.createElement('canvas');
  const width = canvas.width = source.naturalWidth;
  const height = canvas.height = source.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { success: false, reason: 'processing_failed' };
  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const perimeter: number[] = [];
  for (let x = 0; x < width; x++) {
    perimeter.push(x);
    if (height > 1) perimeter.push((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    perimeter.push(y * width);
    if (width > 1) perimeter.push(y * width + width - 1);
  }
  // Quantized histogram finds the backdrop even when the subject occupies a corner.
  // Transparent pixels contribute no RGB vote (their hidden colors are arbitrary).
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  let dominant: { count: number; r: number; g: number; b: number } | undefined;
  for (const index of perimeter) {
    const offset = index * 4;
    if (data[offset + 3] === 0) continue;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++;
    bucket.r += r; bucket.g += g; bucket.b += b;
    buckets.set(key, bucket);
    if (!dominant || bucket.count > dominant.count) dominant = bucket;
  }
  const tolerance = 35;
  const background = dominant
    ? [dominant.r / dominant.count, dominant.g / dominant.count, dominant.b / dominant.count]
    : undefined;
  const colorDistanceSquared = (index: number) => background
    ? (data[index * 4] - background[0]) ** 2 + (data[index * 4 + 1] - background[1]) ** 2 + (data[index * 4 + 2] - background[2]) ** 2
    : Infinity;
  const count = width * height;
  const seen = new Uint8Array(count);
  const removed = new Uint8Array(count);
  const queue = new Uint32Array(count);
  let head = 0;
  let tail = 0;
  const enqueue = (index: number) => {
    if (seen[index]) return;
    seen[index] = 1;
    if (data[index * 4 + 3] === 0 || colorDistanceSquared(index) <= tolerance ** 2) {
      removed[index] = 1;
      queue[tail++] = index;
    }
  };
  // Seed only the external border; similar colors enclosed inside the subject stay intact.
  perimeter.forEach(enqueue);
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index + width < count) enqueue(index + width);
  }
  for (let index = 0; index < count; index++) {
    const offset = index * 4;
    if (removed[index]) { data[offset + 3] = 0; continue; }
    const x = index % width;
    const boundary = (x > 0 && removed[index - 1]) || (x < width - 1 && removed[index + 1]) ||
      (index >= width && removed[index - width]) || (index + width < count && removed[index + width]);
    if (!boundary || !background) continue;
    // Feather only the first surviving pixel adjacent to the removed backdrop.
    // Strongly contrasting subject edges retain their full opacity.
    const fraction = Math.min(1, Math.max(0, (Math.sqrt(colorDistanceSquared(index)) - tolerance) / tolerance));
    const alpha = fraction * fraction * (3 - 2 * fraction);
    if (alpha > 0 && alpha < 1) {
      // Remove the background color spill from antialiased edge pixels.
      for (let channel = 0; channel < 3; channel++) {
        data[offset + channel] = Math.min(255, Math.max(0, (data[offset + channel] - background[channel] * (1 - alpha)) / alpha));
      }
    }
    data[offset + 3] = Math.round(data[offset + 3] * alpha);
  }
  context.putImageData(image, 0, 0);
  return { success: true, canvas };
  } catch {
    return { success: false, reason: 'processing_failed' };
  }
}
