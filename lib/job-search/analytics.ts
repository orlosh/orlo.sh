import { addDays, dateIn, daysBetween } from "./dates";
import { OPPORTUNITY_STATUSES, type OpportunityStatus, SOURCES, type Source } from "./enums";
import { SOURCE_LABEL, STATUS_LABEL } from "./labels";
import type { OppSnap, Snapshot } from "./model";
import { isClosed, maxRank, RANK, rank } from "./stages";

/**
 * Métricas de la búsqueda. Todo se calcula a partir del historial real; cuando una muestra es
 * demasiado pequeña para sacar conclusiones, se devuelve null y la UI muestra "Datos insuficientes".
 */

/** Tamaño mínimo de muestra para comparar tasas entre grupos. */
export const MIN_SAMPLE = 5;

export type Rate = { num: number; den: number; rate: number | null };
export const rate = (num: number, den: number): Rate => ({ num, den, rate: den ? num / den : null });
export const pct = (r: Rate | number | null) => {
  const v = typeof r === "number" || r === null ? r : r.rate;
  return v === null ? "—" : `${Math.round(v * 100)}%`;
};

/* ----------------------------------------------------- hechos por proceso */

export type OppFacts = {
  opp: OppSnap;
  maxRank: number;
  qualified: boolean;
  applied: boolean;
  responded: boolean;
  interviewed: boolean;
  final: boolean;
  offer: boolean;
  referral: boolean;
  cold: boolean;
  /** Primer instante en que alcanzó cada hito (del historial). */
  reachedAt: { applied: Date | null; interview: Date | null; final: Date | null; offer: Date | null };
};

const WARM_SOURCES: Source[] = ["referral", "recruiter", "networking", "friend"];

export function factsFor(s: Snapshot): OppFacts[] {
  const historyBy = new Map<string, Snapshot["history"]>();
  for (const h of s.history) {
    const list = historyBy.get(h.opportunityId) ?? [];
    list.push(h);
    historyBy.set(h.opportunityId, list);
  }
  const interviewsBy = new Map<string, Snapshot["interviews"]>();
  for (const i of s.interviews) {
    const list = interviewsBy.get(i.opportunityId) ?? [];
    list.push(i);
    interviewsBy.set(i.opportunityId, list);
  }

  return s.opportunities.map((opp) => {
    const hist = (historyBy.get(opp.id) ?? []).slice().sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
    const ivs = interviewsBy.get(opp.id) ?? [];
    const mr = Math.max(maxRank([opp.status, ...hist.map((h) => h.toStatus)]), -1);
    const firstAt = (min: number) => hist.find((h) => (rank(h.toStatus) ?? -1) >= min)?.changedAt ?? null;
    const nonScreen = ivs.filter((i) => i.kind !== "recruiter_screen");
    const firstInterviewAt = [firstAt(RANK.interview), ...nonScreen.map((i) => i.scheduledAt)]
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    const applied = !!opp.appliedAt || mr >= RANK.applied;
    const referral = opp.referral === "received" || opp.source === "referral";
    const appliedAt = opp.appliedAt ? new Date(`${opp.appliedAt}T12:00:00Z`) : firstAt(RANK.applied);
    return {
      opp,
      maxRank: mr,
      qualified: mr >= RANK.qualified || applied,
      applied,
      responded: applied && (!!opp.firstResponseAt || mr >= RANK.recruiterScreen),
      interviewed: mr >= RANK.interview || nonScreen.length > 0,
      final: mr >= RANK.final || ivs.some((i) => i.kind === "final"),
      offer: mr >= RANK.offer || opp.outcome === "offer" || opp.outcome === "accepted" || opp.outcome === "declined",
      referral,
      cold: applied && !referral && !opp.hasRecruiter && !WARM_SOURCES.includes(opp.source),
      reachedAt: { applied: appliedAt, interview: firstInterviewAt, final: firstAt(RANK.final), offer: firstAt(RANK.offer) },
    };
  });
}

/* ----------------------------------------------------------------- funnel */

export const FUNNEL_STEPS = [
  ["opportunities", "Oportunidades"],
  ["qualified", "Cualificadas"],
  ["applied", "Aplicadas"],
  ["responses", "Respuestas"],
  ["interviews", "Entrevistas"],
  ["finals", "Finales"],
  ["offers", "Ofertas"],
] as const;
export type FunnelKey = (typeof FUNNEL_STEPS)[number][0];

