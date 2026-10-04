CREATE TABLE "ai_key_models" (
	"key_id" uuid NOT NULL,
	"model" text NOT NULL,
	"last_request_at" timestamp with time zone,
	"cooldown_until" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_key_models_key_id_model_pk" PRIMARY KEY("key_id","model")
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "requests_per_minute" smallint DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "model_fallback" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_key_models" ADD CONSTRAINT "ai_key_models_key_id_ai_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."ai_api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_rpm_range" CHECK ("ai_settings"."requests_per_minute" BETWEEN 1 AND 120);