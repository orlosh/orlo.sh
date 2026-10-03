import { addBusinessDays, addDays, dateIn } from "./dates";
import type { ActivityType, InterviewKind, OpportunityStatus, Outcome, Priority, TaskKind } from "./enums";
import { INTERVIEW_KIND_LABEL, STATUS_LABEL } from "./labels";
import type { Goal } from "./model";
import { isClosed, rank, RANK } from "./stages";

/**
 * Reglas de automatización, como funciones puras que describen efectos. Las mutaciones los
 * aplican dentro de la misma transacción que el cambio que los provoca, así que nunca queda un
 * estado a medias (p. ej., una candidatura marcada como Applied sin su follow-up).
 */

export type ActivityEffect = { type: ActivityType; summary: string; metadata?: Record<string, unknown> };
export type TaskEffect = { title: string; kind: TaskKind; dueDate: string; priority: Priority; origin: string };

export type TransitionEffects = {
  activities: ActivityEffect[];
  tasks: TaskEffect[];
  set: {
    appliedAt?: string;
    firstResponseAt?: Date;
    closedAt?: Date | null;
    outcome?: Outcome | null;
    nextFollowUpAt?: string | null;
  };
  /** Cancelar todas las tareas abiertas de la oportunidad. */
  closePendingTasks: boolean;
  /** Cancelar solo los follow-ups automáticos de candidatura (la empresa ya ha respondido). */
  cancelApplicationFollowUps: boolean;
  referral: "request" | "receive" | null;
};

type OppState = {
  status: OpportunityStatus;
  appliedAt: string | null;
  firstResponseAt: Date | null;
  closedAt: Date | null;
  label: string;
};

/** Estados que cuentan como respuesta de la empresa a una candidatura. */
const RESPONSE_STATUSES: OpportunityStatus[] = ["recruiter_screen", "interview", "technical", "final_interview", "offer", "rejected"];

export function transitionEffects(
  opp: OppState,
  to: OpportunityStatus,
  { today, now, goal }: { today: string; now: Date; goal: Goal },
): TransitionEffects {
  const fx: TransitionEffects = { activities: [], tasks: [], set: {}, closePendingTasks: false, cancelApplicationFollowUps: false, referral: null };
  if (opp.status === to) return fx;

  fx.activities.push({
    type: "status_changed",
    summary: `${STATUS_LABEL[opp.status]} → ${STATUS_LABEL[to]}`,
    metadata: { from: opp.status, to },
  });

  const wasApplied = !!opp.appliedAt || (rank(opp.status) ?? -1) >= RANK.applied;

  // Reabrir un proceso cerrado borra el resultado anterior.
  if (isClosed(opp.status) && !isClosed(to)) {
    fx.set.closedAt = null;
    fx.set.outcome = null;
  }

  if (to === "applied" || (!wasApplied && (rank(to) ?? -1) > RANK.applied)) {
    const appliedAt = opp.appliedAt ?? today;
    fx.set.appliedAt = appliedAt;
    fx.activities.push({ type: "applied", summary: `Candidatura enviada · ${opp.label}` });
    if (to === "applied") {
      const due = addBusinessDays(appliedAt < today ? today : appliedAt, goal.followupApplicationDays);
      fx.tasks.push({
        title: `Follow-up candidatura · ${opp.label}`,
        kind: "follow_up",
        dueDate: due,
        priority: "medium",
        origin: "auto:application",
      });
      fx.set.nextFollowUpAt = due;
    }
  }

  if (to === "referral_requested") {
    fx.referral = "request";
    fx.activities.push({ type: "referral_requested", summary: `Referral solicitado · ${opp.label}` });
    const due = addBusinessDays(today, goal.followupReferralDays);
    fx.tasks.push({ title: `Follow-up referral · ${opp.label}`, kind: "follow_up", dueDate: due, priority: "medium", origin: "auto:referral" });
    fx.set.nextFollowUpAt = due;
  }

  if (to === "referral_received") {
    fx.referral = "receive";
    fx.activities.push({ type: "referral_received", summary: `Referral recibido · ${opp.label}` });
    fx.set.nextFollowUpAt = null;
  }

  if (RESPONSE_STATUSES.includes(to) && (wasApplied || to !== "rejected") && !opp.firstResponseAt) {
    fx.set.firstResponseAt = now;
    fx.activities.push({ type: "reply", summary: `Respuesta de la empresa (${STATUS_LABEL[to]}) · ${opp.label}` });
    fx.cancelApplicationFollowUps = true;
    if (fx.set.nextFollowUpAt === undefined) fx.set.nextFollowUpAt = null;
  }

  if (to === "rejected") {
    fx.activities.push({ type: "rejection", summary: `Rechazo · ${opp.label}` });
    fx.closePendingTasks = true;
    fx.set.outcome = "rejected";
    fx.set.closedAt = now;
    fx.set.nextFollowUpAt = null;
  }
  if (to === "offer") {
    fx.activities.push({ type: "offer", summary: `Oferta recibida · ${opp.label}` });
    fx.set.outcome = "offer";
  }
  if (to === "ghosted") {
    fx.set.outcome = "ghosted";
    fx.set.closedAt = now;
  }
  if (to === "withdrawn") {
    fx.set.outcome = "withdrawn";
    fx.set.closedAt = now;
    fx.closePendingTasks = true;
    fx.set.nextFollowUpAt = null;
  }
  if (to === "archived") {
    fx.set.closedAt = opp.closedAt ?? now;
    fx.closePendingTasks = true;
    fx.set.nextFollowUpAt = null;
  }
  return fx;
}

