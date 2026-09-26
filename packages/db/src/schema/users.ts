import { pgTable, uuid, varchar, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

/**
 * 1. USERS TABLE
 * Core account entity, credit balance, and Stripe customer link.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 128 }).notNull(),
    avatarAssetId: uuid('avatar_asset_id'), // References assets.id
    stripeCustomerId: varchar('stripe_customer_id', { length: 128 }),
    creditsBalance: integer('credits_balance').notNull().default(50),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_users_email').on(table.email),
    index('idx_users_stripe_customer_id').on(table.stripeCustomerId),
  ]
);

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

/**
 * 2. SUBSCRIPTIONS TABLE
 * Dynamic Entitlements: Standard ($10) vs Pro ($25) controlling queue access, concurrency, and priority.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 128 }).notNull().unique(),
    planTier: varchar('plan_tier', { length: 32 }).notNull(), // 'standard' | 'pro'
    status: varchar('status', { length: 32 }).notNull(), // 'active' | 'past_due' | 'canceled'
    maxQueuedJobs: integer('max_queued_jobs').notNull().default(3), // Standard: 3, Pro: 10
    maxRunningJobs: integer('max_running_jobs').notNull().default(1), // Standard: 1, Pro: 3
    queuePriority: integer('queue_priority').notNull().default(5), // Pro: 1 (highest), Standard: 5
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_subscriptions_user_id').on(table.userId),
    index('idx_subscriptions_stripe_id').on(table.stripeSubscriptionId),
  ]
);

export type Subscription = InferSelectModel<typeof subscriptions>;
export type NewSubscription = InferInsertModel<typeof subscriptions>;
