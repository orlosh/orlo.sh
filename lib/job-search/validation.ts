import { z } from "zod";
import { isoDate, optional, optionalHttpsUrl, optionalIsoDate, required } from "@/lib/validation/content";
import { isValidTimeZone } from "./dates";
import * as E from "./enums";

/**
 * Contratos de entrada de Job Search. Mismo criterio que lib/validation/content.ts: campo vacío
 * → NULL, URLs solo https, y la base de datos repite las reglas con constraints CHECK.
 */

const optEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.literal(""), z.enum(values)])
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

/** Enum con valor por defecto: un campo ausente del formulario llega como "" y cuenta como vacío. */
const defEnum = <T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), z.enum(values).default(fallback as never)) as unknown as z.ZodDefault<z.ZodEnum<{ [K in T[number]]: K }>>;

const optInt = (min: number, max: number) =>
  z
    .union([z.literal(""), z.coerce.number().int().min(min).max(max)])
    .nullable()
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : v));

const optUuid = z
  .union([z.literal(""), z.uuid()])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

const timezone = z
  .string()
  .trim()
  .max(64)
  .refine((v) => v === "" || isValidTimeZone(v), "Zona horaria IANA no válida (p. ej., Europe/Lisbon)");

const csvText = (max: number) =>
  optional(max).transform((v) =>
    v
      ? v
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .join(", ")
      : null,
  );

/* ----------------------------------------------------------------- objetivo */

export const goalInput = z.object({
  startDate: isoDate,
  durationDays: z.coerce.number().int().min(1).max(365),
  timezone: timezone.transform((v) => v || "UTC"),
  targetRoles: csvText(500),
  targetSeniority: optEnum(E.SENIORITIES),
  minSalary: optInt(0, 10_000_000),
  currency: optional(3).transform((v) => v?.toUpperCase() ?? null),
  preferredWorkplaces: z.array(z.enum(E.WORKPLACES)).max(3).default([]),
  preferredLocations: csvText(500),
  extraSkills: csvText(2_000),
  weeklyApplicationTarget: z.coerce.number().int().min(0).max(200),
  followupApplicationDays: z.coerce.number().int().min(1).max(60),
  followupRecruiterDays: z.coerce.number().int().min(1).max(60),
  followupReferralDays: z.coerce.number().int().min(1).max(60),
  staleDays: z.coerce.number().int().min(1).max(90),
});

/* ----------------------------------------------------------------- empresas */

export const companyInput = z.object({
  name: required(120),
  tier: optEnum(E.COMPANY_TIERS),
  interest: optInt(1, 5),
  website: optionalHttpsUrl,
  careersUrl: optionalHttpsUrl,
  industry: optional(120),
  notes: optional(10_000),
  nextAction: optional(300),
  nextActionAt: optionalIsoDate,
  archived: z.boolean().default(false),
});

/* ------------------------------------------------------------ oportunidades */

export const opportunityInput = z
  .object({
    /** Se busca la empresa por nombre (sin distinguir mayúsculas) y se crea si no existe. */
    companyName: optional(120),
    title: required(200),
    url: optionalHttpsUrl,
    description: optional(50_000),
    source: defEnum(E.SOURCES, "other"),
    location: optional(160),
    workplace: optEnum(E.WORKPLACES),
    salaryMin: optInt(0, 10_000_000),
    salaryMax: optInt(0, 10_000_000),
    salaryCurrency: optional(3).transform((v) => v?.toUpperCase() ?? null),
    salaryText: optional(200),
    postedAt: optionalIsoDate,
    discoveredAt: optionalIsoDate,
    appliedAt: optionalIsoDate,
    deadline: optionalIsoDate,
    offerDeadline: optionalIsoDate,
    status: defEnum(E.OPPORTUNITY_STATUSES, "discovered"),
    priority: defEnum(E.PRIORITIES, "medium"),
    roleFit: optInt(0, 5),
    seniorityFit: optInt(0, 5),
    scoreOverride: optInt(0, 100),
    scoreOverrideReason: optional(300),
    nextAction: optional(300),
    nextActionAt: optionalIsoDate,
    nextFollowUpAt: optionalIsoDate,
    outcome: optEnum(E.OUTCOMES),
    discardReason: optional(300),
    notes: optional(20_000),
  })
  .refine((o) => o.salaryMin === null || o.salaryMax === null || o.salaryMax >= o.salaryMin, {
    message: "El máximo no puede ser menor que el mínimo",
    path: ["salaryMax"],
  })
  .refine((o) => o.scoreOverride === null || !!o.scoreOverrideReason, {
    message: "Explica por qué sustituyes el score calculado",
    path: ["scoreOverrideReason"],
  });

