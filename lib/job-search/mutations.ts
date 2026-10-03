import { and, desc, eq, inArray, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { type Actor, audit, type Tx } from "@/lib/admin/mutations";
import type { ContentDb } from "@/lib/content/repository";
import { contactFollowUpDate, interviewEffects, type ActivityEffect, type TaskEffect, transitionEffects } from "./automations";
import { addBusinessDays, todayIn, zonedToUtc } from "./dates";
import type { OpportunityStatus } from "./enums";
import { goalFromRow } from "./goal";
import type { Goal } from "./model";
import { isPreApply, rank } from "./stages";
import { guessFromUrl } from "./url";
import type * as V from "./validation";

/**
 * Lado de escritura de Job Search. Mismo contrato que lib/admin/mutations.ts: funciones de un
 * handle de base de datos, entrada ya validada, una transacción por operación con su entrada en
 * el log de auditoría. Las automatizaciones (actividad, tareas, follow-ups, historial de estados)
 * se escriben en esa misma transacción. `now` se puede inyectar para los tests.
 */

type Ctx = { tx: Tx; actor: Actor; now: Date; goal: Goal; today: string };

async function context(tx: Tx, actor: Actor, now: Date): Promise<Ctx> {
  const [row] = await tx.select().from(t.jobSearchGoal).where(eq(t.jobSearchGoal.id, 1));
  const tz = row?.timezone ?? "UTC";
  const today = todayIn(tz, now);
  return { tx, actor, now, today, goal: goalFromRow(row, today) };
}

function inTx<T>(db: ContentDb, actor: Actor, now: Date, fn: (c: Ctx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => fn(await context(tx, actor, now)));
}

type Refs = { opportunityId?: string | null; contactId?: string | null; companyId?: string | null; interviewId?: string | null };

/** Registra una actividad y marca la oportunidad como activa ahora. */
async function logActivity(c: Ctx, effect: ActivityEffect, refs: Refs) {
  await c.tx.insert(t.jobActivities).values({
    type: effect.type,
    summary: effect.summary.slice(0, 500),
    metadata: effect.metadata ?? null,
    opportunityId: refs.opportunityId ?? null,
    contactId: refs.contactId ?? null,
    companyId: refs.companyId ?? null,
    interviewId: refs.interviewId ?? null,
    occurredAt: c.now,
  });
  if (refs.opportunityId) {
    await c.tx.update(t.jobOpportunities).set({ lastActivityAt: c.now }).where(eq(t.jobOpportunities.id, refs.opportunityId));
  }
}

async function insertTasks(c: Ctx, tasks: TaskEffect[], refs: Refs) {
  if (!tasks.length) return;
  await c.tx.insert(t.jobTasks).values(
    tasks.map((task) => ({
      ...task,
      opportunityId: refs.opportunityId ?? null,
      contactId: refs.contactId ?? null,
      interviewId: refs.interviewId ?? null,
    })),
  );
}

/** Busca la empresa por nombre sin distinguir mayúsculas; la crea si no existe. */
async function ensureCompany(c: Ctx, name: string | null): Promise<string | null> {
  const clean = name?.trim();
  if (!clean) return null;
  const [found] = await c.tx
    .select({ id: t.jobCompanies.id })
    .from(t.jobCompanies)
    .where(sql`lower(${t.jobCompanies.name}) = lower(${clean})`);
  if (found) return found.id;
  const [row] = await c.tx.insert(t.jobCompanies).values({ name: clean }).returning({ id: t.jobCompanies.id });
  await audit(c.tx, c.actor, "create", "jobCompany", row.id, ["name"]);
  return row.id;
}

async function oppLabelFor(c: Ctx, opp: { title: string; companyId: string | null }) {
  if (!opp.companyId) return opp.title;
  const [co] = await c.tx.select({ name: t.jobCompanies.name }).from(t.jobCompanies).where(eq(t.jobCompanies.id, opp.companyId));
  return co ? `${co.name} · ${opp.title}` : opp.title;
}

/* ----------------------------------------------------------------- objetivo */

export async function saveGoal(db: ContentDb, actor: Actor, input: V.GoalInput) {
  await db.transaction(async (tx) => {
    await tx
      .insert(t.jobSearchGoal)
      .values({ id: 1, ...input })
      .onConflictDoUpdate({ target: t.jobSearchGoal.id, set: { ...input, updatedAt: new Date() } });
    await audit(tx, actor, "update", "jobSearchGoal", 1, Object.keys(input));
  });
}

/* ------------------------------------------------------- cambios de estado */

type OppRow = typeof t.jobOpportunities.$inferSelect;

/**
 * Aplica un cambio de estado con todas sus automatizaciones: historial, actividades, tareas,
 * follow-ups, referral y cierre de tareas pendientes.
 */
async function applyTransition(
  c: Ctx,
  opp: OppRow,
  to: OpportunityStatus,
  { referral, skipStatusActivity = false }: { referral?: { contactId: string | null; notes: string | null }; skipStatusActivity?: boolean } = {},
) {
  if (opp.status === to) return;
  const label = await oppLabelFor(c, opp);
  const fx = transitionEffects(
    { status: opp.status, appliedAt: opp.appliedAt, firstResponseAt: opp.firstResponseAt, closedAt: opp.closedAt, label },
    to,
    c,
  );

  // Las tareas se cierran antes de crear las nuevas de este mismo cambio.
  if (fx.closePendingTasks) {
    await c.tx
      .update(t.jobTasks)
      .set({ status: "cancelled", updatedAt: c.now })
      .where(and(eq(t.jobTasks.opportunityId, opp.id), eq(t.jobTasks.status, "open")));
  }
  if (fx.cancelApplicationFollowUps) {
    await c.tx
      .update(t.jobTasks)
      .set({ status: "cancelled", updatedAt: c.now })
      .where(and(eq(t.jobTasks.opportunityId, opp.id), eq(t.jobTasks.status, "open"), eq(t.jobTasks.origin, "auto:application")));
  }

  await c.tx
    .update(t.jobOpportunities)
    .set({ status: to, statusChangedAt: c.now, updatedAt: c.now, ...fx.set })
    .where(eq(t.jobOpportunities.id, opp.id));
  await c.tx.insert(t.jobStatusHistory).values({ opportunityId: opp.id, fromStatus: opp.status, toStatus: to, changedAt: c.now });

  for (const a of fx.activities) {
    if (skipStatusActivity && a.type === "status_changed") continue;
    await logActivity(c, a, { opportunityId: opp.id, companyId: opp.companyId });
  }
  await insertTasks(c, fx.tasks, { opportunityId: opp.id });

  if (fx.referral === "request") {
    await c.tx.insert(t.jobReferrals).values({
      opportunityId: opp.id,
      contactId: referral?.contactId ?? null,
      notes: referral?.notes ?? null,
      requestedAt: c.today,
    });
  }
  if (fx.referral === "receive") {
    const [pending] = await c.tx
      .select({ id: t.jobReferrals.id })
      .from(t.jobReferrals)
      .where(and(eq(t.jobReferrals.opportunityId, opp.id), eq(t.jobReferrals.status, "requested")))
      .orderBy(desc(t.jobReferrals.requestedAt))
      .limit(1);
    if (pending) {
      await c.tx.update(t.jobReferrals).set({ status: "received", receivedAt: c.today, updatedAt: c.now }).where(eq(t.jobReferrals.id, pending.id));
    } else {
      // Si el referral ya se marcó como recibido (updateReferral), no se duplica la fila.
      const [already] = await c.tx
        .select({ id: t.jobReferrals.id })
        .from(t.jobReferrals)
        .where(and(eq(t.jobReferrals.opportunityId, opp.id), eq(t.jobReferrals.status, "received")))
        .limit(1);
      if (!already) {
        await c.tx.insert(t.jobReferrals).values({ opportunityId: opp.id, status: "received", requestedAt: c.today, receivedAt: c.today });
      }
    }
    await cancelReferralFollowUps(c, opp.id);
  }
}

async function cancelReferralFollowUps(c: Ctx, opportunityId: string) {
  await c.tx
    .update(t.jobTasks)
    .set({ status: "cancelled", updatedAt: c.now })
    .where(and(eq(t.jobTasks.opportunityId, opportunityId), eq(t.jobTasks.status, "open"), eq(t.jobTasks.origin, "auto:referral")));
}

async function getOpp(c: Ctx, id: string) {
  const [row] = await c.tx.select().from(t.jobOpportunities).where(eq(t.jobOpportunities.id, id));
  return row ?? null;
}

export async function changeStatus(db: ContentDb, actor: Actor, ids: string[], status: OpportunityStatus, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    let changed = 0;
    for (const id of ids) {
      const opp = await getOpp(c, id);
      if (!opp || opp.status === status) continue;
      await applyTransition(c, opp, status);
      await audit(c.tx, actor, "update", "jobOpportunity", id, ["status"]);
      changed++;
    }
    return changed;
  });
}

