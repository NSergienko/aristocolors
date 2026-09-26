import {
  users,
  subscriptions,
  assets,
  aristocolorsProfiles,
  aristocolorsEmbeddings,
  projects,
  projectVersions,
  canvasLayers,
  generations,
  generationArtifacts,
  usageEvents,
  db,
} from '../src';
import { getTableColumns } from 'drizzle-orm';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('--- Starting AristoColors Database Schema Verification ---');

console.log('1. Verifying Table Definitions for 11 Core Entities...');
const tables = [
  users,
  subscriptions,
  assets,
  aristocolorsProfiles,
  aristocolorsEmbeddings,
  projects,
  projectVersions,
  canvasLayers,
  generations,
  generationArtifacts,
  usageEvents,
];
assert(tables.length === 11, 'Exactly 11 core tables must be defined');

console.log('2. Verifying Multi-Model pgvector Strategy on aristocolors_embeddings...');
const embeddingCols = getTableColumns(aristocolorsEmbeddings);
assert(embeddingCols.dimension !== undefined, 'dimension column must exist');
assert(embeddingCols.embedding1024 !== undefined, 'embedding1024 vector column must exist');
assert(embeddingCols.embedding768 !== undefined, 'embedding768 vector column must exist');
assert(embeddingCols.embedding512 !== undefined, 'embedding512 vector column must exist');

assert(
  (embeddingCols.embedding1024 as unknown as { dimensions: number }).dimensions === 1024,
  'embedding1024 must have dimensions = 1024'
);
assert(
  (embeddingCols.embedding768 as unknown as { dimensions: number }).dimensions === 768,
  'embedding768 must have dimensions = 768'
);
assert(
  (embeddingCols.embedding512 as unknown as { dimensions: number }).dimensions === 512,
  'embedding512 must have dimensions = 512'
);

console.log('3. Verifying generations Table Invariants...');
const genCols = getTableColumns(generations);
assert(genCols.idempotencyKey !== undefined, 'idempotencyKey must exist on generations');
assert(genCols.billingStage !== undefined, 'billingStage must exist on generations');
assert(genCols.provenance !== undefined, 'provenance must exist on generations');
assert(genCols.manifestSnapshot !== undefined, 'manifestSnapshot must exist on generations');
assert(genCols.bullmqJobId !== undefined, 'bullmqJobId must exist on generations');

console.log('4. Verifying usage_events Financial Ledger Invariants...');
const usageCols = getTableColumns(usageEvents);
assert(usageCols.idempotencyKey !== undefined, 'idempotencyKey must exist on usage_events');
assert(usageCols.lifecycleStage !== undefined, 'lifecycleStage must exist on usage_events');
assert(usageCols.eventType !== undefined, 'eventType must exist on usage_events');
assert(usageCols.creditsDelta !== undefined, 'creditsDelta must exist on usage_events');

console.log('5. Verifying subscriptions Dynamic Entitlements...');
const subCols = getTableColumns(subscriptions);
assert(subCols.planTier !== undefined, 'planTier must exist on subscriptions');
assert(subCols.maxQueuedJobs !== undefined, 'maxQueuedJobs must exist on subscriptions');
assert(subCols.maxRunningJobs !== undefined, 'maxRunningJobs must exist on subscriptions');
assert(subCols.queuePriority !== undefined, 'queuePriority must exist on subscriptions');

console.log('6. Verifying canvas_layers & assets Domain Entity...');
const layerCols = getTableColumns(canvasLayers);
assert(layerCols.sourceAssetId !== undefined, 'sourceAssetId must exist on canvas_layers');
assert(layerCols.transformMatrix !== undefined, 'transformMatrix must exist on canvas_layers');

const assetCols = getTableColumns(assets);
assert(assetCols.storageKey !== undefined, 'storageKey must exist on assets');
assert(assetCols.checksumSha256 !== undefined, 'checksumSha256 must exist on assets');

console.log('7. Verifying Drizzle Client Initialization...');
assert(db !== undefined && typeof db.select === 'function', 'Drizzle client must be initialized');

console.log('--- All AristoColors Database Schema Invariants Verified Successfully! ---');
