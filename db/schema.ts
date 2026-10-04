import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
// Ruta relativa a propósito: drizzle-kit y los scripts de seed cargan este fichero sin alias.
import * as js from "../lib/job-search/enums";

/* -------------------------------------------------------------------------- */
/* Columnas compartidas                                                       */
/* -------------------------------------------------------------------------- */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Orden manual dentro de una lista (arrastrar/ordenar en el admin). Menor primero. */
const position = integer("position").notNull().default(0);

const SLUG_PATTERN = "^[a-z0-9]+(-[a-z0-9]+)*$";

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const employmentType = pgEnum("employment_type", [
  "full_time",
  "part_time",
  "contract",
  "freelance",
  "internship",
]);

export const projectStatus = pgEnum("project_status", [
  "in_progress",
  "active",
  "completed",
  "archived",
]);

export const educationKind = pgEnum("education_kind", ["formal", "certification", "course"]);

export const socialKind = pgEnum("social_kind", ["github", "linkedin", "email", "website", "other"]);

/* -------------------------------------------------------------------------- */
/* Perfil                                                                     */
/* -------------------------------------------------------------------------- */

/** Fila única (id = 1): la identidad pública del sitio (una marca, no el nombre de una persona). */
export const profile = pgTable(
  "profile",
  {
    id: smallint("id").primaryKey().default(1),
    displayName: text("display_name").notNull(),
    headline: text("headline").notNull(),
    location: text("location"),
    /** Markdown. */
    summary: text("summary").notNull(),
    /** Dirección de contacto pública. Opcional: la dirección del CV no se publica por defecto. */
    contactEmail: text("contact_email"),
    ...timestamps,
  },
  (t) => [check("profile_singleton", sql`${t.id} = 1`)],
);

export const socialLinks = pgTable(
  "social_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: socialKind("kind").notNull(),
    label: text("label").notNull(),
    url: text("url").notNull(),
    position,
    ...timestamps,
  },
  (t) => [check("social_links_url_scheme", sql`${t.url} ~ '^(https://|mailto:)'`)],
);

/* -------------------------------------------------------------------------- */
/* Stack: tecnologías agrupadas por capa                                      */
/* -------------------------------------------------------------------------- */

export const technologyCategories = pgTable(
  "technology_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    position,
    ...timestamps,
  },
  (t) => [
    uniqueIndex("technology_categories_slug_key").on(t.slug),
    check("technology_categories_slug_format", sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`),
  ],
);

export const technologies = pgTable(
  "technologies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => technologyCategories.id, { onDelete: "restrict" }),
    description: text("description"),
    /** Solo se rellena cuando existe una cifra real. Nunca un porcentaje. */
    yearsOfExperience: smallint("years_of_experience"),
    position,
    ...timestamps,
  },
  (t) => [
    uniqueIndex("technologies_slug_key").on(t.slug),
    uniqueIndex("technologies_name_lower_key").on(sql`lower(${t.name})`),
    index("technologies_category_idx").on(t.categoryId),
    check("technologies_slug_format", sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`),
    check(
      "technologies_years_range",
      sql`${t.yearsOfExperience} IS NULL OR ${t.yearsOfExperience} BETWEEN 0 AND 60`,
    ),
  ],
);

/* -------------------------------------------------------------------------- */
/* Experiencia                                                                */
/* -------------------------------------------------------------------------- */

