import { z } from "zod";

/**
 * Contratos de entrada compartidos por los formularios del admin, las server actions y la API.
 * La base de datos impone las mismas reglas con constraints CHECK; validar
 * también aquí da al usuario un error legible en lugar de una violación de constraint.
 */

const trimmed = (max: number) => z.string().trim().max(max);
const required = (max: number) => trimmed(max).min(1, "Obligatorio");

/** Un string vacío de un campo de formulario se convierte en NULL. */
const optional = (max: number) =>
  trimmed(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const slugSchema = z
  .string()
  .trim()
  .min(1, "Obligatorio")
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones");

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      return new URL(v).protocol === "https:";
    } catch {
      return false;
    }
  }, "Debe ser una URL https://");

const optionalHttpsUrl = z
  .union([z.literal(""), httpsUrl])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

const isoDate = z.iso.date("Fecha YYYY-MM-DD");
const optionalIsoDate = z
  .union([z.literal(""), isoDate])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

const markdown = (max = 50_000) => optional(max);

const idList = z.array(z.uuid()).max(100).default([]);

/* --------------------------------------------------------------- diagrama */

export const diagramSchema = z
  .object({
    nodes: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9-]{1,40}$/),
          label: z.string().min(1).max(40),
          detail: z.string().max(60).optional(),
          lane: z.number().int().min(0).max(8),
          column: z.number().int().min(0).max(6),
        }),
      )
      .min(1)
      .max(30),
    edges: z
      .array(
        z.object({
          from: z.string(),
          to: z.string(),
          label: z.string().max(30).optional(),
        }),
      )
      .max(60),
  })
  .superRefine((d, ctx) => {
    const ids = new Set(d.nodes.map((n) => n.id));
    if (ids.size !== d.nodes.length) ctx.addIssue({ code: "custom", message: "IDs de nodo duplicados" });
    for (const e of d.edges) {
      if (!ids.has(e.from) || !ids.has(e.to)) {
        ctx.addIssue({ code: "custom", message: `Arista con nodo inexistente: ${e.from} → ${e.to}` });
      }
    }
  });

/* --------------------------------------------------------------- entidades */

export const profileInput = z.object({
  /** Identidad pública del sitio: una marca, nunca un nombre legal. */
  displayName: required(60),
  headline: required(160),
  location: optional(120),
  summary: required(5_000),
  contactEmail: z
    .union([z.literal(""), z.email().max(254)])
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});

export const socialLinkInput = z.object({
  kind: z.enum(["github", "linkedin", "email", "website", "other"]),
  label: required(40),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => /^(https:\/\/|mailto:)/.test(v), "Debe empezar por https:// o mailto:"),
  position: z.coerce.number().int().min(0).max(1000).default(0),
});

export const experienceInput = z
  .object({
    company: required(120),
    publicCompany: optional(120),
    role: required(120),
    client: optional(120),
    location: optional(120),
    employmentType: z
      .union([z.literal(""), z.enum(["full_time", "part_time", "contract", "freelance", "internship"])])
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
    description: markdown(10_000),
    startDate: isoDate,
    endDate: optionalIsoDate,
    visible: z.boolean().default(true),
    highlights: z.array(required(500)).max(20).default([]),
    technologyIds: idList,
  })
  .refine((e) => !e.endDate || e.endDate >= e.startDate, {
    message: "La fecha de fin no puede ser anterior al inicio",
    path: ["endDate"],
  });

export const projectInput = z.object({
  slug: slugSchema,
  title: required(120),
  summary: required(300),
  status: z
    .union([z.literal(""), z.enum(["in_progress", "active", "completed", "archived"])])
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
  featured: z.boolean().default(false),
  published: z.boolean().default(false),
  repositoryUrl: optionalHttpsUrl,
  liveUrl: optionalHttpsUrl,
  overview: markdown(),
  architecture: markdown(),
  infrastructure: markdown(),
  deployment: markdown(),
  security: markdown(),
  challenges: markdown(),
  decisions: markdown(),
  results: markdown(),
  lessons: markdown(),
  diagram: diagramSchema.nullable().default(null),
  position: z.coerce.number().int().min(0).max(1000).default(0),
  technologyIds: idList,
  images: z
    .array(
      z.object({
        url: z
          .string()
          .trim()
          .max(500)
          .refine((v) => v.startsWith("/") || v.startsWith("https://"), "Ruta local o URL https://"),
        alt: required(200),
        caption: optional(300),
      }),
    )
    .max(20)
    .default([]),
});

export const technologyCategoryInput = z.object({
  name: required(60),
  slug: slugSchema,
  description: optional(500),
  position: z.coerce.number().int().min(0).max(1000).default(0),
});

export const technologyInput = z.object({
  name: required(60),
  slug: slugSchema,
  categoryId: z.uuid("Selecciona una capa"),
  description: optional(1_000),
  yearsOfExperience: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(60)])
    .nullable()
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  position: z.coerce.number().int().min(0).max(1000).default(0),
});

export const noteInput = z.object({
  slug: slugSchema,
  title: required(160),
  excerpt: required(400),
  body: required(100_000),
  published: z.boolean().default(false),
  /** Nombres de etiquetas separados por comas, tal como vienen del formulario. */
  tags: z
    .array(required(40))
    .max(10)
    .default([]),
});

export const educationInput = z
  .object({
    kind: z.enum(["formal", "certification", "course"]),
    title: required(200),
    institution: required(120),
    startYear: z
      .union([z.literal(""), z.coerce.number().int().min(1950).max(2100)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    endYear: z
      .union([z.literal(""), z.coerce.number().int().min(1950).max(2100)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    credentialUrl: optionalHttpsUrl,
    position: z.coerce.number().int().min(0).max(1000).default(0),
  })
  .refine((e) => e.startYear === null || e.endYear === null || e.endYear >= e.startYear, {
    message: "El año de fin no puede ser anterior al de inicio",
    path: ["endYear"],
  });

export const languageInput = z.object({
  name: required(40),
  level: optional(40),
  position: z.coerce.number().int().min(0).max(1000).default(0),
});

export type ProfileInput = z.infer<typeof profileInput>;
export type ExperienceInput = z.infer<typeof experienceInput>;
export type ProjectInput = z.infer<typeof projectInput>;
export type TechnologyInput = z.infer<typeof technologyInput>;
export type TechnologyCategoryInput = z.infer<typeof technologyCategoryInput>;
export type NoteInput = z.infer<typeof noteInput>;
export type EducationInput = z.infer<typeof educationInput>;
export type LanguageInput = z.infer<typeof languageInput>;
export type SocialLinkInput = z.infer<typeof socialLinkInput>;

/** Convierte un nombre de texto libre en un candidato a slug. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