/* ------------------------------------------------------------ oportunidades */

function opportunityColumns({ companyName: _c, status: _s, ...cols }: V.OpportunityInput) {
  return cols;
}

async function insertOpportunity(c: Ctx, values: typeof t.jobOpportunities.$inferInsert, status: OpportunityStatus) {
  const [row] = await c.tx
    .insert(t.jobOpportunities)
    .values({ ...values, status: "discovered", discoveredAt: values.discoveredAt ?? c.today, statusChangedAt: c.now, lastActivityAt: c.now })
    .returning();
  await c.tx.insert(t.jobStatusHistory).values({ opportunityId: row.id, fromStatus: null, toStatus: "discovered", changedAt: c.now });
  await logActivity(c, { type: "opportunity_created", summary: `Oportunidad creada · ${await oppLabelFor(c, row)}` }, { opportunityId: row.id, companyId: row.companyId });
  // Crear directamente en un estado posterior pasa por las mismas automatizaciones que moverla.
  if (status !== "discovered") await applyTransition(c, row, status, { skipStatusActivity: true });
  return row.id;
}

export async function createOpportunity(db: ContentDb, actor: Actor, input: V.OpportunityInput, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    const companyId = await ensureCompany(c, input.companyName);
    const id = await insertOpportunity(c, { ...opportunityColumns(input), discoveredAt: input.discoveredAt ?? c.today, companyId }, input.status);
    await audit(c.tx, actor, "create", "jobOpportunity", id, Object.keys(input));
    return id;
  });
}

