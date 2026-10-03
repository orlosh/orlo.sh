import { addDays, dateIn, daysBetween, diffDays, relativeDay } from "./dates";
import { INTERVIEW_KIND_LABEL, STATUS_LABEL, TASK_KIND_LABEL } from "./labels";
import { oppLabel, type OppSnap, type Snapshot, type TaskSnap } from "./model";
import { INBOX_STATUSES, isClosed, isInterviewing, isPreApply } from "./stages";

/**
 * Plan diario, alertas y KPIs del dashboard. Funciones puras de la instantánea: cada elemento
 * lleva el motivo por el que aparece, calculado con los mismos datos que se muestran.
 */

const BASE = "/admin/job-search";
export const oppHref = (id: string) => `${BASE}/opportunities/${id}`;
const contactHref = (id: string) => `${BASE}/contacts/${id}`;
const interviewHref = (id: string) => `${BASE}/interviews/${id}`;

/* ------------------------------------------------------------ plan diario */

export const PLAN_CATEGORIES = [
  "Entrevistas próximas",
  "Procesos finales",
  "Seguimientos vencidos",
  "Alta prioridad",
  "Recomendaciones",
  "Contactos",
  "Candidaturas",
  "Investigación",
  "Otras tareas",
] as const;

export type PlanItem = {
  key: string;
  /** Índice en PLAN_CATEGORIES: define el orden. */
  category: number;
  title: string;
  reason: string;
  href: string;
  taskId?: string;
};

const TASK_CATEGORY: Record<TaskSnap["kind"], number> = {
  prepare_interview: 0,
  send_thank_you: 0,
  follow_up: 2,
  ask_referral: 4,
  contact: 5,
  apply: 6,
  research: 7,
  update_cv: 8,
  update_portfolio: 8,
  other: 8,
};

function dueReason(due: string, today: string) {
  const d = diffDays(today, due);
  return d < 0 ? `Vencida ${relativeDay(due, today)}` : d === 0 ? "Vence hoy" : `Vence ${relativeDay(due, today)}`;
}

