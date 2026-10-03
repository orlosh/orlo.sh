import type {
  ActivityType,
  CompanyTier,
  ContactKind,
  ContactStatus,
  DocumentKind,
  InterviewFormat,
  InterviewKind,
  InterviewOutcome,
  OpportunityStatus,
  Outcome,
  Priority,
  ReferralStatus,
  Seniority,
  Source,
  TaskKind,
  Workplace,
} from "./enums";
import {
  ACTIVITY_TYPES,
  COMPANY_TIERS,
  CONTACT_KINDS,
  CONTACT_STATUSES,
  DOCUMENT_KINDS,
  INTERVIEW_FORMATS,
  INTERVIEW_KINDS,
  INTERVIEW_OUTCOMES,
  OPPORTUNITY_STATUSES,
  OUTCOMES,
  PRIORITIES,
  REFERRAL_STATUSES,
  SENIORITIES,
  SOURCES,
  TASK_KINDS,
  WORKPLACES,
} from "./enums";

/** Etiquetas visibles. Los nombres de estados, tipos y fuentes siguen la nomenclatura pedida. */

export const STATUS_LABEL: Record<OpportunityStatus, string> = {
  discovered: "Discovered",
  researching: "Researching",
  qualified: "Qualified",
  networking: "Networking",
  referral_requested: "Referral Requested",
  referral_received: "Referral Received",
  ready_to_apply: "Ready to Apply",
  applied: "Applied",
  recruiter_screen: "Recruiter Screen",
  interview: "Interview",
  technical: "Technical / Case",
  final_interview: "Final Interview",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "Ghosted",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

export const PRIORITY_LABEL: Record<Priority, string> = { high: "Alta", medium: "Media", low: "Baja" };

export const WORKPLACE_LABEL: Record<Workplace, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "Onsite" };

export const SOURCE_LABEL: Record<Source, string> = {
  linkedin: "LinkedIn",
  company_website: "Company Website",
  recruiter: "Recruiter",
  referral: "Referral",
  networking: "Networking",
  job_board: "Job Board",
  wellfound: "Wellfound",
  welcome_to_the_jungle: "Welcome to the Jungle",
  community: "Community",
  friend: "Friend",
  other: "Other",
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  offer: "Oferta recibida",
  accepted: "Oferta aceptada",
  declined: "Oferta rechazada",
  rejected: "Rechazado",
  ghosted: "Sin respuesta",
  withdrawn: "Retirado",
};

export const TIER_LABEL: Record<CompanyTier, string> = { a: "Tier A", b: "Tier B", c: "Tier C" };

export const CONTACT_KIND_LABEL: Record<ContactKind, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring Manager",
  employee: "Employee",
  referral: "Referral",
  founder: "Founder",
  former_colleague: "Former colleague",
  friend: "Friend",
  other: "Other",
};

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  to_contact: "Por contactar",
  contacted: "Contactado",
  in_conversation: "En conversación",
  no_response: "Sin respuesta",
  closed: "Cerrado",
};

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  apply: "Apply",
  research: "Research",
  contact: "Contact",
  follow_up: "Follow Up",
  prepare_interview: "Prepare Interview",
  send_thank_you: "Send Thank You",
  ask_referral: "Ask Referral",
  update_cv: "Update CV",
  update_portfolio: "Update Portfolio",
  other: "Other",
};

export const INTERVIEW_KIND_LABEL: Record<InterviewKind, string> = {
  recruiter_screen: "Recruiter Screen",
  hiring_manager: "Hiring Manager",
  technical: "Technical",
  portfolio_review: "Portfolio Review",
  case_study: "Case Study",
  take_home: "Take Home",
  behavioral: "Behavioral",
  panel: "Panel",
  final: "Final",
  other: "Other",
};

export const INTERVIEW_FORMAT_LABEL: Record<InterviewFormat, string> = {
  video: "Videollamada",
  phone: "Teléfono",
  onsite: "Presencial",
  async: "Asíncrono",
};

export const INTERVIEW_OUTCOME_LABEL: Record<InterviewOutcome, string> = {
  pending: "Pendiente",
  passed: "Superada",
  rejected: "No superada",
  cancelled: "Cancelada",
  unknown: "Sin noticias",
};

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  opportunity_created: "Oportunidad creada",
  status_changed: "Cambio de estado",
  applied: "Candidatura enviada",
  recruiter_contacted: "Recruiter contactado",
  reply: "Respuesta recibida",
  referral_requested: "Referral solicitado",
  referral_received: "Referral recibido",
  interview_scheduled: "Entrevista programada",
  interview_completed: "Entrevista completada",
  follow_up: "Follow-up",
  rejection: "Rechazo",
  offer: "Oferta",
  note: "Nota",
  contact_created: "Contacto creado",
  contact_interaction: "Interacción con contacto",
  task_completed: "Tarea completada",
  document_used: "Documento usado",
};

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  cv: "CV",
  cover_letter: "Cover letter",
  portfolio: "Portfolio",
  case_study: "Case study",
  reference: "Referencia",
  other: "Otro",
};

export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  requested: "Solicitado",
  received: "Recibido",
  declined: "Rechazado",
  no_response: "Sin respuesta",
};

export const SENIORITY_LABEL: Record<Seniority, string> = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  staff: "Staff",
  lead: "Lead",
  principal: "Principal",
  manager: "Manager",
  director: "Director",
};

type Option = { value: string; label: string };
const opts = <T extends string>(values: readonly T[], labels: Record<T, string>, empty?: string): Option[] => [
  ...(empty !== undefined ? [{ value: "", label: empty }] : []),
  ...values.map((v) => ({ value: v, label: labels[v] })),
];

/** Opciones listas para <Select>. Con `empty`, la primera opción es "sin valor". */
export const OPTIONS = {
  status: (empty?: string) => opts(OPPORTUNITY_STATUSES, STATUS_LABEL, empty),
  priority: (empty?: string) => opts(PRIORITIES, PRIORITY_LABEL, empty),
  workplace: (empty?: string) => opts(WORKPLACES, WORKPLACE_LABEL, empty),
  source: (empty?: string) => opts(SOURCES, SOURCE_LABEL, empty),
  outcome: (empty?: string) => opts(OUTCOMES, OUTCOME_LABEL, empty),
  tier: (empty?: string) => opts(COMPANY_TIERS, TIER_LABEL, empty),
  contactKind: (empty?: string) => opts(CONTACT_KINDS, CONTACT_KIND_LABEL, empty),
  contactStatus: (empty?: string) => opts(CONTACT_STATUSES, CONTACT_STATUS_LABEL, empty),
  taskKind: (empty?: string) => opts(TASK_KINDS, TASK_KIND_LABEL, empty),
  interviewKind: (empty?: string) => opts(INTERVIEW_KINDS, INTERVIEW_KIND_LABEL, empty),
  interviewFormat: (empty?: string) => opts(INTERVIEW_FORMATS, INTERVIEW_FORMAT_LABEL, empty),
  interviewOutcome: (empty?: string) => opts(INTERVIEW_OUTCOMES, INTERVIEW_OUTCOME_LABEL, empty),
  activity: (empty?: string) => opts(ACTIVITY_TYPES, ACTIVITY_LABEL, empty),
  documentKind: (empty?: string) => opts(DOCUMENT_KINDS, DOCUMENT_KIND_LABEL, empty),
  referralStatus: (empty?: string) => opts(REFERRAL_STATUSES, REFERRAL_STATUS_LABEL, empty),
  seniority: (empty?: string) => opts(SENIORITIES, SENIORITY_LABEL, empty),
};
