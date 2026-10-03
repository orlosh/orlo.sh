"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { type ActionState, bool, list, str } from "@/lib/admin/form";
import { describeDbError, type Actor } from "@/lib/admin/mutations";
import { requireAdminAction, UnauthorizedError } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { clientIp } from "@/lib/security/client-ip";
import { bottleneck, factsFor, weekMetrics } from "./analytics";
import * as m from "./mutations";
import { loadSnapshot } from "./repository";
import * as v from "./validation";

/**
 * Server Actions de /admin/job-search. Mismo pipeline que lib/admin/actions.ts:
 *   1. vuelve a comprobar que quien llama es admin (las actions son endpoints públicos),
 *   2. valida con Zod,
 *   3. escribe con lib/job-search/mutations (transacción + auditoría + automatizaciones),
 *   4. refresca el router del cliente. No hay caché pública que invalidar: estos datos
 *      nunca salen de /admin.
 */

async function actor(): Promise<Actor> {
  const session = await requireAdminAction();
  return { id: session.user.id, ip: clientIp(await headers(), env().TRUSTED_IP_HEADER) };
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

type Done = string | ((result: unknown) => string);
type Opts = { success: Done; redirectTo?: string | ((result: unknown) => string | null) };

async function run<S extends z.ZodType>(
  entity: string,
  schema: S,
  raw: unknown,
  op: (a: Actor, data: z.infer<S>) => Promise<unknown>,
  { success, redirectTo }: Opts,
): Promise<ActionState> {
  let result: unknown;
  try {
    const a = await actor();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { status: "error", message: "Revisa los campos marcados", fieldErrors: fieldErrors(parsed.error) };
    result = await op(a, parsed.data);
    if (result === false) return { status: "error", message: "El elemento ya no existe" };
    logger.info({ entity, actor: a.id }, "job-search mutation");
  } catch (err) {
    if (err instanceof UnauthorizedError) return { status: "error", message: "No autorizado" };
    const known = describeDbError(err);
    if (known) return { status: "error", message: known.message, fieldErrors: known.field ? { [known.field]: known.message } : undefined };
    logger.error({ err, entity }, "job-search mutation failed");
    return { status: "error", message: "Error inesperado; queda registrado en los logs" };
  }
  const target = typeof redirectTo === "function" ? redirectTo(result) : redirectTo;
  if (target) redirect(target);
  refresh();
  return { status: "success", message: typeof success === "function" ? success(result) : success };
}

const BASE = "/admin/job-search";
const uuid = z.uuid();

function idFrom(fd: FormData, key = "id"): string {
  const id = str(fd, key);
  if (!uuid.safeParse(id).success) throw new Error("invalid id");
  return id;
}
const optionalId = (fd: FormData) => (str(fd, "id") ? idFrom(fd) : null);

/** Solo destinos dentro de Job Search: un campo oculto nunca puede convertirse en un open redirect. */
function safeNext(fd: FormData): string | null {
  const next = str(fd, "next");
  return /^\/admin\/job-search(\/[\w\-/?=&.:]*)?$/.test(next) ? next : null;
}

const pick = (fd: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, str(fd, k)]));

/* ----------------------------------------------------------------- objetivo */

export async function saveGoalAction(_: ActionState, fd: FormData) {
  return run(
    "jobSearchGoal",
    v.goalInput,
    {
      ...pick(fd, [
        "startDate",
        "durationDays",
        "timezone",
        "targetRoles",
        "targetSeniority",
        "minSalary",
        "currency",
        "preferredLocations",
        "extraSkills",
        "weeklyApplicationTarget",
        "followupApplicationDays",
        "followupRecruiterDays",
        "followupReferralDays",
        "staleDays",
      ]),
      preferredWorkplaces: list(fd, "preferredWorkplaces"),
    },
    (a, data) => m.saveGoal(db, a, data),
    { success: "Objetivo guardado" },
  );
}

/* ------------------------------------------------------------ oportunidades */

