import { z } from 'zod';

const image = z.string().max(12_000_000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/);
const hex = z.string().regex(/^#[a-fA-F0-9]{6}$/);
export const harmonizationRequestSchema = z.object({
  projectId: z.string().trim().min(1).max(200),
  compositeImage: image, backgroundImage: image, foregroundImage: image,
  intensity: z.number().min(0).max(100), aspectRatio: z.enum(['9:16', '1:1', '16:9']),
  telemetry: z.object({
    lighting: z.object({ azimuth: z.number().min(0).max(360).nullable(), elevation: z.number().min(0).max(90).nullable(),
      highlightTint: hex, kelvin: z.number().min(2000).max(12500).nullable(), confidence: z.number().min(0).max(100) }),
    palette: z.array(z.object({ hex, lab: z.tuple([z.number().min(0).max(100), z.number().min(-150).max(150), z.number().min(-150).max(150)]), percentage: z.number().min(0).max(100) })).min(1).max(5),
    dominantHex: hex,
  }),
});
export type HarmonizationRequest = z.infer<typeof harmonizationRequestSchema>;
export const refinementSchema = z.object({ contactShadow: z.number().min(0).max(100), edgeFeather: z.number().min(0).max(20), warmth: z.number().min(-50).max(50) });
export type HarmonizationRefinements = z.infer<typeof refinementSchema>;
export const harmonizationResultSchema = z.object({
  success: z.literal(true), resultImageUrl: image,
  review: z.object({ beforeImageUrl: image, backgroundImageUrl: image, foregroundMaskUrl: image,
    backgroundLab: z.tuple([z.number().min(0).max(100), z.number().min(-150).max(150), z.number().min(-150).max(150)]).optional(),
    lightingAzimuth: z.number().min(0).max(360).nullable().optional(),
    refinements: refinementSchema.default({ contactShadow: 0, edgeFeather: 0, warmth: 0 }),
    pixelInputs: z.object({ profileId: z.string().uuid(), foregroundImageUrl: image,
      foregroundBounds: z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().positive(), height: z.number().positive() }) }).optional(),
    refinedImageUrl: image.optional(), acceptedImageUrl: image.optional(), acceptedAt: z.string().datetime().optional() }).optional(),
  audit: z.object({ harmonizedAt: z.string().datetime(), appliedIntensity: z.number().min(0).max(100),
    lightingMatchScore: z.number().min(0).max(100).nullable(), method: z.enum(['photometric-v1', 'pixel-v1']),
    scoreMeaning: z.literal('luminance-statistics-similarity'), width: z.number().int().positive(), height: z.number().int().positive(),
    aspectRatio: z.enum(['9:16', '1:1', '16:9']), processedForegroundPixels: z.number().int().nonnegative() }),
});
export type HarmonizationResult = z.infer<typeof harmonizationResultSchema>;

// Finish and Export share this persisted artifact, never the editable Compose canvas.
export function getAcceptedHarmonizedImage(result: HarmonizationResult | null): string | null {
  return result?.review?.acceptedAt
    ? result.review.acceptedImageUrl ?? result.review.refinedImageUrl ?? null : null;
}
