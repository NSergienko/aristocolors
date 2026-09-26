import { pgTable, uuid, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { users } from './users';
import { generations } from './generations';

export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    generationId: uuid('generation_id').references(() => generations.id, {
      onDelete: 'set null',
    }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull().unique(),
    eventType: varchar('event_type', { length: 32 }).notNull(),
    lifecycleStage: varchar('lifecycle_stage', { length: 32 }).notNull(),
    creditsDelta: integer('credits_delta').notNull(),
    gpuDurationMs: integer('gpu_duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_usage_events_user_id').on(table.userId),
    index('idx_usage_events_idempotency').on(table.idempotencyKey),
    index('idx_usage_events_stage').on(table.lifecycleStage),
    index('idx_usage_events_created_at').on(table.createdAt),
  ]
);

export type UsageEvent = InferSelectModel<typeof usageEvents>;
export type NewUsageEvent = InferInsertModel<typeof usageEvents>;
