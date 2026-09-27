import { z } from 'zod';

import { TargetProviderSchema } from './job';

export const DiffusionConditioningDirectivesSchema = z.object({
  provider: z.literal('diffusion_sdxl'),
  positivePrompt: z.string(),
  negativePrompt: z.string(),
  loraTriggers: z.array(z.string()),
  cfgScale: z.number().positive(),
  clipSkip: z.number().int().min(1).max(4),
  controlnetInpaintWeight: z.number().min(0).max(1),
  steps: z.number().int().positive(),
  samplerName: z.string(),
  paletteKeywords: z.array(z.string()),
  lightingPrompt: z.string(),
  texturePrompt: z.string(),
});

export type DiffusionConditioningDirectives = z.infer<typeof DiffusionConditioningDirectivesSchema>;

export const ImagenConditioningDirectivesSchema = z.object({
  provider: z.literal('imagen_3'),
  naturalLanguageAtmosphere: z.string(),
  lightingDirective: z.string(),
  colorPaletteDirective: z.string(),
  textureDirective: z.string(),
  aspectRatio: z.string().optional(),
  safetySettings: z.record(z.string(), z.string()).optional(),
  guidanceScale: z.number().positive().optional(),
  combinedPrompt: z.string(),
});

export type ImagenConditioningDirectives = z.infer<typeof ImagenConditioningDirectivesSchema>;

export const ControlNetDirectivesSchema = z.object({
  provider: z.literal('controlnet_inpaint'),
  preprocessor: z.string(),
  controlnetWeight: z.number().min(0).max(1),
  ipAdapterScale: z.number().min(0).max(1),
  startingControlStep: z.number().min(0).max(1),
  endingControlStep: z.number().min(0).max(1),
  controlMode: z.enum(['balanced', 'controlnet_important', 'prompt_important']),
  maskBlur: z.number().nonnegative(),
});

export type ControlNetDirectives = z.infer<typeof ControlNetDirectivesSchema>;

export const CompiledConditioningDirectivesSchema = z.object({
  compilerVersion: z.string().min(1),
  profileId: z.string().uuid().optional(),
  schemaVersion: z.string().min(1),
  targetProvider: z.union([TargetProviderSchema, z.literal('all')]),
  diffusion: DiffusionConditioningDirectivesSchema.optional(),
  imagen: ImagenConditioningDirectivesSchema.optional(),
  controlnet: ControlNetDirectivesSchema.optional(),
  metadata: z.record(z.string(), z.unknown()),
  compiledAt: z.string().datetime(),
});

export type CompiledConditioningDirectives = z.infer<typeof CompiledConditioningDirectivesSchema>;
