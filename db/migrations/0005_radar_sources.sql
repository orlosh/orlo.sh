ALTER TABLE "ai_api_keys" ADD COLUMN "search_blocked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "radar_sources" text[] DEFAULT '{companies,remotive,arbeitnow,google}' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_leads" ADD COLUMN "source" text;