/** Alta rápida (inbox / Quick Add): título y empresa se deducen de la URL si faltan. */
export async function quickAddOpportunity(db: ContentDb, actor: Actor, input: V.QuickOpportunityInput, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    if (input.url) {
      const [dup] = await c.tx.select({ id: t.jobOpportunities.id }).from(t.jobOpportunities).where(eq(t.jobOpportunities.url, input.url));
      if (dup) return { id: dup.id, duplicate: true };
    }
    const guess = guessFromUrl(input.url);
    const companyId = await ensureCompany(c, input.companyName ?? guess.company);
    const host = input.url ? new URL(input.url).hostname.replace(/^www\./, "") : null;
    const title = input.title ?? guess.title ?? `Oferta sin revisar (${host})`;
    const source = input.source !== "other" ? input.source : (guess.source ?? "other");
    const id = await insertOpportunity(c, { title, url: input.url, source, priority: input.priority, companyId }, input.status);
    await audit(c.tx, actor, "create", "jobOpportunity", id, ["url", "title", "source"]);
    return { id, duplicate: false };
  });
}

export async function updateOpportunity(db: ContentDb, actor: Actor, id: string, input: V.OpportunityInput, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    const current = await getOpp(c, id);
    if (!current) return false;
    const companyId = await ensureCompany(c, input.companyName);
    await c.tx
      .update(t.jobOpportunities)
      .set({ ...opportunityColumns(input), companyId, discoveredAt: input.discoveredAt ?? current.discoveredAt, updatedAt: now })
      .where(eq(t.jobOpportunities.id, id));
    if (input.status !== current.status) {
      const fresh = (await getOpp(c, id))!;
      await applyTransition(c, fresh, input.status);
    }
    await audit(c.tx, actor, "update", "jobOpportunity", id, Object.keys(input));
    return true;
  });
}

export async function reviewInboxItem(db: ContentDb, actor: Actor, input: V.ReviewInput, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    const opp = await getOpp(c, input.id);
    if (!opp) return false;
    const companyId = input.companyName ? await ensureCompany(c, input.companyName) : opp.companyId;
    await c.tx
      .update(t.jobOpportunities)
      .set({
        companyId,
        title: input.title ?? opp.title,
        priority: input.priority,
        discardReason: input.decision === "discard" ? input.discardReason : opp.discardReason,
        updatedAt: now,
      })
      .where(eq(t.jobOpportunities.id, opp.id));
    const fresh = (await getOpp(c, opp.id))!;
    const to = input.decision === "qualify" ? "qualified" : input.decision === "discard" ? "archived" : "researching";
    await applyTransition(c, fresh, to);
    await audit(c.tx, actor, "update", "jobOpportunity", opp.id, ["status", "priority", "companyId"]);
    return true;
  });
}

