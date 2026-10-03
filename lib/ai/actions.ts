"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { bool, str } from "@/lib/admin/form";
import { type Actor, describeDbError } from "@/lib/admin/mutations";
import { requireAdminAction, UnauthorizedError } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/job-search/dates";
import { logger } from "@/lib/logger";
import { clientIp } from "@/lib/security/client-ip";
import * as admin from "./admin";
import * as f from "./features";
import { AiError, createGemini } from "./gemini";
import { PageError } from "./page";
import { addLeadAsOpportunity, dismissLead, runRadar } from "./radar";
import { aiContext, dbKeyStore, getAiSettings, logRun } from "./store";

/**
 * Server Actions de la IA. Mismo contrato que el resto del admin (re-autorización, Zod,
 * auditoría) y, además, traducción de los errores de Gemini a mensajes accionables. Las que
 * solo devuelven un borrador (mensajes, coach, ensayo) no guardan nada: lo devuelven en `data`.
 */

export type AiState<T = unknown> =
  | { status: "idle" }
  | { status: "success"; message: string; data?: T }
  | { status: "error"; message: string; fieldErrors?: Record<string, string> };

const uuid = z.uuid();
const secret = () => env().BETTER_AUTH_SECRET;

async function actor(): Promise<Actor> {
  const session = await requireAdminAction();
  return { id: session.user.id, ip: clientIp(await headers(), env().TRUSTED_IP_HEADER) };
}

function aiMessage(err: AiError) {
  if (err.retryAt) return `${err.message} Prueba de nuevo a partir de ${formatDateTime(err.retryAt, "UTC")} (UTC).`;
  return err.message;
}

async function guard<T>(feature: string, op: (a: Actor) => Promise<{ message: string; data?: T; redirectTo?: string }>): Promise<AiState<T>> {
  let out: { message: string; data?: T; redirectTo?: string };
  try {
    out = await op(await actor());
  } catch (err) {
    if (err instanceof UnauthorizedError) return { status: "error", message: "No autorizado" };
    if (err instanceof AiError) return { status: "error", message: aiMessage(err) };
    if (err instanceof PageError) return { status: "error", message: err.message };
    if (err instanceof z.ZodError) return { status: "error", message: err.issues[0]?.message ?? "Datos no válidos" };
    const known = describeDbError(err);
    if (known) return { status: "error", message: known.message };
    logger.error({ err, feature }, "ai action failed");
    return { status: "error", message: "Error inesperado; queda registrado en los logs" };
  }
  if (out.redirectTo) redirect(out.redirectTo);
  refresh();
  return { status: "success", message: out.message, data: out.data };
}

const idFrom = (fd: FormData, key = "id") => uuid.parse(str(fd, key));
const ctx = () => aiContext(db, secret());

/* ----------------------------------------------------------- ajustes */