export function funnel(facts: OppFacts[]): Record<FunnelKey, number> {
  return {
    opportunities: facts.length,
    qualified: facts.filter((f) => f.qualified).length,
    applied: facts.filter((f) => f.applied).length,
    responses: facts.filter((f) => f.responded).length,
    interviews: facts.filter((f) => f.interviewed).length,
    finals: facts.filter((f) => f.final).length,
    offers: facts.filter((f) => f.offer).length,
  };
}

export function conversions(facts: OppFacts[]) {
  const applied = facts.filter((f) => f.applied);
  const interviewed = facts.filter((f) => f.interviewed);
  const finals = facts.filter((f) => f.final);
  const referred = applied.filter((f) => f.referral);
  const cold = applied.filter((f) => f.cold);
  return [
    { key: "app_response", label: "Candidatura → respuesta", ...rate(applied.filter((f) => f.responded).length, applied.length) },
    { key: "app_interview", label: "Candidatura → entrevista", ...rate(applied.filter((f) => f.interviewed).length, applied.length) },
    { key: "interview_final", label: "Entrevista → final", ...rate(interviewed.filter((f) => f.final).length, interviewed.length) },
    { key: "final_offer", label: "Final → oferta", ...rate(finals.filter((f) => f.offer).length, finals.length) },
    { key: "referral_interview", label: "Con recomendación → entrevista", ...rate(referred.filter((f) => f.interviewed).length, referred.length) },
    { key: "cold_interview", label: "Candidatura en frío → entrevista", ...rate(cold.filter((f) => f.interviewed).length, cold.length) },
  ];
}

/* --------------------------------------------------------------- fuentes */

export type SourceRow = {
  source: Source;
  label: string;
  opportunities: number;
  applications: number;
  responses: number;
  interviews: number;
  offers: number;
  /** Entrevistas / candidaturas. */
  conversion: Rate;
};

export function sourcePerformance(facts: OppFacts[]): SourceRow[] {
  return SOURCES.map((source) => {
    const group = facts.filter((f) => f.opp.source === source);
    const applied = group.filter((f) => f.applied);
    return {
      source,
      label: SOURCE_LABEL[source],
      opportunities: group.length,
      applications: applied.length,
      responses: applied.filter((f) => f.responded).length,
      interviews: applied.filter((f) => f.interviewed).length,
      offers: applied.filter((f) => f.offer).length,
      conversion: rate(applied.filter((f) => f.interviewed).length, applied.length),
    };
  })
    .filter((r) => r.opportunities > 0)
    .sort((a, b) => b.interviews - a.interviews || b.applications - a.applications);
}

/* ------------------------------------------------------------- referrals */

export function referralAnalytics(facts: OppFacts[]) {
  const applied = facts.filter((f) => f.applied);
  const group = (list: OppFacts[]) => ({
    applications: list.length,
    response: rate(list.filter((f) => f.responded).length, list.length),
    interview: rate(list.filter((f) => f.interviewed).length, list.length),
    final: rate(list.filter((f) => f.final).length, list.length),
    offer: rate(list.filter((f) => f.offer).length, list.length),
  });
  return { withReferral: group(applied.filter((f) => f.referral)), withoutReferral: group(applied.filter((f) => !f.referral)) };
}

/* ---------------------------------------------------------------- tiempos */

export type Duration = { avg: number | null; n: number };
const avg = (values: number[]): Duration => ({
  avg: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null,
  n: values.length,
});

export function timeAnalytics(s: Snapshot, facts: OppFacts[]) {
  const spans = (from: (f: OppFacts) => Date | null, to: (f: OppFacts) => Date | null) =>
    avg(
      facts
        .map((f) => {
          const a = from(f);
          const b = to(f);
          return a && b && b >= a ? daysBetween(a, b) : null;
        })
        .filter((v): v is number => v !== null),
    );

  // Días en cada fase: de un cambio de estado al siguiente (o hasta ahora si sigue abierta).
  const perStatus = new Map<OpportunityStatus, number[]>();
  const byOpp = new Map<string, Snapshot["history"]>();
  for (const h of s.history) byOpp.set(h.opportunityId, [...(byOpp.get(h.opportunityId) ?? []), h]);
  const totals: number[] = [];
  for (const f of facts) {
    const hist = (byOpp.get(f.opp.id) ?? []).slice().sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
    hist.forEach((h, i) => {
      const end = hist[i + 1]?.changedAt ?? (isClosed(h.toStatus) ? null : s.now);
      if (!end || isClosed(h.toStatus)) return;
      perStatus.set(h.toStatus, [...(perStatus.get(h.toStatus) ?? []), daysBetween(h.changedAt, end)]);
    });
    if (f.applied && f.opp.closedAt && f.reachedAt.applied) totals.push(daysBetween(f.reachedAt.applied, f.opp.closedAt));
  }

  return {
    appToResponse: spans((f) => f.reachedAt.applied, (f) => (f.responded ? f.opp.firstResponseAt : null)),
    appToInterview: spans((f) => f.reachedAt.applied, (f) => f.reachedAt.interview),
    interviewToFinal: spans((f) => f.reachedAt.interview, (f) => f.reachedAt.final),
    finalToOffer: spans((f) => f.reachedAt.final, (f) => f.reachedAt.offer),
    totalProcess: avg(totals),
    daysInStage: OPPORTUNITY_STATUSES.filter((st) => perStatus.has(st)).map((st) => ({
      status: st,
      label: STATUS_LABEL[st],
      ...avg(perStatus.get(st)!),
    })),
  };
}

