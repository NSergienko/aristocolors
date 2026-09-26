import {
  AristoColorsProfileSchema,
  AristoColorsEmbeddingRecordSchema,
  SupportedEmbeddingDimensionSchema,
  CanvasLayerManifestSchema,
  GenerationJobPayloadSchema,
  CreditLifecycleStageSchema,
  EntitlementsPolicySchema,
  STANDARD_TIER_ENTITLEMENTS,
  PRO_TIER_ENTITLEMENTS,
  PythonMlRuntimeHealthSchema,
  PythonMlRpcRequestSchema,
  PythonMlRpcResponseSchema,
} from '../src';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('--- Starting AristoColors Contracts Invariant Verification ---');

// 1. Embedding Dimension & Vector Invariants
console.log('1. Verifying Embedding Dimension & Multi-Model Invariants...');
assert(SupportedEmbeddingDimensionSchema.safeParse(1024).success, '1024 must be valid');
assert(SupportedEmbeddingDimensionSchema.safeParse(768).success, '768 must be valid');
assert(SupportedEmbeddingDimensionSchema.safeParse(512).success, '512 must be valid');
assert(!SupportedEmbeddingDimensionSchema.safeParse(256).success, '256 must be rejected');
assert(!SupportedEmbeddingDimensionSchema.safeParse(1000).success, '1000 must be rejected');

const valid512 = AristoColorsEmbeddingRecordSchema.safeParse({
  profileId: '9f83a2c1-71b9-49e8-8b31-000000000001',
  modelName: 'clip_vith14',
  modelVersion: 'v1.0',
  dimension: 512,
  vector: new Array(512).fill(0.01),
});
assert(valid512.success, 'Valid 512d record must parse successfully');

const invalidLength = AristoColorsEmbeddingRecordSchema.safeParse({
  profileId: '9f83a2c1-71b9-49e8-8b31-000000000001',
  modelName: 'clip_vith14',
  modelVersion: 'v1.0',
  dimension: 512,
  vector: new Array(768).fill(0.01),
});
assert(!invalidLength.success, 'Vector length mismatch must be rejected by schema refinement');

// 2. Credit Lifecycle Invariants
console.log('2. Verifying Credit Lifecycle Invariants...');
assert(CreditLifecycleStageSchema.safeParse('reserve').success, "'reserve' must be valid");
assert(CreditLifecycleStageSchema.safeParse('settle').success, "'settle' must be valid");
assert(CreditLifecycleStageSchema.safeParse('refund').success, "'refund' must be valid");
assert(!CreditLifecycleStageSchema.safeParse('charge').success, "'charge' must be rejected");
assert(!CreditLifecycleStageSchema.safeParse('pending').success, "'pending' must be rejected");

// 3. AristoColorsProfile Structure
console.log('3. Verifying AristoColorsProfile Structure...');
const validProfile = AristoColorsProfileSchema.safeParse({
  schemaVersion: '1.2.0',
  extractorVersion: 'extractor_v1.2',
  canonicalModelName: 'dinov2_vitl14',
  deterministicFeatures: {
    palette: [
      { hex: '#1A243B', weight: 0.45, lab: { l: 15.2, a: 2.1, b: -18.4 }, name: 'Deep Midnight' },
      { hex: '#E29D47', weight: 0.35, lab: { l: 68.4, a: 18.2, b: 54.1 }, name: 'Amber Glow' },
    ],
    luminanceStats: { mean: 98.4, stdDev: 34.2, skewness: -0.15 },
    textureAnalysis: {
      grainType: 'fine_micro_grain',
      fftRadialEnergy: 142.8,
      edgeBleedRadiusPx: 8.5,
      laplacianNoiseVariance: 12.4,
    },
  },
  inferredFeatures: {
    lighting: {
      azimuthDeg: -45.0,
      elevationDeg: 35.0,
      colorTempKelvin: 4200,
      intensity: 0.92,
      contrastRatio: '8.4:1',
      ambientFillRatio: '0.25',
      confidence: 0.88,
      estimatorVersion: 'sh_estimator_v1.4',
    },
    surfaceNormals: {
      dominantFacing: 'front',
      roughnessScore: 0.32,
      confidence: 0.84,
      estimatorVersion: 'sn_estimator_v1.1',
    },
  },
});
assert(validProfile.success, 'Valid profile must parse cleanly');