/** Alta rápida desde el inbox o el Quick Add: basta con una URL o un título. */
export const quickOpportunityInput = z
  .object({
    url: optionalHttpsUrl,
    title: optional(200),
    companyName: optional(120),
    source: defEnum(E.SOURCES, "other"),
    priority: defEnum(E.PRIORITIES, "medium"),
    status: defEnum(E.OPPORTUNITY_STATUSES, "discovered"),
  })
  .refine((o) => o.url || o.title, { message: "Pega una URL o escribe un título", path: ["url"] });

export const statusChangeInput = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
  status: z.enum(E.OPPORTUNITY_STATUSES),
});

export const bulkInput = z.discriminatedUnion("op", [
  z.object({ op: z.literal("status"), ids: z.array(z.uuid()).min(1).max(200), status: z.enum(E.OPPORTUNITY_STATUSES) }),
  z.object({ op: z.literal("priority"), ids: z.array(z.uuid()).min(1).max(200), priority: z.enum(E.PRIORITIES) }),
  z.object({ op: z.literal("delete"), ids: z.array(z.uuid()).min(1).max(200) }),
]);

export const reviewInput = z.object({
  id: z.uuid(),
  decision: z.enum(["qualify", "discard", "research"]),
  companyName: optional(120),
  title: optional(200),
  priority: defEnum(E.PRIORITIES, "medium"),
  discardReason: optional(300),
});

/* ---------------------------------------------------------------- contactos */

export const contactInput = z.object({
  name: required(120),
  companyName: optional(120),
  title: optional(160),
  kind: defEnum(E.CONTACT_KINDS, "other"),
  status: defEnum(E.CONTACT_STATUSES, "to_contact"),
  linkedinUrl: optionalHttpsUrl,
  email: z
    .union([z.literal(""), z.email("Email no válido").max(254)])
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  phone: optional(40),
  relationship: optional(200),
  lastInteractionAt: optionalIsoDate,
  nextFollowUpAt: optionalIsoDate,
  notes: optional(10_000),
  /** Al crear desde una oportunidad: vincularlo directamente. */
  opportunityId: optUuid,
});

export const interactionInput = z.object({
  contactId: z.uuid(),
  direction: z.enum(["outbound", "inbound"]),
  summary: required(500),
  createFollowUp: z.boolean().default(false),
  opportunityId: optUuid,
});

export const linkContactInput = z.object({
  opportunityId: z.uuid(),
  contactId: z.uuid(),
  role: defEnum(E.CONTACT_KINDS, "other"),
});

/* ---------------------------------------------------------------- referrals */

export const referralInput = z.object({
  opportunityId: z.uuid(),
  contactId: optUuid,
  notes: optional(1_000),
});

export const referralUpdateInput = z.object({
  id: z.uuid(),
  status: z.enum(E.REFERRAL_STATUSES),
});

/* -------------------------------------------------------------- entrevistas */

const localDateTime = z
  .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha y hora no válidas")])
  .optional()
  .transform((v) => v || null);

