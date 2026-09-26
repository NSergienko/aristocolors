import { describe, expect, it } from 'vitest';
import {
  AristoColorsEmbeddingRecordSchema,
  AristoColorsProfileSchema,
  CanvasLayerManifestSchema,
  CreditLifecycleEventPayloadSchema,
  EntitlementsPolicySchema,
  GenerationJobPayloadSchema,
  PRO_TIER_ENTITLEMENTS,
  STANDARD_TIER_ENTITLEMENTS,
} from '../src';

describe('contracts invariants', () => {
  it('rejects embedding dimension/vector mismatch', () => {
    const result = AristoColorsEmbeddingRecordSchema.safeParse({
      embedding_model: 'dinov2_vitl14',
      embedding_version: 'v1.0',
      embedding_dimension: 1024,
      embedding: Array.from({ length: 3 }, () => 0.1),
      extractor_version: 'v1.0',
      style_dna_schema_version: 'v1.0',
    });

    expect(result.success).toBe(false);
  });

  it('accepts valid credit lifecycle payloads', () => {
    const result = CreditLifecycleEventPayloadSchema.safeParse({
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      generationId: '33333333-3333-4333-8333-333333333333',
      creditReservationId: '44444444-4444-4444-8444-444444444444',
      stage: 'reserve',
      credits: 10,
      timestamp: '2025-01-01T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('accepts a valid AristoColorsProfile', () => {
    const result = AristoColorsProfileSchema.safeParse({
      style_dna_schema_version: 'v1.0',
      extractor_version: 'v1.0',
      deterministic_features: {
        palette: [
          { hex: '#112233', lab: { l: 20, a: 0, b: 0 }, weight: 0.4 },
          { hex: '#445566', lab: { l: 40, a: 0, b: 0 }, weight: 0.3 },
          { hex: '#778899', lab: { l: 60, a: 0, b: 0 }, weight: 0.2 },
          { hex: '#aabbcc', lab: { l: 80, a: 0, b: 0 }, weight: 0.07 },
          { hex: '#ddeeff', lab: { l: 95, a: 0, b: 0 }, weight: 0.03 },
        ],
        dominant_facing: 'front',
        luminance_stats: {
          mean_l: 55,
          std_l: 12,
          skewness_l: 0.1,
          contrast_ratio: 2.4,
        },
        texture_analysis: {
          grain_type: 'fine',
          grain_density: 0.42,
          edge_bleed_radius_px: 3.5,
        },
      },
      inferred_features: {
        lighting: {
          azimuth_deg: 120,
          elevation_deg: 35,
          kelvin: 5600,
          fill_ratio: 0.35,
          confidence: 0.92,
          estimator_version: 'v1.0',
        },
        surface_normals: {
          dominant_direction: {
            x: 0.1,
            y: 0.2,
            z: 0.97,
          },
          confidence: 0.88,
          estimator_version: 'v1.0',
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts a valid CanvasLayerManifest', () => {
    const result = CanvasLayerManifestSchema.safeParse({
      projectId: '55555555-5555-4555-8555-555555555555',
      manifestVersionId: '66666666-6666-4666-8666-666666666666',
      width: 2048,
      height: 2048,
      dpi: 300,
      layers: [
        {
          layerId: '77777777-7777-4777-8777-777777777777',
          sourceAssetId: '88888888-8888-4888-8888-888888888888',
          transformMatrix: [1, 0, 0, 1, 0, 0],
          blendMode: 'normal',
          zIndex: 0,
          opacity: 1,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('accepts a valid GenerationJobPayload with idempotency, provenance, and reservation', () => {
    const result = GenerationJobPayloadSchema.safeParse({
      idempotencyKey: '99999999-9999-4999-8999-999999999999',
      jobId: 'job_123',
      projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      aristoColorsId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      targetProvider: 'imagen_3',
      resolution: '2048x2048',
      harmonizationIntensity: 0.85,
      seed: 42,
      creditReservationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      priority: 5,
      manifestSnapshot: {
        projectId: '55555555-5555-4555-8555-555555555555',
        manifestVersionId: '66666666-6666-4666-8666-666666666666',
        width: 2048,
        height: 2048,
        dpi: 300,
        layers: [
          {
            layerId: '77777777-7777-4777-8777-777777777777',
            sourceAssetId: '88888888-8888-4888-8888-888888888888',
            transformMatrix: [1, 0, 0, 1, 0, 0],
            blendMode: 'normal',
            zIndex: 0,
            opacity: 1,
          },
        ],
      },
      provenance: {
        manifestVersion: 1,
        manifestChecksumSha256:
          'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        compilerVersion: 'v1.0',
        profileVersion: 'v1.0',
        sourceAssetChecksums: {
          '88888888-8888-4888-8888-888888888888':
            'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        },
        seed: 42,
        targetProvider: 'imagen_3',
        resolution: '2048x2048',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts Standard and Pro entitlements', () => {
    expect(EntitlementsPolicySchema.safeParse(STANDARD_TIER_ENTITLEMENTS).success).toBe(true);
    expect(EntitlementsPolicySchema.safeParse(PRO_TIER_ENTITLEMENTS).success).toBe(true);
  });
});
