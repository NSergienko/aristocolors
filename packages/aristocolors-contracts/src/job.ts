import { z } from 'zod';
import { CanvasLayerManifestSchema } from './manifest';

export const TargetProviderSchema = z.enum([
  'imagen_3',
  'diffusion_sdxl',
  'flux_1_dev',
  'controlnet_inpaint',
]);
export type TargetProvider = z.infer<typeof TargetProviderSchema>;

export const TargetResolutionSchema = z.enum([
  '1024x1024',
  '1080x1920',
  '1920x1080',
  '2048x2048',
  '3840x2160',
]);
export type TargetResolution = z.infer<typeof TargetResolutionSchema>;

export const GenerationProvenanceSchema = z.object({
  manifestVersion: z.number().int().min(1),
  manifestChecksumSha256: z.string().min(64),
  compilerVersion: z.string().min(1),
  profileVersion: z.string().min(1),
  sourceAssetChecksums: z.record(z.string(), z.string().min(64)),
  seed: z.number().int(),
  targetProvider: TargetProviderSchema,
  resolution: TargetResolutionSchema,
  createdAt: z.string().datetime(),
});
export type GenerationProvenance = z.infer<typeof GenerationProvenanceSchema>;

export const GenerationJobPayloadSchema = z.object({
  idempotencyKey: z.string().uuid('Mandatory idempotencyKey UUIDv4 required'),
  jobId: z.string().min(1),
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  aristoColorsId: z.string().uuid(),
  targetProvider: TargetProviderSchema,
  resolution: TargetResolutionSchema,
  harmonizationIntensity: z.number().min(0).max(1).default(0.85),
  seed: z.number().int(),
  guidanceScale: z.number().positive().optional(),
  steps: z.number().int().positive().optional(),
  creditReservationId: z.string().uuid('Valid reservation UUID required before dispatch'),
  priority: z.number().int().min(1).max(10).default(5),
  manifestSnapshot: CanvasLayerManifestSchema,
  provenance: GenerationProvenanceSchema,
  compilerDirectives: z.record(z.string(), z.unknown()).optional(),
});
export type GenerationJobPayload = z.infer<typeof GenerationJobPayloadSchema>;
