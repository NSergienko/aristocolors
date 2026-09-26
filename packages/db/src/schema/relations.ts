import { relations } from 'drizzle-orm';
import { users, subscriptions } from './users';
import { assets } from './assets';
import { aristocolorsProfiles, aristocolorsEmbeddings } from './profiles';
import { projects, projectVersions, canvasLayers } from './projects';
import { generations, generationArtifacts } from './generations';
import { usageEvents } from './billing';

export const usersRelations = relations(users, ({ one, many }) => ({
  avatar: one(assets, {
    fields: [users.avatarAssetId],
    references: [assets.id],
  }),
  subscriptions: many(subscriptions),
  assets: many(assets),
  projects: many(projects),
  profiles: many(aristocolorsProfiles),
  usageEvents: many(usageEvents),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

export const assetsRelations = relations(assets, ({ one, many }) => ({
  user: one(users, {
    fields: [assets.userId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [assets.projectId],
    references: [projects.id],
  }),
  artifacts: many(generationArtifacts),
}));

export const aristocolorsProfilesRelations = relations(aristocolorsProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [aristocolorsProfiles.userId],
    references: [users.id],
  }),
  embeddings: many(aristocolorsEmbeddings),
  projects: many(projects),
  generations: many(generations),
}));

export const aristocolorsEmbeddingsRelations = relations(aristocolorsEmbeddings, ({ one }) => ({
  profile: one(aristocolorsProfiles, {
    fields: [aristocolorsEmbeddings.profileId],
    references: [aristocolorsProfiles.id],
  }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  activeAristoColors: one(aristocolorsProfiles, {
    fields: [projects.activeAristoColorsId],
    references: [aristocolorsProfiles.id],
  }),
  thumbnailAsset: one(assets, {
    fields: [projects.thumbnailAssetId],
    references: [assets.id],
  }),
  versions: many(projectVersions),
  layers: many(canvasLayers),
  generations: many(generations),
}));

export const projectVersionsRelations = relations(projectVersions, ({ one }) => ({
  project: one(projects, {
    fields: [projectVersions.projectId],
    references: [projects.id],
  }),
}));

export const canvasLayersRelations = relations(canvasLayers, ({ one }) => ({
  project: one(projects, {
    fields: [canvasLayers.projectId],
    references: [projects.id],
  }),
  sourceAsset: one(assets, {
    fields: [canvasLayers.sourceAssetId],
    references: [assets.id],
  }),
  maskAsset: one(assets, {
    fields: [canvasLayers.maskAssetId],
    references: [assets.id],
  }),
}));

export const generationsRelations = relations(generations, ({ one, many }) => ({
  project: one(projects, {
    fields: [generations.projectId],
    references: [projects.id],
  }),
  aristoColors: one(aristocolorsProfiles, {
    fields: [generations.aristoColorsId],
    references: [aristocolorsProfiles.id],
  }),
  artifacts: many(generationArtifacts),
  usageEvents: many(usageEvents),
}));

export const generationArtifactsRelations = relations(generationArtifacts, ({ one }) => ({
  generation: one(generations, {
    fields: [generationArtifacts.generationId],
    references: [generations.id],
  }),
  asset: one(assets, {
    fields: [generationArtifacts.assetId],
    references: [assets.id],
  }),
}));

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
  user: one(users, {
    fields: [usageEvents.userId],
    references: [users.id],
  }),
  generation: one(generations, {
    fields: [usageEvents.generationId],
    references: [generations.id],
  }),
}));