/** Estado al que avanza un proceso cuando se programa una entrevista de cada tipo. */
const INTERVIEW_STATUS: Record<InterviewKind, OpportunityStatus> = {
  recruiter_screen: "recruiter_screen",
  hiring_manager: "interview",
  technical: "technical",
  portfolio_review: "technical",
  case_study: "technical",
  take_home: "technical",
  behavioral: "interview",
  panel: "interview",
  final: "final_interview",
  other: "interview",
};

export function interviewEffects(
  interview: { kind: InterviewKind; scheduledAt: Date | null },
  opp: { status: OpportunityStatus; label: string },
  { today, goal }: { today: string; goal: Goal },
) {
  const day = interview.scheduledAt ? dateIn(interview.scheduledAt, goal.timezone) : null;
  const kindLabel = INTERVIEW_KIND_LABEL[interview.kind];
  const prepDue = day ? (addDays(day, -1) < today ? today : addDays(day, -1)) : today;
  const tasks: TaskEffect[] = [
    { title: `Preparar ${kindLabel} · ${opp.label}`, kind: "prepare_interview", dueDate: prepDue, priority: "high", origin: "auto:interview" },
  ];
  // Thank-you en las 24 h siguientes; no aplica a pruebas asíncronas.
  if (interview.kind !== "take_home") {
    tasks.push({
      title: `Enviar thank-you · ${opp.label}`,
      kind: "send_thank_you",
      dueDate: day ? addDays(day, 1) : addDays(today, 1),
      priority: "high",
      origin: "auto:interview",
    });
  }
  const target = INTERVIEW_STATUS[interview.kind];
  const advance = !isClosed(opp.status) && (rank(target) ?? -1) > (rank(opp.status) ?? -1) ? target : null;
  return {
    activity: { type: "interview_scheduled", summary: `${kindLabel} programada${day ? ` para el ${day}` : ""} · ${opp.label}` } satisfies ActivityEffect,
    tasks,
    advanceTo: advance,
  };
}

/** Follow-up tras escribir a un contacto: regla de recruiter (días laborables). */
export function contactFollowUpDate(today: string, goal: Goal) {
  return addBusinessDays(today, goal.followupRecruiterDays);
}
