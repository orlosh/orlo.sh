import { asc, eq, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { type Actor, audit } from "@/lib/admin/mutations";
import { bottleneck, conversions, factsFor, funnel, sourcePerformance, weekMetrics } from "@/lib/job-search/analytics";
import { todayIn } from "@/lib/job-search/dates";
import type { Workplace } from "@/lib/job-search/enums";
import { createOpportunity } from "@/lib/job-search/mutations";
import { loadSnapshot } from "@/lib/job-search/repository";
import { guessFromUrl } from "@/lib/job-search/url";
import { opportunityInput } from "@/lib/job-search/validation";
import { AiError, type GenerateResult } from "./gemini";
import { readJobPage } from "./page";
import { data, SYSTEM } from "./prompts";
import * as Sc from "./schemas";
import { type AiCtx, candidateContext, type CandidateCtx } from "./store";
import { verifyEvidence } from "./verify";

/**
 * Funciones de IA sobre la búsqueda de empleo. Cada una: reúne el contexto real (oferta, CV,
 * empresa), pide a Gemini una respuesta con esquema, la valida, verifica las citas del CV y
 * guarda el resultado con su entrada de auditoría. Nada se guarda sin validar.
 */

const clip = (s: string | null | undefined, n: number) => (s ?? "").slice(0, n);
const isoDate = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const httpsOrNull = (s?: string | null) => (s && /^https:\/\/[^\s]+$/.test(s) ? s.slice(0, 500) : null);

async function note(ctx: AiCtx, summary: string, refs: { opportunityId?: string; companyId?: string | null; interviewId?: string }) {
  await ctx.db.insert(t.jobActivities).values({ type: "note", summary: summary.slice(0, 500), opportunityId: refs.opportunityId ?? null, companyId: refs.companyId ?? null, interviewId: refs.interviewId ?? null, occurredAt: ctx.now() });
  if (refs.opportunityId) await ctx.db.update(t.jobOpportunities).set({ lastActivityAt: ctx.now() }).where(eq(t.jobOpportunities.id, refs.opportunityId));
}

/* --------------------------------------------------- encaje con el CV */

export type VerifiedMatch = Sc.FitMatch & {
  strengths: (NonNullable<Sc.FitMatch["strengths"]>[number] & { verified: boolean })[];
  verifiedRatio: number | null;
  model: string;
  cvName: string | null;
  at: string;
};

/** Evaluación de encaje con citas verificadas. La comparte el radar. */
export async function evaluateFit(ctx: AiCtx, cand: CandidateCtx, job: string, model: string, feature = "match"): Promise<VerifiedMatch> {
  if (!cand.hasCv) throw new AiError("bad_request", "No hay CV con texto ni experiencia registrada con la que comparar. Pega tu CV en Documentos.");
  const { data: m } = await ctx.gemini.generateJson(
    {
      feature,
      model,
      system: SYSTEM,
      temperature: 0.1,
      prompt: [
        "Evalúa el encaje del candidato con esta oferta. Puntúa 0-100 con criterio exigente: 80+ solo si cumple los requisitos imprescindibles con evidencia en el CV.",
        "En cada punto fuerte incluye en `evidence` una frase copiada LITERALMENTE del CV. Si no hay frase que lo respalde, no lo incluyas.",
        "Las carencias deben ser reales y con una forma honesta de cubrirlas (sin inventar experiencia).",
        data("OFERTA", clip(job, 24_000)),
        data("CANDIDATO", cand.prompt),
      ].join("\n\n"),
    },
    Sc.fitMatch,
  );
  const strengths = verifyEvidence(m.strengths, cand.evidenceSource);
  return {
    ...m,
    strengths,
    verifiedRatio: strengths.length ? strengths.filter((s) => s.verified).length / strengths.length : null,
    model,
    cvName: cand.cvName,
    at: ctx.now().toISOString(),
  };
}

function jobText(o: typeof t.jobOpportunities.$inferSelect, companyName: string | null) {
  const a = (o.aiAnalysis ?? {}) as Partial<Sc.JobExtraction>;
  return [
    `Puesto: ${o.title}${companyName ? ` en ${companyName}` : ""}`,
    o.location ? `Ubicación: ${o.location}` : "",
    o.description ?? "",
    !o.description && a.requirements?.length ? `Requisitos:\n- ${a.requirements.join("\n- ")}` : "",
    !o.description && a.responsibilities?.length ? `Responsabilidades:\n- ${a.responsibilities.join("\n- ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function matchOpportunity(ctx: AiCtx, actor: Actor, opportunityId: string) {
  const opp = await ctx.db.query.jobOpportunities.findFirst({ where: eq(t.jobOpportunities.id, opportunityId), with: { company: true } });
  if (!opp) throw new AiError("bad_request", "La oportunidad ya no existe");
  if (!opp.description && !opp.aiAnalysis) throw new AiError("bad_request", "La oportunidad no tiene descripción. Impórtala con IA o pega el texto de la oferta.");
  const cand = await candidateContext(ctx.db, ctx.settings);
  const match = await evaluateFit(ctx, cand, jobText(opp, opp.company?.name ?? null), ctx.settings.modelDefault);
  await ctx.db.transaction(async (tx) => {
    await tx.update(t.jobOpportunities).set({ aiMatch: match, aiMatchAt: ctx.now() }).where(eq(t.jobOpportunities.id, opp.id));
    await audit(tx, actor, "update", "jobOpportunity", opp.id, ["aiMatch"]);
  });
  await note(ctx, `Encaje IA: ${match.score}% · ${match.verdict}`, { opportunityId: opp.id, companyId: opp.companyId });
  return match;
}

/* ------------------------------------------- importar una oferta por URL */

export async function importOpportunity(ctx: AiCtx, actor: Actor, args: { url?: string | null; opportunityId?: string | null }) {
  const existing = args.opportunityId
    ? await ctx.db.query.jobOpportunities.findFirst({ where: eq(t.jobOpportunities.id, args.opportunityId) })
    : args.url
      ? await ctx.db.query.jobOpportunities.findFirst({ where: eq(t.jobOpportunities.url, args.url) })
      : null;
  if (args.opportunityId && !existing) throw new AiError("bad_request", "La oportunidad ya no existe");
  const url = args.url ?? existing?.url ?? null;
  if (!url && !existing?.description) throw new AiError("bad_request", "Hace falta la URL de la oferta o su descripción.");

  const page = url ? await readJobPage(url, ctx.fetchImpl) : null;
  const posting = page?.ok ? page.posting : null;
  const today = todayIn("UTC", ctx.now());
  const web = ctx.settings.useSearch;

  const { data: x, result } = await ctx.gemini.generateJson(
    {
      feature: "import",
      model: ctx.settings.modelDefault,
      system: SYSTEM,
      search: web,
      urlContext: web && !!url,
      temperature: 0.1,
      prompt: [
        `Extrae la información de esta oferta de empleo. Hoy es ${today}.`,
        url ? `URL: ${url}` : "",
        posting ? data("DATOS ESTRUCTURADOS DE LA PROPIA OFERTA (fiables)", JSON.stringify(posting)) : "",
        page?.ok && page.text ? data("TEXTO DE LA PÁGINA (puede incluir menús o ruido)", clip(page.text, 18_000)) : "",
        page && !page.ok ? `No se pudo descargar la página desde el servidor (${page.error}).${web ? " Léela con la herramienta de contexto de URL." : ""}` : "",
        existing?.description ? data("DESCRIPCIÓN YA GUARDADA", clip(existing.description, 18_000)) : "",
        web
          ? "Usa Google Search solo para datos de la empresa (sector, tamaño, fase) y, si la oferta no publica salario, una estimación de fuentes públicas marcada con salaryIsEstimate=true y la fuente en salaryNote."
          : "No tienes acceso web: usa solo el texto proporcionado.",
        "En `description` copia el texto completo de la oferta, limpio y sin resumir. Evalúa el riesgo de oferta fantasma con señales concretas (antigüedad, republicaciones, vaguedad).",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    Sc.jobExtraction,
  );

  // Lo publicado por la propia oferta manda sobre lo que deduzca la IA.
  const salaryFromPosting = posting?.salary && (!posting.salary.unit || /year|año|annual/i.test(posting.salary.unit)) ? posting.salary : null;
  const merged = {
    title: clip(posting?.title ?? x.title, 200) || "Oferta sin título",
    company: clip(posting?.company ?? x.company, 120) || null,
    location: clip(posting?.location ?? x.location, 160) || null,
    workplace: posting?.remote ? ("remote" as const) : ((x.workplace ?? null) as Workplace | null),
    postedAt: isoDate(posting?.datePosted) ?? isoDate(x.postedAt),
    deadline: isoDate(posting?.validThrough) ?? isoDate(x.deadline),
    salaryMin: salaryFromPosting?.min ?? (x.salaryIsEstimate ? null : (x.salaryMin ?? null)),
    salaryMax: salaryFromPosting?.max ?? (x.salaryIsEstimate ? null : (x.salaryMax ?? null)),
    salaryCurrency: clip(salaryFromPosting?.currency ?? (x.salaryIsEstimate ? null : x.salaryCurrency), 3).toUpperCase() || null,
    description: clip((posting?.description?.length ?? 0) > (x.description?.length ?? 0) ? posting!.description : x.description, 50_000) || null,
  };
  const analysis = { ...x, sources: result.sources, searchQueries: result.searchQueries, fetchedByServer: !!page?.ok, finalUrl: page?.finalUrl ?? url, model: result.model, at: ctx.now().toISOString() };
  const finalUrl = httpsOrNull(page?.ok ? page.finalUrl : url);

  let id = existing?.id;
  if (!existing) {
    id = await createOpportunity(
      ctx.db,
      actor,
      opportunityInput.parse({
        title: merged.title,
        companyName: merged.company ?? "",
        url: finalUrl ?? "",
        source: (finalUrl && guessFromUrl(finalUrl).source) || "other",
        location: merged.location ?? "",
        workplace: merged.workplace ?? "",
        salaryMin: merged.salaryMin ?? "",
        salaryMax: merged.salaryMax && merged.salaryMin && merged.salaryMax < merged.salaryMin ? "" : (merged.salaryMax ?? ""),
        salaryCurrency: merged.salaryCurrency ?? "",
        postedAt: merged.postedAt ?? "",
        deadline: merged.deadline ?? "",
        description: merged.description ?? "",
        status: "discovered",
      }),
      ctx.now(),
    );
  } else {
    // Solo se rellenan los huecos: nada de lo que hayas escrito se sobrescribe.
    const fill = <K extends keyof typeof existing>(k: K, v: (typeof existing)[K] | null) => (existing[k] === null || existing[k] === "" ? (v ?? existing[k]) : existing[k]);
    await ctx.db
      .update(t.jobOpportunities)
      .set({
        location: fill("location", merged.location),
        workplace: fill("workplace", merged.workplace),
        postedAt: fill("postedAt", merged.postedAt),
        deadline: fill("deadline", merged.deadline),
        salaryMin: fill("salaryMin", merged.salaryMin),
        salaryMax: existing.salaryMin === null && existing.salaryMax === null && (merged.salaryMax ?? 0) >= (merged.salaryMin ?? 0) ? merged.salaryMax : existing.salaryMax,
        salaryCurrency: fill("salaryCurrency", merged.salaryCurrency),
        description: fill("description", merged.description),
        url: fill("url", finalUrl),
        updatedAt: ctx.now(),
      })
      .where(eq(t.jobOpportunities.id, existing.id));
  }

  await ctx.db.transaction(async (tx) => {
    await tx.update(t.jobOpportunities).set({ aiAnalysis: analysis, aiAnalyzedAt: ctx.now() }).where(eq(t.jobOpportunities.id, id!));
    await audit(tx, actor, "update", "jobOpportunity", id!, ["aiAnalysis"]);
    // Datos de la empresa que faltaban.
    const opp = await tx.query.jobOpportunities.findFirst({ where: eq(t.jobOpportunities.id, id!) });
    if (opp?.companyId) {
      const co = await tx.query.jobCompanies.findFirst({ where: eq(t.jobCompanies.id, opp.companyId) });
      if (co) {
        await tx
          .update(t.jobCompanies)
          .set({ industry: co.industry ?? (clip(x.companyInfo?.industry, 120) || null), website: co.website ?? httpsOrNull(x.companyWebsite), updatedAt: ctx.now() })
          .where(eq(t.jobCompanies.id, co.id));
      }
    }
  });
  await note(ctx, `Oferta analizada con IA${x.ghostRisk === "high" ? " · riesgo alto de oferta fantasma" : ""}`, { opportunityId: id });

  const warnings: string[] = [];
  if (page && !page.ok) warnings.push(`El servidor no pudo leer la página (${page.error}); los datos vienen de la lectura de Gemini.`);
  if (ctx.settings.autoMatch) {
    try {
      await matchOpportunity(ctx, actor, id!);
    } catch (err) {
      warnings.push(`No se pudo calcular el encaje: ${(err as Error).message}`);
    }
  }
  return { id: id!, created: !existing, warnings };
}

/* --------------------------------------------- carta de presentación */

export async function generateCoverLetter(
  ctx: AiCtx,
  actor: Actor,
  args: { opportunityId: string; language: "es" | "en"; tone: "formal" | "cercano" | "directo"; length: "corta" | "media"; notes: string | null },
) {
  const opp = await ctx.db.query.jobOpportunities.findFirst({ where: eq(t.jobOpportunities.id, args.opportunityId), with: { company: true } });
  if (!opp) throw new AiError("bad_request", "La oportunidad ya no existe");
  const cand = await candidateContext(ctx.db, ctx.settings);
  if (!cand.hasCv) throw new AiError("bad_request", "Pega tu CV en Documentos para poder escribir una carta basada en él.");
  const research = (opp.company?.aiResearch ?? null) as { summary?: string } | null;
  const analysis = (opp.aiAnalysis ?? null) as Partial<Sc.JobExtraction> | null;
  const lang = args.language === "en" ? "inglés" : "castellano";

  const { data: c } = await ctx.gemini.generateJson(
    {
      feature: "cover_letter",
      model: ctx.settings.modelDefault,
      system: SYSTEM,
      temperature: 0.5,
      prompt: [
        `Escribe una carta de presentación en ${lang}, tono ${args.tone}, ${args.length === "corta" ? "150-220 palabras" : "250-350 palabras"}, para esta oferta.`,
        "Estructura: por qué esta empresa (con un dato concreto de ella), 2-3 pruebas del CV que responden a lo que piden, cierre con disponibilidad. Nada de frases hechas ni marcadores por rellenar.",
        "Cada afirmación sobre el candidato va también en `claims` con su cita LITERAL del CV en `evidence`. No afirmes nada que no puedas citar.",
        data("OFERTA", jobText(opp, opp.company?.name ?? null).slice(0, 16_000)),
        research?.summary || analysis?.companyInfo?.about ? data("EMPRESA", [research?.summary, analysis?.companyInfo?.about].filter(Boolean).join("\n")) : "",
        data("CANDIDATO", cand.prompt),
        args.notes ? data("INDICACIONES DEL CANDIDATO", args.notes) : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    Sc.coverLetter,
  );

  const claims = verifyEvidence(c.claims, cand.evidenceSource);
  const unverified = claims.filter((x) => !x.verified);
  const company = opp.company?.name ?? opp.title;
  const today = todayIn("UTC", ctx.now());
  const docId = await ctx.db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(t.jobDocuments)
      .values({
        kind: "cover_letter",
        name: `Carta · ${company}`.slice(0, 160),
        version: `IA ${today} · ${args.language.toUpperCase()}`,
        content: [c.subject ? `Asunto: ${c.subject}\n` : "", c.letter].join("\n").trim(),
        notes: unverified.length
          ? `Revisa estas afirmaciones: no se encontró su cita en tu CV.\n${unverified.map((x) => `- ${x.claim}`).join("\n")}`
          : `Todas las afirmaciones (${claims.length}) tienen cita verificada en el CV.`,
        generated: true,
        opportunityId: opp.id,
      })
      .returning({ id: t.jobDocuments.id });
    await audit(tx, actor, "create", "jobDocument", doc.id, ["content"]);
    return doc.id;
  });
  await note(ctx, `Carta de presentación generada (${args.language.toUpperCase()})${unverified.length ? ` · ${unverified.length} afirmaciones sin cita` : ""}`, { opportunityId: opp.id, companyId: opp.companyId });
  return { documentId: docId, unverified: unverified.length, total: claims.length };
}

/* --------------------------------------------- investigación de empresa */

export async function researchCompany(ctx: AiCtx, actor: Actor, companyId: string) {
  if (!ctx.settings.useSearch) throw new AiError("bad_request", "Activa el acceso web (Google Search) en Ajustes → IA para investigar empresas.");
  const co = await ctx.db.query.jobCompanies.findFirst({ where: eq(t.jobCompanies.id, companyId), with: { opportunities: true } });
  if (!co) throw new AiError("bad_request", "La empresa ya no existe");
  const { data: r, result } = await ctx.gemini.generateJson(
    {
      feature: "company_research",
      model: ctx.settings.modelDefault,
      system: SYSTEM,
      search: true,
      temperature: 0.2,
      prompt: [
        `Investiga la empresa «${co.name}»${co.website ? ` (${co.website})` : ""} para alguien que quiere trabajar allí. Hoy es ${todayIn("UTC", ctx.now())}.`,
        co.opportunities.length ? `Puestos que le interesan: ${co.opportunities.map((o) => o.title).join("; ")}.` : "",
        "Busca: qué hace y para quién, tamaño, financiación, noticias de los últimos 12 meses con fecha, señales de contratación o despidos, stack técnico público, cultura y lo que se sepa de su proceso de selección.",
        "Si hay varias empresas con ese nombre, quédate con la que contrata para esos puestos y dilo en el resumen. Lo que no encuentres, omítelo.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    Sc.companyResearch,
  );
  const research = { ...r, sources: result.sources, searchQueries: result.searchQueries, model: result.model, at: ctx.now().toISOString() };
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(t.jobCompanies)
      .set({ aiResearch: research, aiResearchAt: ctx.now(), industry: co.industry ?? (clip(r.industry, 120) || null), updatedAt: ctx.now() })
      .where(eq(t.jobCompanies.id, co.id));
    await audit(tx, actor, "update", "jobCompany", co.id, ["aiResearch"]);
  });
  return research;
}

/* --------------------------------------------- preparación de entrevista */

const stamp = (now: Date) => `— Sugerencias IA (${todayIn("UTC", now)}) —`;
/** Rellena el campo vacío; si ya tiene contenido, añade la sugerencia debajo sin borrar nada. */
function mergeField(current: string | null, suggestion: string | undefined, now: Date) {
  const s = suggestion?.trim();
  if (!s) return current;
  if (!current?.trim()) return s;
  if (current.includes(s)) return current;
  return `${current.trim()}\n\n${stamp(now)}\n${s}`;
}

export async function prepareInterview(ctx: AiCtx, actor: Actor, interviewId: string) {
  const iv = await ctx.db.query.jobInterviews.findFirst({ where: eq(t.jobInterviews.id, interviewId), with: { opportunity: { with: { company: true } }, interviewer: true } });
  if (!iv) throw new AiError("bad_request", "La entrevista ya no existe");
  const cand = await candidateContext(ctx.db, ctx.settings);
  const stories = await ctx.db.query.jobStarStories.findMany({ orderBy: [asc(t.jobStarStories.title)] });
  const o = iv.opportunity;
  const research = o.company?.aiResearch as { summary?: string; interviewProcess?: string[] } | null;
  const interviewer = iv.interviewer?.name ?? iv.interviewerName;

  const { data: p } = await ctx.gemini.generateJson(
    {
      feature: "interview_prep",
      model: ctx.settings.modelDefault,
      system: SYSTEM,
      search: ctx.settings.useSearch,
      temperature: 0.3,
      prompt: [
        `Prepara una entrevista de tipo «${iv.kind}»${iv.round ? `, ronda ${iv.round}` : ""} para el puesto «${o.title}»${o.company ? ` en ${o.company.name}` : ""}.`,
        interviewer
          ? `Entrevistador: ${interviewer}${iv.interviewer?.title ? ` (${iv.interviewer.title})` : ""}. Si buscas información sobre esta persona, usa solo fuentes públicas profesionales y no especules.`
          : "",
        data("OFERTA", jobText(o, o.company?.name ?? null).slice(0, 14_000)),
        research ? data("EMPRESA", [research.summary, ...(research.interviewProcess ?? [])].filter(Boolean).join("\n")) : "",
        stories.length ? data("HISTORIAS STAR DEL CANDIDATO", stories.map((s) => `«${s.title}»: ${[s.situation, s.task, s.action, s.result].filter(Boolean).join(" / ")}`).join("\n")) : "",
        data("CANDIDATO", cand.prompt),
        iv.topics ? `Temas anunciados: ${iv.topics}` : "",
        "Las respuestas solo pueden usar hechos del CV o de las historias STAR (indica cuál en basedOn). Si para una pregunta no hay material, dilo en el esquema en lugar de inventar.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    Sc.interviewPrep,
  );

  const now = ctx.now();
  const questions = p.questions?.map((q) => `- ${q.question}${q.why ? ` (por qué: ${q.why})` : ""}`).join("\n");
  const answers = p.answers?.map((a) => `P: ${a.question}\n${a.outline}${a.basedOn ? `\n(Basado en: ${a.basedOn})` : ""}`).join("\n\n");
  const existingChecklist = (iv.prepChecklist ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const known = new Set(existingChecklist.map((l) => l.replace(/^\[( |x)\]\s*/i, "").toLowerCase()));
  const checklist = [...existingChecklist, ...(p.checklist ?? []).filter((c) => !known.has(c.toLowerCase())).map((c) => `[ ] ${c}`)].join("\n");

  await ctx.db.transaction(async (tx) => {
    await tx
      .update(t.jobInterviews)
      .set({
        prepCompany: mergeField(iv.prepCompany, p.company, now),
        prepRole: mergeField(iv.prepRole, p.role, now),
        prepInterviewer: mergeField(iv.prepInterviewer, p.interviewer, now),
        prepQuestions: mergeField(iv.prepQuestions, questions, now),
        prepAnswers: mergeField(iv.prepAnswers, answers, now),
        prepQuestionsToAsk: mergeField(iv.prepQuestionsToAsk, p.questionsToAsk?.map((q) => `- ${q}`).join("\n"), now),
        prepChecklist: checklist || iv.prepChecklist,
        updatedAt: now,
      })
      .where(eq(t.jobInterviews.id, iv.id));
    await audit(tx, actor, "update", "jobInterview", iv.id, ["prep"]);
  });
  return p;
}

/* ------------------------------------------------- mensajes y feedback */

export const MESSAGE_KINDS = {
  referral_request: "Pedir una recomendación interna",
  follow_up: "Seguimiento de una candidatura",
  thank_you: "Agradecimiento tras una entrevista",
  cold_outreach: "Primer contacto con alguien de la empresa",
  recruiter_reply: "Responder a un reclutador",
  networking: "Retomar el contacto con alguien de mi red",
} as const;
export type MessageKind = keyof typeof MESSAGE_KINDS;

export async function draftMessage(
  ctx: AiCtx,
  args: { kind: MessageKind; channel: "linkedin" | "email"; language: "es" | "en"; contactId: string | null; opportunityId: string | null; notes: string | null },
) {
  const contact = args.contactId ? await ctx.db.query.jobContacts.findFirst({ where: eq(t.jobContacts.id, args.contactId), with: { company: true } }) : null;
  const opp = args.opportunityId ? await ctx.db.query.jobOpportunities.findFirst({ where: eq(t.jobOpportunities.id, args.opportunityId), with: { company: true } }) : null;
  const cand = await candidateContext(ctx.db, ctx.settings);
  const { data: m } = await ctx.gemini.generateJson(
    {
      feature: "message",
      model: ctx.settings.modelDefault,
      system: SYSTEM,
      temperature: 0.6,
      prompt: [
        `Redacta un mensaje para ${args.channel === "linkedin" ? "LinkedIn (máximo 600 caracteres, sin asunto)" : "correo electrónico (con asunto, máximo 180 palabras)"} en ${args.language === "en" ? "inglés" : "castellano"}.`,
        `Objetivo: ${MESSAGE_KINDS[args.kind]}.`,
        contact ? `Destinatario: ${contact.name}${contact.title ? `, ${contact.title}` : ""}${contact.company ? ` en ${contact.company.name}` : ""}. Relación: ${contact.relationship ?? contact.kind}.${contact.notes ? ` Notas: ${clip(contact.notes, 800)}` : ""}` : "",
        opp ? `Oferta: ${opp.title}${opp.company ? ` en ${opp.company.name}` : ""}.${opp.url ? ` ${opp.url}` : ""}` : "",
        data("CANDIDATO", clip(cand.prompt, 8_000)),
        args.notes ? data("INDICACIONES", args.notes) : "",
        "Natural, concreto, sin halagos vacíos ni marcadores por rellenar. Si mencionas experiencia del candidato, que esté en el CV. Firma solo si el nombre aparece en el CV.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    Sc.message,
  );
  return m;
}

export async function rehearseAnswer(ctx: AiCtx, args: { interviewId: string; question: string; answer: string }) {
  const iv = await ctx.db.query.jobInterviews.findFirst({ where: eq(t.jobInterviews.id, args.interviewId), with: { opportunity: { with: { company: true } } } });
  if (!iv) throw new AiError("bad_request", "La entrevista ya no existe");
  const { data: f } = await ctx.gemini.generateJson(
    {
      feature: "rehearsal",
      model: ctx.settings.modelDefault,
      system: SYSTEM,
      temperature: 0.2,
      prompt: [
        `Evalúa esta respuesta de entrevista (${iv.kind}) para «${iv.opportunity.title}»${iv.opportunity.company ? ` en ${iv.opportunity.company.name}` : ""}: estructura (situación, tarea, acción, resultado), concreción, relevancia para el puesto y duración estimada.`,
        data("PREGUNTA", args.question),
        data("RESPUESTA", args.answer),
        "La versión mejorada solo puede reordenar y concretar lo que ya dice la respuesta: no añadas hechos nuevos.",
      ].join("\n\n"),
    },
    Sc.answerFeedback,
  );
  return f;
}

/** Coach semanal: lee solo las métricas reales de la semana. */
export async function coachWeek(ctx: AiCtx, weekStart: string) {
  const s = await loadSnapshot(ctx.db, ctx.now());
  const facts = factsFor(s);
  const metrics = {
    semana: weekMetrics(s, weekStart),
    semanaAnterior: weekMetrics(s, new Date(Date.parse(weekStart) - 7 * 86_400_000).toISOString().slice(0, 10)),
    embudo: funnel(facts),
    conversiones: conversions(facts).map((c) => ({ paso: c.label, num: c.num, den: c.den })),
    fuentes: sourcePerformance(facts).map((r) => ({ fuente: r.label, candidaturas: r.applications, entrevistas: r.interviews, ofertas: r.offers })),
    cuelloDeBotella: bottleneck(s, facts),
    objetivo: { dia: s.today, inicio: s.goal.startDate, dias: s.goal.durationDays, candidaturasSemana: s.goal.weeklyApplicationTarget },
  };
  const { data: c } = await ctx.gemini.generateJson(
    {
      feature: "coach",
      model: ctx.settings.modelDefault,
      system: SYSTEM,
      temperature: 0.3,
      prompt: [
        "Actúa como coach de búsqueda de empleo. Analiza la semana con estas métricas reales (no hay más datos) y da un diagnóstico y acciones concretas para conseguir trabajo en el plazo del objetivo.",
        "Si la muestra es pequeña, dilo y céntrate en volumen y canales.",
        data("METRICAS", JSON.stringify(metrics)),
      ].join("\n\n"),
    },
    Sc.coach,
  );
  return c;
}

/** Recuento de llamadas de hoy, para el panel. */
export async function usageToday(ctx: Pick<AiCtx, "db">) {
  const [r] = await ctx.db.execute<{ ok: number; error: number; tokens: number }>(sql`
    select count(*) filter (where status = 'ok')::int as ok, count(*) filter (where status = 'error')::int as error,
      coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0)::int as tokens
    from ai_runs where created_at >= date_trunc('day', now())
  `);
  return r;
}

export type { GenerateResult };
