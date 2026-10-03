import { diffDays } from "./dates";
import { seniorityDistance, type JobAnalysis, type ProfileMatch } from "./jd";
import { WORKPLACE_LABEL } from "./labels";
import type { Goal, OppSnap } from "./model";
import type { SourceRow } from "./analytics";
import { MIN_SAMPLE } from "./analytics";

/**
 * Opportunity Score (0-100). Suma de diez factores con un peso máximo cada uno; cada factor
 * explica de dónde salen sus puntos. Sin datos, un factor puntúa a medias y lo dice: nunca se
 * premia ni se castiga una ausencia de información como si fuera un dato.
 */

export type ScoreFactor = { key: string; label: string; points: number; max: number; reason: string };
export type Score = { score: number; computed: number; overridden: boolean; overrideReason: string | null; factors: ScoreFactor[] };

export type ScoreContext = {
  goal: Goal;
  today: string;
  analysis: JobAnalysis | null;
  match: ProfileMatch | null;
  /** Rendimiento histórico de la fuente de la oportunidad (null si no hay). */
  sourceRow: SourceRow | null;
  /** Tasa global candidatura → entrevista, para comparar la fuente. */
  overallInterviewRate: number | null;
};

const half = (max: number) => Math.round(max / 2);
const fromFive = (v: number, max: number) => Math.round((v / 5) * max);

function roleFit(o: OppSnap, ctx: ScoreContext): ScoreFactor {
  const max = 15;
  if (o.roleFit !== null) return { key: "role", label: "Role fit", max, points: fromFive(o.roleFit, max), reason: `Valoración manual ${o.roleFit}/5.` };
  if (!ctx.goal.targetRoles.length) return { key: "role", label: "Role fit", max, points: half(max), reason: "Sin roles objetivo en los ajustes." };
  const title = o.title.toLowerCase();
  const hit = ctx.goal.targetRoles.find((r) => title.includes(r.toLowerCase()));
  if (hit) return { key: "role", label: "Role fit", max, points: max, reason: `El título contiene "${hit}".` };
  const words = ctx.goal.targetRoles.flatMap((r) => r.toLowerCase().split(/\s+/)).filter((w) => w.length > 3);
  const partial = words.filter((w) => title.includes(w));
  if (partial.length) return { key: "role", label: "Role fit", max, points: Math.round(max * 0.6), reason: `Coincidencia parcial con el rol objetivo (${partial.join(", ")}).` };
  return { key: "role", label: "Role fit", max, points: Math.round(max * 0.2), reason: "El título no coincide con ningún rol objetivo." };
}

function skillMatch(_: OppSnap, ctx: ScoreContext): ScoreFactor {
  const max = 20;
  if (!ctx.analysis || !ctx.match) return { key: "skills", label: "Skill match", max, points: half(max), reason: "Sin Job Description para analizar." };
  const cov = ctx.match.requiredCoverage;
  if (cov === null) return { key: "skills", label: "Skill match", max, points: half(max), reason: "La JD no menciona habilidades reconocibles." };
  const total = ctx.analysis.requiredSkills.length;
  const matched = total - ctx.match.missingRequired.length;
  return {
    key: "skills",
    label: "Skill match",
    max,
    points: Math.round(cov * max),
    reason: `${matched}/${total} habilidades requeridas con evidencia${ctx.match.missingRequired.length ? `; faltan ${ctx.match.missingRequired.slice(0, 3).join(", ")}` : ""}.`,
  };
}

function seniorityFit(o: OppSnap, ctx: ScoreContext): ScoreFactor {
  const max = 10;
  if (o.seniorityFit !== null) return { key: "seniority", label: "Seniority fit", max, points: fromFive(o.seniorityFit, max), reason: `Valoración manual ${o.seniorityFit}/5.` };
  const jd = ctx.analysis?.seniority;
  const target = ctx.goal.targetSeniority;
  if (!jd || !target) return { key: "seniority", label: "Seniority fit", max, points: half(max), reason: !target ? "Sin seniority objetivo en los ajustes." : "La JD no indica seniority." };
  const d = seniorityDistance(jd.value, target);
  const points = d === 0 ? max : d === 1 ? Math.round(max * 0.6) : 0;
  return { key: "seniority", label: "Seniority fit", max, points, reason: `Oferta ${jd.value}${jd.inferred ? " (inferido de los años pedidos)" : ""} vs objetivo ${target}.` };
}

function salaryFit(o: OppSnap, ctx: ScoreContext): ScoreFactor {
  const max = 10;
  const min = ctx.goal.minSalary;
  const offered = o.salaryMax ?? o.salaryMin;
  if (!min) return { key: "salary", label: "Salary fit", max, points: half(max), reason: "Sin salario mínimo en los ajustes." };
  if (!offered) return { key: "salary", label: "Salary fit", max, points: half(max), reason: "La oferta no publica salario." };
  if (o.salaryCurrency && ctx.goal.currency && o.salaryCurrency.toUpperCase() !== ctx.goal.currency.toUpperCase()) {
    return { key: "salary", label: "Salary fit", max, points: half(max), reason: `Moneda distinta (${o.salaryCurrency} vs ${ctx.goal.currency}): no se compara.` };
  }
  if (offered >= min) return { key: "salary", label: "Salary fit", max, points: max, reason: `Hasta ${offered.toLocaleString("es-ES")} ≥ mínimo ${min.toLocaleString("es-ES")}.` };
  if (offered >= min * 0.9) return { key: "salary", label: "Salary fit", max, points: half(max), reason: `Hasta ${offered.toLocaleString("es-ES")}: menos de un 10 % por debajo del mínimo.` };
  return { key: "salary", label: "Salary fit", max, points: 0, reason: `Hasta ${offered.toLocaleString("es-ES")} < mínimo ${min.toLocaleString("es-ES")}.` };
}

