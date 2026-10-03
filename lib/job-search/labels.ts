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

/** Etiquetas visibles, todas en castellano. Los valores internos (enums) no cambian. */

export const STATUS_LABEL: Record<OpportunityStatus, string> = {
  discovered: "Nueva",
  researching: "Investigando",
  qualified: "Cualificada",
  networking: "Buscando contactos",
  referral_requested: "Recomendación pedida",
  referral_received: "Recomendación recibida",
  ready_to_apply: "Lista para aplicar",
  applied: "Aplicada",
  recruiter_screen: "Llamada con reclutador",
  interview: "Entrevista",
  technical: "Técnica / caso práctico",
  final_interview: "Entrevista final",
  offer: "Oferta",
  rejected: "Descartado por la empresa",
  ghosted: "Sin respuesta",
  withdrawn: "Me retiré",
  archived: "Archivada",
};

export const PRIORITY_LABEL: Record<Priority, string> = { high: "Alta", medium: "Media", low: "Baja" };

export const WORKPLACE_LABEL: Record<Workplace, string> = { remote: "Remoto", hybrid: "Híbrido", onsite: "Presencial" };

export const SOURCE_LABEL: Record<Source, string> = {
  linkedin: "LinkedIn",
  company_website: "Web de la empresa",
  recruiter: "Reclutador",
  referral: "Recomendación",
  networking: "Red de contactos",
  job_board: "Portal de empleo",
  wellfound: "Wellfound",
  welcome_to_the_jungle: "Welcome to the Jungle",
  community: "Comunidad",
  friend: "Amistad",
  other: "Otra",
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  offer: "Oferta recibida",
  accepted: "Oferta aceptada",
  declined: "Oferta rechazada",
  rejected: "Descartado por la empresa",
  ghosted: "Sin respuesta",
  withdrawn: "Me retiré",
};

export const TIER_LABEL: Record<CompanyTier, string> = { a: "Categoría A", b: "Categoría B", c: "Categoría C" };

export const CONTACT_KIND_LABEL: Record<ContactKind, string> = {
  recruiter: "Reclutador/a",
  hiring_manager: "Responsable de contratación",
  employee: "Empleado/a",
  referral: "Puede recomendarme",
  founder: "Fundador/a",
  former_colleague: "Excompañero/a",
  friend: "Amistad",
  other: "Otro",
};

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  to_contact: "Por contactar",
  contacted: "Contactado",
  in_conversation: "En conversación",
  no_response: "Sin respuesta",
  closed: "Cerrado",
};

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  apply: "Aplicar",
  research: "Investigar",
  contact: "Contactar",
  follow_up: "Seguimiento",
  prepare_interview: "Preparar entrevista",
  send_thank_you: "Enviar agradecimiento",
  ask_referral: "Pedir recomendación",
  update_cv: "Actualizar CV",
  update_portfolio: "Actualizar portfolio",
  other: "Otra",
};

export const INTERVIEW_KIND_LABEL: Record<InterviewKind, string> = {
  recruiter_screen: "Llamada con reclutador",
  hiring_manager: "Responsable de contratación",
  technical: "Técnica",
  portfolio_review: "Revisión de portfolio",
  case_study: "Caso práctico",
  take_home: "Prueba para casa",
  behavioral: "Competencias",
  panel: "Panel",
  final: "Final",
  other: "Otra",
};

export const INTERVIEW_FORMAT_LABEL: Record<InterviewFormat, string> = {
  video: "Videollamada",
  phone: "Teléfono",
  onsite: "Presencial",
  async: "Asíncrona",
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
  recruiter_contacted: "Reclutador contactado",
  reply: "Respuesta recibida",
  referral_requested: "Recomendación pedida",
  referral_received: "Recomendación recibida",
  interview_scheduled: "Entrevista programada",
  interview_completed: "Entrevista hecha",
  follow_up: "Seguimiento",
  rejection: "Descarte",
  offer: "Oferta",
  note: "Nota",
  contact_created: "Contacto creado",
  contact_interaction: "Mensaje con contacto",
  task_completed: "Tarea completada",
  document_used: "Documento enviado",
};

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  cv: "CV",
  cover_letter: "Carta de presentación",
  portfolio: "Portfolio",
  case_study: "Caso de estudio",
  reference: "Referencia",
  other: "Otro",
};

export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  requested: "Pedida",
  received: "Recibida",
  declined: "Rechazada",
  no_response: "Sin respuesta",
};

export const SENIORITY_LABEL: Record<Seniority, string> = {
  intern: "Prácticas",
  junior: "Junior",
  mid: "Intermedio",
  senior: "Senior",
  staff: "Staff",
  lead: "Lead",
  principal: "Principal",
  manager: "Manager",
  director: "Dirección",
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
