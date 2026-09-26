import { z } from 'zod';

export const BlendModeSchema = z.enum([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
]);
export type BlendMode = z.infer<typeof BlendModeSchema>;

export const LayerTransformSchema = z.object({
  x: z.number(),
  y: z.number(),
  scaleX: z.number().default(1),
  scaleY: z.number().default(1),
  rotation: z.number().default(0),
  originX: z.enum(['left', 'center', 'right']).default('center'),
  originY: z.enum(['top', 'center', 'bottom']).default('center'),
  matrix: z
    .tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()])
    .optional(),
});
export type LayerTransform = z.infer<typeof LayerTransformSchema>;

export const CanvasDimensionSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  dpi: z.number().int().positive().default(72),
});
export type CanvasDimension = z.infer<typeof CanvasDimensionSchema>;

export const CanvasLayerItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  sourceAssetId: z.string().uuid(),
  maskAssetId: z.string().uuid().nullable().optional(),
  zIndex: z.number().int(),
  isVisible: z.boolean().default(true),
  isLocked: z.boolean().default(false),
  opacity: z.number().min(0).max(1).default(1),
  blendMode: BlendModeSchema.default('normal'),
  transform: LayerTransformSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CanvasLayerItem = z.infer<typeof CanvasLayerItemSchema>;

export const CanvasLayerManifestSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  version: z.number().int().min(1),
  canvas: CanvasDimensionSchema,
  layers: z.array(CanvasLayerItemSchema),
  activeAristoColorsId: z.string().uuid().nullable().optional(),
  checksumSha256: z.string().optional(),
  updatedAt: z.string().datetime().optional(),
});
export type CanvasLayerManifest = z.infer<typeof CanvasLayerManifestSchema>;
