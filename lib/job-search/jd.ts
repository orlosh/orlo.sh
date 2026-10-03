import type { Seniority, Workplace } from "./enums";

/**
 * Análisis de Job Descriptions y matching contra el perfil. Determinista y local: no hay ningún
 * modelo externo ni se envía el texto a ningún servicio. Todo lo que se muestra como "coincide"
 * procede literalmente del perfil guardado (stack, experiencia, proyectos, CV); lo que no aparece
 * se marca como gap, nunca se rellena.
 */

/* -------------------------------------------------------------- léxico */

type SkillCategory = "language" | "framework" | "tool" | "cloud" | "data" | "practice" | "soft";
type LexiconEntry = { name: string; category: SkillCategory; aliases?: string[]; pattern?: RegExp };

const L = (category: SkillCategory, names: (string | [string, ...string[]])[]): LexiconEntry[] =>
  names.map((n) => (Array.isArray(n) ? { name: n[0], aliases: n.slice(1), category } : { name: n, category }));

/** Términos habituales en ofertas técnicas. El stack del perfil se añade siempre por encima. */
const BUILTIN: LexiconEntry[] = [
  ...L("language", [
    ["JavaScript", "JS", "ECMAScript"],
    ["TypeScript", "TS"],
    "Python",
    "Java",
    "Kotlin",
    "Scala",
    "Ruby",
    "PHP",
    ["C#", "csharp"],
    "C++",
    "Rust",
    "Swift",
    "Elixir",
    "Haskell",
    "Clojure",
    "Dart",
    "SQL",
    "Bash",
    "HTML",
    "CSS",
    "GraphQL",
    "Solidity",
  ]),
  { name: "Go", category: "language", pattern: /\b[Gg]olang\b|(?<![\p{L}\p{N}])Go(?![\p{L}\p{N}-])(?!\s+(?:to|beyond|live)\b)/u },
  ...L("framework", [
    "React",
    "React Native",
    ["Next.js", "NextJS"],
    "Vue",
    ["Nuxt", "Nuxt.js"],
    "Angular",
    "Svelte",
    "SvelteKit",
    "Remix",
    "Astro",
    ["Node.js", "NodeJS", "Node"],
    "Express",
    "NestJS",
    "Fastify",
    "Deno",
    "Bun",
    "Django",
    "Flask",
    "FastAPI",
    "Rails",
    "Laravel",
    "Symfony",
    "Spring",
    "Spring Boot",
    [".NET", "dotnet"],
    "Tailwind",
    "Redux",
    "Flutter",
    "Phoenix",
    "tRPC",
    "Prisma",
    "Drizzle",
    "Hibernate",
    "jQuery",
  ]),
  ...L("cloud", [
    ["AWS", "Amazon Web Services"],
    ["GCP", "Google Cloud"],
    "Azure",
    "Vercel",
    "Netlify",
    "Cloudflare",
    "Heroku",
    "Fly.io",
    "Lambda",
    "S3",
    "EC2",
    "ECS",
    "EKS",
    "Neon",
    "Supabase",
    "Firebase",
  ]),
  ...L("data", [
    ["PostgreSQL", "Postgres"],
    "MySQL",
    "MariaDB",
    "SQLite",
    "MongoDB",
    "Redis",
    "Elasticsearch",
    "OpenSearch",
    "DynamoDB",
    "Cassandra",
    "Kafka",
    "RabbitMQ",
    "Snowflake",
    "BigQuery",
    "dbt",
    "Spark",
    "Airflow",
    "Pandas",
    "ClickHouse",
    "Machine Learning",
    "LLM",
    "PyTorch",
    "TensorFlow",
  ]),
  ...L("tool", [
    "Docker",
    ["Kubernetes", "k8s"],
    "Helm",
    "Terraform",
    "Pulumi",
    "Ansible",
    "Git",
    "GitHub",
    "GitHub Actions",
    "GitLab",
    "Jenkins",
    "CircleCI",
    ["CI/CD", "CI / CD", "continuous integration", "continuous delivery"],
    "Linux",
    "Nginx",
    "Caddy",
    "Grafana",
    "Prometheus",
    "Datadog",
    "Sentry",
    "OpenTelemetry",
    "Jest",
    "Vitest",
    "Playwright",
    "Cypress",
    "Storybook",
    "Webpack",
    "Vite",
    "Figma",
    "Jira",
    "Linear",
    "Notion",
    "Postman",
    "OAuth",
    "JWT",
    "REST",
    "gRPC",
    "WebSockets",
  ]),
  // Solo prácticas concretas: palabras genéricas ("performance", "ownership") irían a keywords,
  // no a habilidades, porque convertirlas en gaps sería ruido.
  ...L("practice", [
    "Microservices",
    ["Distributed systems", "distributed system"],
    ["System design", "systems design"],
    "Event-driven",
    "Serverless",
    "DevOps",
    "SRE",
    "Observability",
    "Accessibility",
    ["TDD", "test-driven"],
    "DDD",
    "Agile",
    "Scrum",
    ["Code review", "code reviews"],
    "API design",
    "Infrastructure as code",
    "SEO",
    "Design systems",
    "Mentoring",
  ]),
  ...L("soft", [["Stakeholder management", "stakeholders"], "English", ["Spanish", "español", "castellano"]]),
];

