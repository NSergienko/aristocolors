import { pgTable, uuid, varchar, integer, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { CanvasLayerManifest, GenerationProvenance } from '@aristocolors/contracts';
import { projects } from './projects';
import { assets } from './assets';
import { aristocolorsProfiles } from './profiles';

export const generations = pgTable(
  'generations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    aristoColorsId: uuid('aristocolors_id').references(() => aristocolorsProfiles.id, {
      onDelete: 'set null',
    }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull().unique(),
    bullmqJobId: varchar('bullmq_job_id', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    billingStage: varchar('billing_stage', { length: 32 }).notNull().default('reserved'),
    targetProvider: varchar('target_provider', { length: 32 }).notNull().default('sdxl_controlnet'),
    compilerDirectives: jsonb('compiler_directives').notNull(),
    manifestSnapshot: jsonb('manifest_snapshot')
      .$type<CanvasLayerManifest>()
      .notNull(),
    provenance: jsonb('provenance')
      .$type<GenerationProvenance>()
      .notNull()
      .default({} as GenerationProvenance),
    latencyMs: integer('latency_ms'),
    creditsSpent: integer('credits_spent').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_generations_project_id').on(table.projectId),
    index('idx_generations_idempotency').on(table.idempotencyKey),
    index('idx_generations_status').on(table.status),
    index('idx_generations_billing_stage').on(table.billingStage),
    index('idx_generations_created_at').on(table.createdAt),
  ]
);

export type Generation = InferSelectModel<typeof generations>;
export type NewGeneration = InferInsertModel<typeof generations>;

export const generationArtifacts = pgTable(
  'generation_artifacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    generationId: uuid('generation_id')
      .notNull()
      .references(() => generations.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    aspectRatio: varchar('aspect_ratio', { length: 16 }).notNull(),
    formatName: varchar('format_name', { length: 64 }).notNull(),
    isMaster4k: boolean('is_master_4k').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_generation_artifacts_gen_id').on(table.generationId),
    index('idx_generation_artifacts_asset_id').on(table.assetId),
  ]
);

export type GenerationArtifact = InferSelectModel<typeof generationArtifacts>;
export type NewGenerationArtifact = InferInsertModel<typeof generationArtifacts>;