export const experiences = pgTable(
  "experiences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Privado: visible solo en /admin. La parte pública de lectura nunca lo devuelve. */
    company: text("company").notNull(),
    /** Lo que el sitio público muestra como empleador. NULL = no se muestra el empleador. */
    publicCompany: text("public_company"),
    role: text("role").notNull(),
    /** Privado, como `company` (p. ej., el cliente final de un puesto externalizado). */
    client: text("client"),
    location: text("location"),
    employmentType: employmentType("employment_type"),
    /** Markdown. */
    description: text("description"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    /** NULL = puesto actual. */
    endDate: date("end_date", { mode: "string" }),
    visible: boolean("visible").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("experiences_start_date_idx").on(t.startDate.desc()),
    check("experiences_date_order", sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`),
  ],
);

export const experienceHighlights = pgTable(
  "experience_highlights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    experienceId: uuid("experience_id")
      .notNull()
      .references(() => experiences.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    position,
  },
  (t) => [index("experience_highlights_experience_idx").on(t.experienceId, t.position)],
);

export const experienceTechnologies = pgTable(
  "experience_technologies",
  {
    experienceId: uuid("experience_id")
      .notNull()
      .references(() => experiences.id, { onDelete: "cascade" }),
    technologyId: uuid("technology_id")
      .notNull()
      .references(() => technologies.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.experienceId, t.technologyId] }),
    index("experience_technologies_technology_idx").on(t.technologyId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Proyectos (casos de estudio)                                               */
/* -------------------------------------------------------------------------- */

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    /** Descripción de una línea usada en tarjetas, meta description y OG. */
    summary: text("summary").notNull(),
    /** NULL cuando no se conoce el estado (p. ej., el CV no lo indica). */
    status: projectStatus("status"),
    featured: boolean("featured").notNull().default(false),
    published: boolean("published").notNull().default(false),
    repositoryUrl: text("repository_url"),
    liveUrl: text("live_url"),
    // Estructura del caso de estudio. Markdown; una sección vacía no se renderiza.
    overview: text("overview"),
    architecture: text("architecture"),
    infrastructure: text("infrastructure"),
    deployment: text("deployment"),
    security: text("security"),
    challenges: text("challenges"),
    decisions: text("decisions"),
    results: text("results"),
    lessons: text("lessons"),
    /** Diagrama de arquitectura estructurado (nodos + aristas), validado por lib/validation. */
    diagram: jsonb("diagram"),
    position,
    ...timestamps,
  },
  (t) => [
    uniqueIndex("projects_slug_key").on(t.slug),
    index("projects_published_idx").on(t.published, t.featured, t.position),
    check("projects_slug_format", sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`),
    check(
      "projects_urls_https",
      sql`(${t.repositoryUrl} IS NULL OR ${t.repositoryUrl} ~ '^https://') AND (${t.liveUrl} IS NULL OR ${t.liveUrl} ~ '^https://')`,
    ),
  ],
);

export const projectTechnologies = pgTable(
  "project_technologies",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    technologyId: uuid("technology_id")
      .notNull()
      .references(() => technologies.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.technologyId] }),
    index("project_technologies_technology_idx").on(t.technologyId),
  ],
);

export const projectImages = pgTable(
  "project_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** Obligatorio: las imágenes sin texto alternativo son un fallo de accesibilidad. */
    alt: text("alt").notNull(),
    caption: text("caption"),
    position,
    ...timestamps,
  },
  (t) => [index("project_images_project_idx").on(t.projectId, t.position)],
);

/* -------------------------------------------------------------------------- */
/* Formación, certificaciones, idiomas                                        */
/* -------------------------------------------------------------------------- */

export const education = pgTable(
  "education",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: educationKind("kind").notNull(),
    title: text("title").notNull(),
    institution: text("institution").notNull(),
    startYear: smallint("start_year"),
    endYear: smallint("end_year"),
    credentialUrl: text("credential_url"),
    position,
    ...timestamps,
  },
  (t) => [
    check(
      "education_year_order",
      sql`${t.startYear} IS NULL OR ${t.endYear} IS NULL OR ${t.endYear} >= ${t.startYear}`,
    ),
  ],
);

export const languages = pgTable(
  "languages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Texto libre (p. ej., "Nativo", "C1"). NULL cuando el CV no lo indica. */
    level: text("level"),
    position,
    ...timestamps,
  },
  (t) => [uniqueIndex("languages_name_lower_key").on(sql`lower(${t.name})`)],
);

