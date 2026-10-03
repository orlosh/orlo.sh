/**
 * Valores de los enums de Job Search. Sin dependencias: los importan el esquema de la base de
 * datos (por ruta relativa), la validación y los componentes de cliente, con una sola fuente.
 */

/** Orden = progresión del proceso. Las cuatro últimas son estados de cierre, fuera de la escala. */
export const OPPORTUNITY_STATUSES = [
  "discovered",
  "researching",
  "qualified",
  "networking",
  "referral_requested",
  "referral_received",
  "ready_to_apply",
  "applied",
  "recruiter_screen",
  "interview",
  "technical",
  "final_interview",
  "offer",
  "rejected",
  "ghosted",
  "withdrawn",
  "archived",
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const WORKPLACES = ["remote", "hybrid", "onsite"] as const;
export type Workplace = (typeof WORKPLACES)[number];

export const SOURCES = [
  "linkedin",
  "company_website",
  "recruiter",
  "referral",
  "networking",
  "job_board",
  "wellfound",
  "welcome_to_the_jungle",
  "community",
  "friend",
  "other",
] as const;
export type Source = (typeof SOURCES)[number];

export const OUTCOMES = ["offer", "accepted", "declined", "rejected", "ghosted", "withdrawn"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const COMPANY_TIERS = ["a", "b", "c"] as const;
export type CompanyTier = (typeof COMPANY_TIERS)[number];

export const CONTACT_KINDS = [
  "recruiter",
  "hiring_manager",
  "employee",
  "referral",
  "founder",
  "former_colleague",
  "friend",
  "other",
] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const CONTACT_STATUSES = ["to_contact", "contacted", "in_conversation", "no_response", "closed"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];

export const TASK_KINDS = [
  "apply",
  "research",
  "contact",
  "follow_up",
  "prepare_interview",
  "send_thank_you",
  "ask_referral",
  "update_cv",
  "update_portfolio",
  "other",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_STATUSES = ["open", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const INTERVIEW_KINDS = [
  "recruiter_screen",
  "hiring_manager",
  "technical",
  "portfolio_review",
  "case_study",
  "take_home",
  "behavioral",
  "panel",
  "final",
  "other",
] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];

export const INTERVIEW_FORMATS = ["video", "phone", "onsite", "async"] as const;
export type InterviewFormat = (typeof INTERVIEW_FORMATS)[number];

export const INTERVIEW_OUTCOMES = ["pending", "passed", "rejected", "cancelled", "unknown"] as const;
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export const ACTIVITY_TYPES = [
  "opportunity_created",
  "status_changed",
  "applied",
  "recruiter_contacted",
  "reply",
  "referral_requested",
  "referral_received",
  "interview_scheduled",
  "interview_completed",
  "follow_up",
  "rejection",
  "offer",
  "note",
  "contact_created",
  "contact_interaction",
  "task_completed",
  "document_used",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const DOCUMENT_KINDS = ["cv", "cover_letter", "portfolio", "case_study", "reference", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const REFERRAL_STATUSES = ["requested", "received", "declined", "no_response"] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const SENIORITIES = ["intern", "junior", "mid", "senior", "staff", "lead", "principal", "manager", "director"] as const;
export type Seniority = (typeof SENIORITIES)[number];