const OPPORTUNITY_FIELDS = [
  "companyName",
  "title",
  "url",
  "description",
  "source",
  "location",
  "workplace",
  "salaryMin",
  "salaryMax",
  "salaryCurrency",
  "salaryText",
  "postedAt",
  "discoveredAt",
  "appliedAt",
  "deadline",
  "offerDeadline",
  "status",
  "priority",
  "roleFit",
  "seniorityFit",
  "scoreOverride",
  "scoreOverrideReason",
  "nextAction",
  "nextActionAt",
  "nextFollowUpAt",
  "outcome",
  "discardReason",
  "notes",
];

export async function saveOpportunityAction(_: ActionState, fd: FormData) {
  const id = optionalId(fd);
  return run(
    "jobOpportunity",
    v.opportunityInput,
    pick(fd, OPPORTUNITY_FIELDS),
    (a, data) => (id ? m.updateOpportunity(db, a, id, data) : m.createOpportunity(db, a, data)),
    { success: "Oportunidad guardada", redirectTo: id ? undefined : (r) => `${BASE}/opportunities/${r}` },
  );
}

export async function quickAddOpportunityAction(_: ActionState, fd: FormData) {
  const next = safeNext(fd);
  return run(
    "jobOpportunity",
    v.quickOpportunityInput,
    pick(fd, ["url", "title", "companyName", "source", "priority", "status"]),
    (a, data) => m.quickAddOpportunity(db, a, data),
    {
      success: (r) => ((r as { duplicate: boolean }).duplicate ? "Esa URL ya estaba guardada" : "Guardada en el inbox"),
      // `next` puede llevar ":id" para abrir la oportunidad recién creada.
      redirectTo: next ? (r) => next.replace(":id", (r as { id: string }).id) : undefined,
    },
  );
}

export async function reviewInboxAction(_: ActionState, fd: FormData) {
  return run(
    "jobOpportunity",
    v.reviewInput,
    pick(fd, ["id", "decision", "companyName", "title", "priority", "discardReason"]),
    (a, data) => m.reviewInboxItem(db, a, data),
    { success: "Revisada" },
  );
}

/** También la llama el Kanban directamente (arrastrar y soltar) con un FormData construido en cliente. */
export async function changeStatusAction(_: ActionState, fd: FormData) {
  return run(
    "jobOpportunity",
    v.statusChangeInput,
    { ids: list(fd, "ids"), status: str(fd, "status") },
    (a, data) => m.changeStatus(db, a, data.ids, data.status),
    { success: "Estado actualizado" },
  );
}

export async function bulkAction(_: ActionState, fd: FormData) {
  return run(
    "jobOpportunity",
    v.bulkInput,
    { op: str(fd, "op"), ids: list(fd, "ids"), status: str(fd, "status"), priority: str(fd, "priority") },
    (a, data) => m.bulkUpdate(db, a, data),
    { success: (n) => `${n} oportunidad${n === 1 ? "" : "es"} actualizada${n === 1 ? "" : "s"}` },
  );
}

export async function deleteOpportunityAction(_: ActionState, fd: FormData) {
  return run("jobOpportunity", z.undefined(), undefined, (a) => m.deleteOpportunity(db, a, idFrom(fd)), {
    success: "Eliminada",
    redirectTo: `${BASE}/opportunities`,
  });
}

/* ----------------------------------------------------------------- empresas */

export async function saveCompanyAction(_: ActionState, fd: FormData) {
  const id = optionalId(fd);
  return run(
    "jobCompany",
    v.companyInput,
    { ...pick(fd, ["name", "tier", "interest", "website", "careersUrl", "industry", "notes", "nextAction", "nextActionAt"]), archived: bool(fd, "archived") },
    (a, data) => (id ? m.updateCompany(db, a, id, data) : m.createCompany(db, a, data)),
    { success: "Empresa guardada", redirectTo: id ? undefined : (r) => `${BASE}/companies/${r}` },
  );
}

export async function deleteCompanyAction(_: ActionState, fd: FormData) {
  return run("jobCompany", z.undefined(), undefined, (a) => m.deleteCompany(db, a, idFrom(fd)), {
    success: "Eliminada",
    redirectTo: `${BASE}/companies`,
  });
}

/* ---------------------------------------------------------------- contactos */

