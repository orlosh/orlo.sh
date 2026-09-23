import { eq, inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { ContentDb } from "@/lib/content/repository";
import * as t from "@/db/schema";
import { slugify } from "@/lib/validation/content";
import type {
  EducationInput,
  ExperienceInput,
  LanguageInput,
  NoteInput,
  ProfileInput,
  ProjectInput,
  SocialLinkInput,
  TechnologyCategoryInput,
  TechnologyInput,
} from "@/lib/validation/content";

/**
 * Lado de escritura del panel de admin. Funciones puras de un handle de base de datos (para
 * poder probarlas directamente con tests de integración) que reciben entrada ya validada.
 * Cada escritura se ejecuta en una transacción junto con su entrada en el log de auditoría:
 * no puede haber un cambio sin rastro.
 */
export type Actor = { id: string; ip: string | null };
type Tx = Parameters<Parameters<ContentDb["transaction"]>[0]>[0];

async function audit(
  tx: Tx,
  actor: Actor,
  action: "create" | "update" | "delete",
  entity: string,
  entityId: string | number,
  fields?: string[],
) {
  await tx.insert(t.auditLog).values({
    actorId: actor.id,
    action,
    entity,
    entityId: String(entityId),
    metadata: fields ? { fields } : null,
    ipAddress: actor.ip,
  });
}

/* ----------------------------------------------------------------- perfil */

export async function updateProfile(db: ContentDb, actor: Actor, input: ProfileInput) {
  await db.transaction(async (tx) => {
    await tx
      .insert(t.profile)
      .values({ id: 1, ...input })
      .onConflictDoUpdate({ target: t.profile.id, set: { ...input, updatedAt: new Date() } });
    await audit(tx, actor, "update", "profile", 1, Object.keys(input));
  });
}

/* ------------------------------------------- CRUD simple de una sola tabla */

type SimpleEntity = {
  socialLink: { table: typeof t.socialLinks; input: SocialLinkInput };
  technologyCategory: { table: typeof t.technologyCategories; input: TechnologyCategoryInput };
  technology: { table: typeof t.technologies; input: TechnologyInput };
  education: { table: typeof t.education; input: EducationInput };
  language: { table: typeof t.languages; input: LanguageInput };
};

const SIMPLE_TABLES: { [K in keyof SimpleEntity]: SimpleEntity[K]["table"] } = {
  socialLink: t.socialLinks,
  technologyCategory: t.technologyCategories,
  technology: t.technologies,
  education: t.education,
  language: t.languages,
};

type TableWithId = PgTable & { id: typeof t.socialLinks.id };

export async function createSimple<K extends keyof SimpleEntity>(
  db: ContentDb,
  actor: Actor,
  entity: K,
  input: SimpleEntity[K]["input"],
): Promise<string> {
  const table = SIMPLE_TABLES[entity] as unknown as TableWithId;
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(table).values(input as never).returning({ id: table.id });
    await audit(tx, actor, "create", entity, row.id, Object.keys(input));
    return row.id;
  });
}

export async function updateSimple<K extends keyof SimpleEntity>(
  db: ContentDb,
  actor: Actor,
  entity: K,
  id: string,
  input: SimpleEntity[K]["input"],
): Promise<boolean> {
  const table = SIMPLE_TABLES[entity] as unknown as TableWithId;
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(table)
      .set({ ...input, updatedAt: new Date() } as never)
      .where(eq(table.id, id))
      .returning({ id: table.id });
    if (!rows.length) return false;
    await audit(tx, actor, "update", entity, id, Object.keys(input));
    return true;
  });
}

export async function deleteSimple(
  db: ContentDb,
  actor: Actor,
  entity: keyof SimpleEntity,
  id: string,
): Promise<boolean> {
  const table = SIMPLE_TABLES[entity] as unknown as TableWithId;
  return db.transaction(async (tx) => {
    const rows = await tx.delete(table).where(eq(table.id, id)).returning({ id: table.id });
    if (!rows.length) return false;
    await audit(tx, actor, "delete", entity, id);
    return true;
  });
}

/* ------------------------------------------------------------ experiencia */

async function writeExperienceChildren(tx: Tx, experienceId: string, input: ExperienceInput) {
  await tx.delete(t.experienceHighlights).where(eq(t.experienceHighlights.experienceId, experienceId));
  if (input.highlights.length) {
    await tx
      .insert(t.experienceHighlights)
      .values(input.highlights.map((body, position) => ({ experienceId, body, position })));
  }
  await tx.delete(t.experienceTechnologies).where(eq(t.experienceTechnologies.experienceId, experienceId));
  const ids = [...new Set(input.technologyIds)];
  if (ids.length) {
    await tx.insert(t.experienceTechnologies).values(ids.map((technologyId) => ({ experienceId, technologyId })));
  }
}

function experienceColumns({ highlights: _h, technologyIds: _t, ...cols }: ExperienceInput) {
  return cols;
}

export async function createExperience(db: ContentDb, actor: Actor, input: ExperienceInput): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(t.experiences).values(experienceColumns(input)).returning({ id: t.experiences.id });
    await writeExperienceChildren(tx, row.id, input);
    await audit(tx, actor, "create", "experience", row.id, Object.keys(input));
    return row.id;
  });
}

export async function updateExperience(db: ContentDb, actor: Actor, id: string, input: ExperienceInput) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(t.experiences)
      .set({ ...experienceColumns(input), updatedAt: new Date() })
      .where(eq(t.experiences.id, id))
      .returning({ id: t.experiences.id });
    if (!rows.length) return false;
    await writeExperienceChildren(tx, id, input);
    await audit(tx, actor, "update", "experience", id, Object.keys(input));
    return true;
  });
}

