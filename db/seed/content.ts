import { z } from "zod";
import { diagramSchema } from "../../lib/validation/content";

/**
 * Forma de un fichero de contenido del seed. El contenido real NO se sube al repositorio:
 *   db/seed/content.local.json    ignorado por git, excluido de las imágenes Docker
 *   db/seed/content.example.json  marcador de posición versionado, se usa si no hay fichero local
 * Tras el primer seed, la base de datos es la fuente de verdad; se edita desde /admin.
 */
const techSlug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const seedContentSchema = z.object({
  profile: z.object({
    displayName: z.string().min(1),
    headline: z.string().min(1),
    location: z.string().nullable().default(null),
    summary: z.string().min(1),
    contactEmail: z.string().nullable().default(null),
  }),
  links: z
    .array(z.object({ kind: z.enum(["github", "linkedin", "email", "website", "other"]), label: z.string(), url: z.string() }))
    .default([]),
  stack: z.array(
    z.object({
      name: z.string(),
      slug: techSlug,
      items: z.array(z.tuple([z.string(), techSlug])),
    }),
  ),
  experience: z
    .array(
      z.object({
        company: z.string(),
        publicCompany: z.string().nullable().default(null),
        client: z.string().nullable().default(null),
        role: z.string(),
        startDate: z.iso.date(),
        endDate: z.iso.date().nullable(),
        highlights: z.array(z.string()).default([]),
        technologies: z.array(techSlug).default([]),
      }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        kind: z.enum(["formal", "certification", "course"]),
        title: z.string(),
        institution: z.string(),
        startYear: z.number().int().nullable(),
        endYear: z.number().int().nullable(),
      }),
    )
    .default([]),
  languages: z.array(z.string()).default([]),
  projects: z
    .array(
      z.object({
        slug: techSlug,
        title: z.string(),
        summary: z.string(),
        published: z.boolean().default(false),
        featured: z.boolean().default(false),
        overview: z.string().nullable().default(null),
        architecture: z.string().nullable().default(null),
        infrastructure: z.string().nullable().default(null),
        deployment: z.string().nullable().default(null),
        security: z.string().nullable().default(null),
        decisions: z.string().nullable().default(null),
        /** "@system" = el diagrama propio de esta aplicación (lib/architecture.ts). */
        diagram: z.union([z.literal("@system"), diagramSchema]).nullable().default(null),
        technologies: z.array(techSlug).default([]),
      }),
    )
    .default([]),
});

export type SeedContent = z.infer<typeof seedContentSchema>;
