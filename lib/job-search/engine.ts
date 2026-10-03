import { conversions, factsFor, type OppFacts, sourcePerformance, type SourceRow } from "./analytics";
import { analyzeJobDescription, type CandidateProfile, compareProfile, type JobAnalysis, type ProfileMatch } from "./jd";
import type { OppSnap, Snapshot } from "./model";
import { computeScore, type Score } from "./score";

/**
 * Une la instantánea con el perfil: análisis de cada Job Description, score de cada oportunidad
 * y métricas por fuente. Puro y en memoria: el volumen de una búsqueda (decenas o pocos cientos de
 * oportunidades) no justifica precalcular nada en la base de datos.
 */
export type Engine = {
  facts: OppFacts[];
  sources: SourceRow[];
  overallInterviewRate: number | null;
  scores: Map<string, Score>;
  analyses: Map<string, { analysis: JobAnalysis; match: ProfileMatch } | null>;
};

export function analyzeOpportunity(o: Pick<OppSnap, "description" | "title">, profile: CandidateProfile, today: string) {
  const analysis = o.description ? analyzeJobDescription(o.description, { title: o.title, extraSkills: profile.skills }) : null;
  return analysis ? { analysis, match: compareProfile(analysis, profile, today) } : null;
}

export function runEngine(s: Snapshot, profile: CandidateProfile): Engine {
  const facts = factsFor(s);
  const sources = sourcePerformance(facts);
  const overallInterviewRate = conversions(facts).find((c) => c.key === "app_interview")?.rate ?? null;
  const scores = new Map<string, Score>();
  const analyses: Engine["analyses"] = new Map();
  for (const o of s.opportunities) {
    const a = analyzeOpportunity(o, profile, s.today);
    analyses.set(o.id, a);
    scores.set(
      o.id,
      computeScore(o, {
        goal: s.goal,
        today: s.today,
        analysis: a?.analysis ?? null,
        match: a?.match ?? null,
        sourceRow: sources.find((r) => r.source === o.source) ?? null,
        overallInterviewRate,
      }),
    );
  }
  return { facts, sources, overallInterviewRate, scores, analyses };
}

export const scoreValues = (e: Engine) => new Map([...e.scores].map(([id, sc]) => [id, sc.score]));
