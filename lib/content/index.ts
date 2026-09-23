import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/db/client";
import * as repo from "./repository";
import { TAGS } from "./tags";

/**
 * Lecturas públicas cacheadas, usadas por las páginas y por la API JSON.
 *
 * Estrategia: las páginas se renderizan en cada petición (el nonce de la CSP
 * lo exige), pero solo se consulta la base de datos cuando una mutación del
 * panel ha invalidado la etiqueta correspondiente. El revalidate de una hora
 * es una red de seguridad para cambios hechos fuera de la app (p. ej. un
 * UPDATE a mano), no el mecanismo principal de frescura.
 *
 * La versión del build forma parte de la clave: en Vercel la caché de datos
 * sobrevive a los despliegues, y así un despliegue nunca lee entradas con la
 * forma de DTO de la versión anterior.
 */
const REVALIDATE_SECONDS = 3600;
const VERSION = process.env.APP_VERSION ?? "dev";

export const getProfile = unstable_cache(() => repo.findProfile(db), ["profile", VERSION], {
  tags: [TAGS.profile],
  revalidate: REVALIDATE_SECONDS,
});

export const getExperience = unstable_cache(() => repo.findExperience(db), ["experience", VERSION], {
  tags: [TAGS.experience],
  revalidate: REVALIDATE_SECONDS,
});

export const getStack = unstable_cache(() => repo.findStack(db), ["stack", VERSION], {
  tags: [TAGS.stack],
  revalidate: REVALIDATE_SECONDS,
});

export const getProjects = unstable_cache(() => repo.findProjects(db), ["projects", VERSION], {
  tags: [TAGS.projects],
  revalidate: REVALIDATE_SECONDS,
});

export const getProject = unstable_cache(
  (slug: string) => repo.findProjectBySlug(db, slug),
  ["project", VERSION],
  { tags: [TAGS.projects], revalidate: REVALIDATE_SECONDS },
);

export const getNotes = unstable_cache(() => repo.findNotes(db), ["notes", VERSION], {
  tags: [TAGS.notes],
  revalidate: REVALIDATE_SECONDS,
});

export const getNote = unstable_cache((slug: string) => repo.findNoteBySlug(db, slug), ["note", VERSION], {
  tags: [TAGS.notes],
  revalidate: REVALIDATE_SECONDS,
});

export const getEducation = unstable_cache(() => repo.findEducation(db), ["education", VERSION], {
  tags: [TAGS.education],
  revalidate: REVALIDATE_SECONDS,
});

export const getLanguages = unstable_cache(() => repo.findLanguages(db), ["languages", VERSION], {
  tags: [TAGS.languages],
  revalidate: REVALIDATE_SECONDS,
});

export type * from "./types";
