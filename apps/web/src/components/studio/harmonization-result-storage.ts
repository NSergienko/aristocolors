import { harmonizationResultSchema, type HarmonizationResult } from '@/lib/studio/harmonization-contract';

const RESULT_ENGINE_VERSION = 2;

function openResults(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('aristocolors-harmonization', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('results');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeHarmonizationResult(projectId: string, result: HarmonizationResult, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const db = await openResults();
  try {
    await new Promise<void>((resolve, reject) => {
      signal?.throwIfAborted();
      const transaction = db.transaction('results', 'readwrite');
      const cancel = () => transaction.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      const cleanUp = () => signal?.removeEventListener('abort', cancel);
      transaction.objectStore('results').put({ engineVersion: RESULT_ENGINE_VERSION, result }, projectId);
      transaction.oncomplete = () => { cleanUp(); resolve(); };
      transaction.onerror = () => { cleanUp(); reject(transaction.error); };
      transaction.onabort = () => { cleanUp(); reject(transaction.error ?? new Error('Result storage was interrupted.')); };
    });
  } finally { db.close(); }
}

export async function loadHarmonizationResult(projectId: string): Promise<HarmonizationResult | null> {
  const db = await openResults();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction('results').objectStore('results').get(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!value || typeof value !== 'object' || !('engineVersion' in value) || value.engineVersion !== RESULT_ENGINE_VERSION ||
        !('result' in value)) return null;
    return harmonizationResultSchema.parse(value.result);
  } finally { db.close(); }
}

export async function clearHarmonizationResult(projectId: string): Promise<void> {
  const db = await openResults();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('results', 'readwrite');
      transaction.objectStore('results').delete(projectId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