// 4. CanvasLayerManifest
console.log('4. Verifying CanvasLayerManifest Serialization...');
const validManifest = CanvasLayerManifestSchema.safeParse({
  id: '00000000-0000-4000-8000-000000000001',
  projectId: '00000000-0000-4000-8000-000000000002',
  version: 1,
  canvas: { width: 1920, height: 1080, dpi: 72 },
  layers: [
    {
      id: '00000000-0000-4000-8000-000000000003',
      name: 'Background Environment',
      sourceAssetId: '00000000-0000-4000-8000-000000000004',
      zIndex: 0,
      isVisible: true,
      isLocked: false,
      opacity: 1.0,
      blendMode: 'normal',
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        originX: 'center',
        originY: 'center',
      },
    },
  ],
});
assert(validManifest.success, 'Valid manifest must parse cleanly');

// 5. GenerationJobPayload
console.log('5. Verifying GenerationJobPayload & Provenance...');
const validJob = GenerationJobPayloadSchema.safeParse({
  idempotencyKey: '00000000-0000-4000-8000-000000000010',
  jobId: 'bull_job_12345',
  projectId: '00000000-0000-4000-8000-000000000002',
  userId: '00000000-0000-4000-8000-000000000020',
  aristoColorsId: '00000000-0000-4000-8000-000000000030',
  targetProvider: 'diffusion_sdxl',
  resolution: '2048x2048',
  harmonizationIntensity: 0.85,
  seed: 4291823,
  creditReservationId: '00000000-0000-4000-8000-000000000040',
  priority: 1,
  manifestSnapshot: validManifest.data,
  provenance: {
    manifestVersion: 1,
    manifestChecksumSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    compilerVersion: 'v1.1',
    profileVersion: '1.2.0',
    sourceAssetChecksums: {
      '00000000-0000-4000-8000-000000000004':
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    seed: 4291823,
    targetProvider: 'diffusion_sdxl',
    resolution: '2048x2048',
    createdAt: new Date().toISOString(),
  },
});
assert(validJob.success, 'Valid generation job payload must parse cleanly');

const missingIdempotency = GenerationJobPayloadSchema.safeParse({
  ...validJob.data,
  idempotencyKey: 'not-a-uuid',
});
assert(!missingIdempotency.success, 'Invalid idempotency key must be rejected');

// 6. Entitlements
console.log('6. Verifying EntitlementsPolicy Invariants...');
assert(
  EntitlementsPolicySchema.safeParse(STANDARD_TIER_ENTITLEMENTS).success,
  'Standard tier must parse',
);
assert(
  EntitlementsPolicySchema.safeParse(PRO_TIER_ENTITLEMENTS).success,
  'Pro tier must parse',
);
assert(
  PRO_TIER_ENTITLEMENTS.queuePriority < STANDARD_TIER_ENTITLEMENTS.queuePriority,
  'Pro tier must have higher priority (lower integer)',
);
assert(
  PRO_TIER_ENTITLEMENTS.allowCommercial4KUpscale === true,
  'Pro tier must permit 4K commercial upscale',
);

// 7. Node.js Dispatcher -> Python ML Runtime RPC Invariants
console.log('7. Verifying Python ML Runtime RPC Schemas...');
const validHealth = PythonMlRuntimeHealthSchema.safeParse({
  status: 'ok',
  runtime: 'python-3.11',
  stateless: true,
  consumesBullmq: false,
  architectureBoundary: 'Node.js 22 Dispatcher -> Python 3.11 ML Runtime (RPC HTTP/gRPC)',
  gpuAvailable: true,
  gpuDevice: 'NVIDIA RTX 4090',
  version: '0.1.0',
});
assert(validHealth.success, 'Valid Python ML Runtime health response must parse cleanly');

const invalidHealthQueue = PythonMlRuntimeHealthSchema.safeParse({
  ...validHealth.data,
  consumesBullmq: true,
});
assert(
  !invalidHealthQueue.success,
  'Python ML Runtime claiming to consume BullMQ directly must be rejected',
);

const validRpcReq = PythonMlRpcRequestSchema.safeParse({
  taskId: 'task_abc_123',
  idempotencyKey: '00000000-0000-4000-8000-000000000010',
  taskType: 'render_photobash',
  payload: validJob.data,
  timeoutMs: 30000,
});
assert(validRpcReq.success, 'Valid RPC request wrapping generation job payload must parse cleanly');

const validRpcResp = PythonMlRpcResponseSchema.safeParse({
  taskId: 'task_abc_123',
  status: 'completed',
  result: { renderKey: 'assets/renders/user/gen/1x1.png' },
  error: null,
  executionTimeMs: 142.5,
});
assert(validRpcResp.success, 'Valid RPC response must parse cleanly');

console.log('--- All AristoColors Contracts Invariants Verified Successfully! ---');
