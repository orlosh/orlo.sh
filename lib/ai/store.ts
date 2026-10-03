import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import type { ContentDb } from "@/lib/content/repository";
import { loadProfile } from "@/lib/job-search/repository";
import { getGoal } from "@/lib/job-search/repository";
import { AiError, createGemini, type KeyStore, type RunEntry } from "./gemini";
import { decryptSecret } from "./secrets";

/**
 * Persistencia de la IA: ajustes (fila única), claves cifradas, registro de llamadas y el
 * contexto del candidato que se envía a Gemini. Funciones de un handle de base de datos, como
 * el resto del proyecto, para poder probarlas contra PostgreSQL.
 */

export type AiSettings = typeof t.aiSettings.$inferSelect;

export const AI_DEFAULTS: AiSettings = {
  id: 1,
  enabled: false,
  modelDefault: "gemini-3.8-flash",
  modelLight: "gemini-3.5-flash-lite",
  useSearch: true,
  autoMatch: true,
  cvDocumentId: null,
  profileContext: null,
  radarEnabled: false,
  radarQueries: null,
  radarLocations: null,
  radarExcludedCompanies: null,
  radarMinMatch: 80,
  radarMaxPerRun: 8,
  radarMaxAgeDays: 14,
  radarFrequencyDays: 1,
  radarLastRunAt: null,
  timeBudgetSeconds: 240,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

export async function getAiSettings(db: ContentDb): Promise<AiSettings> {
  const [row] = await db.select().from(t.aiSettings).where(eq(t.aiSettings.id, 1));
  return row ?? AI_DEFAULTS;
}

/** Claves activas, descifradas y en orden; las que no se pueden descifrar se omiten. */
export function dbKeyStore(db: ContentDb, secret: string): KeyStore {
  return {
    async keys() {
      const rows = await db.select().from(t.aiApiKeys).where(eq(t.aiApiKeys.enabled, true)).orderBy(asc(t.aiApiKeys.position), asc(t.aiApiKeys.createdAt));
      return rows.flatMap((r) => {
        const apiKey = decryptSecret(r.keyCiphertext, secret);
        return apiKey ? [{ id: r.id, label: r.label, apiKey, cooldownUntil: r.cooldownUntil }] : [];
      });
    },
    async success(id, at) {
      await db
        .update(t.aiApiKeys)
        .set({ successCount: sql`${t.aiApiKeys.successCount} + 1`, lastUsedAt: at, cooldownUntil: null })
        .where(eq(t.aiApiKeys.id, id));
    },
    async failure(id, error, cooldownUntil, at) {
      await db
        .update(t.aiApiKeys)
        .set({ failureCount: sql`${t.aiApiKeys.failureCount} + 1`, lastErrorAt: at, lastError: error.slice(0, 500), cooldownUntil, lastUsedAt: at })
        .where(eq(t.aiApiKeys.id, id));
    },
  };
}

export async function logRun(db: ContentDb, e: RunEntry) {
  await db.insert(t.aiRuns).values({ ...e, error: e.error?.slice(0, 1000) ?? null });
}

/** Cliente listo para usar, o error claro si la IA está desactivada en el panel. */
export async function aiContext(db: ContentDb, secret: string, { fetchImpl = fetch, now = () => new Date() } = {}) {
  const settings = await getAiSettings(db);
  if (!settings.enabled) throw new AiError("disabled", "La IA está desactivada. Actívala en Ajustes → IA.");
  const gemini = createGemini({ fetch: fetchImpl, store: dbKeyStore(db, secret), log: (e) => logRun(db, e), now });
  return { db, settings, gemini, now, fetchImpl };
}
export type AiCtx = Awaited<ReturnType<typeof aiContext>>;

/* --------------------------------------------------------- contexto */

/**
 * Texto con el que se compara cada oferta: el CV elegido en los ajustes (o el más reciente con
 * texto) y, si no hay ninguno, la experiencia registrada en el portfolio. Más las habilidades
 * del stack, el contexto adicional y las preferencias del objetivo.
 */
export async function candidateContext(db: ContentDb, settings: AiSettings) {
  const { goal } = await getGoal(db);
  const profile = await loadProfile(db, goal.extraSkills, goal.targetSeniority, goal.targetRoles);
  const cv =
    (settings.cvDocumentId
      ? await db.query.jobDocuments.findFirst({ where: and(eq(t.jobDocuments.id, settings.cvDocumentId), isNotNull(t.jobDocuments.content)) })
      : null) ??
    (await db.query.jobDocuments.findFirst({
      where: and(eq(t.jobDocuments.kind, "cv"), isNotNull(t.jobDocuments.content), eq(t.jobDocuments.archived, false)),
      orderBy: [desc(t.jobDocuments.updatedAt)],
    }));

  const experienceText = profile.experiences
    .map((e) => [`${e.label} (${e.startDate} – ${e.endDate ?? "actualidad"})`, ...e.lines.map((l) => `- ${l}`), e.technologies?.length ? `Tecnologías: ${e.technologies.join(", ")}` : ""].filter(Boolean).join("\n"))
    .join("\n\n");
  const projectsText = profile.projects.map((p) => `- ${p.title}: ${p.summary} (${p.technologies.join(", ")})`).join("\n");
  const cvText = cv?.content?.trim() || experienceText;

  // Todo lo que la IA puede citar como evidencia: CV + experiencia + proyectos + contexto.
  const evidenceSource = [cvText, experienceText, projectsText, settings.profileContext ?? "", profile.skills.join(", ")].join("\n");

  const prompt = [
    `CV${cv ? ` («${cv.name}${cv.version ? ` ${cv.version}` : ""}»)` : " (generado desde la experiencia registrada)"}:\n${cvText}`,
    projectsText ? `PROYECTOS:\n${projectsText}` : "",
    profile.skills.length ? `HABILIDADES DECLARADAS: ${profile.skills.join(", ")}` : "",
    settings.profileContext ? `CONTEXTO ADICIONAL (hechos aportados por el candidato):\n${settings.profileContext}` : "",
    `PREFERENCIAS: roles ${goal.targetRoles.join(", ") || "—"}; nivel ${goal.targetSeniority ?? "—"}; modalidad ${goal.preferredWorkplaces.join(", ") || "—"}; ubicaciones ${goal.preferredLocations.join(", ") || "—"}; salario mínimo ${goal.minSalary ? `${goal.minSalary} ${goal.currency ?? ""}` : "—"}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { prompt, evidenceSource, cvName: cv ? `${cv.name}${cv.version ? ` (${cv.version})` : ""}` : null, hasCv: !!cvText.trim(), goal, profile };
}
export type CandidateCtx = Awaited<ReturnType<typeof candidateContext>>;
