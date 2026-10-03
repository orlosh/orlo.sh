import type { JobExtraction } from "@/lib/ai/schemas";
import type { VerifiedMatch } from "@/lib/ai/features";
import { AiMark } from "./ai";
import { Badge } from "./ui";

/** Presentación de lo que ya devolvió Gemini y está guardado (sin llamadas nuevas). */

type Source = { uri: string; title: string | null };

export function Sources({ sources }: { sources?: Source[] }) {
  if (!sources?.length) return null;
  return (
    <details className="text-xs text-slate-600">
      <summary className="cursor-pointer hover:text-carbon">Fuentes de Google Search ({sources.length})</summary>
      <ul className="mt-1 space-y-0.5">
        {sources.slice(0, 12).map((s) => (
          <li key={s.uri} className="truncate">
            <a href={s.uri} target="_blank" rel="noopener noreferrer nofollow" className="link">
              {s.title ?? s.uri}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

const meta = (model?: string, at?: string) => [model, at ? new Date(at).toISOString().slice(0, 10) : null].filter(Boolean).join(" · ");

const GHOST: Record<string, string> = { low: "Riesgo bajo de oferta fantasma", medium: "Riesgo medio de oferta fantasma", high: "Riesgo alto de oferta fantasma" };

export function AiAnalysisCard({ analysis }: { analysis: (JobExtraction & { sources?: Source[]; model?: string; at?: string }) | null }) {
  if (!analysis) return null;
  const a = analysis;
  return (
    <div className="panel space-y-3 p-4">
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <AiMark /> Análisis de la oferta · {meta(a.model, a.at)}
      </p>
      <p className="text-sm text-slate-800">{a.summary}</p>
      <div className="flex flex-wrap gap-1.5">
        {a.ghostRisk ? (
          <Badge tone={a.ghostRisk === "high" ? "dark" : "default"} title={a.ghostRiskReason}>
            {GHOST[a.ghostRisk]}
          </Badge>
        ) : null}
        {a.seniority ? <Badge tone="muted">Nivel: {a.seniority}</Badge> : null}
        {a.language ? <Badge tone="muted">Idioma: {a.language}</Badge> : null}
        {a.visaSponsorship === "yes" ? <Badge tone="muted">Patrocina visado</Badge> : null}
      </div>
      {a.ghostRiskReason && a.ghostRisk !== "low" ? <p className="text-xs text-slate-600">{a.ghostRiskReason}</p> : null}
      {a.salaryIsEstimate && (a.salaryMin || a.salaryMax) ? (
        <p className="text-xs text-slate-600">
          Salario estimado (no publicado): {[a.salaryMin, a.salaryMax].filter(Boolean).map((n) => n!.toLocaleString("es-ES")).join(" – ")} {a.salaryCurrency ?? ""}
          {a.salaryNote ? ` · ${a.salaryNote}` : ""}
        </p>
      ) : null}
      {a.redFlags?.length ? (
        <div>
          <p className="text-xs font-medium text-carbon">Señales de alerta</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-700">
            {a.redFlags.map((f) => (
              <li key={f.flag}>
                {f.flag}: {f.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {a.techStack?.length ? <p className="text-xs text-slate-600">Tecnologías: {a.techStack.join(", ")}</p> : null}
      {a.benefits?.length ? <p className="text-xs text-slate-600">Beneficios: {a.benefits.join(" · ")}</p> : null}
      {a.applyTips?.length ? (
        <div>
          <p className="text-xs font-medium text-carbon">Consejos para esta candidatura</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-700">
            {a.applyTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Sources sources={a.sources} />
    </div>
  );
}

const RECOMMENDATION: Record<string, string> = {
  apply: "Aplica",
  apply_with_referral: "Aplica, mejor con recomendación",
  improve_first: "Prepara antes los puntos débiles",
  skip: "No compensa",
};
const SEVERITY: Record<string, string> = { low: "leve", medium: "media", high: "importante" };

export function AiMatchCard({ match, company }: { match: VerifiedMatch | null; company?: string | null }) {
  if (!match) return null;
  const verified = match.strengths.filter((s) => s.verified).length;
  return (
    <div className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <AiMark /> Encaje con tu CV{match.cvName ? ` («${match.cvName}»)` : ""} · {meta(match.model, match.at)}
          </p>
          <p className="mt-1 text-sm text-slate-800">{match.verdict}</p>
          <p className="mt-1 text-sm font-medium text-carbon">{RECOMMENDATION[match.recommendation] ?? match.recommendation}</p>
        </div>
        <p className="text-right">
          <span className="block font-mono text-3xl text-carbon">{match.score}%</span>
          {match.strengths.length ? (
            <span className="block text-[0.7rem] text-slate-500">
              {verified}/{match.strengths.length} citas verificadas
            </span>
          ) : null}
        </p>
      </div>

      {match.strengths.length ? (
        <div>
          <p className="text-xs font-medium text-carbon">Puntos fuertes</p>
          <ul className="mt-1 space-y-1.5">
            {match.strengths.map((s) => (
              <li key={s.point} className={`text-sm ${s.verified ? "text-slate-800" : "text-slate-500"}`}>
                <span aria-hidden="true">{s.verified ? "✓ " : "? "}</span>
                {s.point}
                <span className="block text-xs text-slate-500">
                  {s.verified ? `«${s.evidence}»` : "La cita no aparece en tu CV: no lo uses sin comprobarlo."}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {match.gaps?.length ? (
        <div>
          <p className="text-xs font-medium text-carbon">Carencias</p>
          <ul className="mt-1 space-y-1.5">
            {match.gaps.map((g) => (
              <li key={g.point} className="text-sm text-slate-800">
                {g.point} <span className="text-xs text-slate-500">({SEVERITY[g.severity] ?? g.severity})</span>
                {g.mitigation ? <span className="block text-xs text-slate-600">{g.mitigation}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {match.missingKeywords?.length ? <p className="text-xs text-slate-600">Palabras clave que tu CV no menciona: {match.missingKeywords.join(", ")}</p> : null}
      {match.talkingPoints?.length ? (
        <div>
          <p className="text-xs font-medium text-carbon">Argumentos para la candidatura</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-700">
            {match.talkingPoints.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {match.whoToContact?.length && company ? (
        <div>
          <p className="text-xs font-medium text-carbon">A quién buscar en {company}</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {match.whoToContact.map((role) => (
              <li key={role}>
                {/* Búsqueda en LinkedIn construida aquí: la IA sugiere cargos, nunca nombres. */}
                <a
                  href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${company} ${role}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200"
                >
                  {role} ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

type Research = {
  summary: string;
  product?: string;
  industry?: string;
  size?: string;
  stage?: string;
  funding?: string;
  hq?: string;
  techStack?: string[];
  recentNews?: { title: string; date: string; summary?: string }[];
  hiringSignals?: string[];
  risks?: string[];
  culture?: string[];
  interviewProcess?: string[];
  sources?: Source[];
  model?: string;
  at?: string;
};

export function CompanyResearchCard({ research }: { research: Research | null }) {
  if (!research) return null;
  const r = research;
  const facts = [
    ["Producto", r.product],
    ["Sector", r.industry],
    ["Tamaño", r.size],
    ["Fase", r.stage],
    ["Financiación", r.funding],
    ["Sede", r.hq],
  ].filter(([, v]) => v);
  const lists: [string, string[] | undefined][] = [
    ["Señales de contratación", r.hiringSignals],
    ["Riesgos", r.risks],
    ["Cultura", r.culture],
    ["Proceso de selección", r.interviewProcess],
  ];
  return (
    <div className="panel space-y-3 p-4">
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <AiMark /> Investigación · {meta(r.model, r.at)}
      </p>
      <p className="text-sm text-slate-800">{r.summary}</p>
      {facts.length ? (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="text-slate-800">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {r.techStack?.length ? <p className="text-xs text-slate-600">Tecnologías: {r.techStack.join(", ")}</p> : null}
      {r.recentNews?.length ? (
        <div>
          <p className="text-xs font-medium text-carbon">Noticias recientes</p>
          <ul className="mt-1 space-y-1 text-xs text-slate-700">
            {r.recentNews.map((n) => (
              <li key={n.title}>
                <span className="font-mono text-slate-500">{n.date}</span> {n.title}
                {n.summary ? <span className="block text-slate-600">{n.summary}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {lists.map(([label, items]) =>
        items?.length ? (
          <div key={label}>
            <p className="text-xs font-medium text-carbon">{label}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-slate-700">
              {items.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
      <Sources sources={r.sources} />
    </div>
  );
}
