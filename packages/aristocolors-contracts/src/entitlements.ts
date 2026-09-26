import { z } from 'zod';

export const SubscriptionTierSchema = z.enum(['free', 'standard', 'pro', 'studio']);
export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;

export const MaxResolutionSchema = z.enum(['1024x1024', '2048x2048', '4096x4096']);
export type MaxResolution = z.infer<typeof MaxResolutionSchema>;

export const EntitlementsPolicySchema = z.object({
  tier: SubscriptionTierSchema,
  monthlyCredits: z.number().int().nonnegative(),
  maxQueuedJobs: z.number().int().positive(),
  maxRunningJobs: z.number().int().positive(),
  queuePriority: z.number().int().min(1).max(10),
  maxResolution: MaxResolutionSchema,
  allowCommercial4KUpscale: z.boolean(),
  maxCanvasLayers: z.number().int().positive(),
  watermark: z.boolean(),
  aristoColorsProfileLimit: z.union([z.number().int().positive(), z.literal('unlimited')]),
});
export type EntitlementsPolicy = z.infer<typeof EntitlementsPolicySchema>;

export const STANDARD_TIER_ENTITLEMENTS: EntitlementsPolicy = {
  tier: 'standard',
  monthlyCredits: 500,
  maxQueuedJobs: 2,
  maxRunningJobs: 1,
  queuePriority: 5,
  maxResolution: '2048x2048',
  allowCommercial4KUpscale: false,
  maxCanvasLayers: 15,
  watermark: false,
  aristoColorsProfileLimit: 15,
};

export const PRO_TIER_ENTITLEMENTS: EntitlementsPolicy = {
  tier: 'pro',
  monthlyCredits: 2000,
  maxQueuedJobs: 10,
  maxRunningJobs: 3,
  queuePriority: 1,
  maxResolution: '4096x4096',
  allowCommercial4KUpscale: true,
  maxCanvasLayers: 50,
  watermark: false,
  aristoColorsProfileLimit: 'unlimited',
};

export const FREE_TIER_ENTITLEMENTS: EntitlementsPolicy = {
  tier: 'free',
  monthlyCredits: 25,
  maxQueuedJobs: 1,
  maxRunningJobs: 1,
  queuePriority: 9,
  maxResolution: '1024x1024',
  allowCommercial4KUpscale: false,
  maxCanvasLayers: 5,
  watermark: true,
  aristoColorsProfileLimit: 2,
};
