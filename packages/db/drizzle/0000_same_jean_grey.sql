CREATE EXTENSION IF NOT EXISTS "vector";
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_subscription_id" varchar(128) NOT NULL,
	"plan_tier" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"max_queued_jobs" integer DEFAULT 3 NOT NULL,
	"max_running_jobs" integer DEFAULT 1 NOT NULL,
	"queue_priority" integer DEFAULT 5 NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(128) NOT NULL,
	"avatar_asset_id" uuid,
	"stripe_customer_id" varchar(128),
	"credits_balance" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"type" varchar(32) NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" varchar(64) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aristocolors_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"model_name" varchar(64) NOT NULL,
	"model_version" varchar(16) NOT NULL,
	"dimension" integer NOT NULL,
	"embedding_1024" vector(1024),
	"embedding_768" vector(768),
	"embedding_512" vector(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_profile_model_version" UNIQUE("profile_id","model_name","model_version"),
	CONSTRAINT "chk_embedding_dimension" CHECK ((dimension = 1024 AND embedding_1024 IS NOT NULL AND embedding_768 IS NULL AND embedding_512 IS NULL) OR (dimension = 768 AND embedding_768 IS NOT NULL AND embedding_1024 IS NULL AND embedding_512 IS NULL) OR (dimension = 512 AND embedding_512 IS NOT NULL AND embedding_1024 IS NULL AND embedding_768 IS NULL))
);
--> statement-breakpoint
CREATE TABLE "aristocolors_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(128) NOT NULL,
	"aristocolors_schema_version" varchar(16) DEFAULT '1.1.0' NOT NULL,
	"extractor_version" varchar(32) DEFAULT 'extractor-v2.1' NOT NULL,
	"canonical_model_name" varchar(64) DEFAULT 'dinov2_vitl14' NOT NULL,
	"deterministic_features" jsonb NOT NULL,
	"inferred_features" jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvas_layers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"z_index" integer DEFAULT 0 NOT NULL,
	"layer_type" varchar(32) NOT NULL,
	"source_asset_id" uuid NOT NULL,
	"mask_asset_id" uuid,
	"transform_matrix" jsonb NOT NULL,
	"blend_mode" varchar(32) DEFAULT 'normal' NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"layer_manifest_snapshot" jsonb NOT NULL,
	"change_summary" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_project_version" UNIQUE("project_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"canvas_width" integer DEFAULT 1920 NOT NULL,
	"canvas_height" integer DEFAULT 1080 NOT NULL,
	"canvas_dpi" integer DEFAULT 72 NOT NULL,
	"active_aristocolors_id" uuid,
	"thumbnail_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"aspect_ratio" varchar(16) NOT NULL,
	"format_name" varchar(64) NOT NULL,
	"is_master_4k" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"aristocolors_id" uuid,
	"idempotency_key" varchar(128) NOT NULL,
	"bullmq_job_id" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"billing_stage" varchar(32) DEFAULT 'reserved' NOT NULL,
	"target_provider" varchar(32) DEFAULT 'sdxl_controlnet' NOT NULL,
	"compiler_directives" jsonb NOT NULL,
	"manifest_snapshot" jsonb NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"latency_ms" integer,
	"credits_spent" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generations_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"generation_id" uuid,
	"idempotency_key" varchar(128) NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"lifecycle_stage" varchar(32) NOT NULL,
	"credits_delta" integer NOT NULL,
	"gpu_duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aristocolors_embeddings" ADD CONSTRAINT "aristocolors_embeddings_profile_id_aristocolors_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."aristocolors_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aristocolors_profiles" ADD CONSTRAINT "aristocolors_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_layers" ADD CONSTRAINT "canvas_layers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_layers" ADD CONSTRAINT "canvas_layers_source_asset_id_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_layers" ADD CONSTRAINT "canvas_layers_mask_asset_id_assets_id_fk" FOREIGN KEY ("mask_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_active_aristocolors_id_aristocolors_profiles_id_fk" FOREIGN KEY ("active_aristocolors_id") REFERENCES "public"."aristocolors_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_thumbnail_asset_id_assets_id_fk" FOREIGN KEY ("thumbnail_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_artifacts" ADD CONSTRAINT "generation_artifacts_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_artifacts" ADD CONSTRAINT "generation_artifacts_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_aristocolors_id_aristocolors_profiles_id_fk" FOREIGN KEY ("aristocolors_id") REFERENCES "public"."aristocolors_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_subscriptions_user_id" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_stripe_id" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_stripe_customer_id" ON "users" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "idx_assets_user_id" ON "assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_assets_project_id" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_assets_type" ON "assets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_assets_checksum" ON "assets" USING btree ("checksum_sha256");--> statement-breakpoint
CREATE INDEX "idx_embeddings_profile_id" ON "aristocolors_embeddings" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "idx_embeddings_model_version" ON "aristocolors_embeddings" USING btree ("model_name","model_version");--> statement-breakpoint
CREATE INDEX "idx_aristocolors_embedding_1024_hnsw" ON "aristocolors_embeddings" USING hnsw ("embedding_1024" vector_cosine_ops) WHERE embedding_1024 IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_aristocolors_embedding_768_hnsw" ON "aristocolors_embeddings" USING hnsw ("embedding_768" vector_cosine_ops) WHERE embedding_768 IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_aristocolors_embedding_512_hnsw" ON "aristocolors_embeddings" USING hnsw ("embedding_512" vector_cosine_ops) WHERE embedding_512 IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_aristocolors_user_id" ON "aristocolors_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_aristocolors_canonical_model" ON "aristocolors_profiles" USING btree ("canonical_model_name");--> statement-breakpoint
CREATE INDEX "idx_canvas_layers_project_z" ON "canvas_layers" USING btree ("project_id","z_index");--> statement-breakpoint
CREATE INDEX "idx_canvas_layers_source_asset" ON "canvas_layers" USING btree ("source_asset_id");--> statement-breakpoint
CREATE INDEX "idx_project_versions_lookup" ON "project_versions" USING btree ("project_id","version_number");--> statement-breakpoint
CREATE INDEX "idx_projects_user_id" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_projects_updated_at" ON "projects" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_generation_artifacts_gen_id" ON "generation_artifacts" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "idx_generation_artifacts_asset_id" ON "generation_artifacts" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "idx_generations_project_id" ON "generations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_generations_idempotency" ON "generations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_generations_status" ON "generations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_generations_billing_stage" ON "generations" USING btree ("billing_stage");--> statement-breakpoint
CREATE INDEX "idx_generations_created_at" ON "generations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_events_user_id" ON "usage_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_usage_events_idempotency" ON "usage_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_usage_events_stage" ON "usage_events" USING btree ("lifecycle_stage");--> statement-breakpoint
CREATE INDEX "idx_usage_events_created_at" ON "usage_events" USING btree ("created_at");
