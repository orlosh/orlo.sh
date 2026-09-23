import { sql } from "drizzle-orm";
import {
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
