import { dateIn, daysBetween } from "./dates";
import type { Snapshot } from "./model";
import { stageGroup } from "./stages";

/** Proyecciones serializables de la instantánea para los componentes de cliente. */

export function tableRows(s: Snapshot, scores: Map<string, number>) {
  return s.opportunities.map((o) => ({
    id: o.id,
    title: o.title,
    company: o.companyName,
    status: o.status,
    stage: stageGroup(o.status),
    priority: o.priority,
    source: o.source,
    workplace: o.workplace,
    location: o.location,
    salaryMin: o.salaryMin,
    salaryMax: o.salaryMax,
    salaryCurrency: o.salaryCurrency,
    score: scores.get(o.id) ?? 0,
    referral: o.referral,
    hasRecruiter: o.hasRecruiter,
    discoveredAt: o.discoveredAt,
    appliedAt: o.appliedAt,
    nextAction: o.nextAction,
    nextFollowUpAt: o.nextFollowUpAt,
    daysInStage: Math.floor(daysBetween(o.statusChangedAt, s.now)),
    idleDays: Math.floor(daysBetween(o.lastActivityAt, s.now)),
  }));
}

export function kanbanCards(s: Snapshot, scores: Map<string, number>) {
  const nextInterview = new Map<string, { at: string; kind: string }>();
  for (const i of s.interviews) {
    if (i.outcome !== "pending" || !i.scheduledAt || i.scheduledAt < s.now) continue;
    const cur = nextInterview.get(i.opportunityId);
    const at = dateIn(i.scheduledAt, s.goal.timezone);
    if (!cur || at < cur.at) nextInterview.set(i.opportunityId, { at, kind: i.kind });
  }
  return s.opportunities.map((o) => ({
    id: o.id,
    title: o.title,
    company: o.companyName,
    status: o.status,
    priority: o.priority,
    score: scores.get(o.id) ?? 0,
    daysInStage: Math.floor(daysBetween(o.statusChangedAt, s.now)),
    nextAction: o.nextAction,
    nextFollowUpAt: o.nextFollowUpAt,
    referral: o.referral,
    interview: nextInterview.get(o.id) ?? null,
  }));
}

export type KanbanCard = ReturnType<typeof kanbanCards>[number];
