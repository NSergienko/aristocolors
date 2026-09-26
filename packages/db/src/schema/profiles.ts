import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  vector,
  index,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { DeterministicFeatures, InferredFeatures } from '@aristocolors/contracts';
import { users } from './users';

/**
 * 4. ARISTOCOLORS PROFILES
 * Canonical mathematical style profile containing Level 1 Deterministic Features
 * and Level 2 Inferred Features with confidence and estimator versioning.
 */
export const aristocolorsProfiles = pgTable(
  'aristocolors_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 128 }).notNull(),

    // Canonical Model Metadata
    aristocolorsSchemaVersion: varchar('aristocolors_schema_version', { length: 16 })
      .notNull()
      .default('1.1.0'),
    extractorVersion: varchar('extractor_version', { length: 32 })
      .notNull()
      .default('extractor-v2.1'),
    canonicalModelName: varchar('canonical_model_name', { length: 64 })
      .notNull()
      .default('dinov2_vitl14'),

    // Tier 1: Deterministic Style Features (CIELAB Delta E, Luminance stats, 2D FFT micro-grain)
    deterministicFeatures: jsonb('deterministic_features')
      .$type<DeterministicFeatures>()
      .notNull(),

    // Tier 2: Inferred Features (Spherical Harmonics lighting, surface normals with confidence scores)
    inferredFeatures: jsonb('inferred_features')
      .$type<InferredFeatures>()
      .notNull(),

    isPublic: boolean('is_public').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_aristocolors_user_id').on(table.userId),
    index('idx_aristocolors_canonical_model').on(table.canonicalModelName),
  ]
);

export type AristoColorsProfileRecord = InferSelectModel<typeof aristocolorsProfiles>;
export type NewAristoColorsProfileRecord = InferInsertModel<typeof aristocolorsProfiles>;

/**
 * 4b. ARISTOCOLORS EMBEDDINGS
 * Multi-Model & Dimension-Specific Storage Strategy for pgvector.
 * Supports DINOv2 (1024d), SigLIP (768d), and CLIP (512d) with strictly-typed
 * dimension columns and isolated partial HNSW indexes.
 */
export const aristocolorsEmbeddings = pgTable(
  'aristocolors_embeddings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => aristocolorsProfiles.id, { onDelete: 'cascade' }),
    modelName: varchar('model_name', { length: 64 }).notNull(),
    modelVersion: varchar('model_version', { length: 16 }).notNull(),
    dimension: integer('dimension').notNull(),

    embedding1024: vector('embedding_1024', { dimensions: 1024 }),
    embedding768: vector('embedding_768', { dimensions: 768 }),
    embedding512: vector('embedding_512', { dimensions: 512 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_profile_model_version').on(table.profileId, table.modelName, table.modelVersion),
    check(
      'chk_embedding_dimension',
      sql`(dimension = 1024 AND embedding_1024 IS NOT NULL AND embedding_768 IS NULL AND embedding_512 IS NULL) OR (dimension = 768 AND embedding_768 IS NOT NULL AND embedding_1024 IS NULL AND embedding_512 IS NULL) OR (dimension = 512 AND embedding_512 IS NOT NULL AND embedding_1024 IS NULL AND embedding_768 IS NULL)`
    ),
    index('idx_embeddings_profile_id').on(table.profileId),
    index('idx_embeddings_model_version').on(table.modelName, table.modelVersion),

    index('idx_aristocolors_embedding_1024_hnsw')
      .using('hnsw', table.embedding1024.op('vector_cosine_ops'))
      .where(sql`embedding_1024 IS NOT NULL`),
    index('idx_aristocolors_embedding_768_hnsw')
      .using('hnsw', table.embedding768.op('vector_cosine_ops'))
      .where(sql`embedding_768 IS NOT NULL`),
    index('idx_aristocolors_embedding_512_hnsw')
      .using('hnsw', table.embedding512.op('vector_cosine_ops'))
      .where(sql`embedding_512 IS NOT NULL`),
  ]
);

export type AristoColorsEmbeddingRecordTable = InferSelectModel<typeof aristocolorsEmbeddings>;
export type NewAristoColorsEmbeddingRecordTable = InferInsertModel<typeof aristocolorsEmbeddings>;