const CONTACT_FIELDS = ["name", "companyName", "title", "kind", "status", "linkedinUrl", "email", "phone", "relationship", "lastInteractionAt", "nextFollowUpAt", "notes", "opportunityId"];

export async function saveContactAction(_: ActionState, fd: FormData) {
  const id = optionalId(fd);
  const stay = bool(fd, "stay");
  return run(
    "jobContact",
    v.contactInput,
    pick(fd, CONTACT_FIELDS),
    (a, data) => (id ? m.updateContact(db, a, id, data) : m.createContact(db, a, data)),
    { success: id ? "Contacto guardado" : "Contacto añadido", redirectTo: id || stay ? undefined : (r) => `${BASE}/contacts/${r}` },
  );
}

export async function deleteContactAction(_: ActionState, fd: FormData) {
  return run("jobContact", z.undefined(), undefined, (a) => m.deleteContact(db, a, idFrom(fd)), {
    success: "Eliminado",
    redirectTo: `${BASE}/contacts`,
  });
}

export async function logInteractionAction(_: ActionState, fd: FormData) {
  return run(
    "jobContact",
    v.interactionInput,
    { ...pick(fd, ["contactId", "direction", "summary", "opportunityId"]), createFollowUp: bool(fd, "createFollowUp") },
    (a, data) => m.logInteraction(db, a, data),
    { success: "Interacción registrada" },
  );
}

export async function linkContactAction(_: ActionState, fd: FormData) {
  return run("jobOpportunity", v.linkContactInput, pick(fd, ["opportunityId", "contactId", "role"]), (a, data) => m.linkContact(db, a, data), {
    success: "Contacto vinculado",
  });
}

export async function unlinkContactAction(_: ActionState, fd: FormData) {
  return run("jobOpportunity", z.undefined(), undefined, (a) => m.unlinkContact(db, a, idFrom(fd, "opportunityId"), idFrom(fd, "contactId")), {
    success: "Desvinculado",
  });
}

/* ---------------------------------------------------------------- referrals */

export async function requestReferralAction(_: ActionState, fd: FormData) {
  return run("jobReferral", v.referralInput, pick(fd, ["opportunityId", "contactId", "notes"]), (a, data) => m.requestReferral(db, a, data), {
    success: "Referral solicitado; follow-up creado",
  });
}

export async function updateReferralAction(_: ActionState, fd: FormData) {
  return run("jobReferral", v.referralUpdateInput, pick(fd, ["id", "status"]), (a, data) => m.updateReferral(db, a, data), {
    success: "Referral actualizado",
  });
}

/* -------------------------------------------------------------- entrevistas */

const INTERVIEW_FIELDS = [
  "opportunityId",
  "kind",
  "round",
  "interviewerContactId",
  "interviewerName",
  "scheduledLocal",
  "timezone",
  "durationMinutes",
  "meetingUrl",
  "format",
  "topics",
  "notes",
  "outcome",
  "nextAction",
];

export async function saveInterviewAction(_: ActionState, fd: FormData) {
  const id = optionalId(fd);
  return run(
    "jobInterview",
    v.interviewInput,
    pick(fd, INTERVIEW_FIELDS),
    (a, data) => (id ? m.updateInterview(db, a, id, data) : m.createInterview(db, a, data)),
    { success: "Entrevista guardada", redirectTo: id ? undefined : (r) => `${BASE}/interviews/${r}` },
  );
}

export async function saveInterviewPrepAction(_: ActionState, fd: FormData) {
  const id = idFrom(fd);
  return run(
    "jobInterview",
    v.interviewPrepInput,
    {
      ...pick(fd, ["prepCompany", "prepRole", "prepInterviewer", "prepQuestions", "prepAnswers", "prepQuestionsToAsk", "prepChecklist"]),
      starStoryIds: list(fd, "starStoryIds"),
    },
    (a, data) => m.saveInterviewPrep(db, a, id, data),
    { success: "Preparación guardada" },
  );
}

export async function deleteInterviewAction(_: ActionState, fd: FormData) {
  return run("jobInterview", z.undefined(), undefined, (a) => m.deleteInterview(db, a, idFrom(fd)), {
    success: "Eliminada",
    redirectTo: `${BASE}/interviews`,
  });
}