export async function deleteExperience(db: ContentDb, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.delete(t.experiences).where(eq(t.experiences.id, id)).returning({ id: t.experiences.id });
    if (!rows.length) return false;
    await audit(tx, actor, "delete", "experience", id);
    return true;
  });
}

/* -------------------------------------------------------------- proyectos */

async function writeProjectChildren(tx: Tx, projectId: string, input: ProjectInput) {
  await tx.delete(t.projectTechnologies).where(eq(t.projectTechnologies.projectId, projectId));
  const ids = [...new Set(input.technologyIds)];
  if (ids.length) {
    await tx.insert(t.projectTechnologies).values(ids.map((technologyId) => ({ projectId, technologyId })));
  }
  await tx.delete(t.projectImages).where(eq(t.projectImages.projectId, projectId));
  if (input.images.length) {
    await tx
      .insert(t.projectImages)
      .values(input.images.map((img, position) => ({ projectId, ...img, position })));
  }
}

function projectColumns({ technologyIds: _t, images: _i, ...cols }: ProjectInput) {
  return cols;
}

export async function createProject(db: ContentDb, actor: Actor, input: ProjectInput): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(t.projects).values(projectColumns(input)).returning({ id: t.projects.id });
    await writeProjectChildren(tx, row.id, input);
    await audit(tx, actor, "create", "project", row.id, Object.keys(input));
    return row.id;
  });
}

export async function updateProject(db: ContentDb, actor: Actor, id: string, input: ProjectInput) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(t.projects)
      .set({ ...projectColumns(input), updatedAt: new Date() })
      .where(eq(t.projects.id, id))
      .returning({ id: t.projects.id });
    if (!rows.length) return false;
    await writeProjectChildren(tx, id, input);
    await audit(tx, actor, "update", "project", id, Object.keys(input));
    return true;
  });
}

export async function deleteProject(db: ContentDb, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.delete(t.projects).where(eq(t.projects.id, id)).returning({ id: t.projects.id });
    if (!rows.length) return false;
    await audit(tx, actor, "delete", "project", id);
    return true;
  });
}

/* ------------------------------------------------------------------ notas */

async function upsertTags(tx: Tx, names: string[]): Promise<string[]> {
  const unique = new Map<string, string>();
  for (const name of names) {
    const slug = slugify(name);
    if (slug) unique.set(slug, name.trim());
  }
  if (!unique.size) return [];
  await tx
    .insert(t.tags)
    .values([...unique].map(([slug, name]) => ({ slug, name })))
    .onConflictDoNothing({ target: t.tags.slug });
  const rows = await tx.select({ id: t.tags.id }).from(t.tags).where(inArray(t.tags.slug, [...unique.keys()]));
  return rows.map((r) => r.id);
}

async function writeNoteTags(tx: Tx, noteId: string, tagNames: string[]) {
  await tx.delete(t.noteTags).where(eq(t.noteTags.noteId, noteId));
  const tagIds = await upsertTags(tx, tagNames);
  if (tagIds.length) await tx.insert(t.noteTags).values(tagIds.map((tagId) => ({ noteId, tagId })));
}

export async function createNote(db: ContentDb, actor: Actor, input: NoteInput): Promise<string> {
  const { tags, ...cols } = input;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(t.notes)
      .values({ ...cols, publishedAt: cols.published ? new Date() : null })
      .returning({ id: t.notes.id });
    await writeNoteTags(tx, row.id, tags);
    await audit(tx, actor, "create", "note", row.id, Object.keys(input));
    return row.id;
  });
}

export async function updateNote(db: ContentDb, actor: Actor, id: string, input: NoteInput) {
  const { tags, ...cols } = input;
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ publishedAt: t.notes.publishedAt }).from(t.notes).where(eq(t.notes.id, id));
    if (!current) return false;
    // Se conserva la primera fecha de publicación cuando una nota se vuelve a guardar o publicar.
    const publishedAt = cols.published ? (current.publishedAt ?? new Date()) : current.publishedAt;
    await tx
      .update(t.notes)
      .set({ ...cols, publishedAt, updatedAt: new Date() })
      .where(eq(t.notes.id, id));
    await writeNoteTags(tx, id, tags);
    await audit(tx, actor, "update", "note", id, Object.keys(input));
    return true;
  });
}

export async function deleteNote(db: ContentDb, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.delete(t.notes).where(eq(t.notes.id, id)).returning({ id: t.notes.id });
    if (!rows.length) return false;
    await audit(tx, actor, "delete", "note", id);
    return true;
  });
}

/* -------------------------------------------------------- errores de BD */

/**
 * Traduce las violaciones de constraints de PostgreSQL a mensajes
 * con los que el editor pueda actuar.
 */
export function describeDbError(err: unknown): { message: string; field?: string } | null {
  const e = (err as { cause?: unknown })?.cause ?? err;
  const code = (e as { code?: string })?.code;
  const constraint = (e as { constraint_name?: string })?.constraint_name ?? "";
  if (code === "23505") {
    if (constraint.includes("slug")) return { message: "Ya existe un elemento con ese slug", field: "slug" };
    if (constraint.includes("name")) return { message: "Ya existe un elemento con ese nombre", field: "name" };
    return { message: "Ya existe un elemento con esos datos" };
  }
  if (code === "23503") {
    return { message: "No se puede eliminar: otros elementos dependen de este (p. ej. tecnologías de una capa)" };
  }
  if (code === "23514") return { message: `Datos no válidos (${constraint})` };
  return null;
}