export async function bulkUpdate(db: ContentDb, actor: Actor, input: V.BulkInput, now = new Date()) {
  if (input.op === "status") return changeStatus(db, actor, input.ids, input.status, now);
  return db.transaction(async (tx) => {
    if (input.op === "priority") {
      const rows = await tx
        .update(t.jobOpportunities)
        .set({ priority: input.priority, updatedAt: now })
        .where(inArray(t.jobOpportunities.id, input.ids))
        .returning({ id: t.jobOpportunities.id });
      for (const r of rows) await audit(tx, actor, "update", "jobOpportunity", r.id, ["priority"]);
      return rows.length;
    }
    const rows = await tx.delete(t.jobOpportunities).where(inArray(t.jobOpportunities.id, input.ids)).returning({ id: t.jobOpportunities.id });
    for (const r of rows) await audit(tx, actor, "delete", "jobOpportunity", r.id);
    return rows.length;
  });
}

export async function deleteOpportunity(db: ContentDb, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.delete(t.jobOpportunities).where(eq(t.jobOpportunities.id, id)).returning({ id: t.jobOpportunities.id });
    if (!rows.length) return false;
    await audit(tx, actor, "delete", "jobOpportunity", id);
    return true;
  });
}

/* ----------------------------------------------------------------- empresas */

export async function createCompany(db: ContentDb, actor: Actor, input: V.CompanyInput) {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(t.jobCompanies).values(input).returning({ id: t.jobCompanies.id });
    await audit(tx, actor, "create", "jobCompany", row.id, Object.keys(input));
    return row.id;
  });
}

export async function updateCompany(db: ContentDb, actor: Actor, id: string, input: V.CompanyInput) {
  return db.transaction(async (tx) => {
    const rows = await tx.update(t.jobCompanies).set({ ...input, updatedAt: new Date() }).where(eq(t.jobCompanies.id, id)).returning({ id: t.jobCompanies.id });
    if (!rows.length) return false;
    await audit(tx, actor, "update", "jobCompany", id, Object.keys(input));
    return true;
  });
}

export async function deleteCompany(db: ContentDb, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.delete(t.jobCompanies).where(eq(t.jobCompanies.id, id)).returning({ id: t.jobCompanies.id });
    if (!rows.length) return false;
    await audit(tx, actor, "delete", "jobCompany", id);
    return true;
  });
}

/* ---------------------------------------------------------------- contactos */

function contactColumns({ companyName: _c, opportunityId: _o, ...cols }: V.ContactInput) {
  return cols;
}

export async function createContact(db: ContentDb, actor: Actor, input: V.ContactInput, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    const companyId = await ensureCompany(c, input.companyName);
    const [row] = await c.tx.insert(t.jobContacts).values({ ...contactColumns(input), companyId }).returning({ id: t.jobContacts.id });
    if (input.opportunityId) {
      await c.tx.insert(t.jobOpportunityContacts).values({ opportunityId: input.opportunityId, contactId: row.id, role: input.kind }).onConflictDoNothing();
    }
    await logActivity(c, { type: "contact_created", summary: `Contacto añadido · ${input.name}` }, { contactId: row.id, companyId, opportunityId: input.opportunityId });
    await audit(c.tx, actor, "create", "jobContact", row.id, Object.keys(input));
    return row.id;
  });
}

export async function updateContact(db: ContentDb, actor: Actor, id: string, input: V.ContactInput, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    const companyId = await ensureCompany(c, input.companyName);
    const rows = await c.tx
      .update(t.jobContacts)
      .set({ ...contactColumns(input), companyId, updatedAt: now })
      .where(eq(t.jobContacts.id, id))
      .returning({ id: t.jobContacts.id });
    if (!rows.length) return false;
    await audit(c.tx, actor, "update", "jobContact", id, Object.keys(input));
    return true;
  });
}

export async function deleteContact(db: ContentDb, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.delete(t.jobContacts).where(eq(t.jobContacts.id, id)).returning({ id: t.jobContacts.id });
    if (!rows.length) return false;
    await audit(tx, actor, "delete", "jobContact", id);
    return true;
  });
}

/**
 * Registra un mensaje enviado o recibido. Saliente → "contactado" y follow-up según la regla de
 * recruiter; entrante → "en conversación" y se cancelan los follow-ups abiertos con esa persona.
 */
