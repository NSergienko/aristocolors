import { z } from 'zod';
import { CanvasLayerManifestSchema } from '@aristocolors/contracts';
const cropSchema = z.object({ top: z.number().min(0).max(100), bottom: z.number().min(0).max(100),
  left: z.number().min(0).max(100), right: z.number().min(0).max(100) })
  .refine(crop => crop.top + crop.bottom <= 100 && crop.left + crop.right <= 100)
  .default({ top: 0, bottom: 0, left: 0, right: 0 });

const valuesSchema = z.object({
  left: z.number().finite(), top: z.number().finite(), scaleX: z.number().finite(), scaleY: z.number().finite(),
  angle: z.number().finite(), opacity: z.number().min(0).max(1), visible: z.boolean(),
  globalCompositeOperation: z.enum(['source-over', 'multiply', 'screen', 'overlay', 'lighten', 'darken']),
  flipX: z.boolean().default(false), flipY: z.boolean().default(false),
});
const manifestSchema = z.object({
  activeAristoColorsId: CanvasLayerManifestSchema.shape.activeAristoColorsId,
  version: z.literal(1), title: z.string(), selectedLayerId: z.string().nullable(),
  width: z.number().positive(), height: z.number().positive(),
  layers: z.array(z.object({
    id: z.string(), name: z.string(), isBase: z.boolean(), zIndex: z.number().int().nonnegative(),
    imageSource: z.instanceof(Blob), originalSource: z.instanceof(Blob), maskSource: z.instanceof(Blob).optional(),
    values: valuesSchema,
    crop: cropSchema,
  })).min(1),
});
export type StoredStudioManifest = z.infer<typeof manifestSchema>;
const canonicalSchema = z.object({
  activeAristoColorsId: CanvasLayerManifestSchema.shape.activeAristoColorsId,
  version: z.literal(2), assetKey: z.string(), title: z.string(), selectedLayerId: z.string().nullable(),
  updatedAt: z.number().nonnegative().optional(),
  width: z.number().positive(), height: z.number().positive(),
  layers: z.array(z.object({
    id: z.string(), name: z.string(), src: z.string(), isBase: z.boolean(),
    x: z.number().finite(), y: z.number().finite(), scaleX: z.number().finite(), scaleY: z.number().finite(),
    rotation: z.number().finite(), zIndex: z.number().int().nonnegative(), opacity: z.number().min(0).max(1),
    blendMode: valuesSchema.shape.globalCompositeOperation, visible: z.boolean(),
    flipX: z.boolean().default(false), flipY: z.boolean().default(false), crop: cropSchema,
  })).min(1),
});

export interface StudioProjectIndex {
  id: string;
  title: string;
  updatedAt: number;
  width: number;
  height: number;
  layersCount: number;
  thumbnailDataUrl?: string;
}

const projectIndexSchema = z.object({
  summary: z.object({
    id: z.string(), updatedAt: z.number().nonnegative(), thumbnailDataUrl: z.string().optional(),
  }),
});

function openStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('aristocolors-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('manifests');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadStudioManifest(key: string): Promise<StoredStudioManifest | null> {
  const json = localStorage.getItem(key);
  let canonical = json ? canonicalSchema.safeParse(JSON.parse(json)).data ?? null : null;
  const db = await openStorage();
  try {
    const store = db.transaction('manifests').objectStore('manifests');
    const index: unknown = await new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (index && typeof index === 'object' && 'canonical' in index) {
      canonical = canonicalSchema.parse(index.canonical);
    }
    if (!canonical) {
      const legacy = manifestSchema.safeParse(index);
      if (legacy.success) return legacy.data;
    }
    const value: unknown = await new Promise((resolve, reject) => {
      const request = store.get(canonical?.assetKey ?? key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (value === undefined) {
      if (canonical) throw new Error('The saved project image payload is missing.');
      return null;
    }
    let manifest = manifestSchema.parse(value);
    const savedCanonical = canonical;
    if (savedCanonical) {
      const assets = new Map(manifest.layers.map(layer => [layer.id, layer]));
      manifest = { ...manifest, activeAristoColorsId: savedCanonical.activeAristoColorsId, title: savedCanonical.title, selectedLayerId: savedCanonical.selectedLayerId,
        width: savedCanonical.width, height: savedCanonical.height,
        layers: savedCanonical.layers.map(layer => {
          const asset = assets.get(layer.id);
          if (!asset || layer.src !== `indexeddb:${savedCanonical.assetKey}:${layer.id}`) throw new Error('A saved layer source is missing.');
          return { ...asset, id: layer.id, name: layer.name, isBase: layer.isBase, zIndex: layer.zIndex, crop: layer.crop,
            values: { left: layer.x, top: layer.y, scaleX: layer.scaleX, scaleY: layer.scaleY,
              angle: layer.rotation, opacity: layer.opacity, globalCompositeOperation: layer.blendMode, visible: layer.visible,
              flipX: layer.flipX, flipY: layer.flipY } };
        }),
      };
    }
    manifest.layers.sort((a, b) => a.zIndex - b.zIndex);
    if (!manifest.layers[0].isBase || manifest.layers.filter(layer => layer.isBase).length !== 1 ||
        new Set(manifest.layers.map(layer => layer.id)).size !== manifest.layers.length) {
      throw new Error('The saved project manifest has an invalid layer stack.');
    }
    return manifest;
  } finally { db.close(); }
}

export async function listStudioProjectIndexes(): Promise<{ key: string; data: StudioProjectIndex }[]> {
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => !!key && /^aristocolors_project_.+_manifest$/.test(key));
  const db = await openStorage();
  try {
    const indexed = await new Promise<Map<string, unknown>>((resolve, reject) => {
      const projects = new Map<string, unknown>();
      const request = db.transaction('manifests').objectStore('manifests').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(projects); return; }
        if (typeof cursor.key === 'string' && /^aristocolors_project_.+_manifest$/.test(cursor.key)) {
          projects.set(cursor.key, cursor.value);
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
    const entries = new Map<string, { id: string; canonical: z.infer<typeof canonicalSchema>; index: unknown }>();
    for (const key of keys) {
      const match = key.match(/^aristocolors_project_(.+)_manifest$/);
      if (!match) continue;
      const json = localStorage.getItem(key);
      const parsedLocal = json ? canonicalSchema.safeParse(JSON.parse(json)) : null;
      const index: unknown = indexed.get(key);
      const indexCanonical = index && typeof index === 'object' && 'canonical' in index
        ? canonicalSchema.safeParse(index.canonical) : null;
      const canonical = indexCanonical?.success ? indexCanonical.data : parsedLocal?.success ? parsedLocal.data : null;
      if (canonical) entries.set(key, { id: match[1], canonical, index });
    }
    for (const [key, index] of indexed) {
      if (entries.has(key) || !index || typeof index !== 'object' || !('canonical' in index)) continue;
      const match = key.match(/^aristocolors_project_(.+)_manifest$/);
      const canonical = canonicalSchema.safeParse(index.canonical);
      if (match && canonical.success) entries.set(key, { id: match[1], canonical: canonical.data, index });
    }
    return Array.from(entries, ([key, entry]) => {
      const parsedIndex = projectIndexSchema.safeParse(entry.index);
      const summary = parsedIndex.success ? parsedIndex.data.summary : undefined;
      return {
        key,
        data: {
          id: summary?.id ?? entry.id,
          title: entry.canonical.title,
          updatedAt: summary?.updatedAt ?? entry.canonical.updatedAt ?? 0,
          width: entry.canonical.width,
          height: entry.canonical.height,
          layersCount: entry.canonical.layers.length,
          thumbnailDataUrl: summary?.thumbnailDataUrl,
        },
      };
    }).sort((left, right) => right.data.updatedAt - left.data.updatedAt);
  } finally { db.close(); }
}

export async function saveStudioManifest(
  key: string,
  manifest: StoredStudioManifest,
  isCurrent: () => boolean,
  summary: { id: string; updatedAt: number; thumbnailDataUrl?: string } = {
    id: key.replace(/^aristocolors_project_(.+)_manifest$/, '$1'), updatedAt: Date.now(),
  }
): Promise<void> {
  const db = await openStorage();
  const assetKey = `${key}:assets:${crypto.randomUUID()}`;
  try {
    if (!isCurrent()) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('manifests', 'readwrite');
      transaction.objectStore('manifests').put(manifest, assetKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving the project was interrupted.'));
    });
    if (!isCurrent()) {
      db.transaction('manifests', 'readwrite').objectStore('manifests').delete(assetKey);
      return;
    }
    const previousJson = localStorage.getItem(key);
    const previous = previousJson ? canonicalSchema.safeParse(JSON.parse(previousJson)) : null;
    const canonical = { version: 2 as const, assetKey, title: manifest.title, updatedAt: summary.updatedAt,
      activeAristoColorsId: manifest.activeAristoColorsId, selectedLayerId: manifest.selectedLayerId,
      width: manifest.width, height: manifest.height,
      layers: manifest.layers.map(layer => ({ id: layer.id, name: layer.name, isBase: layer.isBase,
        src: `indexeddb:${assetKey}:${layer.id}`, x: layer.values.left, y: layer.values.top,
        scaleX: layer.values.scaleX, scaleY: layer.values.scaleY, rotation: layer.values.angle,
        zIndex: layer.zIndex, opacity: layer.values.opacity, blendMode: layer.values.globalCompositeOperation,
        visible: layer.values.visible, flipX: layer.values.flipX, flipY: layer.values.flipY, crop: layer.crop })) };
    try {
      localStorage.setItem(key, JSON.stringify(canonical));
    } catch (cause) {
      if (!cause || typeof cause !== 'object' || !('name' in cause) || cause.name !== 'QuotaExceededError') {
        db.transaction('manifests', 'readwrite').objectStore('manifests').delete(assetKey);
        throw cause;
      }
    }
    db.transaction('manifests', 'readwrite').objectStore('manifests').put({ summary, canonical }, key);
    if (previous?.success) db.transaction('manifests', 'readwrite').objectStore('manifests').delete(previous.data.assetKey);
  } finally { db.close(); }
}

export async function clearStudioManifest(key: string): Promise<void> {
  const json = localStorage.getItem(key);
  const canonical = json ? canonicalSchema.safeParse(JSON.parse(json)) : null;
  const db = await openStorage();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('manifests', 'readwrite');
      const store = transaction.objectStore('manifests');
      store.delete(key); // Remove the legacy manifest as well, so reset cannot restore it on F5.
      if (canonical?.success) store.delete(canonical.data.assetKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Resetting local storage was interrupted.'));
    });
    localStorage.removeItem(key);
  } finally { db.close(); }
}

export function pixelsToPng(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to encode project image pixels.');
  context.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error('Unable to encode the project image as PNG.'));
  }, 'image/png'));
}
