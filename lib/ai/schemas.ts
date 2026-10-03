import { SENIORITIES } from "@/lib/job-search/enums";
import { type Infer, S } from "./schema";

/** Esquemas de las respuestas de Gemini: lo que se pide y lo que se acepta. */

const str = S.str;
const list = (max: number, d?: string) => S.arr(S.str(), max, d);

export const jobExtraction = S.obj(
  {
    title: str("Título del puesto tal como aparece en la oferta"),
    summary: str("Resumen de 3-4 frases en castellano: qué se hace, para quién y qué piden"),
  },
  {
    company: str("Nombre de la empresa que contrata (no la del portal de empleo)"),
    companyWebsite: str("Web oficial de la empresa, https"),
    location: str(),
    workplace: S.enum(["remote", "hybrid", "onsite"]),
    employmentType: str("Jornada o tipo de contrato"),
    seniority: S.enum(SENIORITIES),
    salaryMin: S.int(0, 10_000_000, "Mínimo anual si la oferta lo publica"),
    salaryMax: S.int(0, 10_000_000, "Máximo anual si la oferta lo publica"),
    salaryCurrency: str("Código ISO de 3 letras"),
    salaryIsEstimate: S.bool("true si el salario NO aparece en la oferta y es una estimación de fuentes públicas"),
    salaryNote: str("Detalle o fuente del salario"),
    postedAt: str("Fecha de publicación YYYY-MM-DD, solo si consta"),
    deadline: str("Fecha límite YYYY-MM-DD, solo si consta"),
    language: str("Idioma de trabajo requerido"),
    description: str("Texto completo de la oferta, limpio, sin inventar ni resumir"),
    responsibilities: list(20),
    requirements: list(25),
    niceToHave: list(20),
    techStack: list(30),
    benefits: list(15),
    visaSponsorship: S.enum(["yes", "no", "unknown"]),
    companyInfo: S.obj({}, { industry: str(), size: str(), stage: str(), hq: str(), about: str() }),
    redFlags: S.arr(S.obj({ flag: str(), reason: str() }), 10, "Señales de alerta concretas (oferta antigua o repetida, requisitos contradictorios, salario irreal…)"),
    ghostRisk: S.enum(["low", "medium", "high"], "Riesgo de que sea una oferta fantasma (sin intención real de contratar)"),
    ghostRiskReason: str(),
    applyTips: list(5, "Consejos concretos para esta candidatura"),
  },
);
export type JobExtraction = Infer<typeof jobExtraction>;

const evidence = S.obj({ point: str(), evidence: str("Cita LITERAL copiada del CV que lo respalda") });

export const fitMatch = S.obj(
  {
    score: S.int(0, 100, "Encaje 0-100 con criterio exigente"),
    verdict: str("Una frase con la conclusión"),
    recommendation: S.enum(["apply", "apply_with_referral", "improve_first", "skip"]),
  },
  {
    strengths: S.arr(evidence, 8),
    gaps: S.arr(S.obj({ point: str(), severity: S.enum(["low", "medium", "high"]), mitigation: str("Cómo cubrirlo con honestidad") }), 8),
    missingKeywords: list(15, "Palabras clave de la oferta que el CV no menciona"),
    whoToContact: list(5, "Cargos (no nombres) a los que escribir en la empresa"),
    talkingPoints: list(5, "Argumentos para la candidatura, basados en el CV"),
  },
);
export type FitMatch = Infer<typeof fitMatch>;

export const coverLetter = S.obj(
  { letter: str("Carta completa, lista para enviar, sin marcadores por rellenar") },
  {
    subject: str(),
    claims: S.arr(S.obj({ claim: str("Afirmación sobre el candidato que hace la carta"), evidence: str("Cita LITERAL del CV que la respalda") }), 15),
  },
);

export const companyResearch = S.obj(
  { summary: str("Qué hace la empresa, en 3-5 frases") },
  {
    product: str(),
    industry: str(),
    size: str(),
    stage: str("Fase o tipo: startup, scale-up, cotizada…"),
    funding: str(),
    hq: str(),
    techStack: list(20),
    recentNews: S.arr(S.obj({ title: str(), date: str() }, { summary: str() }), 6),
    hiringSignals: list(6, "Señales de que están contratando o creciendo, con fecha"),
    risks: list(6, "Despidos, problemas financieros, polémicas…"),
    culture: list(6),
    interviewProcess: list(6, "Lo que se sabe públicamente de su proceso de selección"),
  },
);

export const interviewPrep = S.obj(
  {},
  {
    company: str("Lo esencial de la empresa para esta entrevista"),
    role: str("Qué buscan en el puesto y cómo se evaluará"),
    interviewer: str("Solo información pública verificable sobre la persona; si no hay, qué tipo de perfil suele hacer esta ronda"),
    questions: S.arr(S.obj({ question: str(), why: str() }), 12),
    answers: S.arr(S.obj({ question: str(), outline: str("Esquema de respuesta usando SOLO hechos del CV o de las historias STAR") }, { basedOn: str("Historia STAR o línea del CV usada") }), 8),
    questionsToAsk: list(8),
    checklist: list(8),
  },
);

export const message = S.obj({ body: str() }, { subject: str() });

export const radarSearch = S.obj({
  jobs: S.arr(
    S.obj(
      { title: str(), url: str("URL directa de la oferta (página de empleo de la empresa, ATS o portal)") },
      { company: str(), location: str(), postedAt: str("YYYY-MM-DD"), snippet: str() },
    ),
    25,
  ),
});

export const coach = S.obj(
  { summary: str("Diagnóstico de la semana en 3-4 frases, basado solo en los datos") },
  { working: list(5), change: list(5), focus: list(5, "Prioridades concretas para la próxima semana") },
);

export const answerFeedback = S.obj(
  { score: S.int(0, 10), feedback: str() },
  { strengths: list(5), improve: list(5), improvedOutline: str("Versión mejorada usando SOLO los hechos de la respuesta original") },
);