export const interviewInput = z.object({
  opportunityId: z.uuid("Selecciona una oportunidad"),
  kind: defEnum(E.INTERVIEW_KINDS, "other"),
  round: optInt(1, 20),
  interviewerContactId: optUuid,
  interviewerName: optional(160),
  /** Hora local en `timezone` (valor de <input type="datetime-local">). */
  scheduledLocal: localDateTime,
  timezone: timezone.transform((v) => v || null),
  durationMinutes: optInt(5, 600),
  meetingUrl: optionalHttpsUrl,
  format: optEnum(E.INTERVIEW_FORMATS),
  topics: optional(5_000),
  notes: optional(20_000),
  outcome: defEnum(E.INTERVIEW_OUTCOMES, "pending"),
  nextAction: optional(300),
});

export const interviewPrepInput = z.object({
  prepCompany: optional(20_000),
  prepRole: optional(20_000),
  prepInterviewer: optional(10_000),
  prepQuestions: optional(20_000),
  prepAnswers: optional(50_000),
  prepQuestionsToAsk: optional(10_000),
  prepChecklist: optional(5_000),
  starStoryIds: z.array(z.uuid()).max(50).default([]),
});

export const starStoryInput = z.object({
  title: required(160),
  situation: optional(5_000),
  task: optional(5_000),
  action: optional(5_000),
  result: optional(5_000),
  tags: csvText(200),
});

/* ------------------------------------------------------------------- tareas */

export const taskInput = z.object({
  title: required(300),
  kind: defEnum(E.TASK_KINDS, "other"),
  priority: defEnum(E.PRIORITIES, "medium"),
  dueDate: optionalIsoDate,
  opportunityId: optUuid,
  contactId: optUuid,
  interviewId: optUuid,
  notes: optional(5_000),
});

/* -------------------------------------------------------- notas y documentos */

export const jobNoteInput = z.object({
  body: required(20_000),
  opportunityId: optUuid,
  contactId: optUuid,
  companyId: optUuid,
  interviewId: optUuid,
});

export const documentInput = z.object({
  kind: z.enum(E.DOCUMENT_KINDS),
  name: required(160),
  version: optional(60),
  url: optionalHttpsUrl,
  content: optional(100_000),
  notes: optional(5_000),
  archived: z.boolean().default(false),
});

export const linkDocumentInput = z.object({
  opportunityId: z.uuid(),
  documentId: z.uuid("Selecciona un documento"),
  usedAt: optionalIsoDate,
});

export const weeklyReviewInput = z.object({
  weekStart: isoDate,
  wins: optional(5_000),
  blockers: optional(5_000),
  focus: optional(5_000),
});

export type GoalInput = z.infer<typeof goalInput>;
export type CompanyInput = z.infer<typeof companyInput>;
export type OpportunityInput = z.infer<typeof opportunityInput>;
export type QuickOpportunityInput = z.infer<typeof quickOpportunityInput>;
export type ReviewInput = z.infer<typeof reviewInput>;
export type BulkInput = z.infer<typeof bulkInput>;
export type ContactInput = z.infer<typeof contactInput>;
export type InteractionInput = z.infer<typeof interactionInput>;
export type LinkContactInput = z.infer<typeof linkContactInput>;
export type ReferralInput = z.infer<typeof referralInput>;
export type ReferralUpdateInput = z.infer<typeof referralUpdateInput>;
export type InterviewInput = z.infer<typeof interviewInput>;
export type InterviewPrepInput = z.infer<typeof interviewPrepInput>;
export type StarStoryInput = z.infer<typeof starStoryInput>;
export type TaskInput = z.infer<typeof taskInput>;
export type JobNoteInput = z.infer<typeof jobNoteInput>;
export type DocumentInput = z.infer<typeof documentInput>;
export type LinkDocumentInput = z.infer<typeof linkDocumentInput>;
export type WeeklyReviewInput = z.infer<typeof weeklyReviewInput>;