const TOOL_CATEGORIES: SkillCategory[] = ["tool", "cloud", "data"];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

function termPattern(term: string): RegExp {
  // Sin letra, número ni punto delante: "JS" no debe casar dentro de "Node.js".
  return new RegExp(`(?<![\\p{L}\\p{N}.])${escape(term)}(?![\\p{L}\\p{N}+#])`, "iu");
}

type CompiledTerm = { key: string; name: string; category: SkillCategory; patterns: RegExp[] };

export const skillKey = (s: string) => s.trim().toLowerCase();

function compileLexicon(extra: string[]): CompiledTerm[] {
  const byKey = new Map<string, CompiledTerm>();
  for (const e of BUILTIN) {
    byKey.set(skillKey(e.name), {
      key: skillKey(e.name),
      name: e.name,
      category: e.category,
      patterns: e.pattern ? [e.pattern] : [e.name, ...(e.aliases ?? [])].map(termPattern),
    });
  }
  // Habilidades del perfil que el léxico no conoce: se detectan igual en la JD.
  for (const raw of extra) {
    const name = raw.trim();
    if (name.length < 2 || byKey.has(skillKey(name))) continue;
    byKey.set(skillKey(name), { key: skillKey(name), name, category: "tool", patterns: [termPattern(name)] });
  }
  return [...byKey.values()];
}

function findTerms(text: string, lexicon: CompiledTerm[]): CompiledTerm[] {
  return lexicon.filter((t) => t.patterns.some((p) => p.test(text)));
}

function countTerm(text: string, term: CompiledTerm): number {
  let n = 0;
  for (const p of term.patterns) {
    const g = new RegExp(p.source, p.flags.includes("g") ? p.flags : `${p.flags}g`);
    n += text.match(g)?.length ?? 0;
  }
  return n;
}

/* ------------------------------------------------------------ secciones */

type Section = "responsibilities" | "required" | "preferred" | "other";

const HEADINGS: [Section, RegExp][] = [
  ["preferred", /nice[\s-]to[\s-]have|preferred|bonus|extra points|would be (great|a plus)|deseable|valorable|se valorar[áa]|plus\b/i],
  [
    "responsibilities",
    /responsibilit|what you('ll| will) do|your (role|mission|impact)|in this role|day[\s-]to[\s-]day|the role|funciones|responsabilidades|qu[ée] har[áa]s|tu d[íi]a a d[íi]a|misi[óo]n/i,
  ],
  [
    "required",
    /requirement|required|must[\s-]have|qualifications|what you('ll)? need|what we('re| are) looking for|who you are|you (have|bring|are)|about you|requisitos|imprescindible|buscamos|tu perfil|perfil|experience/i,
  ],
  ["other", /benefits|perks|what we offer|about us|who we are|ofrecemos|beneficios|qui[ée]nes somos|compensation|salary|the company/i],
];

const BULLET = /^\s*(?:[-*•·▪◦‣–]|\d+[.)])\s+/;

