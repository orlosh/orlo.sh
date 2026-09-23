import { and, asc, desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { schema as fullSchema } from "@/db";
import * as t from "@/db/schema";
import { diagramSchema } from "@/lib/validation/content";
import type {
  EducationItem,
  Experience,
  Language,
  NoteDetail,
  NoteSummary,
  Profile,
  ProjectDetail,
  ProjectSummary,
  StackLayer,
} from "./types";

/**
 * Consultas de lectura del contenido público. Funciones puras de un handle de base de datos,
 * para que los tests de integración puedan ejecutarlas contra una base de datos desechable
 * sin que la caché de Next.js se interponga. Solo se devuelven filas publicadas / visibles.
 */
export type ContentDb = PostgresJsDatabase<typeof fullSchema>;

const iso = (d: Date) => d.toISOString();

export async function findProfile(db: ContentDb): Promise<Profile | null> {
  const row = await db.query.profile.findFirst();
  if (!row) return null;
  const links = await db.query.socialLinks.findMany({ orderBy: [asc(t.socialLinks.position)] });
  return {
    displayName: row.displayName,
    headline: row.headline,
    location: row.location,
    summary: row.summary,
    contactEmail: row.contactEmail,
    links: links.map(({ kind, label, url }) => ({ kind, label, url })),
    updatedAt: iso(row.updatedAt),
  };
}

export async function findExperience(db: ContentDb): Promise<Experience[]> {
  const rows = await db.query.experiences.findMany({
    where: eq(t.experiences.visible, true),
    orderBy: [desc(t.experiences.startDate)],
    with: {
      highlights: { orderBy: [asc(t.experienceHighlights.position)] },
      technologies: { with: { technology: true } },
    },
  });
  // Primero los puestos actuales (sin fecha de fin), luego por inicio más reciente.
  rows.sort((a, b) => {
    if (!a.endDate !== !b.endDate) return a.endDate ? 1 : -1;
    return b.startDate.localeCompare(a.startDate);
  });
  return rows.map((r) => ({
    id: r.id,
    // Frontera de privacidad: las columnas privadas `company` y `client` nunca salen del admin.
    company: r.publicCompany,
    role: r.role,
    location: r.location,
    employmentType: r.employmentType,
    description: r.description,
    startDate: r.startDate,
    endDate: r.endDate,
    highlights: r.highlights.map((h) => h.body),
    technologies: r.technologies
      .map(({ technology }) => ({ name: technology.name, slug: technology.slug, position: technology.position }))
      .sort((a, b) => a.position - b.position)
      .map(({ name, slug }) => ({ name, slug })),
  }));
}

export async function findStack(db: ContentDb): Promise<StackLayer[]> {
  const layers = await db.query.technologyCategories.findMany({
    orderBy: [asc(t.technologyCategories.position)],
    with: {
      technologies: {
        orderBy: [asc(t.technologies.position), asc(t.technologies.name)],
        with: { projects: { with: { project: true } } },
      },
    },
  });
  return layers.map((l) => ({
    name: l.name,
    slug: l.slug,
    description: l.description,
    technologies: l.technologies.map((tech) => ({
      name: tech.name,
      slug: tech.slug,
      description: tech.description,
      yearsOfExperience: tech.yearsOfExperience,
      projects: tech.projects
        .filter(({ project }) => project.published)
        .map(({ project }) => ({ title: project.title, slug: project.slug })),
    })),
  }));
}

type ProjectRow = typeof t.projects.$inferSelect & {
  technologies: { technology: typeof t.technologies.$inferSelect }[];
};

function toProjectSummary(p: ProjectRow): ProjectSummary {
  return {
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    status: p.status,
    featured: p.featured,
    repositoryUrl: p.repositoryUrl,
    liveUrl: p.liveUrl,
    technologies: p.technologies
      .map(({ technology }) => technology)
      .sort((a, b) => a.position - b.position)
      .map(({ name, slug }) => ({ name, slug })),
    updatedAt: iso(p.updatedAt),
  };
}

export async function findProjects(db: ContentDb): Promise<ProjectSummary[]> {
  const rows = await db.query.projects.findMany({
    where: eq(t.projects.published, true),
    orderBy: [desc(t.projects.featured), asc(t.projects.position), desc(t.projects.createdAt)],
    with: { technologies: { with: { technology: true } } },
  });
  return rows.map(toProjectSummary);
}

export async function findProjectBySlug(db: ContentDb, slug: string): Promise<ProjectDetail | null> {
  const p = await db.query.projects.findFirst({
    where: and(eq(t.projects.slug, slug), eq(t.projects.published, true)),
    with: {
      technologies: { with: { technology: true } },
      images: { orderBy: [asc(t.projectImages.position)] },
    },
  });
  if (!p) return null;
  // Un diagrama mal formado se descarta en lugar de romper la página.
  const diagram = p.diagram ? diagramSchema.safeParse(p.diagram) : null;
  return {
    ...toProjectSummary(p),
    sections: {
      overview: p.overview,
      architecture: p.architecture,
      infrastructure: p.infrastructure,
      deployment: p.deployment,
      security: p.security,
      challenges: p.challenges,
      decisions: p.decisions,
      results: p.results,
      lessons: p.lessons,
    },
    diagram: diagram?.success ? diagram.data : null,
    images: p.images.map(({ url, alt, caption }) => ({ url, alt, caption })),
    createdAt: iso(p.createdAt),
  };
}

/** ~220 palabras por minuto para prosa técnica, nunca menos de un minuto. */
export function readingMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

type NoteRow = typeof t.notes.$inferSelect & { tags: { tag: typeof t.tags.$inferSelect }[] };

function toNoteSummary(n: NoteRow): NoteSummary {
  return {
    slug: n.slug,
    title: n.title,
    excerpt: n.excerpt,
    // Lo garantiza la constraint notes_published_has_date para las filas publicadas.
    publishedAt: iso(n.publishedAt ?? n.createdAt),
    updatedAt: iso(n.updatedAt),
    tags: n.tags.map(({ tag }) => ({ name: tag.name, slug: tag.slug })),
  };
}

export async function findNotes(db: ContentDb): Promise<NoteSummary[]> {
  const rows = await db.query.notes.findMany({
    where: eq(t.notes.published, true),
    orderBy: [desc(t.notes.publishedAt)],
    with: { tags: { with: { tag: true } } },
  });
  return rows.map(toNoteSummary);
}

export async function findNoteBySlug(db: ContentDb, slug: string): Promise<NoteDetail | null> {
  const n = await db.query.notes.findFirst({
    where: and(eq(t.notes.slug, slug), eq(t.notes.published, true)),
    with: { tags: { with: { tag: true } } },
  });
  if (!n) return null;
  return { ...toNoteSummary(n), body: n.body, readingMinutes: readingMinutes(n.body) };
}

export async function findEducation(db: ContentDb): Promise<EducationItem[]> {
  const rows = await db.query.education.findMany({
    orderBy: [asc(t.education.position), desc(t.education.endYear)],
  });
  return rows.map(({ kind, title, institution, startYear, endYear, credentialUrl }) => ({
    kind,
    title,
    institution,
    startYear,
    endYear,
    credentialUrl,
  }));
}

export async function findLanguages(db: ContentDb): Promise<Language[]> {
  const rows = await db.query.languages.findMany({ orderBy: [asc(t.languages.position)] });
  return rows.map(({ name, level }) => ({ name, level }));
}