export async function saveStarStoryAction(_: ActionState, fd: FormData) {
  const id = optionalId(fd);
  return run("jobStarStory", v.starStoryInput, pick(fd, ["title", "situation", "task", "action", "result", "tags"]), (a, data) => m.saveStarStory(db, a, id, data), {
    success: "Historia guardada",
  });
}

export async function deleteStarStoryAction(_: ActionState, fd: FormData) {
  return run("jobStarStory", z.undefined(), undefined, (a) => m.deleteStarStory(db, a, idFrom(fd)), { success: "Eliminada" });
}

/* ------------------------------------------------------------------- tareas */

export async function saveTaskAction(_: ActionState, fd: FormData) {
  const id = optionalId(fd);
  return run(
    "jobTask",
    v.taskInput,
    pick(fd, ["title", "kind", "priority", "dueDate", "opportunityId", "contactId", "interviewId", "notes"]),
    (a, data) => (id ? m.updateTask(db, a, id, data) : m.createTask(db, a, data)),
    { success: id ? "Tarea guardada" : "Tarea creada" },
  );
}

export async function setTaskDoneAction(_: ActionState, fd: FormData) {
  const done = str(fd, "done") !== "false";
  return run("jobTask", z.undefined(), undefined, (a) => m.setTaskDone(db, a, idFrom(fd), done), {
    success: done ? "Tarea completada" : "Tarea reabierta",
  });
}

export async function deleteTaskAction(_: ActionState, fd: FormData) {
  return run("jobTask", z.undefined(), undefined, (a) => m.deleteTask(db, a, idFrom(fd)), { success: "Eliminada" });
}

/* -------------------------------------------------------------------- notas */

export async function addNoteAction(_: ActionState, fd: FormData) {
  return run("jobNote", v.jobNoteInput, pick(fd, ["body", "opportunityId", "contactId", "companyId", "interviewId"]), (a, data) => m.addNote(db, a, data), {
    success: "Nota añadida",
  });
}

export async function deleteNoteAction(_: ActionState, fd: FormData) {
  return run("jobNote", z.undefined(), undefined, (a) => m.deleteNote(db, a, idFrom(fd)), { success: "Eliminada" });
}

/* --------------------------------------------------------------- documentos */

export async function saveDocumentAction(_: ActionState, fd: FormData) {
  const id = optionalId(fd);
  return run(
    "jobDocument",
    v.documentInput,
    { ...pick(fd, ["kind", "name", "version", "url", "content", "notes"]), archived: bool(fd, "archived") },
    (a, data) => m.saveDocument(db, a, id, data),
    { success: "Documento guardado" },
  );
}

export async function deleteDocumentAction(_: ActionState, fd: FormData) {
  return run("jobDocument", z.undefined(), undefined, (a) => m.deleteDocument(db, a, idFrom(fd)), { success: "Eliminado" });
}

export async function linkDocumentAction(_: ActionState, fd: FormData) {
  return run("jobOpportunity", v.linkDocumentInput, pick(fd, ["opportunityId", "documentId", "usedAt"]), (a, data) => m.linkDocument(db, a, data), {
    success: "Documento registrado en la candidatura",
  });
}

export async function unlinkDocumentAction(_: ActionState, fd: FormData) {
  return run("jobOpportunity", z.undefined(), undefined, (a) => m.unlinkDocument(db, a, idFrom(fd, "opportunityId"), idFrom(fd, "documentId")), {
    success: "Quitado",
  });
}

/* ------------------------------------------------------------ weekly review */

/** Guarda la reflexión de la semana junto con una instantánea de las métricas calculadas ahora. */
export async function saveWeeklyReviewAction(_: ActionState, fd: FormData) {
  return run(
    "jobWeeklyReview",
    v.weeklyReviewInput,
    pick(fd, ["weekStart", "wins", "blockers", "focus"]),
    async (a, data) => {
      const snap = await loadSnapshot(db);
      const facts = factsFor(snap);
      const metrics = { ...weekMetrics(snap, data.weekStart), bottleneck: bottleneck(snap, facts)?.stage ?? null };
      return m.saveWeeklyReview(db, a, data, metrics);
    },
    { success: "Revisión guardada" },
  );
}