function isHeading(line: string): boolean {
  const l = line.trim();
  if (!l || l.length > 70) return false;
  if (/^#{1,6}\s/.test(l)) return true;
  if (BULLET.test(l)) return false;
  return /:$/.test(l) || (l.split(/\s+/).length <= 6 && !/[.;,]$/.test(l));
}

function classifyHeading(line: string): Section | null {
  for (const [section, re] of HEADINGS) if (re.test(line)) return section;
  return null;
}

type Line = { text: string; section: Section; bullet: boolean };

function splitLines(text: string): Line[] {
  const out: Line[] = [];
  let section: Section = "other";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (isHeading(line)) {
      const s = classifyHeading(line);
      if (s) {
        section = s;
        // Un título con contenido tras los dos puntos ("Requisitos: React, Node") también cuenta.
        const rest = line.split(":").slice(1).join(":").trim();
        if (rest) out.push({ text: rest, section, bullet: false });
        continue;
      }
    }
    out.push({ text: line.replace(BULLET, ""), section, bullet: BULLET.test(line) });
  }
  return out;
}

/* -------------------------------------------------------------- campos */

const SENIORITY_PATTERNS: [Seniority, RegExp][] = [
  ["intern", /\b(intern(ship)?|trainee|becari[oa]|pr[áa]cticas)\b/i],
  ["director", /\b(director|head of|vp of|vice president)\b/i],
  ["manager", /\b(engineering manager|manager)\b/i],
  ["principal", /\bprincipal\b/i],
  ["staff", /\bstaff\s+(\w+\s+)?(engineer|developer|designer)\b/i],
  ["lead", /\b(tech(nical)? lead|team lead|lead\s+(\w+\s+)?(engineer|developer)|l[íi]der t[ée]cnico)\b/i],
  ["senior", /\b(senior|sr\.?)\b/i],
  ["mid", /\b(mid[\s-]?level|mid|intermediate|semi[\s-]?senior|ssr)\b/i],
  ["junior", /\b(junior|jr\.?|entry[\s-]level|graduate)\b/i],
];

function detectSeniority(title: string, body: string, minYears: number | null) {
  for (const source of [title, body]) {
    for (const [s, re] of SENIORITY_PATTERNS) if (re.test(source)) return { value: s, inferred: false };
  }
  if (minYears !== null) {
    const value: Seniority = minYears >= 8 ? "staff" : minYears >= 5 ? "senior" : minYears >= 2 ? "mid" : "junior";
    return { value, inferred: true };
  }
  return null;
}

const YEARS = /(\d{1,2})\s*\+?\s*(?:(?:-|–|to|a)\s*(\d{1,2})\s*\+?\s*)?(?:years?|yrs?|años)/gi;

function detectExperience(text: string) {
  const mentions: string[] = [];
  let min: number | null = null;
  for (const m of text.matchAll(YEARS)) {
    const n = Number(m[1]);
    if (n > 30) continue;
    min = min === null ? n : Math.max(min, n);
    // Frase corta alrededor de la cifra, para mostrar de dónde sale.
    const start = Math.max(0, (m.index ?? 0) - 30);
    mentions.push(text.slice(start, (m.index ?? 0) + m[0].length + 40).replace(/\s+/g, " ").trim());
  }
  return { minYears: min, mentions: mentions.slice(0, 4) };
}

const CURRENCY: Record<string, string> = { "€": "EUR", eur: "EUR", euros: "EUR", "$": "USD", usd: "USD", "£": "GBP", gbp: "GBP" };

