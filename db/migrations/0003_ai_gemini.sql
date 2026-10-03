CREATE TYPE "public"."job_lead_status" AS ENUM('new', 'added', 'below_threshold', 'dismissed', 'unreachable');--> statement-breakpoint
ALTER TYPE "public"."job_source" ADD VALUE 'radar' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "ai_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"key_ciphertext" text NOT NULL,
	"key_last4" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"cooldown_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"key_id" uuid,
	"status" text NOT NULL,
	"attempts" smallint DEFAULT 1 NOT NULL,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_runs_status" CHECK ("ai_runs"."status" IN ('ok', 'error'))
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"model_default" text DEFAULT 'gemini-3.8-flash' NOT NULL,
	"model_light" text DEFAULT 'gemini-3.5-flash-lite' NOT NULL,
	"use_search" boolean DEFAULT true NOT NULL,
	"auto_match" boolean DEFAULT true NOT NULL,
	"cv_document_id" uuid,
	"profile_context" text,
	"radar_enabled" boolean DEFAULT false NOT NULL,
	"radar_queries" text,
	"radar_locations" text,
	"radar_excluded_companies" text,
	"radar_min_match" smallint DEFAULT 80 NOT NULL,
	"radar_max_per_run" smallint DEFAULT 8 NOT NULL,
	"radar_max_age_days" smallint DEFAULT 14 NOT NULL,
	"radar_frequency_days" smallint DEFAULT 1 NOT NULL,
	"radar_last_run_at" timestamp with time zone,
	"time_budget_seconds" smallint DEFAULT 240 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_settings_singleton" CHECK ("ai_settings"."id" = 1),
	CONSTRAINT "ai_settings_radar_ranges" CHECK ("ai_settings"."radar_min_match" BETWEEN 0 AND 100 AND "ai_settings"."radar_max_per_run" BETWEEN 1 AND 50 AND "ai_settings"."radar_max_age_days" BETWEEN 1 AND 90 AND "ai_settings"."radar_frequency_days" BETWEEN 1 AND 30 AND "ai_settings"."time_budget_seconds" BETWEEN 20 AND 800)
);
--> statement-breakpoint
CREATE TABLE "job_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"company_name" text,
	"location" text,
	"posted_at" date,
	"snippet" text,
	"status" "job_lead_status" DEFAULT 'new' NOT NULL,
	"match_score" smallint,
	"match" jsonb,
	"run_id" uuid,
	"opportunity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_leads_url_https" CHECK ("job_leads"."url" ~ '^https://'),
	CONSTRAINT "job_leads_score_range" CHECK ("job_leads"."match_score" IS NULL OR "job_leads"."match_score" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "job_radar_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"found" integer DEFAULT 0 NOT NULL,
	"evaluated" integer DEFAULT 0 NOT NULL,
	"added" integer DEFAULT 0 NOT NULL,
	"error" text,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "job_radar_runs_trigger" CHECK ("job_radar_runs"."trigger" IN ('cron', 'manual')),
	CONSTRAINT "job_radar_runs_status" CHECK ("job_radar_runs"."status" IN ('running', 'ok', 'partial', 'error'))
);
--> statement-breakpoint
ALTER TABLE "job_companies" ADD COLUMN "ai_research" jsonb;--> statement-breakpoint
ALTER TABLE "job_companies" ADD COLUMN "ai_research_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_documents" ADD COLUMN "opportunity_id" uuid;--> statement-breakpoint
ALTER TABLE "job_documents" ADD COLUMN "generated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_opportunities" ADD COLUMN "ai_analysis" jsonb;--> statement-breakpoint
ALTER TABLE "job_opportunities" ADD COLUMN "ai_analyzed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_opportunities" ADD COLUMN "ai_match" jsonb;--> statement-breakpoint
ALTER TABLE "job_opportunities" ADD COLUMN "ai_match_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_key_id_ai_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."ai_api_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_cv_document_id_job_documents_id_fk" FOREIGN KEY ("cv_document_id") REFERENCES "public"."job_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_leads" ADD CONSTRAINT "job_leads_run_id_job_radar_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."job_radar_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_leads" ADD CONSTRAINT "job_leads_opportunity_id_job_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."job_opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_runs_created_idx" ON "ai_runs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "job_leads_url_key" ON "job_leads" USING btree ("url");--> statement-breakpoint
CREATE INDEX "job_leads_status_idx" ON "job_leads" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_radar_runs_started_idx" ON "job_radar_runs" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "job_documents" ADD CONSTRAINT "job_documents_opportunity_id_job_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."job_opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_documents_opportunity_idx" ON "job_documents" USING btree ("opportunity_id");