function locationFit(o: OppSnap, ctx: ScoreContext): ScoreFactor {
  const max = 10;
  const prefs = ctx.goal.preferredWorkplaces;
  const loc = (o.location ?? "").toLowerCase();
  const locHit = ctx.goal.preferredLocations.find((l) => l && loc.includes(l.toLowerCase()));
  if (!o.workplace && !o.location) return { key: "location", label: "Location fit", max, points: half(max), reason: "Sin modalidad ni ubicación." };
  if (!prefs.length && !ctx.goal.preferredLocations.length) return { key: "location", label: "Location fit", max, points: half(max), reason: "Sin preferencias de ubicación en los ajustes." };
  if (o.workplace && prefs.includes(o.workplace)) {
    return { key: "location", label: "Location fit", max, points: max, reason: `${WORKPLACE_LABEL[o.workplace]} está entre tus preferencias.` };
  }
  if (locHit) return { key: "location", label: "Location fit", max, points: Math.round(max * 0.7), reason: `Ubicación preferida (${locHit}).` };
  return { key: "location", label: "Location fit", max, points: Math.round(max * 0.2), reason: `${o.workplace ? WORKPLACE_LABEL[o.workplace] : "Modalidad desconocida"}${o.location ? ` · ${o.location}` : ""}: fuera de tus preferencias.` };
}

function companyInterest(o: OppSnap): ScoreFactor {
  const max = 10;
  if (o.companyInterest !== null) return { key: "company", label: "Company interest", max, points: fromFive(o.companyInterest, max), reason: `Interés ${o.companyInterest}/5${o.companyTier ? ` · Tier ${o.companyTier.toUpperCase()}` : ""}.` };
  if (o.companyTier) {
    const points = { a: max, b: Math.round(max * 0.6), c: Math.round(max * 0.3) }[o.companyTier];
    return { key: "company", label: "Company interest", max, points, reason: `Empresa Tier ${o.companyTier.toUpperCase()}.` };
  }
  return { key: "company", label: "Company interest", max, points: half(max), reason: "Empresa sin tier ni interés asignado." };
}

function referral(o: OppSnap): ScoreFactor {
  const max = 10;
  if (o.referral === "received" || o.source === "referral") return { key: "referral", label: "Referral", max, points: max, reason: "Referral recibido." };
  if (o.referral === "requested") return { key: "referral", label: "Referral", max, points: half(max), reason: "Referral solicitado, pendiente." };
  return { key: "referral", label: "Referral", max, points: 0, reason: "Sin referral." };
}

function recruiter(o: OppSnap): ScoreFactor {
  const max = 5;
  if (o.hasRecruiter || o.source === "recruiter") return { key: "recruiter", label: "Recruiter connection", max, points: max, reason: "Hay un recruiter o hiring manager vinculado." };
  return { key: "recruiter", label: "Recruiter connection", max, points: 0, reason: "Sin recruiter vinculado." };
}

function freshness(o: OppSnap, ctx: ScoreContext): ScoreFactor {
  const max = 5;
  if (!o.postedAt) return { key: "freshness", label: "Fecha de publicación", max, points: 2, reason: "Fecha de publicación desconocida." };
  const age = diffDays(o.postedAt, ctx.today);
  const points = age <= 7 ? max : age <= 14 ? 3 : age <= 30 ? 1 : 0;
  return { key: "freshness", label: "Fecha de publicación", max, points, reason: `Publicada hace ${Math.max(age, 0)} días.` };
}

function history(o: OppSnap, ctx: ScoreContext): ScoreFactor {
  const max = 5;
  const row = ctx.sourceRow;
  if (!row || row.applications < MIN_SAMPLE || row.conversion.rate === null || ctx.overallInterviewRate === null) {
    return { key: "history", label: "Resultados históricos", max, points: 3, reason: "Insufficient data: menos de 5 candidaturas por esta fuente." };
  }
  const r = row.conversion.rate;
  const overall = ctx.overallInterviewRate;
  const points = r >= overall ? max : r >= overall / 2 ? 3 : 1;
  return {
    key: "history",
    label: "Resultados históricos",
    max,
    points,
    reason: `${row.label}: ${row.interviews}/${row.applications} candidaturas con entrevista (${Math.round(r * 100)} % vs ${Math.round(overall * 100)} % global).`,
  };
}

export function computeScore(o: OppSnap, ctx: ScoreContext): Score {
  const factors = [
    roleFit(o, ctx),
    skillMatch(o, ctx),
    seniorityFit(o, ctx),
    salaryFit(o, ctx),
    locationFit(o, ctx),
    companyInterest(o),
    referral(o),
    recruiter(o),
    freshness(o, ctx),
    history(o, ctx),
  ];
  const computed = Math.max(0, Math.min(100, factors.reduce((a, f) => a + f.points, 0)));
  const overridden = o.scoreOverride !== null;
  return { score: overridden ? o.scoreOverride! : computed, computed, overridden, overrideReason: o.scoreOverrideReason, factors };
}