function parseAmount(raw: string, k?: string): number | null {
  const digits = raw.replace(/[.,\s](?=\d{3}\b)/g, "").replace(/[.,]\d{1,2}$/, "");
  const n = Number(digits.replace(/[^\d]/g, ""));
  if (!Number.isFinite(n) || n === 0) return null;
  return k || n < 1000 ? n * 1000 : n;
}

function detectSalary(text: string) {
  const num = String.raw`(\d{2,3}(?:[.,\s]\d{3})*)\s?(k|K|mil)?`;
  const sym = String.raw`(€|\$|£)`;
  const code = String.raw`(€|eur|euros|usd|\$|gbp|£)`;
  const range = String.raw`\s?(?:-|–|—|to|a|hasta)\s?`;
  const patterns = [
    new RegExp(`${sym}\\s?${num}${range}${sym}?\\s?${num}`, "i"),
    new RegExp(`${num}${range}${num}\\s?${code}`, "i"),
  ];
  let m = patterns[0].exec(text);
  if (m) {
    const min = parseAmount(m[2], m[3]);
    const max = parseAmount(m[5], m[6] ?? m[3]);
    return { min, max, currency: CURRENCY[m[1].toLowerCase()] ?? null, raw: m[0].trim() };
  }
  m = patterns[1].exec(text);
  if (m) {
    const min = parseAmount(m[1], m[2] ?? m[4]);
    const max = parseAmount(m[3], m[4]);
    return { min, max, currency: CURRENCY[m[5].toLowerCase()] ?? null, raw: m[0].trim() };
  }
  return null;
}

function detectWorkplace(text: string): Workplace | null {
  const hybrid = /\b(hybrid|h[íi]brido)\b/i.test(text);
  const remote = /\b(fully remote|remote|remoto|teletrabajo|work from home|wfh|anywhere)\b/i.test(text);
  const onsite = /\b(on-?site|in[\s-]office|presencial|in the office)\b/i.test(text);
  if (hybrid) return "hybrid";
  if (remote && !onsite) return "remote";
  if (onsite) return "onsite";
  return null;
}

function detectLocation(lines: Line[]): string | null {
  for (const l of lines) {
    const m = /^(?:location|ubicaci[óo]n|based in|localizaci[óo]n|office)\s*[:\-–]\s*(.{2,80})$/i.exec(l.text);
    if (m) return m[1].trim();
  }
  return null;
}

/* ------------------------------------------------------------ keywords */

const STOPWORDS = new Set(
  (
    "the and for with you your our are will that this from have has who what when where how all any can into about " +
    "their they them its work team teams role new more able also must should would like well across within using use " +
    "experience years year strong good great plus other etc job company help build including such we're you'll " +
    "los las del por para con una unos unas que como más sus son está estar ser tener nuestro nuestra equipo trabajo " +
    "empresa años experiencia buscamos puesto será muy también desde entre sobre cada otros otras"
  ).split(/\s+/),
);

