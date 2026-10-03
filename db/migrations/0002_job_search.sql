CREATE TYPE "public"."job_activity_type" AS ENUM('opportunity_created', 'status_changed', 'applied', 'recruiter_contacted', 'reply', 'referral_requested', 'referral_received', 'interview_scheduled', 'interview_completed', 'follow_up', 'rejection', 'offer', 'note', 'contact_created', 'contact_interaction', 'task_completed', 'document_used');--> statement-breakpoint
CREATE TYPE "public"."job_company_tier" AS ENUM('a', 'b', 'c');--> statement-breakpoint
CREATE TYPE "public"."job_contact_kind" AS ENUM('recruiter', 'hiring_manager', 'employee', 'referral', 'founder', 'former_colleague', 'friend', 'other');--> statement-breakpoint
CREATE TYPE "public"."job_contact_status" AS ENUM('to_contact', 'contacted', 'in_conversation', 'no_response', 'closed');--> statement-breakpoint
CREATE TYPE "public"."job_document_kind" AS ENUM('cv', 'cover_letter', 'portfolio', 'case_study', 'reference', 'other');--> statement-breakpoint
CREATE TYPE "public"."job_interview_format" AS ENUM('video', 'phone', 'onsite', 'async');--> statement-breakpoint
CREATE TYPE "public"."job_interview_kind" AS ENUM('recruiter_screen', 'hiring_manager', 'technical', 'portfolio_review', 'case_study', 'take_home', 'behavioral', 'panel', 'final', 'other');--> statement-breakpoint
CREATE TYPE "public"."job_interview_outcome" AS ENUM('pending', 'passed', 'rejected', 'cancelled', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."job_opportunity_status" AS ENUM('discovered', 'researching', 'qualified', 'networking', 'referral_requested', 'referral_received', 'ready_to_apply', 'applied', 'recruiter_screen', 'interview', 'technical', 'final_interview', 'offer', 'rejected', 'ghosted', 'withdrawn', 'archived');--> statement-breakpoint
CREATE TYPE "public"."job_outcome" AS ENUM('offer', 'accepted', 'declined', 'rejected', 'ghosted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."job_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."job_referral_status" AS ENUM('requested', 'received', 'declined', 'no_response');--> statement-breakpoint
CREATE TYPE "public"."job_seniority" AS ENUM('intern', 'junior', 'mid', 'senior', 'staff', 'lead', 'principal', 'manager', 'director');--> statement-breakpoint
CREATE TYPE "public"."job_source" AS ENUM('linkedin', 'company_website', 'recruiter', 'referral', 'networking', 'job_board', 'wellfound', 'welcome_to_the_jungle', 'community', 'friend', 'other');--> statement-breakpoint
CREATE TYPE "public"."job_task_kind" AS ENUM('apply', 'research', 'contact', 'follow_up', 'prepare_interview', 'send_thank_you', 'ask_referral', 'update_cv', 'update_portfolio', 'other');--> statement-breakpoint
CREATE TYPE "public"."job_task_status" AS ENUM('open', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_workplace" AS ENUM('remote', 'hybrid', 'onsite');--> statement-breakpoint
CREATE TABLE "job_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "job_activity_type" NOT NULL,
	"summary" text NOT NULL,
	"opportunity_id" uuid,
	"contact_id" uuid,
	"company_id" uuid,
	"interview_id" uuid,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tier" "job_company_tier",
	"interest" smallint,
	"website" text,
	"careers_url" text,
	"industry" text,
	"notes" text,
	"next_action" text,
	"next_action_at" date,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_companies_interest_range" CHECK ("job_companies"."interest" IS NULL OR "job_companies"."interest" BETWEEN 1 AND 5),
	CONSTRAINT "job_companies_urls_https" CHECK (("job_companies"."website" IS NULL OR "job_companies"."website" ~ '^https://') AND ("job_companies"."careers_url" IS NULL OR "job_companies"."careers_url" ~ '^https://'))
);
--> statement-breakpoint
CREATE TABLE "job_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company_id" uuid,
	"title" text,
	"kind" "job_contact_kind" DEFAULT 'other' NOT NULL,
	"status" "job_contact_status" DEFAULT 'to_contact' NOT NULL,
	"linkedin_url" text,
	"email" text,
	"phone" text,
	"relationship" text,
	"last_interaction_at" date,
	"next_follow_up_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_contacts_linkedin_https" CHECK ("job_contacts"."linkedin_url" IS NULL OR "job_contacts"."linkedin_url" ~ '^https://')
);
--> statement-breakpoint
CREATE TABLE "job_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "job_document_kind" NOT NULL,
	"name" text NOT NULL,
	"version" text,
	"url" text,
	"content" text,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_documents_url_https" CHECK ("job_documents"."url" IS NULL OR "job_documents"."url" ~ '^https://')
);
--> statement-breakpoint
CREATE TABLE "job_interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"kind" "job_interview_kind" DEFAULT 'other' NOT NULL,
	"round" smallint,
	"interviewer_contact_id" uuid,
	"interviewer_name" text,
	"scheduled_at" timestamp with time zone,
	"timezone" text,
	"duration_minutes" smallint,
	"meeting_url" text,
	"format" "job_interview_format",
	"topics" text,
	"notes" text,
	"outcome" "job_interview_outcome" DEFAULT 'pending' NOT NULL,
	"next_action" text,
	"completed_at" timestamp with time zone,
	"prep_company" text,
	"prep_role" text,
	"prep_interviewer" text,
	"prep_questions" text,
	"prep_answers" text,
	"prep_questions_to_ask" text,
	"prep_checklist" text,
	"star_story_ids" uuid[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_interviews_meeting_https" CHECK ("job_interviews"."meeting_url" IS NULL OR "job_interviews"."meeting_url" ~ '^https://'),
	CONSTRAINT "job_interviews_duration_range" CHECK ("job_interviews"."duration_minutes" IS NULL OR "job_interviews"."duration_minutes" BETWEEN 5 AND 600)
);
--> statement-breakpoint
CREATE TABLE "job_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"body" text NOT NULL,
	"opportunity_id" uuid,
	"contact_id" uuid,
	"company_id" uuid,
	"interview_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"title" text NOT NULL,
	"url" text,
	"description" text,
	"source" "job_source" DEFAULT 'other' NOT NULL,
	"location" text,
	"workplace" "job_workplace",
	"salary_min" integer,
	"salary_max" integer,
	"salary_currency" text,
	"salary_text" text,
	"posted_at" date,
	"discovered_at" date DEFAULT current_date NOT NULL,
	"applied_at" date,
	"deadline" date,
	"offer_deadline" date,
	"status" "job_opportunity_status" DEFAULT 'discovered' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"priority" "job_priority" DEFAULT 'medium' NOT NULL,
	"role_fit" smallint,
	"seniority_fit" smallint,
	"score_override" smallint,
	"score_override_reason" text,
	"next_action" text,
	"next_action_at" date,
	"next_follow_up_at" date,
	"first_response_at" timestamp with time zone,
	"outcome" "job_outcome",
	"closed_at" timestamp with time zone,
	"discard_reason" text,
	"notes" text,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_opportunities_url_https" CHECK ("job_opportunities"."url" IS NULL OR "job_opportunities"."url" ~ '^https://'),
	CONSTRAINT "job_opportunities_fit_range" CHECK (("job_opportunities"."role_fit" IS NULL OR "job_opportunities"."role_fit" BETWEEN 0 AND 5) AND ("job_opportunities"."seniority_fit" IS NULL OR "job_opportunities"."seniority_fit" BETWEEN 0 AND 5)),
	CONSTRAINT "job_opportunities_score_range" CHECK ("job_opportunities"."score_override" IS NULL OR "job_opportunities"."score_override" BETWEEN 0 AND 100),
	CONSTRAINT "job_opportunities_salary_order" CHECK ("job_opportunities"."salary_min" IS NULL OR "job_opportunities"."salary_max" IS NULL OR "job_opportunities"."salary_max" >= "job_opportunities"."salary_min")
);
--> statement-breakpoint
CREATE TABLE "job_opportunity_contacts" (
	"opportunity_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"role" "job_contact_kind" DEFAULT 'other' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_opportunity_contacts_opportunity_id_contact_id_pk" PRIMARY KEY("opportunity_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "job_opportunity_documents" (
	"opportunity_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"used_at" date DEFAULT current_date NOT NULL,
	CONSTRAINT "job_opportunity_documents_opportunity_id_document_id_pk" PRIMARY KEY("opportunity_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "job_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"contact_id" uuid,
	"status" "job_referral_status" DEFAULT 'requested' NOT NULL,
	"requested_at" date DEFAULT current_date NOT NULL,
	"received_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_search_goal" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"start_date" date DEFAULT current_date NOT NULL,
	"duration_days" smallint DEFAULT 30 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"target_roles" text,
	"target_seniority" "job_seniority",
	"min_salary" integer,
	"currency" text,
	"preferred_workplaces" "job_workplace"[] DEFAULT '{}' NOT NULL,
	"preferred_locations" text,
	"extra_skills" text,
	"weekly_application_target" smallint DEFAULT 10 NOT NULL,
	"followup_application_days" smallint DEFAULT 5 NOT NULL,
	"followup_recruiter_days" smallint DEFAULT 3 NOT NULL,
	"followup_referral_days" smallint DEFAULT 4 NOT NULL,
	"stale_days" smallint DEFAULT 7 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_search_goal_singleton" CHECK ("job_search_goal"."id" = 1),
	CONSTRAINT "job_search_goal_duration" CHECK ("job_search_goal"."duration_days" BETWEEN 1 AND 365),
	CONSTRAINT "job_search_goal_rules" CHECK ("job_search_goal"."followup_application_days" BETWEEN 1 AND 60 AND "job_search_goal"."followup_recruiter_days" BETWEEN 1 AND 60 AND "job_search_goal"."followup_referral_days" BETWEEN 1 AND 60 AND "job_search_goal"."stale_days" BETWEEN 1 AND 90)
);
--> statement-breakpoint
CREATE TABLE "job_star_stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"situation" text,
	"task" text,
	"action" text,
	"result" text,
	"tags" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_status_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_status_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"opportunity_id" uuid NOT NULL,
	"from_status" "job_opportunity_status",
	"to_status" "job_opportunity_status" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"kind" "job_task_kind" DEFAULT 'other' NOT NULL,
	"status" "job_task_status" DEFAULT 'open' NOT NULL,
	"priority" "job_priority" DEFAULT 'medium' NOT NULL,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"opportunity_id" uuid,
	"contact_id" uuid,
	"interview_id" uuid,
	"company_id" uuid,
	"origin" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_tasks_done_has_date" CHECK ("job_tasks"."status" <> 'done' OR "job_tasks"."completed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "job_weekly_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"week_start" date NOT NULL,
	"metrics" jsonb NOT NULL,
	"wins" text,
	"blockers" text,
	"focus" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_activities" ADD CONSTRAINT "job_activities_opportunity_id_job_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."job_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_activities" ADD CONSTRAINT "job_activities_contact_id_job_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."job_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_activities" ADD CONSTRAINT "job_activities_company_id_job_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."job_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_activities" ADD CONSTRAINT "job_activities_interview_id_job_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."job_interviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_contacts" ADD CONSTRAINT "job_contacts_company_id_job_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."job_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_interviews" ADD CONSTRAINT "job_interviews_opportunity_id_job_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."job_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_interviews" ADD CONSTRAINT "job_interviews_interviewer_contact_id_job_contacts_id_fk" FOREIGN KEY ("interviewer_contact_id") REFERENCES "public"."job_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_opportunity_id_job_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."job_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_contact_id_job_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."job_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_company_id_job_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."job_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_notes" ADD CONSTRAINT "job_notes_interview_id_job_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."job_interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_opportunities" ADD CONSTRAINT "job_opportunities_company_id_job_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."job_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_opportunity_contacts" ADD CONSTRAINT "job_opportunity_contacts_opportunity_id_job_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."job_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_opportunity_contacts" ADD CONSTRAINT "job_opportunity_contacts_contact_id_job_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."job_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_opportunity_documents" ADD CONSTRAINT "job_opportunity_documents_opportunity_id_job_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."job_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_opportunity_documents" ADD CONSTRAINT "job_opportunity_documents_document_id_job_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."job_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_referrals" ADD CONSTRAINT "job_referrals_opportunity_id_job_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."job_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_referrals" ADD CONSTRAINT "job_referrals_contact_id_job_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."job_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_opportunity_id_job_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."job_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_tasks" ADD CONSTRAINT "job_tasks_opportunity_id_job_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."job_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_tasks" ADD CONSTRAINT "job_tasks_contact_id_job_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."job_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_tasks" ADD CONSTRAINT "job_tasks_interview_id_job_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."job_interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_tasks" ADD CONSTRAINT "job_tasks_company_id_job_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."job_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_activities_opportunity_idx" ON "job_activities" USING btree ("opportunity_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_activities_contact_idx" ON "job_activities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "job_activities_occurred_idx" ON "job_activities" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "job_companies_name_lower_key" ON "job_companies" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "job_contacts_company_idx" ON "job_contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "job_interviews_opportunity_idx" ON "job_interviews" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "job_interviews_scheduled_idx" ON "job_interviews" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "job_notes_opportunity_idx" ON "job_notes" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "job_opportunities_status_idx" ON "job_opportunities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_opportunities_company_idx" ON "job_opportunities" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "job_opportunities_follow_up_idx" ON "job_opportunities" USING btree ("next_follow_up_at");--> statement-breakpoint
CREATE INDEX "job_opportunity_contacts_contact_idx" ON "job_opportunity_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "job_opportunity_documents_document_idx" ON "job_opportunity_documents" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "job_referrals_opportunity_idx" ON "job_referrals" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "job_referrals_contact_idx" ON "job_referrals" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "job_status_history_opportunity_idx" ON "job_status_history" USING btree ("opportunity_id","changed_at");--> statement-breakpoint
CREATE INDEX "job_tasks_status_due_idx" ON "job_tasks" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "job_tasks_opportunity_idx" ON "job_tasks" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "job_tasks_contact_idx" ON "job_tasks" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_weekly_reviews_week_key" ON "job_weekly_reviews" USING btree ("week_start");