export async function logInteraction(db: ContentDb, actor: Actor, input: V.InteractionInput, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    const [contact] = await c.tx.select().from(t.jobContacts).where(eq(t.jobContacts.id, input.contactId));
    if (!contact) return false;
    const outbound = input.direction === "outbound";
    const followUp = outbound && input.createFollowUp ? contactFollowUpDate(c.today, c.goal) : null;
    const status =
      outbound ? (contact.status === "to_contact" || contact.status === "no_response" ? "contacted" : contact.status) : "in_conversation";
    await c.tx
      .update(t.jobContacts)
      .set({ lastInteractionAt: c.today, status, nextFollowUpAt: outbound ? (followUp ?? contact.nextFollowUpAt) : null, updatedAt: now })
      .where(eq(t.jobContacts.id, contact.id));

    const type = outbound ? (contact.kind === "recruiter" ? "recruiter_contacted" : "contact_interaction") : "reply";
    await logActivity(
      c,
      { type, summary: `${outbound ? "Mensaje a" : "Respuesta de"} ${contact.name}: ${input.summary}`, metadata: { direction: input.direction } },
      { contactId: contact.id, companyId: contact.companyId, opportunityId: input.opportunityId },
    );
    if (!outbound) {
      await c.tx
        .update(t.jobTasks)
        .set({ status: "cancelled", updatedAt: now })
        .where(and(eq(t.jobTasks.contactId, contact.id), eq(t.jobTasks.status, "open"), eq(t.jobTasks.kind, "follow_up")));
    }
    if (followUp) {
      await insertTasks(
        c,
        [{ title: `Follow-up · ${contact.name}`, kind: "follow_up", dueDate: followUp, priority: "medium", origin: "auto:contact" }],
        { contactId: contact.id, opportunityId: input.opportunityId },
      );
    }
    await audit(c.tx, actor, "update", "jobContact", contact.id, ["lastInteractionAt", "status"]);
    return true;
  });
}

export async function linkContact(db: ContentDb, actor: Actor, input: V.LinkContactInput) {
  return db.transaction(async (tx) => {
    await tx
      .insert(t.jobOpportunityContacts)
      .values(input)
      .onConflictDoUpdate({ target: [t.jobOpportunityContacts.opportunityId, t.jobOpportunityContacts.contactId], set: { role: input.role } });
    await audit(tx, actor, "update", "jobOpportunity", input.opportunityId, ["contacts"]);
    return true;
  });
}

export async function unlinkContact(db: ContentDb, actor: Actor, opportunityId: string, contactId: string) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .delete(t.jobOpportunityContacts)
      .where(and(eq(t.jobOpportunityContacts.opportunityId, opportunityId), eq(t.jobOpportunityContacts.contactId, contactId)))
      .returning({ id: t.jobOpportunityContacts.contactId });
    if (!rows.length) return false;
    await audit(tx, actor, "update", "jobOpportunity", opportunityId, ["contacts"]);
    return true;
  });
}

/* ---------------------------------------------------------------- referrals */

/** Pedir un referral: actividad + follow-up y, si el proceso aún no ha pasado de ahí, nuevo estado. */
export async function requestReferral(db: ContentDb, actor: Actor, input: V.ReferralInput, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    const opp = await getOpp(c, input.opportunityId);
    if (!opp) return false;
    if (input.contactId) {
      await c.tx.insert(t.jobOpportunityContacts).values({ opportunityId: opp.id, contactId: input.contactId, role: "referral" }).onConflictDoNothing();
    }
    if (isPreApply(opp.status) && (rank(opp.status) ?? 99) < rank("referral_requested")!) {
      await applyTransition(c, opp, "referral_requested", { referral: { contactId: input.contactId, notes: input.notes } });
    } else {
      const label = await oppLabelFor(c, opp);
      await c.tx.insert(t.jobReferrals).values({ opportunityId: opp.id, contactId: input.contactId, notes: input.notes, requestedAt: c.today });
      await logActivity(c, { type: "referral_requested", summary: `Referral solicitado · ${label}` }, { opportunityId: opp.id, contactId: input.contactId, companyId: opp.companyId });
      await insertTasks(
        c,
        [{ title: `Follow-up referral · ${label}`, kind: "follow_up", dueDate: addBusinessDays(c.today, c.goal.followupReferralDays), priority: "medium", origin: "auto:referral" }],
        { opportunityId: opp.id, contactId: input.contactId },
      );
    }
    if (input.contactId) {
      await c.tx.update(t.jobContacts).set({ lastInteractionAt: c.today, updatedAt: now }).where(eq(t.jobContacts.id, input.contactId));
    }
    await audit(c.tx, actor, "create", "jobReferral", opp.id, ["contactId"]);
    return true;
  });
}

