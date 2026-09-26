import { z } from 'zod';

export const CreditLifecycleStageSchema = z.enum(['reserve', 'settle', 'refund']);
export type CreditLifecycleStage = z.infer<typeof CreditLifecycleStageSchema>;

export const CreditReservationStatusSchema = z.enum(['reserved', 'settled', 'refunded']);
export type CreditReservationStatus = z.infer<typeof CreditReservationStatusSchema>;

export const CreditLifecycleEventPayloadSchema = z.object({
  idempotencyKey: z.string().uuid(),
  userId: z.string().uuid(),
  generationId: z.string().uuid(),
  creditReservationId: z.string().uuid(),
  stage: CreditLifecycleStageSchema,
  credits: z.number().int().positive(),
  actualGpuDurationMs: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type CreditLifecycleEventPayload = z.infer<typeof CreditLifecycleEventPayloadSchema>;
