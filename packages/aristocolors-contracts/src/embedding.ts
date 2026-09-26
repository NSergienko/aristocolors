import { z } from 'zod';

export const SUPPORTED_EMBEDDING_DIMENSIONS = [1024, 768, 512] as const;

export const SupportedEmbeddingDimensionSchema = z.union([
  z.literal(1024),
  z.literal(768),
  z.literal(512),
]);
export type SupportedEmbeddingDimension = z.infer<typeof SupportedEmbeddingDimensionSchema>;

export const CanonicalEmbeddingModelSchema = z.enum([
  'dinov2_vitl14',
  'siglip_so400m',
  'clip_vith14',
]);
export type CanonicalEmbeddingModel = z.infer<typeof CanonicalEmbeddingModelSchema>;

export const AristoColorsEmbeddingRecordBaseSchema = z.object({
  id: z.string().uuid().optional(),
  profileId: z.string().uuid(),
  modelName: z.string().min(1),
  modelVersion: z.string().min(1),
  dimension: SupportedEmbeddingDimensionSchema,
  vector: z.array(z.number()),
  createdAt: z.string().datetime().optional(),
});

export const AristoColorsEmbeddingRecordSchema = AristoColorsEmbeddingRecordBaseSchema.refine(
  (data) => data.vector.length === data.dimension,
  {
    message: 'Vector array length must strictly match the specified dimension (1024, 768, or 512)',
    path: ['vector'],
  }
);
export type AristoColorsEmbeddingRecord = z.infer<typeof AristoColorsEmbeddingRecordSchema>;