/* ------------------------------------------------------------ bottleneck */

export type Bottleneck = { stage: string; reason: string; action: string } | null;

/**
 * La fase que más frena el funnel. Primero el volumen (sin candidaturas no hay nada que
 * convertir); después la primera conversión que cae por debajo de una referencia razonable.
 */
export function bottleneck(s: Snapshot, facts: OppFacts[]): Bottleneck {
  const f = funnel(facts);
  const weekAgo = addDays(s.today, -7);
  const appliedThisWeek = facts.filter((x) => x.opp.appliedAt && x.opp.appliedAt > weekAgo).length;
  const pipelineReady = facts.filter((x) => !x.applied && !isClosed(x.opp.status)).length;

  if (f.opportunities < 5) {
    return {
      stage: "Oportunidades",
      reason: `Solo ${f.opportunities} oportunidades registradas: faltan oportunidades al principio del embudo.`,
      action: "Añade hoy al menos 10 oportunidades a la bandeja y cualifica las mejores.",
    };
  }
  if (appliedThisWeek < s.goal.weeklyApplicationTarget && f.applied < 10) {
    return {
      stage: "Candidaturas",
      reason: `${appliedThisWeek} candidaturas en los últimos 7 días frente a un objetivo de ${s.goal.weeklyApplicationTarget}/semana${pipelineReady ? `; ${pipelineReady} oportunidades abiertas sin aplicar` : ""}.`,
      action: pipelineReady ? "Aplica hoy a las oportunidades listas o cualificadas con mejor puntuación." : "Busca y cualifica nuevas oportunidades.",
    };
  }
  const checks: [string, number, number, number, string][] = [
    ["Respuestas", f.responses, f.applied, 0.15, "Revisa a qué ofertas apuntas y el CV: la mayoría de candidaturas no reciben respuesta. Prioriza las recomendaciones."],
    ["Entrevistas", f.interviews, f.responses, 0.4, "Las respuestas no se convierten en entrevistas: prepara la presentación para la llamada con reclutador y alinea expectativas."],
    ["Finales", f.finals, f.interviews, 0.3, "Se cae en entrevistas intermedias: refuerza la preparación técnica y las historias STAR."],
    ["Ofertas", f.offers, f.finals, 0.3, "Se cae en finales: revisa el feedback, la preparación del cierre y las preguntas a la empresa."],
  ];
  for (const [stage, num, den, ref, action] of checks) {
    if (den >= MIN_SAMPLE && num / den < ref) {
      return { stage, reason: `${num}/${den} (${pct(num / den)}) frente a una referencia del ${pct(ref)}.`, action };
    }
    if (den < MIN_SAMPLE) break;
  }
  if (f.applied >= MIN_SAMPLE && f.responses < MIN_SAMPLE) {
    return { stage: "Respuestas", reason: `${f.responses} respuestas de ${f.applied} candidaturas: aún pocas para medir más abajo.`, action: "Haz seguimiento de las candidaturas pendientes y pide recomendaciones." };
  }
  return null;
}

/* -------------------------------------------------------------- insights */

export type Insight = { text: string; evidence: string };

