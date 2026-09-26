import { z } from 'zod';

export const GrainTypeSchema = z.enum([
  'fine_micro_grain',
  'medium_painterly',
  'heavy_impasto',
]);
export type GrainType = z.infer<typeof GrainTypeSchema>;

export const DominantFacingSchema = z.enum([
  'front',
  'top_left',
  'top_right',
  'bottom_left',
  'bottom_right',
  'ambient',
]);
export type DominantFacing = z.infer<typeof DominantFacingSchema>;

export const ColorClusterSchema = z.object({
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Hex color must be in #RRGGBB format'),
  weight: z.number().min(0).max(1),
  lab: z.object({
    l: z.number().min(0).max(100),
    a: z.number().min(-128).max(127),
    b: z.number().min(-128).max(127),
  }),
  name: z.string().optional(),
});
export type ColorCluster = z.infer<typeof ColorClusterSchema>;

export const LuminanceStatsSchema = z.object({
  mean: z.number().min(0).max(255),
  stdDev: z.number().min(0),
  skewness: z.number(),
});
export type LuminanceStats = z.infer<typeof LuminanceStatsSchema>;

export const TextureAnalysisSchema = z.object({
  grainType: GrainTypeSchema,
  fftRadialEnergy: z.number().min(0),
  edgeBleedRadiusPx: z.number().min(0).max(100),
  laplacianNoiseVariance: z.number().min(0),
});
export type TextureAnalysis = z.infer<typeof TextureAnalysisSchema>;

export const DeterministicFeaturesSchema = z.object({
  palette: z.array(ColorClusterSchema).min(1).max(12),
  luminanceStats: LuminanceStatsSchema,
  textureAnalysis: TextureAnalysisSchema,
});
export type DeterministicFeatures = z.infer<typeof DeterministicFeaturesSchema>;

export const InferredLightingSchema = z.object({
  azimuthDeg: z.number().min(-180).max(180),
  elevationDeg: z.number().min(0).max(90),
  colorTempKelvin: z.number().positive(),
  intensity: z.number().min(0).max(2),
  contrastRatio: z.string(),
  ambientFillRatio: z.union([z.string(), z.number()]),
  confidence: z.number().min(0).max(1),
  estimatorVersion: z.string().min(1),
});
export type InferredLighting = z.infer<typeof InferredLightingSchema>;

export const InferredSurfaceNormalsSchema = z.object({
  dominantFacing: DominantFacingSchema,
  roughnessScore: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  estimatorVersion: z.string().min(1),
});
export type InferredSurfaceNormals = z.infer<typeof InferredSurfaceNormalsSchema>;

export const InferredFeaturesSchema = z.object({
  lighting: InferredLightingSchema,
  surfaceNormals: InferredSurfaceNormalsSchema.optional(),
});
export type InferredFeatures = z.infer<typeof InferredFeaturesSchema>;

export const AristoColorsProfileSchema = z.object({
  id: z.string().uuid().optional(),
  schemaVersion: z.string().default('1.2.0'),
  extractorVersion: z.string().min(1),
  canonicalModelName: z.string().min(1),
  deterministicFeatures: DeterministicFeaturesSchema,
  inferredFeatures: InferredFeaturesSchema,
  createdAt: z.string().datetime().optional(),
});
export type AristoColorsProfile = z.infer<typeof AristoColorsProfileSchema>;
