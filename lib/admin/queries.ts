import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import * as t from "@/db/schema";

/**
 * Lado de lectura del admin: todo, incluidos borradores y filas ocultas, nunca en caché
 * (el editor debe ver siempre el estado actual). Solo se llama desde páginas
 * que ya han pasado requireAdminPage().
 */

export async function dashboardCounts() {
  const [row] = await db.execute<{
    projects: number;
    drafts: number;
    notes: number;
    experiences: number;
    technologies: number;
  }>(sql`
    select
      (select count(*)::int from projects) as projects,
      (select count(*)::int from notes where not published) as drafts,
      (select count(*)::int from notes) as notes,
      (select count(*)::int from experiences) as experiences,
      (select count(*)::int from technologies) as technologies
  `);
  return row;
}

export function recentAudit(limit = 20) {
  return db
    .select({
      id: t.auditLog.id,
      action: t.auditLog.action,
      entity: t.auditLog.entity,
      entityId: t.auditLog.entityId,
      metadata: t.auditLog.metadata,
      createdAt: t.auditLog.createdAt,
      actor: t.user.email,
    })
    .from(t.auditLog)
    .leftJoin(t.user, eq(t.auditLog.actorId, t.user.id))
    .orderBy(desc(t.auditLog.createdAt))
    .limit(limit);
}

export const getProfileRow = () => db.query.profile.findFirst();
export const listSocialLinks = () => db.query.socialLinks.findMany({ orderBy: [asc(t.socialLinks.position)] });

export const listTechnologyOptions = () =>
  db.query.technologyCategories.findMany({
    orderBy: [asc(t.technologyCategories.position)],
    with: { technologies: { orderBy: [asc(t.technologies.position), asc(t.technologies.name)] } },
  });

export const listExperiences = () =>
  db.query.experiences.findMany({ orderBy: [desc(t.experiences.startDate)] });

export const getExperienceRow = (id: string) =>
  db.query.experiences.findFirst({
    where: eq(t.experiences.id, id),
    with: { highlights: { orderBy: [asc(t.experienceHighlights.position)] }, technologies: true },
  });

export const listProjectRows = () =>
  db.query.projects.findMany({ orderBy: [asc(t.projects.position), desc(t.projects.createdAt)] });

export const getProjectRow = (id: string) =>
  db.query.projects.findFirst({
    where: eq(t.projects.id, id),
    with: { technologies: true, images: { orderBy: [asc(t.projectImages.position)] } },
  });

export const listNoteRows = () => db.query.notes.findMany({ orderBy: [desc(t.notes.updatedAt)] });

export const getNoteRow = (id: string) =>
  db.query.notes.findFirst({ where: eq(t.notes.id, id), with: { tags: { with: { tag: true } } } });

export const listEducation = () => db.query.education.findMany({ orderBy: [asc(t.education.position)] });
export const listLanguages = () => db.query.languages.findMany({ orderBy: [asc(t.languages.position)] });