export function insights(s: Snapshot, facts: OppFacts[]): Insight[] {
  const out: Insight[] = [];
  const ref = referralAnalytics(facts);
  const w = ref.withReferral;
  const wo = ref.withoutReferral;
  if (w.applications >= MIN_SAMPLE && wo.applications >= MIN_SAMPLE && w.interview.rate !== null && wo.interview.rate !== null) {
    const better = w.interview.rate > wo.interview.rate;
    out.push({
      text: better ? "Las recomendaciones convierten mejor que las candidaturas sin recomendación." : "Las candidaturas sin recomendación convierten igual o mejor que con ella.",
      evidence: `Entrevista: ${pct(w.interview)} con recomendación (${w.interview.num}/${w.interview.den}) vs ${pct(wo.interview)} sin (${wo.interview.num}/${wo.interview.den}).`,
    });
  }

  const sources = sourcePerformance(facts).filter((r) => r.applications >= MIN_SAMPLE);
  if (sources.length >= 2) {
    const byVolume = [...sources].sort((a, b) => b.applications - a.applications)[0];
    const best = [...sources].sort((a, b) => (b.conversion.rate ?? 0) - (a.conversion.rate ?? 0))[0];
    if (best.source !== byVolume.source && (best.conversion.rate ?? 0) > (byVolume.conversion.rate ?? 0)) {
      out.push({
        text: `${byVolume.label} genera más volumen, pero ${best.label} genera más entrevistas por candidatura.`,
        evidence: `${byVolume.label}: ${byVolume.interviews}/${byVolume.applications} (${pct(byVolume.conversion)}) · ${best.label}: ${best.interviews}/${best.applications} (${pct(best.conversion)}).`,
      });
    }
    const top = [...sources].sort((a, b) => b.interviews - a.interviews)[0];
    if (top.interviews > 0) {
      out.push({ text: `${top.label} es el canal que más entrevistas está generando.`, evidence: `${top.interviews} entrevistas de ${top.applications} candidaturas.` });
    }
  }

  const stale = s.opportunities.filter(
    (o) => o.priority === "high" && !isClosed(o.status) && daysBetween(o.lastActivityAt, s.now) >= s.goal.staleDays,
  );
  if (stale.length) {
    out.push({
      text: `${stale.length} oportunidad${stale.length === 1 ? "" : "es"} de prioridad alta sin actividad desde hace ${s.goal.staleDays}+ días.`,
      evidence: stale.slice(0, 3).map((o) => o.companyName ?? o.title).join(", "),
    });
  }

  const cold = facts.filter((f) => f.cold);
  const coldInterview = rate(cold.filter((f) => f.interviewed).length, cold.length);
  if (cold.length >= MIN_SAMPLE * 2 && (coldInterview.rate ?? 0) < 0.05) {
    out.push({
      text: "Las candidaturas en frío casi no generan entrevistas.",
      evidence: `${coldInterview.num}/${coldInterview.den} (${pct(coldInterview)}). Dedica más tiempo a contactos y recomendaciones.`,
    });
  }
  return out;
}

/* --------------------------------------------------------- weekly review */

export type WeekMetrics = {
  applications: number;
  contacts: number;
  referralsRequested: number;
  referralsReceived: number;
  followUps: number;
  interviews: number;
  responses: number;
  finals: number;
  offers: number;
};

export function weekMetrics(s: Snapshot, weekStart: string): WeekMetrics {
  const end = addDays(weekStart, 7);
  const tz = s.goal.timezone;
  const inWeek = (d: string | null | undefined) => !!d && d >= weekStart && d < end;
  const instantInWeek = (d: Date | null | undefined) => !!d && inWeek(dateIn(d, tz));
  const reached = (status: OpportunityStatus) =>
    new Set(s.history.filter((h) => h.toStatus === status && instantInWeek(h.changedAt)).map((h) => h.opportunityId)).size;

  return {
    applications: s.opportunities.filter((o) => inWeek(o.appliedAt)).length,
    contacts: new Set(
      s.activities
        .filter((a) => (a.type === "contact_interaction" || a.type === "recruiter_contacted") && instantInWeek(a.occurredAt))
        .map((a) => a.contactId ?? a.opportunityId),
    ).size,
    referralsRequested: s.referrals.filter((r) => inWeek(r.requestedAt)).length,
    referralsReceived: s.referrals.filter((r) => inWeek(r.receivedAt)).length,
    followUps: s.activities.filter((a) => a.type === "follow_up" && instantInWeek(a.occurredAt)).length,
    interviews: s.interviews.filter((i) => i.outcome !== "cancelled" && instantInWeek(i.scheduledAt)).length,
    responses: s.opportunities.filter((o) => instantInWeek(o.firstResponseAt)).length,
    finals: reached("final_interview"),
    offers: reached("offer"),
  };
}

export const WEEK_METRIC_LABEL: Record<keyof WeekMetrics, string> = {
  applications: "Candidaturas",
  contacts: "Contactos",
  referralsRequested: "Recomendaciones pedidas",
  referralsReceived: "Recomendaciones recibidas",
  followUps: "Seguimientos",
  interviews: "Entrevistas",
  responses: "Respuestas",
  finals: "Finales",
  offers: "Ofertas",
};
