import { pgTable, uuid, varchar, integer, boolean, timestamp, jsonb, index, unique } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { CanvasLayerManifest } from '@aristocolors/contracts';
import { users } from './users';
import { assets } from './assets';
import { aristocolorsProfiles } from './profiles';

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    canvasWidth: integer('canvas_width').notNull().default(1920),
    canvasHeight: integer('canvas_height').notNull().default(1080),
    canvasDpi: integer('canvas_dpi').notNull().default(72),
    activeAristoColorsId: uuid('active_aristocolors_id').references(() => aristocolorsProfiles.id, {
      onDelete: 'set null',
    }),
    thumbnailAssetId: uuid('thumbnail_asset_id').references(() => assets.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_projects_user_id').on(table.userId),
    index('idx_projects_updated_at').on(table.updatedAt),
  ]
);

export type Project = InferSelectModel<typeof projects>;
export type NewProject = InferInsertModel<typeof projects>;

export const projectVersions = pgTable(
  'project_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    layerManifestSnapshot: jsonb('layer_manifest_snapshot')
      .$type<CanvasLayerManifest>()
      .notNull(),
    changeSummary: varchar('change_summary', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_project_version').on(table.projectId, table.versionNumber),
    index('idx_project_versions_lookup').on(table.projectId, table.versionNumber),
  ]
);

export type ProjectVersion = InferSelectModel<typeof projectVersions>;
export type NewProjectVersion = InferInsertModel<typeof projectVersions>;

export const canvasLayers = pgTable(
  'canvas_layers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    zIndex: integer('z_index').notNull().default(0),
    layerType: varchar('layer_type', { length: 32 }).notNull(),
    sourceAssetId: uuid('source_asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    maskAssetId: uuid('mask_asset_id').references(() => assets.id, {
      onDelete: 'set null',
    }),
    transformMatrix: jsonb('transform_matrix').notNull(),
    blendMode: varchar('blend_mode', { length: 32 }).notNull().default('normal'),
    isVisible: boolean('is_visible').notNull().default(true),
    isLocked: boolean('is_locked').notNull().default(false),
  },
  (table) => [
    index('idx_canvas_layers_project_z').on(table.projectId, table.zIndex),
    index('idx_canvas_layers_source_asset').on(table.sourceAssetId),
  ]
);

export type CanvasLayer = InferSelectModel<typeof canvasLayers>;
export type NewCanvasLayer = InferInsertModel<typeof canvasLayers>;
