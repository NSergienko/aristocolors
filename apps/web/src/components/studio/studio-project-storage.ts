import { z } from 'zod';
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
  version: z.literal(2), assetKey: z.string(), title: z.string(), selectedLayerId: z.string().nullable(),
  width: z.number().positive(), height: z.number().positive(),
  layers: z.array(z.object({
    id: z.string(), name: z.string(), src: z.string(), isBase: z.boolean(),
    x: z.number().finite(), y: z.number().finite(), scaleX: z.number().finite(), scaleY: z.number().finite(),
    rotation: z.number().finite(), zIndex: z.number().int().nonnegative(), opacity: z.number().min(0).max(1),
    blendMode: valuesSchema.shape.globalCompositeOperation, visible: z.boolean(),
    flipX: z.boolean().default(false), flipY: z.boolean().default(false), crop: cropSchema,
  })).min(1),
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
  const canonical = json ? canonicalSchema.parse(JSON.parse(json)) : null;
  const db = await openStorage();
  try {
    const value: unknown = await new Promise((resolve, reject) => {
      const request = db.transaction('manifests').objectStore('manifests').get(canonical?.assetKey ?? key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (value === undefined) {
      if (canonical) throw new Error('The saved project image payload is missing.');
      return null;
    }
    let manifest = manifestSchema.parse(value);
    if (canonical) {
      const assets = new Map(manifest.layers.map(layer => [layer.id, layer]));
      manifest = { ...manifest, title: canonical.title, selectedLayerId: canonical.selectedLayerId,
        width: canonical.width, height: canonical.height,
        layers: canonical.layers.map(layer => {
          const asset = assets.get(layer.id);
          if (!asset || layer.src !== `indexeddb:${canonical.assetKey}:${layer.id}`) throw new Error('A saved layer source is missing.');
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

export async function saveStudioManifest(key: string, manifest: StoredStudioManifest, isCurrent: () => boolean): Promise<void> {
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
    try {
      localStorage.setItem(key, JSON.stringify({ version: 2, assetKey, title: manifest.title,
        selectedLayerId: manifest.selectedLayerId, width: manifest.width, height: manifest.height,
        layers: manifest.layers.map(layer => ({ id: layer.id, name: layer.name, isBase: layer.isBase,
          src: `indexeddb:${assetKey}:${layer.id}`, x: layer.values.left, y: layer.values.top,
          scaleX: layer.values.scaleX, scaleY: layer.values.scaleY, rotation: layer.values.angle,
          zIndex: layer.zIndex, opacity: layer.values.opacity, blendMode: layer.values.globalCompositeOperation,
          visible: layer.values.visible, flipX: layer.values.flipX, flipY: layer.values.flipY, crop: layer.crop })) }));
    } catch (cause) {
      db.transaction('manifests', 'readwrite').objectStore('manifests').delete(assetKey);
      throw cause;
    }
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