function topKeywords(text: string, exclude: Set<string>, limit = 15): string[] {
  const counts = new Map<string, number>();
  const words = text.toLowerCase().match(/[\p{L}][\p{L}\p{N}+#.-]{2,}/gu) ?? [];
  const clean = words.map((w) => w.replace(/[.-]+$/, "")).filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  for (let i = 0; i < clean.length; i++) {
    const w = clean[i];
    if (!exclude.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
    const bigram = i + 1 < clean.length ? `${w} ${clean[i + 1]}` : null;
    if (bigram && !exclude.has(bigram)) counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }
  return [...counts]
    .filter(([k, n]) => n >= 2 || !k.includes(" "))
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .filter(([, n]) => n >= 2)
    .slice(0, limit)
    .map(([k]) => k);
}

/* ------------------------------------------------------------- análisis */

export type JobAnalysis = {
  role: string | null;
  seniority: { value: Seniority; inferred: boolean } | null;
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  tools: string[];
  keywords: string[];
  experience: { minYears: number | null; mentions: string[] };
  salary: { min: number | null; max: number | null; currency: string | null; raw: string } | null;
  workplace: Workplace | null;
  location: string | null;
  /** True cuando la JD no tiene secciones reconocibles y todo se trata como requisito. */
  unstructured: boolean;
  /** Frecuencia de cada habilidad detectada (clave en minúsculas). */
  skillCounts: Record<string, number>;
};

export function analyzeJobDescription(
  text: string,
  { title, extraSkills = [] }: { title?: string | null; extraSkills?: string[] } = {},
): JobAnalysis | null {
  const body = text.trim();
  if (body.length < 40) return null;
  const lexicon = compileLexicon(extraSkills);
  const lines = splitLines(body);
  const structured = lines.some((l) => l.section !== "other");

  const required = new Map<string, string>();
  const preferred = new Map<string, string>();
  const skillCounts: Record<string, number> = {};
  for (const line of lines) {
    const lineIsPreferred = line.section === "preferred" || /nice[\s-]to[\s-]have|bonus|ideally|preferred|deseable|valorable|se valorar/i.test(line.text);
    for (const term of findTerms(line.text, lexicon)) {
      skillCounts[term.key] = (skillCounts[term.key] ?? 0) + countTerm(line.text, term);
      if (lineIsPreferred) {
        if (!required.has(term.key)) preferred.set(term.key, term.name);
      } else {
        // Una habilidad citada en responsabilidades o en el cuerpo general también se exige en la práctica.
        required.set(term.key, term.name);
        preferred.delete(term.key);
      }
    }
  }

  const all = [...required.values(), ...preferred.values()];
  const tools = lexicon.filter((t) => TOOL_CATEGORIES.includes(t.category) && (required.has(t.key) || preferred.has(t.key))).map((t) => t.name);
  const roleLine = title?.trim() || lines.find((l) => !l.bullet && l.text.length <= 100)?.text || null;
  const experience = detectExperience(body);
  const exclude = new Set(all.map(skillKey));
  const sortBy = (m: Map<string, string>) => [...m].sort((a, b) => (skillCounts[b[0]] ?? 0) - (skillCounts[a[0]] ?? 0)).map(([, n]) => n);

  return {
    role: roleLine,
    seniority: detectSeniority(roleLine ?? "", body, experience.minYears),
    responsibilities: lines
      .filter((l) => l.section === "responsibilities" && l.text.length > 12)
      .map((l) => l.text)
      .slice(0, 12),
    requiredSkills: sortBy(required),
    preferredSkills: sortBy(preferred),
    tools,
    keywords: [...sortBy(new Map([...required, ...preferred])).slice(0, 10), ...topKeywords(body, exclude, 12)],
    experience,
    salary: detectSalary(body),
    workplace: detectWorkplace(body),
    location: detectLocation(lines),
    unstructured: !structured,
    skillCounts,
  };
}

/* ------------------------------------------------------------- perfil */

export type CandidateProfile = {
  /** Stack del portfolio + habilidades extra declaradas en los ajustes. */
  skills: string[];
  /** `technologies`: las vinculadas a esa experiencia; cuentan como evidencia, no como bullets. */
  experiences: { label: string; startDate: string; endDate: string | null; lines: string[]; technologies?: string[] }[];
  projects: { title: string; summary: string; technologies: string[] }[];
  targetSeniority: Seniority | null;
  targetRoles: string[];
};

/** Respaldo que procede de la sección Stack del perfil (no de una experiencia o un proyecto). */
const STACK = "Stack";

export type Evidence = { skill: string; sources: string[] };

export type ProfileMatch = {
  matchedSkills: Evidence[];
  missingRequired: string[];
  missingPreferred: string[];
  relevantExperience: { label: string; line: string; terms: string[] }[];
  keywords: { keyword: string; inProfile: boolean }[];
  gaps: string[];
  recommendations: string[];
  /** Proporción 0-1 de habilidades requeridas con evidencia (null si la JD no cita ninguna). */
  requiredCoverage: number | null;
  profileYears: number;
};

function profileYears(experiences: CandidateProfile["experiences"], today: string): number {
  // Se fusionan los periodos solapados para no contar dos veces el mismo tiempo.
  const ranges = experiences
    .map((e) => [Date.parse(e.startDate), Date.parse(e.endDate ?? today)] as const)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [a, b] of ranges) {
    if (!cur || a > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [a, b];
    } else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return Math.round((total / (365.25 * 86_400_000)) * 10) / 10;
}

const SENIORITY_ORDER: Seniority[] = ["intern", "junior", "mid", "senior", "staff", "lead", "principal", "manager", "director"];

export function seniorityDistance(a: Seniority, b: Seniority): number {
  return Math.abs(SENIORITY_ORDER.indexOf(a) - SENIORITY_ORDER.indexOf(b));
}

export function compareProfile(analysis: JobAnalysis, profile: CandidateProfile, today: string): ProfileMatch {
  const lexicon = compileLexicon(profile.skills);
  const declared = new Set(profile.skills.map(skillKey));
  const termFor = (name: string) => lexicon.find((t) => t.key === skillKey(name));

  const evidenceFor = (skill: string): string[] => {
    const sources: string[] = [];
    if (declared.has(skillKey(skill))) sources.push(STACK);
    const term = termFor(skill);
    if (!term) return sources;
    for (const e of profile.experiences) {
      const inTech = e.technologies?.some((x) => skillKey(x) === term.key);
      if (inTech || e.lines.some((l) => term.patterns.some((p) => p.test(l)))) sources.push(e.label);
    }
    for (const p of profile.projects) {
      const inTech = p.technologies.some((t) => skillKey(t) === term.key);
      if (inTech || term.patterns.some((re) => re.test(`${p.title} ${p.summary}`))) sources.push(`Proyecto: ${p.title}`);
    }
    return [...new Set(sources)];
  };

  const matchedSkills: Evidence[] = [];
  const missingRequired: string[] = [];
  const missingPreferred: string[] = [];
  for (const s of analysis.requiredSkills) {
    const sources = evidenceFor(s);
    if (sources.length) matchedSkills.push({ skill: s, sources });
    else missingRequired.push(s);
  }
  for (const s of analysis.preferredSkills) {
    const sources = evidenceFor(s);
    if (sources.length) matchedSkills.push({ skill: s, sources });
    else missingPreferred.push(s);
  }

  // Líneas de experiencia que citan habilidades o keywords de la JD.
  const jdTerms = [...analysis.requiredSkills, ...analysis.preferredSkills]
    .map(termFor)
    .filter((t): t is CompiledTerm => !!t);
  const kwPatterns = analysis.keywords.map((k) => ({ k, re: termPattern(k) }));
  const relevantExperience = profile.experiences
    .flatMap((e) =>
      e.lines.map((line) => ({
        label: e.label,
        line,
        terms: [
          ...jdTerms.filter((t) => t.patterns.some((p) => p.test(line))).map((t) => t.name),
          ...kwPatterns.filter(({ k, re }) => re.test(line) && !jdTerms.some((t) => t.key === skillKey(k))).map(({ k }) => k),
        ],
      })),
    )
    .filter((x) => x.terms.length)
    .sort((a, b) => b.terms.length - a.terms.length)
    .slice(0, 10);

  const profileText = [
    ...profile.skills,
    ...profile.experiences.flatMap((e) => [e.label, ...e.lines, ...(e.technologies ?? [])]),
    ...profile.projects.flatMap((p) => [p.title, p.summary, ...p.technologies]),
  ].join("\n");
  const keywords = analysis.keywords.map((keyword) => ({ keyword, inProfile: termPattern(keyword).test(profileText) }));

  const years = profileYears(profile.experiences, today);
  const gaps: string[] = [];
  const recommendations: string[] = [];

  if (missingRequired.length) {
    gaps.push(`Sin evidencia en tu perfil de: ${missingRequired.join(", ")} (requerido).`);
    recommendations.push(
      `No añadas ${missingRequired.slice(0, 3).join(", ")} al CV si no lo has usado. Si sí lo has usado, regístralo primero en Stack o Experiencia para que la comparación lo detecte.`,
    );
  }
  if (missingPreferred.length) gaps.push(`Deseables sin evidencia: ${missingPreferred.join(", ")}.`);
  if (analysis.experience.minYears !== null && years < analysis.experience.minYears) {
    gaps.push(`Piden ${analysis.experience.minYears}+ años; tu experiencia registrada suma ${years} años.`);
    recommendations.push("Prepara cómo explicar el alcance de tu experiencia (responsabilidad, impacto) sin inflar los años.");
  }
  if (analysis.seniority && profile.targetSeniority && seniorityDistance(analysis.seniority.value, profile.targetSeniority) >= 2) {
    gaps.push(`Seniority de la oferta (${analysis.seniority.value}) lejos de tu objetivo (${profile.targetSeniority}).`);
  }
  const top = matchedSkills.filter((m) => m.sources.some((s) => s !== STACK)).slice(0, 4);
  if (top.length) {
    recommendations.push(
      `Destaca ${top.map((m) => m.skill).join(", ")}: lo piden y tienes evidencia concreta (${[...new Set(top.flatMap((m) => m.sources.filter((s) => s !== STACK)))].slice(0, 3).join("; ")}).`,
    );
  }
  const stackOnly = matchedSkills.filter((m) => m.sources.length === 1 && m.sources[0] === STACK).map((m) => m.skill);
  if (stackOnly.length) {
    recommendations.push(
      `${stackOnly.slice(0, 4).join(", ")} está en tu Stack pero en ninguna experiencia o proyecto: si lo usaste en algún puesto, añádelo a esa experiencia.`,
    );
  }
  const missingKw = keywords.filter((k) => !k.inProfile).map((k) => k.keyword);
  if (missingKw.length) {
    recommendations.push(`Palabras clave de la oferta que tu perfil no menciona: ${missingKw.slice(0, 6).join(", ")}. Úsalas solo donde describan algo que hiciste.`);
  }

  const reqTotal = analysis.requiredSkills.length;
  const reqMatched = analysis.requiredSkills.length - missingRequired.length;
  return {
    matchedSkills,
    missingRequired,
    missingPreferred,
    relevantExperience,
    keywords,
    gaps,
    recommendations,
    requiredCoverage: reqTotal ? reqMatched / reqTotal : null,
    profileYears: years,
  };
}

/* ------------------------------------------------------------ CV match */

export type CvMatch = {
  emphasize: { line: string; terms: string[] }[];
  improve: { line: string; reason: string }[];
  move: { line: string; reason: string }[];
  irrelevant: string[];
  keywordsToAdd: { keyword: string; evidence: string }[];
  keywordsMissing: string[];
  projects: { title: string; terms: string[] }[];
};

function cvLines(cv: string): { text: string; index: number; total: number }[] {
  const raw = cv
    .split(/\r?\n/)
    .map((l) => l.replace(BULLET, "").trim())
    .filter(Boolean);
  return raw.map((text, index) => ({ text, index, total: raw.length }));
}

export function matchCv(analysis: JobAnalysis, cv: string, profile: CandidateProfile): CvMatch {
  const lexicon = compileLexicon(profile.skills);
  const jdSkills = [...analysis.requiredSkills, ...analysis.preferredSkills];
  const terms = jdSkills.map((s) => lexicon.find((t) => t.key === skillKey(s))).filter((t): t is CompiledTerm => !!t);
  const kw = analysis.keywords.filter((k) => !jdSkills.some((s) => skillKey(s) === skillKey(k)));
  const required = new Set(analysis.requiredSkills.map(skillKey));

  const hitsOf = (line: string) => [
    ...terms.filter((t) => t.patterns.some((p) => p.test(line))).map((t) => t.name),
    ...kw.filter((k) => termPattern(k).test(line)),
  ];

  const lines = cvLines(cv);
  const scored = lines.map((l) => ({ ...l, hits: hitsOf(l.text) }));
  // Las líneas cortas son títulos, fechas o datos de contacto: no son bullets que evaluar.
  const bullets = scored.filter((l) => l.text.length >= 30);

  const emphasize = bullets
    .filter((l) => l.hits.length >= 2 || l.hits.some((h) => required.has(skillKey(h))))
    .sort((a, b) => b.hits.length - a.hits.length)
    .slice(0, 8)
    .map((l) => ({ line: l.text, terms: l.hits }));

  const improve: CvMatch["improve"] = [];
  for (const l of bullets) {
    if (!l.hits.length) continue;
    if (!/\d/.test(l.text)) improve.push({ line: l.text, reason: "Relevante pero sin resultado medible: añade una cifra solo si la tienes." });
    else if (l.text.length > 220) improve.push({ line: l.text, reason: "Relevante pero largo: déjalo en una línea con la habilidad delante." });
  }

  const move: CvMatch["move"] = bullets
    .filter((l) => l.hits.length >= 2 && l.index > l.total / 2)
    .map((l) => ({ line: l.text, reason: "Muy relevante para esta oferta pero está en la mitad inferior del CV: súbelo." }));

  // Contenido real del perfil que encaja con la JD y no está en el CV.
  const cvText = cv.toLowerCase();
  for (const e of profile.experiences) {
    for (const line of e.lines) {
      const hits = hitsOf(line);
      if (hits.length >= 2 && !cvText.includes(line.toLowerCase().slice(0, 40))) {
        move.push({ line, reason: `Está en tu perfil (${e.label}) pero no en este CV y encaja con la oferta.` });
      }
    }
  }

  const irrelevant = bullets.filter((l) => !l.hits.length).map((l) => l.text).slice(0, 10);

  const profileText = [
    ...profile.skills,
    ...profile.experiences.flatMap((e) => [...e.lines, ...(e.technologies ?? [])]),
    ...profile.projects.flatMap((p) => [p.title, p.summary, ...p.technologies]),
  ].join("\n");
  const keywordsToAdd: CvMatch["keywordsToAdd"] = [];
  const keywordsMissing: string[] = [];
  for (const k of [...jdSkills, ...kw]) {
    const re = lexicon.find((t) => t.key === skillKey(k))?.patterns ?? [termPattern(k)];
    if (re.some((p) => p.test(cv))) continue;
    if (re.some((p) => p.test(profileText))) {
      const exp = profile.experiences.find((e) => [...e.lines, ...(e.technologies ?? [])].some((l) => re.some((p) => p.test(l))));
      const proj = profile.projects.find((p) => re.some((r) => r.test(`${p.title} ${p.summary} ${p.technologies.join(" ")}`)));
      keywordsToAdd.push({ keyword: k, evidence: exp?.label ?? (proj ? `Proyecto: ${proj.title}` : STACK) });
    } else keywordsMissing.push(k);
  }

  const projects = profile.projects
    .map((p) => {
      const text = `${p.title} ${p.summary} ${p.technologies.join(" ")}`;
      return { title: p.title, terms: terms.filter((t) => t.patterns.some((re) => re.test(text))).map((t) => t.name) };
    })
    .filter((p) => p.terms.length)
    .sort((a, b) => b.terms.length - a.terms.length)
    .slice(0, 5);

  return { emphasize, improve: improve.slice(0, 8), move: move.slice(0, 8), irrelevant, keywordsToAdd, keywordsMissing, projects };
}