export async function updateReferral(db: ContentDb, actor: Actor, input: V.ReferralUpdateInput, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    const [ref] = await c.tx.select().from(t.jobReferrals).where(eq(t.jobReferrals.id, input.id));
    if (!ref) return false;
    await c.tx
      .update(t.jobReferrals)
      .set({ status: input.status, receivedAt: input.status === "received" ? (ref.receivedAt ?? c.today) : ref.receivedAt, updatedAt: now })
      .where(eq(t.jobReferrals.id, ref.id));
    const opp = (await getOpp(c, ref.opportunityId))!;
    if (input.status === "received" && ref.status !== "received") {
      if (isPreApply(opp.status) && (rank(opp.status) ?? 99) < rank("referral_received")!) {
        // El estado nuevo registra la actividad; el referral ya está marcado, así que no se duplica.
        await applyTransition(c, opp, "referral_received");
      } else {
        await logActivity(c, { type: "referral_received", summary: `Referral recibido · ${await oppLabelFor(c, opp)}` }, { opportunityId: opp.id, contactId: ref.contactId });
        await cancelReferralFollowUps(c, opp.id);
      }
    }
    if (input.status === "declined" || input.status === "no_response") await cancelReferralFollowUps(c, opp.id);
    await audit(c.tx, actor, "update", "jobReferral", ref.id, ["status"]);
    return true;
  });
}

/* -------------------------------------------------------------- entrevistas */

function interviewColumns(c: Ctx, { scheduledLocal, ...cols }: V.InterviewInput) {
  const tz = cols.timezone ?? c.goal.timezone;
  return { ...cols, timezone: tz, scheduledAt: scheduledLocal ? zonedToUtc(scheduledLocal, tz) : null };
}

export async function createInterview(db: ContentDb, actor: Actor, input: V.InterviewInput, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    const opp = await getOpp(c, input.opportunityId);
    if (!opp) return false;
    const cols = interviewColumns(c, input);
    const [row] = await c.tx.insert(t.jobInterviews).values(cols).returning({ id: t.jobInterviews.id });
    const label = await oppLabelFor(c, opp);
    const fx = interviewEffects({ kind: cols.kind, scheduledAt: cols.scheduledAt }, { status: opp.status, label }, c);
    if (fx.advanceTo) await applyTransition(c, opp, fx.advanceTo);
    await logActivity(c, fx.activity, { opportunityId: opp.id, interviewId: row.id, contactId: cols.interviewerContactId, companyId: opp.companyId });
    await insertTasks(c, fx.tasks, { opportunityId: opp.id, interviewId: row.id });
    if (cols.interviewerContactId) {
      await c.tx.insert(t.jobOpportunityContacts).values({ opportunityId: opp.id, contactId: cols.interviewerContactId, role: "hiring_manager" }).onConflictDoNothing();
    }
    await audit(c.tx, actor, "create", "jobInterview", row.id, Object.keys(input));
    return row.id;
  });
}

export async function updateInterview(db: ContentDb, actor: Actor, id: string, input: V.InterviewInput, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    const [current] = await c.tx.select().from(t.jobInterviews).where(eq(t.jobInterviews.id, id));
    if (!current) return false;
    const cols = interviewColumns(c, input);
    const finished = current.outcome === "pending" && cols.outcome !== "pending" && cols.outcome !== "cancelled";
    await c.tx
      .update(t.jobInterviews)
      .set({ ...cols, completedAt: finished ? now : cols.outcome === "pending" ? null : current.completedAt, updatedAt: now })
      .where(eq(t.jobInterviews.id, id));

    // Si cambia la fecha, las tareas automáticas abiertas se mueven con ella.
    if (cols.scheduledAt?.getTime() !== current.scheduledAt?.getTime()) {
      const opp = (await getOpp(c, cols.opportunityId))!;
      const fx = interviewEffects({ kind: cols.kind, scheduledAt: cols.scheduledAt }, { status: opp.status, label: "" }, c);
      for (const task of fx.tasks) {
        await c.tx
          .update(t.jobTasks)
          .set({ dueDate: task.dueDate, updatedAt: now })
          .where(and(eq(t.jobTasks.interviewId, id), eq(t.jobTasks.kind, task.kind), eq(t.jobTasks.status, "open"), eq(t.jobTasks.origin, "auto:interview")));
      }
    }
    if (cols.outcome === "cancelled" && current.outcome !== "cancelled") {
      await c.tx.update(t.jobTasks).set({ status: "cancelled", updatedAt: now }).where(and(eq(t.jobTasks.interviewId, id), eq(t.jobTasks.status, "open")));
    }
    if (finished) {
      await logActivity(c, { type: "interview_completed", summary: `Entrevista completada (${cols.outcome})`, metadata: { outcome: cols.outcome } }, { opportunityId: cols.opportunityId, interviewId: id });
    }
    await audit(c.tx, actor, "update", "jobInterview", id, Object.keys(input));
    return true;
  });
}

