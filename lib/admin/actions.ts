"use server";

import { headers } from "next/headers";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { auth } from "@/lib/auth";
import { requireAdminAction, UnauthorizedError } from "@/lib/auth/guard";
import { INVALIDATES } from "@/lib/content/tags";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { clientIp } from "@/lib/security/client-ip";
import * as v from "@/lib/validation/content";
import { type ActionState, bool, csv, images, json, lines, list, str } from "./form";
import * as m from "./mutations";

/**
 * Server Actions de /admin. Cada una:
 *   1. vuelve a comprobar que quien llama es admin (las actions son endpoints públicos),
 *   2. valida el formulario con el esquema de Zod compartido,
 *   3. escribe a través de lib/admin/mutations (transacción + log de auditoría),
 *   4. invalida exactamente las etiquetas de caché a las que puede afectar el cambio.
 * CSRF: Next.js solo ejecuta Server Actions en peticiones POST cuyo Origin
 * coincide con el Host, y la cookie de sesión es SameSite=Lax.
 */

type Entity = keyof typeof INVALIDATES;

async function actor(): Promise<m.Actor> {
  const session = await requireAdminAction();
  return { id: session.user.id, ip: clientIp(await headers(), env().TRUSTED_IP_HEADER) };
}

function invalidate(entity: Entity) {
  for (const tag of INVALIDATES[entity]) updateTag(tag);
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Pipeline compartido. Devuelve un ActionState para useActionState, o redirige
 * (fuera del bloque try, porque redirect() funciona lanzando una excepción).
 */
async function run<S extends z.ZodType>(
  entity: Entity,
  schema: S,
  raw: unknown,
  op: (a: m.Actor, data: z.infer<S>) => Promise<unknown>,
  { success, redirectTo }: { success: string; redirectTo?: string | ((result: unknown) => string) },
): Promise<ActionState> {
  let result: unknown;
  try {
    const a = await actor();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", message: "Revisa los campos marcados", fieldErrors: fieldErrors(parsed.error) };
    }
    result = await op(a, parsed.data);
    if (result === false) return { status: "error", message: "El elemento ya no existe" };
    invalidate(entity);
    logger.info({ entity, actor: a.id }, "admin mutation");
  } catch (err) {
    if (err instanceof UnauthorizedError) return { status: "error", message: "No autorizado" };
    const known = m.describeDbError(err);
    if (known) {
      return {
        status: "error",
        message: known.message,
        fieldErrors: known.field ? { [known.field]: known.message } : undefined,
      };
    }
    logger.error({ err, entity }, "admin mutation failed");
    return { status: "error", message: "Error inesperado; queda registrado en los logs" };
  }
  if (redirectTo) redirect(typeof redirectTo === "function" ? redirectTo(result) : redirectTo);
  return { status: "success", message: success };
}

const idSchema = z.uuid();
/** Las actions de borrado no llevan más payload que el id. */
const noPayload = z.undefined();

function idFrom(fd: FormData): string {
  const id = str(fd, "id");
  if (!idSchema.safeParse(id).success) throw new Error("invalid id");
  return id;
}

/* ----------------------------------------------------------------- perfil */

export async function saveProfile(_: ActionState, fd: FormData) {
  return run(
    "profile",
    v.profileInput,
    {
      displayName: str(fd, "displayName"),
      headline: str(fd, "headline"),
      location: str(fd, "location"),
      summary: str(fd, "summary"),
      contactEmail: str(fd, "contactEmail"),
    },
    (a, data) => m.updateProfile(db, a, data),
    { success: "Perfil guardado" },
  );
}

/* ----------------------------------------------------- entidades simples */

const SIMPLE = {
  socialLink: {
    schema: v.socialLinkInput,
    read: (fd: FormData) => ({
      kind: str(fd, "kind"),
      label: str(fd, "label"),
      url: str(fd, "url"),
      position: str(fd, "position") || 0,
    }),
  },
  technologyCategory: {
    schema: v.technologyCategoryInput,
    read: (fd: FormData) => ({
      name: str(fd, "name"),
      slug: str(fd, "slug") || v.slugify(str(fd, "name")),
      description: str(fd, "description"),
      position: str(fd, "position") || 0,
    }),
  },
  technology: {
    schema: v.technologyInput,
    read: (fd: FormData) => ({
      name: str(fd, "name"),
      slug: str(fd, "slug") || v.slugify(str(fd, "name")),
      categoryId: str(fd, "categoryId"),
      description: str(fd, "description"),
      yearsOfExperience: str(fd, "yearsOfExperience"),
      position: str(fd, "position") || 0,
    }),
  },
  education: {
    schema: v.educationInput,
    read: (fd: FormData) => ({
      kind: str(fd, "kind"),
      title: str(fd, "title"),
      institution: str(fd, "institution"),
      startYear: str(fd, "startYear"),
      endYear: str(fd, "endYear"),
      credentialUrl: str(fd, "credentialUrl"),
      position: str(fd, "position") || 0,
    }),
  },
  language: {
    schema: v.languageInput,
    read: (fd: FormData) => ({
      name: str(fd, "name"),
      level: str(fd, "level"),
      position: str(fd, "position") || 0,
    }),
  },
} as const;