/* -------------------------------------------------------------------------- */
/* Notas técnicas                                                             */
/* -------------------------------------------------------------------------- */

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    /** Markdown. Se renderiza sin HTML en bruto (ver components/markdown). */
    body: text("body").notNull(),
    published: boolean("published").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("notes_slug_key").on(t.slug),
    index("notes_published_idx").on(t.published, t.publishedAt.desc()),
    check("notes_slug_format", sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`),
    check("notes_published_has_date", sql`NOT ${t.published} OR ${t.publishedAt} IS NOT NULL`),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tags_slug_key").on(t.slug),
    check("tags_slug_format", sql`${t.slug} ~ ${sql.raw(`'${SLUG_PATTERN}'`)}`),
  ],
);

export const noteTags = pgTable(
  "note_tags",
  {
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.tagId] }), index("note_tags_tag_idx").on(t.tagId)],
);

/* -------------------------------------------------------------------------- */
/* Job Search: seguimiento privado de la búsqueda de empleo (solo /admin)     */
/* -------------------------------------------------------------------------- */
// Nada de esta sección sale nunca por el sitio público ni por la API: solo la leen las páginas
// de /admin/job-search. Los recordatorios ("Reminder") son tareas de tipo follow_up con fecha.

const HTTPS_OR_NULL = (col: AnyPgColumn) => sql`${col} IS NULL OR ${col} ~ '^https://'`;

export const jobOpportunityStatus = pgEnum("job_opportunity_status", js.OPPORTUNITY_STATUSES);
export const jobPriority = pgEnum("job_priority", js.PRIORITIES);
export const jobWorkplace = pgEnum("job_workplace", js.WORKPLACES);
export const jobSource = pgEnum("job_source", js.SOURCES);
export const jobOutcome = pgEnum("job_outcome", js.OUTCOMES);
export const jobCompanyTier = pgEnum("job_company_tier", js.COMPANY_TIERS);
export const jobContactKind = pgEnum("job_contact_kind", js.CONTACT_KINDS);
export const jobContactStatus = pgEnum("job_contact_status", js.CONTACT_STATUSES);
export const jobTaskKind = pgEnum("job_task_kind", js.TASK_KINDS);
export const jobTaskStatus = pgEnum("job_task_status", js.TASK_STATUSES);
export const jobInterviewKind = pgEnum("job_interview_kind", js.INTERVIEW_KINDS);
export const jobInterviewFormat = pgEnum("job_interview_format", js.INTERVIEW_FORMATS);
export const jobInterviewOutcome = pgEnum("job_interview_outcome", js.INTERVIEW_OUTCOMES);
export const jobActivityType = pgEnum("job_activity_type", js.ACTIVITY_TYPES);
export const jobDocumentKind = pgEnum("job_document_kind", js.DOCUMENT_KINDS);
export const jobReferralStatus = pgEnum("job_referral_status", js.REFERRAL_STATUSES);
export const jobSeniority = pgEnum("job_seniority", js.SENIORITIES);

/** Fila única (id = 1): objetivo de la búsqueda, preferencias y reglas de follow-up. */
export const jobSearchGoal = pgTable(
  "job_search_goal",
  {
    id: smallint("id").primaryKey().default(1),
    startDate: date("start_date", { mode: "string" }).notNull().default(sql`current_date`),
    durationDays: smallint("duration_days").notNull().default(30),
    /** Zona IANA para decidir qué es "hoy". */
    timezone: text("timezone").notNull().default("UTC"),
    /** Separados por comas: títulos de puesto objetivo. */
    targetRoles: text("target_roles"),
    targetSeniority: jobSeniority("target_seniority"),
    minSalary: integer("min_salary"),
    currency: text("currency"),
    preferredWorkplaces: jobWorkplace("preferred_workplaces").array().notNull().default(sql`'{}'`),
    preferredLocations: text("preferred_locations"),
    /** Habilidades reales que no están en el stack público (separadas por comas). */
    extraSkills: text("extra_skills"),
    weeklyApplicationTarget: smallint("weekly_application_target").notNull().default(10),
    followupApplicationDays: smallint("followup_application_days").notNull().default(5),
    followupRecruiterDays: smallint("followup_recruiter_days").notNull().default(3),
    followupReferralDays: smallint("followup_referral_days").notNull().default(4),
    /** Días sin actividad a partir de los que una oportunidad o un contacto "se enfría". */
    staleDays: smallint("stale_days").notNull().default(7),
    ...timestamps,
  },
  (t) => [
    check("job_search_goal_singleton", sql`${t.id} = 1`),
    check("job_search_goal_duration", sql`${t.durationDays} BETWEEN 1 AND 365`),
    check(
      "job_search_goal_rules",
      sql`${t.followupApplicationDays} BETWEEN 1 AND 60 AND ${t.followupRecruiterDays} BETWEEN 1 AND 60 AND ${t.followupReferralDays} BETWEEN 1 AND 60 AND ${t.staleDays} BETWEEN 1 AND 90`,
    ),
  ],
);

export const jobCompanies = pgTable(
  "job_companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    tier: jobCompanyTier("tier"),
    /** 1-5. */
    interest: smallint("interest"),
    website: text("website"),
    careersUrl: text("careers_url"),
    industry: text("industry"),
    notes: text("notes"),
    nextAction: text("next_action"),
    nextActionAt: date("next_action_at", { mode: "string" }),
    archived: boolean("archived").notNull().default(false),
    /** Investigación de la empresa hecha con Gemini + Google Search (ver lib/ai). */
    aiResearch: jsonb("ai_research"),
    aiResearchAt: timestamp("ai_research_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("job_companies_name_lower_key").on(sql`lower(${t.name})`),
    check("job_companies_interest_range", sql`${t.interest} IS NULL OR ${t.interest} BETWEEN 1 AND 5`),
    check("job_companies_urls_https", sql`(${HTTPS_OR_NULL(t.website)}) AND (${HTTPS_OR_NULL(t.careersUrl)})`),
  ],
);

export const jobOpportunities = pgTable(
  "job_opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => jobCompanies.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    url: text("url"),
    /** Texto completo de la Job Description (base del análisis y del matching). */
    description: text("description"),
    source: jobSource("source").notNull().default("other"),
    location: text("location"),
    workplace: jobWorkplace("workplace"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency"),
    /** Texto libre cuando la cifra no encaja en un rango (p. ej., "+ equity"). */
    salaryText: text("salary_text"),
    postedAt: date("posted_at", { mode: "string" }),
    discoveredAt: date("discovered_at", { mode: "string" }).notNull().default(sql`current_date`),
    appliedAt: date("applied_at", { mode: "string" }),
    /** Fecha límite para enviar la candidatura. */
    deadline: date("deadline", { mode: "string" }),
    /** Fecha límite para responder a una oferta. */
    offerDeadline: date("offer_deadline", { mode: "string" }),
    status: jobOpportunityStatus("status").notNull().default("discovered"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    priority: jobPriority("priority").notNull().default("medium"),
    /** Valoraciones manuales 0-5 que sustituyen a la estimación automática del score. */
    roleFit: smallint("role_fit"),
    seniorityFit: smallint("seniority_fit"),
    scoreOverride: smallint("score_override"),
    scoreOverrideReason: text("score_override_reason"),
    nextAction: text("next_action"),
    nextActionAt: date("next_action_at", { mode: "string" }),
    nextFollowUpAt: date("next_follow_up_at", { mode: "string" }),
    /** Primera respuesta de la empresa tras aplicar (screen, entrevista o rechazo). */
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    outcome: jobOutcome("outcome"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    discardReason: text("discard_reason"),
    notes: text("notes"),
    /** Desnormalizado: lo actualiza cada actividad, para detectar oportunidades que se enfrían. */
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    /** Datos extraídos de la oferta por Gemini (JSON validado, ver lib/ai/schemas.ts). */
    aiAnalysis: jsonb("ai_analysis"),
    aiAnalyzedAt: timestamp("ai_analyzed_at", { withTimezone: true }),
    /** Encaje con el CV calculado por Gemini, con las citas del CV ya verificadas. */
    aiMatch: jsonb("ai_match"),
    aiMatchAt: timestamp("ai_match_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("job_opportunities_status_idx").on(t.status),
    index("job_opportunities_company_idx").on(t.companyId),
    index("job_opportunities_follow_up_idx").on(t.nextFollowUpAt),
    check("job_opportunities_url_https", HTTPS_OR_NULL(t.url)),
    check(
      "job_opportunities_fit_range",
      sql`(${t.roleFit} IS NULL OR ${t.roleFit} BETWEEN 0 AND 5) AND (${t.seniorityFit} IS NULL OR ${t.seniorityFit} BETWEEN 0 AND 5)`,
    ),
    check("job_opportunities_score_range", sql`${t.scoreOverride} IS NULL OR ${t.scoreOverride} BETWEEN 0 AND 100`),
    check(
      "job_opportunities_salary_order",
      sql`${t.salaryMin} IS NULL OR ${t.salaryMax} IS NULL OR ${t.salaryMax} >= ${t.salaryMin}`,
    ),
  ],
);

/** Cada cambio de estado, para "días en fase", tiempos entre fases y el funnel. */
export const jobStatusHistory = pgTable(
  "job_status_history",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => jobOpportunities.id, { onDelete: "cascade" }),
    /** NULL en la fila de creación. */
    fromStatus: jobOpportunityStatus("from_status"),
    toStatus: jobOpportunityStatus("to_status").notNull(),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_status_history_opportunity_idx").on(t.opportunityId, t.changedAt)],
);

export const jobContacts = pgTable(
  "job_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    companyId: uuid("company_id").references(() => jobCompanies.id, { onDelete: "set null" }),
    title: text("title"),
    kind: jobContactKind("kind").notNull().default("other"),
    status: jobContactStatus("status").notNull().default("to_contact"),
    linkedinUrl: text("linkedin_url"),
    email: text("email"),
    phone: text("phone"),
    relationship: text("relationship"),
    lastInteractionAt: date("last_interaction_at", { mode: "string" }),
    nextFollowUpAt: date("next_follow_up_at", { mode: "string" }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("job_contacts_company_idx").on(t.companyId),
    check("job_contacts_linkedin_https", HTTPS_OR_NULL(t.linkedinUrl)),
  ],
);

export const jobOpportunityContacts = pgTable(
  "job_opportunity_contacts",
  {
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => jobOpportunities.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => jobContacts.id, { onDelete: "cascade" }),
    /** Papel del contacto en este proceso concreto. */
    role: jobContactKind("role").notNull().default("other"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.opportunityId, t.contactId] }),
    index("job_opportunity_contacts_contact_idx").on(t.contactId),
  ],
);

export const jobReferrals = pgTable(
  "job_referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => jobOpportunities.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => jobContacts.id, { onDelete: "set null" }),
    status: jobReferralStatus("status").notNull().default("requested"),
    requestedAt: date("requested_at", { mode: "string" }).notNull().default(sql`current_date`),
    receivedAt: date("received_at", { mode: "string" }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("job_referrals_opportunity_idx").on(t.opportunityId),
    index("job_referrals_contact_idx").on(t.contactId),
  ],
);

/** Biblioteca de historias STAR reutilizables entre entrevistas. */
export const jobStarStories = pgTable("job_star_stories", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  situation: text("situation"),
  task: text("task"),
  action: text("action"),
  result: text("result"),
  tags: text("tags"),
  ...timestamps,
});

export const jobInterviews = pgTable(
  "job_interviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => jobOpportunities.id, { onDelete: "cascade" }),
    kind: jobInterviewKind("kind").notNull().default("other"),
    /** Ronda dentro del proceso (1, 2, 3…). */
    round: smallint("round"),
    interviewerContactId: uuid("interviewer_contact_id").references(() => jobContacts.id, { onDelete: "set null" }),
    interviewerName: text("interviewer_name"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    timezone: text("timezone"),
    durationMinutes: smallint("duration_minutes"),
    meetingUrl: text("meeting_url"),
    format: jobInterviewFormat("format"),
    topics: text("topics"),
    notes: text("notes"),
    outcome: jobInterviewOutcome("outcome").notNull().default("pending"),
    nextAction: text("next_action"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // Workspace de preparación.
    prepCompany: text("prep_company"),
    prepRole: text("prep_role"),
    prepInterviewer: text("prep_interviewer"),
    prepQuestions: text("prep_questions"),
    prepAnswers: text("prep_answers"),
    prepQuestionsToAsk: text("prep_questions_to_ask"),
    /** Una línea por punto; "[x] " al principio = hecho. */
    prepChecklist: text("prep_checklist"),
    starStoryIds: uuid("star_story_ids").array().notNull().default(sql`'{}'`),
    ...timestamps,
  },
  (t) => [
    index("job_interviews_opportunity_idx").on(t.opportunityId),
    index("job_interviews_scheduled_idx").on(t.scheduledAt),
    check("job_interviews_meeting_https", HTTPS_OR_NULL(t.meetingUrl)),
    check(
      "job_interviews_duration_range",
      sql`${t.durationMinutes} IS NULL OR ${t.durationMinutes} BETWEEN 5 AND 600`,
    ),
  ],
);

export const jobTasks = pgTable(
  "job_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    kind: jobTaskKind("kind").notNull().default("other"),
    status: jobTaskStatus("status").notNull().default("open"),
    priority: jobPriority("priority").notNull().default("medium"),
    dueDate: date("due_date", { mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    opportunityId: uuid("opportunity_id").references(() => jobOpportunities.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => jobContacts.id, { onDelete: "cascade" }),
    interviewId: uuid("interview_id").references(() => jobInterviews.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => jobCompanies.id, { onDelete: "cascade" }),
    /** "manual" o la regla de automatización que la creó (p. ej., "auto:application"). */
    origin: text("origin").notNull().default("manual"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("job_tasks_status_due_idx").on(t.status, t.dueDate),
    index("job_tasks_opportunity_idx").on(t.opportunityId),
    index("job_tasks_contact_idx").on(t.contactId),
    check("job_tasks_done_has_date", sql`${t.status} <> 'done' OR ${t.completedAt} IS NOT NULL`),
  ],
);

export const jobActivities = pgTable(
  "job_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: jobActivityType("type").notNull(),
    summary: text("summary").notNull(),
    opportunityId: uuid("opportunity_id").references(() => jobOpportunities.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => jobContacts.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => jobCompanies.id, { onDelete: "set null" }),
    interviewId: uuid("interview_id").references(() => jobInterviews.id, { onDelete: "set null" }),
    metadata: jsonb("metadata"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("job_activities_opportunity_idx").on(t.opportunityId, t.occurredAt.desc()),
    index("job_activities_contact_idx").on(t.contactId),
    index("job_activities_occurred_idx").on(t.occurredAt.desc()),
  ],
);

export const jobDocuments = pgTable(
  "job_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: jobDocumentKind("kind").notNull(),
    name: text("name").notNull(),
    version: text("version"),
    url: text("url"),
    /** Texto plano (p. ej., el CV) para el matching contra Job Descriptions. */
    content: text("content"),
    notes: text("notes"),
    archived: boolean("archived").notNull().default(false),
    /** Borrador generado para una oportunidad concreta (p. ej., una carta de presentación). */
    opportunityId: uuid("opportunity_id").references(() => jobOpportunities.id, { onDelete: "set null" }),
    generated: boolean("generated").notNull().default(false),
    ...timestamps,
  },
  (t) => [check("job_documents_url_https", HTTPS_OR_NULL(t.url)), index("job_documents_opportunity_idx").on(t.opportunityId)],
);

/** Qué versión de cada documento se envió en cada candidatura. */
export const jobOpportunityDocuments = pgTable(
  "job_opportunity_documents",
  {
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => jobOpportunities.id, { onDelete: "cascade" }),
    // RESTRICT: un documento usado en una candidatura se archiva, no se borra.
    documentId: uuid("document_id")
      .notNull()
      .references(() => jobDocuments.id, { onDelete: "restrict" }),
    usedAt: date("used_at", { mode: "string" }).notNull().default(sql`current_date`),
  },
  (t) => [
    primaryKey({ columns: [t.opportunityId, t.documentId] }),
    index("job_opportunity_documents_document_idx").on(t.documentId),
  ],
);

export const jobNotes = pgTable(
  "job_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    body: text("body").notNull(),
    opportunityId: uuid("opportunity_id").references(() => jobOpportunities.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => jobContacts.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => jobCompanies.id, { onDelete: "cascade" }),
    interviewId: uuid("interview_id").references(() => jobInterviews.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("job_notes_opportunity_idx").on(t.opportunityId)],
);

export const jobWeeklyReviews = pgTable(
  "job_weekly_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Lunes de la semana revisada. */
    weekStart: date("week_start", { mode: "string" }).notNull(),
    /** Instantánea de las métricas calculadas en el momento de guardar. */
    metrics: jsonb("metrics").notNull(),
    wins: text("wins"),
    blockers: text("blockers"),
    focus: text("focus"),
    ...timestamps,
  },
  (t) => [uniqueIndex("job_weekly_reviews_week_key").on(t.weekStart)],
);

/* -------------------------------------------------------------------------- */
/* IA (Gemini): configuración, claves, registro de llamadas y radar          */
/* -------------------------------------------------------------------------- */
// Todo se configura desde /admin/job-search/settings/ai; no hay interruptores por variables de entorno.

export const jobLeadStatus = pgEnum("job_lead_status", js.LEAD_STATUSES);

/** Fila única (id = 1). */
export const aiSettings = pgTable(
  "ai_settings",
  {
    id: smallint("id").primaryKey().default(1),
    enabled: boolean("enabled").notNull().default(false),
    /** Modelo para análisis y textos (calidad). */
    modelDefault: text("model_default").notNull().default("gemini-3.8-flash"),
    /** Modelo para tareas masivas y baratas (evaluar resultados del radar). */
    modelLight: text("model_light").notNull().default("gemini-3.5-flash-lite"),
    /** Permite usar Google Search (grounding) y la lectura de URLs. */
    useSearch: boolean("use_search").notNull().default(true),
    /** Evaluar el encaje con el CV justo después de importar una oferta. */
    autoMatch: boolean("auto_match").notNull().default(true),
    /** CV que se usa como referencia; NULL = el CV con texto más reciente. */
    cvDocumentId: uuid("cv_document_id").references(() => jobDocuments.id, { onDelete: "set null" }),
    /** Hechos reales adicionales para la IA (disponibilidad, idiomas, preferencias…). */
    profileContext: text("profile_context"),
    radarEnabled: boolean("radar_enabled").notNull().default(false),
    /** Una búsqueda por línea; vacío = se construye a partir de los roles objetivo. */
    radarQueries: text("radar_queries"),
    radarLocations: text("radar_locations"),
    radarExcludedCompanies: text("radar_excluded_companies"),
    radarMinMatch: smallint("radar_min_match").notNull().default(80),
    radarMaxPerRun: smallint("radar_max_per_run").notNull().default(8),
    radarMaxAgeDays: smallint("radar_max_age_days").notNull().default(14),
    radarFrequencyDays: smallint("radar_frequency_days").notNull().default(1),
    radarLastRunAt: timestamp("radar_last_run_at", { withTimezone: true }),
    /** Tiempo máximo de trabajo por ejecución del radar (la función tiene su propio límite). */
    timeBudgetSeconds: smallint("time_budget_seconds").notNull().default(240),
    /** Ritmo máximo por clave y modelo: entre dos llamadas se espera al menos 60/rpm segundos. */
    requestsPerMinute: smallint("requests_per_minute").notNull().default(5),
    /** Si el modelo principal se agota en todas las claves, usar el ligero (cuota aparte). */
    modelFallback: boolean("model_fallback").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    check("ai_settings_singleton", sql`${t.id} = 1`),
    check("ai_settings_rpm_range", sql`${t.requestsPerMinute} BETWEEN 1 AND 120`),
    check(
      "ai_settings_radar_ranges",
      sql`${t.radarMinMatch} BETWEEN 0 AND 100 AND ${t.radarMaxPerRun} BETWEEN 1 AND 50 AND ${t.radarMaxAgeDays} BETWEEN 1 AND 90 AND ${t.radarFrequencyDays} BETWEEN 1 AND 30 AND ${t.timeBudgetSeconds} BETWEEN 20 AND 800`,
    ),
  ],
);

/** Claves de la API de Gemini. Se prueban por orden: si una falla, se usa la siguiente. */
export const aiApiKeys = pgTable("ai_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  /** AES-256-GCM (lib/ai/secrets.ts). Nunca se guarda ni se devuelve en claro. */
  keyCiphertext: text("key_ciphertext").notNull(),
  keyLast4: text("key_last4").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  position,
  successCount: integer("success_count").notNull().default(0),
  failureCount: integer("failure_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  lastError: text("last_error"),
  /** Hasta cuándo no se usa (límite alcanzado, clave rechazada…). */
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  ...timestamps,
});

/**
 * Estado de cada clave con cada modelo. Google limita por proyecto y por modelo: que una clave
 * agote el modelo principal no impide usarla con el ligero. También guarda la última llamada,
 * para repartir el ritmo entre instancias de la función.
 */
export const aiKeyModels = pgTable(
  "ai_key_models",
  {
    keyId: uuid("key_id")
      .notNull()
      .references(() => aiApiKeys.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    lastRequestAt: timestamp("last_request_at", { withTimezone: true }),
    cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
    lastError: text("last_error"),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.keyId, t.model] })],
);

/** Una fila por llamada lógica a Gemini (con todos sus reintentos). */
export const aiRuns = pgTable(
  "ai_runs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    keyId: uuid("key_id").references(() => aiApiKeys.id, { onDelete: "set null" }),
    status: text("status").notNull(),
    attempts: smallint("attempts").notNull().default(1),
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_runs_created_idx").on(t.createdAt.desc()), check("ai_runs_status", sql`${t.status} IN ('ok', 'error')`)],
);

export const jobRadarRuns = pgTable(
  "job_radar_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trigger: text("trigger").notNull(),
    status: text("status").notNull().default("running"),
    found: integer("found").notNull().default(0),
    evaluated: integer("evaluated").notNull().default(0),
    added: integer("added").notNull().default(0),
    error: text("error"),
    /** Pasos legibles de la ejecución (búsquedas hechas, descartes…). */
    log: jsonb("log").notNull().default(sql`'[]'::jsonb`),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("job_radar_runs_started_idx").on(t.startedAt.desc()),
    check("job_radar_runs_trigger", sql`${t.trigger} IN ('cron', 'manual')`),
    check("job_radar_runs_status", sql`${t.status} IN ('running', 'ok', 'partial', 'error')`),
  ],
);

/** Cada oferta que encuentra el radar, evaluada o no. La URL evita repetirla. */
export const jobLeads = pgTable(
  "job_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    companyName: text("company_name"),
    location: text("location"),
    postedAt: date("posted_at", { mode: "string" }),
    snippet: text("snippet"),
    status: jobLeadStatus("status").notNull().default("new"),
    matchScore: smallint("match_score"),
    /** Resultado del encaje (motivos, gaps, citas verificadas). */
    match: jsonb("match"),
    runId: uuid("run_id").references(() => jobRadarRuns.id, { onDelete: "set null" }),
    opportunityId: uuid("opportunity_id").references(() => jobOpportunities.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("job_leads_url_key").on(t.url),
    index("job_leads_status_idx").on(t.status, t.createdAt.desc()),
    check("job_leads_url_https", sql`${t.url} ~ '^https://'`),
    check("job_leads_score_range", sql`${t.matchScore} IS NULL OR ${t.matchScore} BETWEEN 0 AND 100`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Registro de auditoría: cada mutación del admin deja rastro                 */
/* -------------------------------------------------------------------------- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    /** Contexto breve y no sensible (nombres de campos cambiados, nunca valores de secretos). */
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt.desc())],
);

/* -------------------------------------------------------------------------- */
/* Autenticación (Better Auth): nombres de propiedad que espera el adapter.   */
/* -------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** Autorización: solo "admin" puede usar /admin. No se puede asignar desde el cliente. */
  role: text("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    /** Hash scrypt generado por Better Auth. Nunca texto plano. */
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Contadores de rate limit del login, persistidos para que un reinicio no los ponga a cero. */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