export async function saveInterviewPrep(db: ContentDb, actor: Actor, id: string, input: V.InterviewPrepInput) {
  return db.transaction(async (tx) => {
    const rows = await tx.update(t.jobInterviews).set({ ...input, updatedAt: new Date() }).where(eq(t.jobInterviews.id, id)).returning({ id: t.jobInterviews.id });
    if (!rows.length) return false;
    await audit(tx, actor, "update", "jobInterview", id, Object.keys(input));
    return true;
  });
}

export async function deleteInterview(db: ContentDb, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.delete(t.jobInterviews).where(eq(t.jobInterviews.id, id)).returning({ id: t.jobInterviews.id });
    if (!rows.length) return false;
    await audit(tx, actor, "delete", "jobInterview", id);
    return true;
  });
}

export async function saveStarStory(db: ContentDb, actor: Actor, id: string | null, input: V.StarStoryInput) {
  return db.transaction(async (tx) => {
    if (id) {
      const rows = await tx.update(t.jobStarStories).set({ ...input, updatedAt: new Date() }).where(eq(t.jobStarStories.id, id)).returning({ id: t.jobStarStories.id });
      if (!rows.length) return false;
      await audit(tx, actor, "update", "jobStarStory", id, Object.keys(input));
      return id;
    }
    const [row] = await tx.insert(t.jobStarStories).values(input).returning({ id: t.jobStarStories.id });
    await audit(tx, actor, "create", "jobStarStory", row.id, Object.keys(input));
    return row.id;
  });
}

export async function deleteStarStory(db: ContentDb, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.delete(t.jobStarStories).where(eq(t.jobStarStories.id, id)).returning({ id: t.jobStarStories.id });
    if (!rows.length) return false;
    // Se quita la historia de las preparaciones que la citaban.
    await tx.execute(sql`update job_interviews set star_story_ids = array_remove(star_story_ids, ${id}::uuid) where ${id}::uuid = any(star_story_ids)`);
    await audit(tx, actor, "delete", "jobStarStory", id);
    return true;
  });
}

/* ------------------------------------------------------------------- tareas */

export async function createTask(db: ContentDb, actor: Actor, input: V.TaskInput) {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(t.jobTasks).values(input).returning({ id: t.jobTasks.id });
    await audit(tx, actor, "create", "jobTask", row.id, Object.keys(input));
    return row.id;
  });
}

export async function updateTask(db: ContentDb, actor: Actor, id: string, input: V.TaskInput) {
  return db.transaction(async (tx) => {
    const rows = await tx.update(t.jobTasks).set({ ...input, updatedAt: new Date() }).where(eq(t.jobTasks.id, id)).returning({ id: t.jobTasks.id });
    if (!rows.length) return false;
    await audit(tx, actor, "update", "jobTask", id, Object.keys(input));
    return true;
  });
}

/**
 * Completar (o reabrir) una tarea. Un follow-up hecho cuenta como actividad de follow-up y
 * actualiza la próxima fecha de follow-up de la oportunidad o del contacto.
 */
export async function setTaskDone(db: ContentDb, actor: Actor, id: string, done: boolean, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    const [task] = await c.tx.select().from(t.jobTasks).where(eq(t.jobTasks.id, id));
    if (!task) return false;
    await c.tx
      .update(t.jobTasks)
      .set({ status: done ? "done" : "open", completedAt: done ? now : null, updatedAt: now })
      .where(eq(t.jobTasks.id, id));
    if (done) {
      const refs = { opportunityId: task.opportunityId, contactId: task.contactId, interviewId: task.interviewId };
      await logActivity(c, { type: task.kind === "follow_up" ? "follow_up" : "task_completed", summary: task.title }, refs);
      if (task.kind === "follow_up" && task.opportunityId) {
        const [next] = await c.tx
          .select({ due: t.jobTasks.dueDate })
          .from(t.jobTasks)
          .where(and(eq(t.jobTasks.opportunityId, task.opportunityId), eq(t.jobTasks.kind, "follow_up"), eq(t.jobTasks.status, "open")))
          .orderBy(t.jobTasks.dueDate)
          .limit(1);
        await c.tx.update(t.jobOpportunities).set({ nextFollowUpAt: next?.due ?? null }).where(eq(t.jobOpportunities.id, task.opportunityId));
      }
      if (task.contactId && (task.kind === "follow_up" || task.kind === "contact")) {
        await c.tx
          .update(t.jobContacts)
          .set({
            lastInteractionAt: c.today,
            nextFollowUpAt: null,
            status: sql`case when ${t.jobContacts.status} = 'to_contact' then 'contacted'::job_contact_status else ${t.jobContacts.status} end`,
            updatedAt: now,
          })
          .where(eq(t.jobContacts.id, task.contactId));
      }
    }
    await audit(c.tx, actor, "update", "jobTask", id, ["status"]);
    return true;
  });
}