export function dailyPlan(s: Snapshot, scores: Map<string, number>, limit = 20): PlanItem[] {
  const { today } = s;
  const items: PlanItem[] = [];
  const seen = new Set<string>();
  const push = (item: PlanItem, dedupe?: string) => {
    if (dedupe && seen.has(dedupe)) return;
    if (dedupe) seen.add(dedupe);
    items.push(item);
  };
  const opps = new Map(s.opportunities.map((o) => [o.id, o]));
  const contacts = new Map(s.contacts.map((c) => [c.id, c]));
  const label = (oppId: string | null) => (oppId && opps.get(oppId) ? oppLabel(opps.get(oppId)!) : null);

  // Tareas abiertas que vencen hoy o antes, cada una en su categoría.
  const dueTasks = s.tasks.filter((t) => t.status === "open" && t.dueDate && t.dueDate <= today);
  for (const t of dueTasks) {
    const cat = TASK_CATEGORY[t.kind];
    const ctx = label(t.opportunityId) ?? (t.contactId ? contacts.get(t.contactId)?.name : null);
    push(
      {
        key: `task:${t.id}`,
        category: cat,
        title: t.title,
        reason: `${TASK_KIND_LABEL[t.kind]} · ${dueReason(t.dueDate!, today)}${ctx ? ` · ${ctx}` : ""}`,
        href: t.opportunityId ? `${oppHref(t.opportunityId)}?tab=tasks` : t.contactId ? contactHref(t.contactId) : `${BASE}/tasks`,
        taskId: t.id,
      },
      t.opportunityId ? `${cat}:${t.opportunityId}:${t.kind}` : undefined,
    );
  }

  // 1. Entrevistas en los próximos 3 días.
  const horizon = addDays(today, 3);
  for (const i of s.interviews) {
    if (i.outcome !== "pending" || !i.scheduledAt) continue;
    const day = dateIn(i.scheduledAt, s.goal.timezone);
    if (day < today || day > horizon) continue;
    const o = opps.get(i.opportunityId);
    push(
      {
        key: `interview:${i.id}`,
        category: 0,
        title: `Preparar ${INTERVIEW_KIND_LABEL[i.kind]}${o ? ` · ${oppLabel(o)}` : ""}`,
        reason: `Es ${relativeDay(day, today)}${i.prepTotal ? ` · preparación ${i.prepDone}/${i.prepTotal}` : " · sin lista de preparación"}`,
        href: interviewHref(i.id),
      },
      `0:${i.opportunityId}:prepare_interview`,
    );
  }

  // 2. Procesos finales y ofertas.
  for (const o of s.opportunities) {
    if (o.status !== "final_interview" && o.status !== "offer") continue;
    const days = Math.floor(daysBetween(o.statusChangedAt, s.now));
    const deadline = o.offerDeadline ? ` · responder ${relativeDay(o.offerDeadline, today)}` : "";
    push(
      {
        key: `final:${o.id}`,
        category: 1,
        title: `${o.status === "offer" ? "Gestionar oferta" : "Cerrar proceso final"} · ${oppLabel(o)}`,
        reason: `${STATUS_LABEL[o.status]} desde hace ${days} d${deadline}${o.nextAction ? ` · siguiente: ${o.nextAction}` : ""}`,
        href: oppHref(o.id),
      },
      `1:${o.id}`,
    );
  }

  // 3. Follow-ups vencidos sin tarea que los cubra.
  const followTask = new Set(s.tasks.filter((t) => t.status === "open" && t.kind === "follow_up").map((t) => t.opportunityId ?? t.contactId));
  for (const o of s.opportunities) {
    if (!o.nextFollowUpAt || o.nextFollowUpAt > today || isClosed(o.status) || followTask.has(o.id)) continue;
    push({ key: `fu-opp:${o.id}`, category: 2, title: `Seguimiento · ${oppLabel(o)}`, reason: `Seguimiento previsto ${relativeDay(o.nextFollowUpAt, today)} · ${STATUS_LABEL[o.status]}`, href: oppHref(o.id) }, `2:${o.id}:follow_up`);
  }
  for (const c of s.contacts) {
    if (!c.nextFollowUpAt || c.nextFollowUpAt > today || c.status === "closed" || followTask.has(c.id)) continue;
    push({ key: `fu-contact:${c.id}`, category: 2, title: `Seguimiento · ${c.name}${c.companyName ? ` (${c.companyName})` : ""}`, reason: `Previsto ${relativeDay(c.nextFollowUpAt, today)}`, href: contactHref(c.id) });
  }

  // 4. Alta prioridad aún sin aplicar.
  s.opportunities
    .filter((o) => o.priority === "high" && isPreApply(o.status) && !(INBOX_STATUSES as readonly string[]).includes(o.status))
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
    .slice(0, 3)
    .forEach((o) => {
      const idle = Math.floor(daysBetween(o.lastActivityAt, s.now));
      push(
        { key: `high:${o.id}`, category: 3, title: `${o.nextAction ?? "Avanzar"} · ${oppLabel(o)}`, reason: `Prioridad alta · puntuación ${scores.get(o.id) ?? "—"} · ${STATUS_LABEL[o.status]} · ${idle ? `sin actividad ${idle} d` : "activa hoy"}`, href: oppHref(o.id) },
        `3:${o.id}`,
      );
    });

  // 5. Referrals pendientes de respuesta.
  for (const r of s.referrals) {
    if (r.status !== "requested") continue;
    const age = diffDays(r.requestedAt, today);
    if (age < s.goal.followupReferralDays) continue;
    const o = opps.get(r.opportunityId);
    const c = r.contactId ? contacts.get(r.contactId) : null;
    if (!o || isClosed(o.status)) continue;
    push(
      { key: `ref:${r.id}`, category: 4, title: `Recordar la recomendación${c ? ` a ${c.name}` : ""} · ${oppLabel(o)}`, reason: `Pedida hace ${age} d sin respuesta (regla: ${s.goal.followupReferralDays} d)`, href: oppHref(o.id) },
      `4:${o.id}:ask_referral`,
    );
  }
  // …y oportunidades en networking con un contacto en la empresa pero sin referral pedido.
  for (const o of s.opportunities) {
    if (o.referral !== "none" || !["qualified", "networking"].includes(o.status) || !o.companyId) continue;
    const insider = s.contacts.find((c) => c.companyId === o.companyId && c.kind !== "recruiter" && c.status !== "closed");
    if (!insider) continue;
    push({ key: `ask-ref:${o.id}`, category: 4, title: `Pedir recomendación a ${insider.name} · ${oppLabel(o)}`, reason: `${STATUS_LABEL[o.status]} y tienes un contacto en ${o.companyName}`, href: oppHref(o.id) }, `4:${o.id}:ask_referral`);
  }

  // 6. Networking: contactos pendientes de un primer mensaje.
  s.contacts
    .filter((c) => c.status === "to_contact")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 3)
    .forEach((c) => push({ key: `net:${c.id}`, category: 5, title: `Contactar a ${c.name}${c.companyName ? ` (${c.companyName})` : ""}`, reason: `Por contactar desde hace ${Math.floor(daysBetween(c.createdAt, s.now))} d`, href: contactHref(c.id) }));

  // 7. Applications listas para enviar.
  s.opportunities
    // Las de prioridad alta ya están arriba en "Alta prioridad": no se repiten.
    .filter((o) => (o.status === "ready_to_apply" || (o.status === "qualified" && o.priority !== "low")) && !seen.has(`3:${o.id}`))
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0))
    .slice(0, 5)
    .forEach((o) =>
      push(
        { key: `apply:${o.id}`, category: 6, title: `Aplicar · ${oppLabel(o)}`, reason: `${STATUS_LABEL[o.status]} · puntuación ${scores.get(o.id) ?? "—"}${o.deadline ? ` · cierra ${relativeDay(o.deadline, today)}` : ""}`, href: oppHref(o.id) },
        `6:${o.id}:apply`,
      ),
    );

  // 8. Research: bandeja sin revisar.
  const inbox = s.opportunities.filter((o) => (INBOX_STATUSES as readonly string[]).includes(o.status));
  if (inbox.length) {
    push({ key: "inbox", category: 7, title: `Revisar la bandeja (${inbox.length})`, reason: `${inbox.length} oportunidad${inbox.length === 1 ? "" : "es"} sin cualificar`, href: `${BASE}/inbox` });
  }

  return items.sort((a, b) => a.category - b.category).slice(0, limit);
}

