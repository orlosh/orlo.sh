import { asc, eq, inArray, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { type Actor, audit } from "@/lib/admin/mutations";
import { todayIn } from "@/lib/job-search/dates";
import { createOpportunity } from "@/lib/job-search/mutations";
import { opportunityInput } from "@/lib/job-search/validation";
import { evaluateFit } from "./features";
import { AiError } from "./gemini";
import { readJobPage } from "./page";
import { data, SYSTEM } from "./prompts";
import * as Sc from "./schemas";
import { type AiCtx, candidateContext } from "./store";

/**
 * Radar de ofertas: busca con Google Search puestos recientes que encajen con el perfil,
 * comprueba que cada URL existe de verdad (la IA puede inventar enlaces), descarta duplicados,
 * evalúa el encaje con el CV y lleva a la bandeja las que superan el umbral (80 % por defecto).
 * Todo queda registrado en job_leads, también lo descartado, para no evaluarlo dos veces.
 */

/** Actor de sistema para la auditoría de las ejecuciones programadas. */
export const SYSTEM_ACTOR: Actor = { id: null, ip: null };

const lines = (s: string | null) =>
  (s ?? "")
    .split(/\r?\n|,/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Normaliza una URL para detectar duplicados: sin fragmento ni parámetros de seguimiento. */
export function canonicalUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.protocol = "https:";
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref$|refid|trk|src$|source$|gh_src|lever-origin)/i.test(k)) u.searchParams.delete(k);
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function isDue(lastRunAt: Date | null, frequencyDays: number, now: Date) {
  // Margen de 2 h: el cron diario no siempre dispara a la misma hora exacta.
  return !lastRunAt || now.getTime() - lastRunAt.getTime() >= frequencyDays * 86_400_000 - 2 * 3_600_000;
}

type Log = { at: string; msg: string }[];

