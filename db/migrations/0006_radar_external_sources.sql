ALTER TABLE "ai_settings" ADD COLUMN "url_context_fallback_only" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "adzuna_app_id" text;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "adzuna_key_ciphertext" text;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "adzuna_key_last4" text;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "adzuna_country" text DEFAULT 'es' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "brave_key_ciphertext" text;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "brave_key_last4" text;