/* ---------------------------------------------------------------- alertas */

export type AlertLevel = "critical" | "warning" | "info";
export type Alert = { key: string; level: AlertLevel; kind: string; title: string; detail: string; href: string };

const ALERT_ORDER: Record<AlertLevel, number> = { critical: 0, warning: 1, info: 2 };

export function alerts(s: Snapshot): Alert[] {
  const { today, now, goal } = s;
  const out: Alert[] = [];
  const opps = new Map(s.opportunities.map((o) => [o.id, o]));

  for (const i of s.interviews) {
    if (i.outcome !== "pending" || !i.scheduledAt) continue;
    const hours = (i.scheduledAt.getTime() - now.getTime()) / 3_600_000;
    if (hours < 0 || hours > 48) continue;
    const o = opps.get(i.opportunityId);
    out.push({ key: `iv:${i.id}`, level: hours <= 24 ? "critical" : "warning", kind: "Entrevista próxima", title: `${INTERVIEW_KIND_LABEL[i.kind]}${o ? ` · ${oppLabel(o)}` : ""}`, detail: `En ${Math.round(hours)} h`, href: interviewHref(i.id) });
  }

  for (const t of s.tasks) {
    if (t.status !== "open" || !t.dueDate || t.dueDate >= today) continue;
    if (t.kind !== "follow_up" && t.kind !== "send_thank_you") continue;
    out.push({ key: `fu:${t.id}`, level: "critical", kind: "Seguimiento vencido", title: t.title, detail: dueReason(t.dueDate, today), href: t.opportunityId ? `${oppHref(t.opportunityId)}?tab=tasks` : `${BASE}/tasks?view=overdue` });
  }

  const openFollow = new Set(s.tasks.filter((t) => t.status === "open" && t.kind === "follow_up").map((t) => t.opportunityId));
  for (const o of s.opportunities) {
    if (isClosed(o.status)) continue;
    const href = oppHref(o.id);
    if (o.nextFollowUpAt && o.nextFollowUpAt < today && !openFollow.has(o.id)) {
      out.push({ key: `fuo:${o.id}`, level: "critical", kind: "Seguimiento vencido", title: oppLabel(o), detail: `Seguimiento previsto ${relativeDay(o.nextFollowUpAt, today)}`, href });
    }
    if (o.status === "applied" && !o.nextFollowUpAt && !openFollow.has(o.id)) {
      out.push({ key: `nofu:${o.id}`, level: "warning", kind: "Candidatura sin seguimiento", title: oppLabel(o), detail: o.appliedAt ? `Aplicada ${relativeDay(o.appliedAt, today)}` : "Aplicada", href });
    }
    const idle = Math.floor(daysBetween(o.lastActivityAt, now));
    if (!(INBOX_STATUSES as readonly string[]).includes(o.status) && idle >= goal.staleDays) {
      out.push({ key: `idle:${o.id}`, level: o.priority === "high" ? "warning" : "info", kind: "Oportunidad inactiva", title: oppLabel(o), detail: `${idle} d sin actividad · ${STATUS_LABEL[o.status]}`, href });
    }
    if (o.offerDeadline && o.offerDeadline >= today && diffDays(today, o.offerDeadline) <= 3) {
      out.push({ key: `offer:${o.id}`, level: "critical", kind: "Plazo de la oferta", title: oppLabel(o), detail: `Responder ${relativeDay(o.offerDeadline, today)}`, href });
    }
    if (o.deadline && !o.appliedAt && isPreApply(o.status) && o.deadline >= today && diffDays(today, o.deadline) <= 3) {
      out.push({ key: `dl:${o.id}`, level: "warning", kind: "Cierre de candidaturas", title: oppLabel(o), detail: `Cierra ${relativeDay(o.deadline, today)}`, href });
    }
    const inStage = Math.floor(daysBetween(o.statusChangedAt, now));
    if ((isInterviewing(o.status) || o.status === "applied") && inStage >= 14) {
      out.push({ key: `stall:${o.id}`, level: "warning", kind: "Proceso estancado", title: oppLabel(o), detail: `${inStage} d en ${STATUS_LABEL[o.status]}`, href });
    }
  }

  for (const c of s.contacts) {
    if (c.status !== "contacted" && c.status !== "in_conversation") continue;
    if (c.nextFollowUpAt && c.nextFollowUpAt < today) {
      out.push({ key: `fuc:${c.id}`, level: "critical", kind: "Seguimiento vencido", title: c.name, detail: `Previsto ${relativeDay(c.nextFollowUpAt, today)}`, href: contactHref(c.id) });
    }
    if (c.lastInteractionAt && diffDays(c.lastInteractionAt, today) >= goal.staleDays) {
      out.push({ key: `coldc:${c.id}`, level: "info", kind: "Contacto inactivo", title: `${c.name}${c.companyName ? ` · ${c.companyName}` : ""}`, detail: `Última interacción ${relativeDay(c.lastInteractionAt, today)}`, href: contactHref(c.id) });
    }
  }

  for (const r of s.referrals) {
    if (r.status !== "requested") continue;
    const age = diffDays(r.requestedAt, today);
    const o = opps.get(r.opportunityId);
    if (age >= goal.followupReferralDays && o && !isClosed(o.status)) {
      out.push({ key: `ref:${r.id}`, level: "warning", kind: "Recomendación pendiente", title: oppLabel(o), detail: `Pedida hace ${age} d`, href: oppHref(o.id) });
    }
  }

  return out.sort((a, b) => ALERT_ORDER[a.level] - ALERT_ORDER[b.level]);
}