export async function saveAiSettingsAction(_: AiState, fd: FormData): Promise<AiState> {
  const parsed = admin.aiSettingsInput.safeParse({
    enabled: bool(fd, "enabled"),
    modelDefault: str(fd, "modelDefault"),
    modelLight: str(fd, "modelLight"),
    useSearch: bool(fd, "useSearch"),
    autoMatch: bool(fd, "autoMatch"),
    cvDocumentId: str(fd, "cvDocumentId"),
    profileContext: str(fd, "profileContext"),
    radarEnabled: bool(fd, "radarEnabled"),
    radarQueries: str(fd, "radarQueries"),
    radarLocations: str(fd, "radarLocations"),
    radarExcludedCompanies: str(fd, "radarExcludedCompanies"),
    radarMinMatch: str(fd, "radarMinMatch"),
    radarMaxPerRun: str(fd, "radarMaxPerRun"),
    radarMaxAgeDays: str(fd, "radarMaxAgeDays"),
    radarFrequencyDays: str(fd, "radarFrequencyDays"),
    timeBudgetSeconds: str(fd, "timeBudgetSeconds"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { status: "error", message: "Revisa los campos marcados", fieldErrors };
  }
  return guard("settings", async (a) => {
    await admin.saveAiSettings(db, a, parsed.data);
    return { message: "Ajustes de IA guardados" };
  });
}

export async function addApiKeyAction(_: AiState, fd: FormData): Promise<AiState> {
  const parsed = admin.apiKeyInput.safeParse({ label: str(fd, "label"), apiKey: str(fd, "apiKey") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { status: "error", message: "Revisa los campos marcados", fieldErrors };
  }
  return guard("keys", async (a) => {
    await admin.addApiKey(db, a, parsed.data, secret());
    return { message: "Clave añadida (cifrada)" };
  });
}

export async function updateApiKeyAction(_: AiState, fd: FormData): Promise<AiState> {
  return guard("keys", async (a) => {
    const id = idFrom(fd);
    const op = str(fd, "op");
    if (op === "up" || op === "down") await admin.moveApiKey(db, a, id, op);
    else if (op === "delete") await admin.deleteApiKey(db, a, id);
    else if (op === "enable" || op === "disable") await admin.updateApiKey(db, a, id, { enabled: op === "enable" });
    else if (op === "reset") await admin.updateApiKey(db, a, id, { resetCooldown: true });
    else throw new AiError("bad_request", "Operación no válida");
    return { message: "Hecho" };
  });
}

/** Prueba una clave concreta con una petición mínima, aunque esté en espera. */
export async function testApiKeyAction(_: AiState, fd: FormData): Promise<AiState> {
  return guard("keys", async () => {
    const id = idFrom(fd);
    const settings = await getAiSettings(db);
    const store = dbKeyStore(db, secret());
    const single = {
      ...store,
      keys: async () => (await store.keys()).filter((k) => k.id === id).map((k) => ({ ...k, cooldownUntil: null })),
    };
    const gemini = createGemini({ fetch, store: single, log: (e) => logRun(db, e) });
    const started = Date.now();
    const r = await gemini.generate({ feature: "test", model: settings.modelLight, prompt: "Responde solo con la palabra OK.", temperature: 0, maxOutputTokens: 20 });
    return { message: `Funciona: «${r.text.slice(0, 20)}» con ${settings.modelLight} en ${Date.now() - started} ms` };
  });
}

/* ------------------------------------------------------- oportunidades */

export async function importJobAction(_: AiState, fd: FormData): Promise<AiState> {
  const url = str(fd, "url").trim();
  if (!z.url().safeParse(url).success || !/^https?:\/\//.test(url)) return { status: "error", message: "Pega una URL válida", fieldErrors: { url: "URL no válida" } };
  return guard("import", async (a) => {
    const r = await f.importOpportunity(await ctx(), a, { url });
    return { message: r.warnings.join(" ") || "Importada", redirectTo: `/admin/job-search/opportunities/${r.id}` };
  });
}

export async function reanalyzeAction(_: AiState, fd: FormData): Promise<AiState> {
  return guard("import", async (a) => {
    const r = await f.importOpportunity(await ctx(), a, { opportunityId: idFrom(fd) });
    return { message: ["Oferta analizada.", ...r.warnings].join(" ") };
  });
}

export async function matchAction(_: AiState, fd: FormData): Promise<AiState> {
  return guard("match", async (a) => {
    const m = await f.matchOpportunity(await ctx(), a, idFrom(fd));
    return { message: `Encaje: ${m.score}%` };
  });
}

export async function coverLetterAction(_: AiState, fd: FormData): Promise<AiState> {
  return guard("cover_letter", async (a) => {
    const r = await f.generateCoverLetter(await ctx(), a, {
      opportunityId: idFrom(fd, "opportunityId"),
      language: str(fd, "language") === "en" ? "en" : "es",
      tone: (["formal", "cercano", "directo"] as const).find((x) => x === str(fd, "tone")) ?? "cercano",
      length: str(fd, "length") === "media" ? "media" : "corta",
      notes: str(fd, "notes").trim().slice(0, 1000) || null,
    });
    return {
      message: r.unverified ? `Carta guardada en Documentos. ${r.unverified} afirmaciones sin cita en tu CV: revísalas.` : "Carta guardada en Documentos; todas las afirmaciones tienen cita en tu CV.",
    };
  });
}

export async function researchCompanyAction(_: AiState, fd: FormData): Promise<AiState> {
  return guard("company_research", async (a) => {
    const r = await f.researchCompany(await ctx(), a, idFrom(fd));
    return { message: `Investigación lista (${r.sources.length} fuentes)` };
  });
}

export async function prepareInterviewAction(_: AiState, fd: FormData): Promise<AiState> {
  return guard("interview_prep", async (a) => {
    await f.prepareInterview(await ctx(), a, idFrom(fd));
    return { message: "Preparación completada: revisa los campos (lo tuyo no se ha borrado)" };
  });
}

/* ------------------------------------------------ borradores (sin guardar) */

export async function draftMessageAction(_: AiState, fd: FormData): Promise<AiState<{ subject?: string; body: string }>> {
  const kind = str(fd, "kind") as f.MessageKind;
  if (!(kind in f.MESSAGE_KINDS)) return { status: "error", message: "Elige qué mensaje quieres" };
  const opt = (k: string) => (uuid.safeParse(str(fd, k)).success ? str(fd, k) : null);
  return guard("message", async () => {
    const m = await f.draftMessage(await ctx(), {
      kind,
      channel: str(fd, "channel") === "email" ? "email" : "linkedin",
      language: str(fd, "language") === "en" ? "en" : "es",
      contactId: opt("contactId"),
      opportunityId: opt("opportunityId"),
      notes: str(fd, "notes").trim().slice(0, 1000) || null,
    });
    return { message: "Borrador listo", data: m };
  });
}

export async function rehearseAction(_: AiState, fd: FormData): Promise<AiState<Awaited<ReturnType<typeof f.rehearseAnswer>>>> {
  const question = str(fd, "question").trim();
  const answer = str(fd, "answer").trim();
  if (question.length < 5 || answer.length < 30) return { status: "error", message: "Escribe la pregunta y una respuesta de al menos un par de frases" };
  return guard("rehearsal", async () => ({
    message: "Respuesta evaluada",
    data: await f.rehearseAnswer(await ctx(), { interviewId: idFrom(fd, "interviewId"), question: question.slice(0, 1000), answer: answer.slice(0, 6000) }),
  }));
}

export async function coachAction(_: AiState, fd: FormData): Promise<AiState<Awaited<ReturnType<typeof f.coachWeek>>>> {
  const week = str(fd, "weekStart");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) return { status: "error", message: "Semana no válida" };
  return guard("coach", async () => ({ message: "Análisis listo", data: await f.coachWeek(await ctx(), week) }));
}

/* --------------------------------------------------------------- radar */

export async function runRadarAction(_: AiState): Promise<AiState> {
  return guard("radar", async (a) => {
    const r = await runRadar(await ctx(), "manual", a);
    return {
      message: `Radar: ${r.found} nuevas, ${r.evaluated} evaluadas, ${r.added} añadidas a la bandeja${r.status === "partial" ? " (quedan pendientes para la próxima ejecución)" : ""}.`,
    };
  });
}

export async function leadAction(_: AiState, fd: FormData): Promise<AiState> {
  return guard("radar", async (a) => {
    const id = idFrom(fd);
    if (str(fd, "op") === "dismiss") {
      await dismissLead({ db, now: () => new Date() }, a, id);
      return { message: "Descartada" };
    }
    // Añadir un resultado ya evaluado no llama a Gemini: funciona aunque la IA esté desactivada.
    const oppId = await addLeadAsOpportunity({ db, now: () => new Date() }, a, id);
    return { message: "Añadida a la bandeja", redirectTo: oppId ? `/admin/job-search/opportunities/${oppId}` : undefined };
  });
}