type SimpleKey = keyof typeof SIMPLE;
const SIMPLE_KEYS = Object.keys(SIMPLE) as SimpleKey[];

function simpleKey(fd: FormData): SimpleKey {
  const k = str(fd, "entity") as SimpleKey;
  if (!SIMPLE_KEYS.includes(k)) throw new Error("invalid entity");
  return k;
}

/** Crea o actualiza (cuando hay un id) cualquier entidad de una sola tabla. */
export async function saveSimple(_: ActionState, fd: FormData): Promise<ActionState> {
  const entity = simpleKey(fd);
  const { schema, read } = SIMPLE[entity];
  const id = str(fd, "id");
  return run(
    entity,
    schema,
    read(fd),
    (a, data) =>
      id ? m.updateSimple(db, a, entity, idFrom(fd), data as never) : m.createSimple(db, a, entity, data as never),
    { success: id ? "Guardado" : "Creado" },
  );
}

export async function deleteSimpleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const entity = simpleKey(fd);
  return run(entity, noPayload, undefined, (a) => m.deleteSimple(db, a, entity, idFrom(fd)), {
    success: "Eliminado",
  });
}

/* ------------------------------------------------------------ experiencia */

function readExperience(fd: FormData) {
  return {
    company: str(fd, "company"),
    publicCompany: str(fd, "publicCompany"),
    role: str(fd, "role"),
    client: str(fd, "client"),
    location: str(fd, "location"),
    employmentType: str(fd, "employmentType"),
    description: str(fd, "description"),
    startDate: str(fd, "startDate"),
    endDate: str(fd, "endDate"),
    visible: bool(fd, "visible"),
    highlights: lines(fd, "highlights"),
    technologyIds: list(fd, "technologyIds"),
  };
}

export async function saveExperience(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  return run(
    "experience",
    v.experienceInput,
    readExperience(fd),
    (a, data) => (id ? m.updateExperience(db, a, idFrom(fd), data) : m.createExperience(db, a, data)),
    { success: "Experiencia guardada", redirectTo: id ? undefined : "/admin/experience" },
  );
}

export async function deleteExperienceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run("experience", noPayload, undefined, (a) => m.deleteExperience(db, a, idFrom(fd)), {
    success: "Eliminada",
    redirectTo: "/admin/experience",
  });
}

/* -------------------------------------------------------------- proyectos */

function readProject(fd: FormData) {
  const text = (k: string) => str(fd, k);
  return {
    slug: text("slug"),
    title: text("title"),
    summary: text("summary"),
    status: text("status"),
    featured: bool(fd, "featured"),
    published: bool(fd, "published"),
    repositoryUrl: text("repositoryUrl"),
    liveUrl: text("liveUrl"),
    overview: text("overview"),
    architecture: text("architecture"),
    infrastructure: text("infrastructure"),
    deployment: text("deployment"),
    security: text("security"),
    challenges: text("challenges"),
    decisions: text("decisions"),
    results: text("results"),
    lessons: text("lessons"),
    diagram: json(fd, "diagram"),
    position: text("position") || 0,
    technologyIds: list(fd, "technologyIds"),
    images: images(fd, "images"),
  };
}

export async function saveProject(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  return run(
    "project",
    v.projectInput,
    readProject(fd),
    (a, data) => (id ? m.updateProject(db, a, idFrom(fd), data) : m.createProject(db, a, data)),
    { success: "Proyecto guardado", redirectTo: id ? undefined : "/admin/projects" },
  );
}

export async function deleteProjectAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run("project", noPayload, undefined, (a) => m.deleteProject(db, a, idFrom(fd)), {
    success: "Eliminado",
    redirectTo: "/admin/projects",
  });
}

/* ------------------------------------------------------------------ notas */

function readNote(fd: FormData) {
  return {
    slug: str(fd, "slug") || v.slugify(str(fd, "title")),
    title: str(fd, "title"),
    excerpt: str(fd, "excerpt"),
    body: str(fd, "body"),
    published: bool(fd, "published"),
    tags: csv(fd, "tags"),
  };
}

export async function saveNote(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id");
  return run(
    "note",
    v.noteInput,
    readNote(fd),
    (a, data) => (id ? m.updateNote(db, a, idFrom(fd), data) : m.createNote(db, a, data)),
    { success: "Nota guardada", redirectTo: id ? undefined : "/admin/notes" },
  );
}

export async function deleteNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run("note", noPayload, undefined, (a) => m.deleteNote(db, a, idFrom(fd)), {
    success: "Eliminada",
    redirectTo: "/admin/notes",
  });
}

/* ----------------------------------------------------------------- sesión */

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/admin/login");
}