/* ------------------------------------------------------------------- KPIs */

export function dashboardKpis(s: Snapshot) {
  const { today, goal } = s;
  const day = Math.max(1, diffDays(goal.startDate, today) + 1);
  const active = (o: OppSnap) => !isClosed(o.status);
  const followUpsDue =
    s.tasks.filter((t) => t.status === "open" && t.kind === "follow_up" && t.dueDate && t.dueDate <= today).length +
    s.opportunities.filter((o) => active(o) && o.nextFollowUpAt && o.nextFollowUpAt <= today && !s.tasks.some((t) => t.status === "open" && t.kind === "follow_up" && t.opportunityId === o.id)).length +
    s.contacts.filter((c) => c.status !== "closed" && c.nextFollowUpAt && c.nextFollowUpAt <= today).length;
  const upcoming = s.interviews.filter((i) => i.outcome === "pending" && i.scheduledAt && i.scheduledAt >= s.now).length;

  return {
    day: Math.min(day, goal.durationDays),
    overrun: day > goal.durationDays ? day - goal.durationDays : 0,
    duration: goal.durationDays,
    remaining: Math.max(0, goal.durationDays - day),
    activeApplications: s.opportunities.filter((o) => ["applied", "recruiter_screen", "interview", "technical", "final_interview", "offer"].includes(o.status)).length,
    activeInterviews: s.opportunities.filter((o) => isInterviewing(o.status) && o.status !== "final_interview").length,
    upcomingInterviews: upcoming,
    finals: s.opportunities.filter((o) => o.status === "final_interview").length,
    offers: s.opportunities.filter((o) => o.status === "offer").length,
    followUpsDue,
    tasksToday: s.tasks.filter((t) => t.status === "open" && t.dueDate && t.dueDate <= today).length,
  };
}
