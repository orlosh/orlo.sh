import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import * as t from "@/db/schema";
import { type Actor, audit } from "@/lib/admin/mutations";
import type { ContentDb } from "@/lib/content/repository";
import { optional } from "@/lib/validation/content";
import { encryptSecret, last4 } from "./secrets";

/** Ajustes y claves de la IA: validación y escritura (con auditoría, nunca con la clave en claro). */

const model = z
  .string()
  .trim()
  .min(3, "Obligatorio")
  .max(80)
  .regex(/^[a-z0-9][a-z0-9.\-]*$/i, "Identificador de modelo no válido");
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

export const aiSettingsInput = z.object({
  enabled: z.boolean(),
  modelDefault: model,
  modelLight: model,
  useSearch: z.boolean(),
  autoMatch: z.boolean(),
  cvDocumentId: z
    .union([z.literal(""), z.uuid()])
    .transform((v) => v || null),
  profileContext: optional(4_000),
  radarEnabled: z.boolean(),
  radarQueries: optional(2_000),
  radarLocations: optional(500),
  radarExcludedCompanies: optional(1_000),
  radarMinMatch: int(0, 100),
  radarMaxPerRun: int(1, 50),
  radarMaxAgeDays: int(1, 90),
  radarFrequencyDays: int(1, 30),
  timeBudgetSeconds: int(20, 800),
  requestsPerMinute: int(1, 120),
  modelFallback: z.boolean(),
});
export type AiSettingsInput = z.infer<typeof aiSettingsInput>;

export const apiKeyInput = z.object({
  label: z.string().trim().min(1, "Obligatorio").max(60),
  // Las claves de Google AI Studio empiezan por "AIza"; se acepta cualquier token razonable por si cambia el formato.
  apiKey: z
    .string()
    .trim()
    .min(20, "La clave parece demasiado corta")
    .max(200)
    .regex(/^[A-Za-z0-9_\-.]+$/, "La clave tiene caracteres no válidos"),
});

export async function saveAiSettings(db: ContentDb, actor: Actor, input: AiSettingsInput) {
  await db.transaction(async (tx) => {
    await tx
      .insert(t.aiSettings)
      .values({ id: 1, ...input })
      .onConflictDoUpdate({ target: t.aiSettings.id, set: { ...input, updatedAt: new Date() } });
    await audit(tx, actor, "update", "aiSettings", 1, Object.keys(input));
  });
}

export async function addApiKey(db: ContentDb, actor: Actor, input: z.infer<typeof apiKeyInput>, secret: string) {
  return db.transaction(async (tx) => {
    const [{ next }] = await tx.select({ next: sql<number>`coalesce(max(${t.aiApiKeys.position}), -1)::int + 1` }).from(t.aiApiKeys);
    const [row] = await tx
      .insert(t.aiApiKeys)
      .values({ label: input.label, keyCiphertext: encryptSecret(input.apiKey, secret), keyLast4: last4(input.apiKey), position: next })
      .returning({ id: t.aiApiKeys.id });
    // Solo la etiqueta en la auditoría: la clave no aparece en ningún registro.
    await audit(tx, actor, "create", "aiApiKey", row.id, ["label"]);
    return row.id;
  });
}

export async function updateApiKey(db: ContentDb, actor: Actor, id: string, change: { enabled?: boolean; resetCooldown?: boolean }) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(t.aiApiKeys)
      .set({
        ...(change.enabled !== undefined ? { enabled: change.enabled } : {}),
        ...(change.resetCooldown ? { cooldownUntil: null, lastError: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(t.aiApiKeys.id, id))
      .returning({ id: t.aiApiKeys.id });
    if (!rows.length) return false;
    await audit(tx, actor, "update", "aiApiKey", id, Object.keys(change));
    return true;
  });
}

/** Sube o baja una clave en el orden de prioridad (intercambia la posición con la vecina). */
export async function moveApiKey(db: ContentDb, actor: Actor, id: string, direction: "up" | "down") {
  return db.transaction(async (tx) => {
    const rows = await tx.select({ id: t.aiApiKeys.id }).from(t.aiApiKeys).orderBy(asc(t.aiApiKeys.position), asc(t.aiApiKeys.createdAt));
    const i = rows.findIndex((r) => r.id === id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= rows.length) return i >= 0;
    [rows[i], rows[j]] = [rows[j], rows[i]];
    for (const [position, r] of rows.entries()) await tx.update(t.aiApiKeys).set({ position }).where(eq(t.aiApiKeys.id, r.id));
    await audit(tx, actor, "update", "aiApiKey", id, ["position"]);
    return true;
  });
}

export async function deleteApiKey(db: ContentDb, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.delete(t.aiApiKeys).where(eq(t.aiApiKeys.id, id)).returning({ id: t.aiApiKeys.id });
    if (!rows.length) return false;
    await audit(tx, actor, "delete", "aiApiKey", id);
    return true;
  });
}

/* ------------------------------------------------------------- lecturas */

/** Lo que el panel puede mostrar de las claves: nunca el texto cifrado ni la clave. */
export const listApiKeys = (db: ContentDb) =>
  db
    .select({
      id: t.aiApiKeys.id,
      label: t.aiApiKeys.label,
      keyLast4: t.aiApiKeys.keyLast4,
      enabled: t.aiApiKeys.enabled,
      successCount: t.aiApiKeys.successCount,
      failureCount: t.aiApiKeys.failureCount,
      lastUsedAt: t.aiApiKeys.lastUsedAt,
      lastErrorAt: t.aiApiKeys.lastErrorAt,
      lastError: t.aiApiKeys.lastError,
      cooldownUntil: t.aiApiKeys.cooldownUntil,
    })
    .from(t.aiApiKeys)
    .orderBy(asc(t.aiApiKeys.position), asc(t.aiApiKeys.createdAt));

/** Estado de cada clave con cada modelo (esperas por límite, uso). */
export const listKeyModels = (db: ContentDb) => db.select().from(t.aiKeyModels).orderBy(asc(t.aiKeyModels.model));

export const listAiRuns = (db: ContentDb, limit = 40) =>
  db
    .select({ run: t.aiRuns, keyLabel: t.aiApiKeys.label })
    .from(t.aiRuns)
    .leftJoin(t.aiApiKeys, eq(t.aiRuns.keyId, t.aiApiKeys.id))
    .orderBy(desc(t.aiRuns.createdAt))
    .limit(limit);

export async function usageByFeature(db: ContentDb, days = 7) {
  return db.execute<{ feature: string; ok: number; error: number; tokens: number }>(sql`
    select split_part(feature, ':', 1) as feature, count(*) filter (where status = 'ok')::int as ok,
      count(*) filter (where status = 'error')::int as error,
      coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0)::int as tokens
    from ai_runs where created_at >= now() - make_interval(days => ${days})
    group by 1 order by 2 desc
  `);
}

export const listRadarRuns = (db: ContentDb, limit = 10) => db.select().from(t.jobRadarRuns).orderBy(desc(t.jobRadarRuns.startedAt)).limit(limit);

export const listLeads = (db: ContentDb, limit = 80) =>
  db.select().from(t.jobLeads).orderBy(sql`case ${t.jobLeads.status} when 'new' then 0 when 'below_threshold' then 1 when 'added' then 2 else 3 end`, desc(t.jobLeads.matchScore), desc(t.jobLeads.createdAt)).limit(limit);