export async function runRadar(ctx: AiCtx, trigger: "cron" | "manual", actor: Actor = SYSTEM_ACTOR) {
  const { settings: st, db } = ctx;
  if (!st.useSearch) throw new AiError("bad_request", "El radar necesita el acceso web (Google Search). Actívalo en Ajustes → IA.");
  const started = Date.now();
  const budgetMs = st.timeBudgetSeconds * 1000;
  const outOfTime = () => Date.now() - started > budgetMs;
  // Cada llamada puede esperar a que haya cuota, pero nunca más de lo que queda de presupuesto.
  const waitBudget = () => Math.max(0, Math.min(60_000, budgetMs - (Date.now() - started) - 30_000));
  const log: Log = [];
  const say = (msg: string) => log.push({ at: new Date().toISOString(), msg });

  const [run] = await db.insert(t.jobRadarRuns).values({ trigger }).returning({ id: t.jobRadarRuns.id });
  await db.update(t.aiSettings).set({ radarLastRunAt: ctx.now() }).where(eq(t.aiSettings.id, 1));
  let found = 0;
  let evaluated = 0;
  let added = 0;

  try {
    const cand = await candidateContext(db, st);
    if (!cand.hasCv) throw new AiError("bad_request", "El radar necesita tu CV (Documentos) para medir el encaje.");
    const queries = lines(st.radarQueries);
    const roles = cand.goal.targetRoles;
    if (!queries.length && !roles.length) throw new AiError("bad_request", "Define búsquedas del radar o roles objetivo en Ajustes.");
    const excluded = lines(st.radarExcludedCompanies).map((c) => c.toLowerCase());
    const today = todayIn("UTC", ctx.now());

    // 1. Búsqueda con Google Search.
    const { data: res, result } = await ctx.gemini.generateJson(
      {
        feature: "radar_search",
        model: st.modelDefault,
        maxWaitMs: waitBudget(),
        system: SYSTEM,
        search: true,
        temperature: 0.2,
        prompt: [
          `Hoy es ${today}. Busca ofertas de empleo ABIERTAS publicadas en los últimos ${st.radarMaxAgeDays} días que encajen con este perfil.`,
          queries.length ? `Búsquedas: ${queries.join(" | ")}` : `Roles: ${roles.join(", ")}`,
          cand.goal.targetSeniority ? `Nivel: ${cand.goal.targetSeniority}` : "",
          lines(st.radarLocations).length ? `Ubicaciones o modalidad: ${lines(st.radarLocations).join(", ")}` : cand.goal.preferredWorkplaces.length ? `Modalidad: ${cand.goal.preferredWorkplaces.join(", ")}` : "",
          excluded.length ? `Excluye estas empresas: ${excluded.join(", ")}` : "",
          data("HABILIDADES DEL CANDIDATO", cand.profile.skills.slice(0, 60).join(", ")),
          "Devuelve solo ofertas concretas con la URL directa de la oferta (página de empleo de la empresa, ATS como Greenhouse/Lever/Ashby o portales de empleo). No devuelvas listados de búsqueda ni inventes URLs: si no tienes la URL exacta, omite la oferta.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
      Sc.radarSearch,
    );
    say(`Búsqueda: ${result.searchQueries.join(" · ") || "sin consultas registradas"} → ${res.jobs.length} candidatas`);

    // 2. Normalización y duplicados (contra el radar y contra las oportunidades ya guardadas).
    const candidates = new Map<string, (typeof res.jobs)[number]>();
    for (const j of res.jobs) {
      const url = canonicalUrl(j.url);
      if (!url || candidates.has(url)) continue;
      if (j.company && excluded.includes(j.company.toLowerCase())) continue;
      candidates.set(url, j);
    }
    const urls = [...candidates.keys()];
    const known = urls.length
      ? new Set([
          ...(await db.select({ url: t.jobLeads.url }).from(t.jobLeads).where(inArray(t.jobLeads.url, urls))).map((r) => r.url),
          ...(await db.select({ url: t.jobOpportunities.url }).from(t.jobOpportunities).where(inArray(t.jobOpportunities.url, urls))).map((r) => r.url!),
        ])
      : new Set<string>();
    const fresh = urls.filter((u) => !known.has(u));
    found = fresh.length;
    say(`${fresh.length} nuevas (${urls.length - fresh.length} ya conocidas)`);

    // 3. Todas las nuevas quedan registradas como pendientes; después se evalúan las pendientes
    //    más antiguas (también las que quedaron de ejecuciones anteriores) dentro del presupuesto.
    if (fresh.length) {
      await db
        .insert(t.jobLeads)
        .values(
          fresh.map((url) => {
            const j = candidates.get(url)!;
            return { url, title: j.title.slice(0, 200), companyName: j.company ?? null, location: j.location ?? null, snippet: j.snippet ?? null, postedAt: j.postedAt && /^\d{4}-\d{2}-\d{2}$/.test(j.postedAt) ? j.postedAt : null, runId: run.id };
          }),
        )
        .onConflictDoNothing();
    }
    const pending = await db.select().from(t.jobLeads).where(eq(t.jobLeads.status, "new")).orderBy(asc(t.jobLeads.createdAt)).limit(st.radarMaxPerRun);

    for (const lead of pending) {
      if (outOfTime()) break;
      const page = await readJobPage(lead.url, ctx.fetchImpl);
      if (!page.ok || (page.text ?? "").length < 200) {
        await db
          .update(t.jobLeads)
          .set({ status: "unreachable", match: { error: page.ok ? "Página sin contenido legible" : page.error }, updatedAt: ctx.now() })
          .where(eq(t.jobLeads.id, lead.id));
        say(`No verificable: ${lead.url} (${page.ok ? "sin contenido" : page.error})`);
        continue;
      }
      evaluated++;
      const title = page.posting?.title ?? lead.title;
      const company = page.posting?.company ?? lead.companyName;
      const jd = [`${title}${company ? ` — ${company}` : ""}`, page.posting?.description ?? page.text].join("\n").slice(0, 20_000);
      let match;
      try {
        match = await evaluateFit(ctx, cand, jd, st.modelLight, "radar_eval", waitBudget());
      } catch (err) {
        say(`Error al evaluar ${lead.url}: ${(err as Error).message}`);
        // Sin cuota no tiene sentido seguir: la oferta queda pendiente para la próxima ejecución.
        if (err instanceof AiError && (err.kind === "exhausted" || err.kind === "no_keys")) break;
        continue;
      }
      const pass = match.score >= st.radarMinMatch;
      await db
        .update(t.jobLeads)
        .set({
          title: title.slice(0, 200),
          companyName: company,
          location: page.posting?.location ?? lead.location,
          postedAt: page.posting?.datePosted ?? lead.postedAt,
          status: pass ? "new" : "below_threshold",
          matchScore: match.score,
          match,
          updatedAt: ctx.now(),
        })
        .where(eq(t.jobLeads.id, lead.id));
      if (pass) {
        if (await addLeadAsOpportunity(ctx, actor, lead.id)) added++;
        say(`Añadida (${match.score}%): ${title}${company ? ` · ${company}` : ""}`);
      } else {
        say(`Por debajo del umbral (${match.score}%): ${title}`);
      }
    }

    const [{ n: left }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.jobLeads).where(eq(t.jobLeads.status, "new"));
    if (left) say(`${left} pendientes para la próxima ejecución`);
    const status = left ? "partial" : "ok";
    await db.update(t.jobRadarRuns).set({ status, found, evaluated, added, log, finishedAt: ctx.now() }).where(eq(t.jobRadarRuns.id, run.id));
    return { runId: run.id, found, evaluated, added, status };
  } catch (err) {
    say((err as Error).message);
    await db
      .update(t.jobRadarRuns)
      .set({ status: "error", found, evaluated, added, log, error: (err as Error).message.slice(0, 1000), finishedAt: ctx.now() })
      .where(eq(t.jobRadarRuns.id, run.id));
    throw err;
  }
}

/** Convierte un resultado del radar en oportunidad de la bandeja, con su encaje ya calculado. */
export async function addLeadAsOpportunity(ctx: Pick<AiCtx, "db" | "now">, actor: Actor, leadId: string) {
  const lead = await ctx.db.query.jobLeads.findFirst({ where: eq(t.jobLeads.id, leadId) });
  if (!lead) return null;
  if (lead.opportunityId) return lead.opportunityId;
  const existing = await ctx.db.query.jobOpportunities.findFirst({ where: eq(t.jobOpportunities.url, lead.url) });
  const id =
    existing?.id ??
    (await createOpportunity(
      ctx.db,
      actor,
      opportunityInput.parse({
        title: lead.title,
        companyName: lead.companyName ?? "",
        url: lead.url,
        source: "radar",
        location: lead.location ?? "",
        postedAt: lead.postedAt ?? "",
        status: "discovered",
        notes: lead.matchScore !== null ? `Encontrada por el radar con un encaje del ${lead.matchScore}%.` : "Encontrada por el radar.",
      }),
      ctx.now(),
    ));
  await ctx.db.transaction(async (tx) => {
    if (lead.match && lead.matchScore !== null) {
      await tx.update(t.jobOpportunities).set({ aiMatch: lead.match, aiMatchAt: ctx.now() }).where(eq(t.jobOpportunities.id, id));
    }
    await tx.update(t.jobLeads).set({ status: "added", opportunityId: id, updatedAt: ctx.now() }).where(eq(t.jobLeads.id, lead.id));
    await audit(tx, actor, "update", "jobLead", lead.id, ["status"]);
  });
  return id;
}

export async function dismissLead(ctx: Pick<AiCtx, "db" | "now">, actor: Actor, leadId: string) {
  return ctx.db.transaction(async (tx) => {
    const rows = await tx.update(t.jobLeads).set({ status: "dismissed", updatedAt: ctx.now() }).where(eq(t.jobLeads.id, leadId)).returning({ id: t.jobLeads.id });
    if (rows.length) await audit(tx, actor, "update", "jobLead", leadId, ["status"]);
    return rows.length > 0;
  });
}

export const radarStats = (db: AiCtx["db"]) =>
  db.execute<{ status: string; n: number }>(sql`select status::text, count(*)::int as n from job_leads group by status`);
