import { pgTable, uuid, varchar, text, integer, bigint, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { users } from './users';

/**
 * 3. ASSETS TABLE
 * First-Class Domain Entity for Cloudflare R2 object storage.
 * Stores references, masks, cutouts, background layers, intermediate depth maps, and commercial renders.
 */
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id'), // Self-contained or project-scoped asset
    type: varchar('type', { length: 32 }).notNull(), // 'reference' | 'cutout' | 'background' | 'prop' | 'mask' | 'intermediate_depth' | 'render'
    storageKey: text('storage_key').notNull(), // Object path in Cloudflare R2
    mimeType: varchar('mime_type', { length: 64 }).notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_assets_user_id').on(table.userId),
    index('idx_assets_project_id').on(table.projectId),
    index('idx_assets_type').on(table.type),
    index('idx_assets_checksum').on(table.checksumSha256),
  ]
);

export type Asset = InferSelectModel<typeof assets>;
export type NewAsset = InferInsertModel<typeof assets>;