export async function deleteTask(db: ContentDb, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.delete(t.jobTasks).where(eq(t.jobTasks.id, id)).returning({ id: t.jobTasks.id });
    if (!rows.length) return false;
    await audit(tx, actor, "delete", "jobTask", id);
    return true;
  });
}

/* ------------------------------------------------------------------- notas */

export async function addNote(db: ContentDb, actor: Actor, input: V.JobNoteInput, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    const [row] = await c.tx.insert(t.jobNotes).values(input).returning({ id: t.jobNotes.id });
    const summary = input.body.length > 140 ? `${input.body.slice(0, 140)}…` : input.body;
    await logActivity(c, { type: "note", summary }, input);
    await audit(c.tx, actor, "create", "jobNote", row.id, ["body"]);
    return row.id;
  });
}

export async function deleteNote(db: ContentDb, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.delete(t.jobNotes).where(eq(t.jobNotes.id, id)).returning({ id: t.jobNotes.id });
    if (!rows.length) return false;
    await audit(tx, actor, "delete", "jobNote", id);
    return true;
  });
}

/* --------------------------------------------------------------- documentos */

export async function saveDocument(db: ContentDb, actor: Actor, id: string | null, input: V.DocumentInput) {
  return db.transaction(async (tx) => {
    if (id) {
      const rows = await tx.update(t.jobDocuments).set({ ...input, updatedAt: new Date() }).where(eq(t.jobDocuments.id, id)).returning({ id: t.jobDocuments.id });
      if (!rows.length) return false;
      await audit(tx, actor, "update", "jobDocument", id, Object.keys(input));
      return id;
    }
    const [row] = await tx.insert(t.jobDocuments).values(input).returning({ id: t.jobDocuments.id });
    await audit(tx, actor, "create", "jobDocument", row.id, Object.keys(input));
    return row.id;
  });
}

export async function deleteDocument(db: ContentDb, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.delete(t.jobDocuments).where(eq(t.jobDocuments.id, id)).returning({ id: t.jobDocuments.id });
    if (!rows.length) return false;
    await audit(tx, actor, "delete", "jobDocument", id);
    return true;
  });
}

/** Registra qué documento (y versión) se usó en una candidatura. */
export async function linkDocument(db: ContentDb, actor: Actor, input: V.LinkDocumentInput, now = new Date()) {
  return inTx(db, actor, now, async (c) => {
    const [doc] = await c.tx.select().from(t.jobDocuments).where(eq(t.jobDocuments.id, input.documentId));
    if (!doc) return false;
    const usedAt = input.usedAt ?? c.today;
    await c.tx
      .insert(t.jobOpportunityDocuments)
      .values({ opportunityId: input.opportunityId, documentId: doc.id, usedAt })
      .onConflictDoUpdate({ target: [t.jobOpportunityDocuments.opportunityId, t.jobOpportunityDocuments.documentId], set: { usedAt } });
    await logActivity(c, { type: "document_used", summary: `${doc.name}${doc.version ? ` (${doc.version})` : ""} usado`, metadata: { documentId: doc.id, version: doc.version } }, { opportunityId: input.opportunityId });
    await audit(c.tx, actor, "update", "jobOpportunity", input.opportunityId, ["documents"]);
    return true;
  });
}

export async function unlinkDocument(db: ContentDb, actor: Actor, opportunityId: string, documentId: string) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .delete(t.jobOpportunityDocuments)
      .where(and(eq(t.jobOpportunityDocuments.opportunityId, opportunityId), eq(t.jobOpportunityDocuments.documentId, documentId)))
      .returning({ id: t.jobOpportunityDocuments.documentId });
    if (!rows.length) return false;
    await audit(tx, actor, "update", "jobOpportunity", opportunityId, ["documents"]);
    return true;
  });
}

/* ------------------------------------------------------------ weekly review */

export async function saveWeeklyReview(db: ContentDb, actor: Actor, input: V.WeeklyReviewInput, metrics: unknown) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(t.jobWeeklyReviews)
      .values({ ...input, metrics })
      .onConflictDoUpdate({ target: t.jobWeeklyReviews.weekStart, set: { ...input, metrics, updatedAt: new Date() } })
      .returning({ id: t.jobWeeklyReviews.id });
    await audit(tx, actor, "update", "jobWeeklyReview", row.id, ["metrics", ...Object.keys(input)]);
    return row.id;
  });
}
