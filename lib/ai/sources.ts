import { decodeEntities, htmlToText } from "./page";
import { normalize } from "./verify";

/**
 * Fuentes del radar que no necesitan Google Search (de pago en Gemini 3): APIs públicas que
 * devuelven ofertas reales con su URL, sin clave ni scraping.
 *
 *  - companies: las páginas de empleo de tus empresas objetivo alojadas en Greenhouse, Lever o
 *    Ashby (se detectan por la URL de empleo, la web o las URLs de sus oportunidades).
 *  - remotive: ofertas remotas por palabra clave. Sus condiciones piden no más de 4 consultas al
 *    día y citar la fuente: el radar hace una consulta por ejecución y muestra "vía Remotive".
 *  - arbeitnow: portal europeo con API abierta.
 *  - adzuna: buscador de empleo con API gratuita (clave propia, ~1.000 llamadas al mes). Solo da un
 *    extracto: cada oferta se descarga después para evaluarla con el texto completo.
 *  - brave: búsqueda web (Brave Search API, clave propia) restringida a Greenhouse, Lever y Ashby.
 *    No se usa para leer ofertas sueltas sino para descubrir empresas que contratan para tu
 *    perfil; de cada una se descarga el tablón completo por la API pública de su ATS.
 */

export const RADAR_SOURCES = {
  companies: "Empresas objetivo (Greenhouse, Lever, Ashby)",
  remotive: "Remotive (empleo remoto)",
  arbeitnow: "Arbeitnow (Europa)",
  adzuna: "Adzuna (necesita su clave)",
  brave: "Búsqueda web con Brave (necesita su clave)",
  google: "Google Search de Gemini (requiere facturación en Gemini 3)",
} as const;

/** Fuentes que ya traen el texto completo de la oferta: no hace falta descargar la página. */
export const FULL_TEXT_SOURCES = new Set(["greenhouse", "lever", "ashby", "remotive", "arbeitnow", "brave"]);

export const ADZUNA_COUNTRIES = ["es", "gb", "de", "fr", "it", "nl", "pl", "at", "be", "ch", "us", "ca", "mx", "br", "au", "nz", "in", "sg", "za"] as const;
export type RadarSource = keyof typeof RADAR_SOURCES;

export type FoundJob = {
  title: string;
  company: string | null;
  url: string;
  location: string | null;
  postedAt: string | null;
  remote: boolean | null;
  /** Texto de la oferta si la fuente lo da (evita descargar la página después). */
  description: string | null;
  source: string;
};

/* ------------------------------------------------------- detección de ATS */

export type Ats = { kind: "greenhouse" | "lever" | "ashby"; token: string; eu?: boolean };

export function detectAts(raw: string | null | undefined): Ats | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const first = u.pathname.split("/").filter(Boolean)[0];
  if (!first) return null;
  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io" || host === "job-boards.eu.greenhouse.io") return { kind: "greenhouse", token: first };
  if (host === "jobs.lever.co") return { kind: "lever", token: first };
  if (host === "jobs.eu.lever.co") return { kind: "lever", token: first, eu: true };
  if (host === "jobs.ashbyhq.com") return { kind: "ashby", token: first };
  return null;
}

/* --------------------------------------------------------------- filtros */

const STOP = new Set(
  "remote remoto remota hibrido hybrid presencial onsite senior sr junior jr mid de del en con y the and for of a el la las los full time part tiempo completo trabajo empleo job jobs".split(" "),
);

/** Palabras que importan de una búsqueda ("Senior Backend Engineer remoto" → backend, engineer). */
export function queryTerms(q: string): string[] {
  return normalize(q)
    .split(" ")
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

/** El título encaja con alguna búsqueda si contiene al menos dos de sus palabras (o todas si tiene una). */
export function titleMatches(title: string, queries: string[]): boolean {
  const t = ` ${normalize(title)} `;
  return queries.some((q) => {
    const terms = queryTerms(q);
    if (!terms.length) return false;
    const hits = terms.filter((w) => t.includes(` ${w} `)).length;
    return hits >= Math.min(2, terms.length);
  });
}

export function locationMatches(job: Pick<FoundJob, "location" | "remote">, locations: string[]): boolean {
  if (!locations.length) return true;
  const loc = normalize(job.location ?? "");
  const wantsRemote = locations.some((l) => /^(remote|remoto|teletrabajo)$/i.test(l.trim()));
  if (wantsRemote && (job.remote || /\b(remote|remoto|anywhere|worldwide)\b/.test(loc))) return true;
  return locations.some((l) => {
    const n = normalize(l);
    return n.length >= 2 && loc.includes(n);
  });
}

const isoDate = (v: unknown): string | null => {
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v).toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
};
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/* ---------------------------------------------------------------- fuentes */

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const res = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "orlo-job-search/1.0 (+https://orlo.sh)" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fromAts(fetchImpl: typeof fetch, ats: Ats, company: string | null): Promise<FoundJob[]> {
  const token = encodeURIComponent(ats.token);
  if (ats.kind === "greenhouse") {
    const data = (await getJson(fetchImpl, `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`)) as { jobs?: Record<string, unknown>[] };
    return (data.jobs ?? []).flatMap((j) => {
      const url = str(j.absolute_url);
      const title = str(j.title);
      if (!url || !title) return [];
      const content = str(j.content);
      // Greenhouse devuelve el HTML escapado: se decodifica antes de limpiar.
      return [{ title, company, url, location: str((j.location as { name?: string })?.name), postedAt: isoDate(j.first_published ?? j.updated_at), remote: null, description: content ? htmlToText(decodeEntities(content), 20_000) : null, source: "greenhouse" }];
    });
  }
  if (ats.kind === "lever") {
    const host = ats.eu ? "api.eu.lever.co" : "api.lever.co";
    const data = (await getJson(fetchImpl, `https://${host}/v0/postings/${token}?mode=json`)) as Record<string, unknown>[];
    return (Array.isArray(data) ? data : []).flatMap((j) => {
      const url = str(j.hostedUrl);
      const title = str(j.text);
      if (!url || !title) return [];
      const cats = (j.categories ?? {}) as { location?: string };
      return [{ title, company, url, location: str(cats.location), postedAt: isoDate(j.createdAt), remote: j.workplaceType === "remote" ? true : null, description: str(j.descriptionPlain), source: "lever" }];
    });
  }
  const data = (await getJson(fetchImpl, `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`)) as { jobs?: Record<string, unknown>[] };
  return (data.jobs ?? []).flatMap((j) => {
    const url = str(j.jobUrl);
    const title = str(j.title);
    if (!url || !title || j.isListed === false) return [];
    return [{ title, company, url, location: str(j.location), postedAt: isoDate(j.publishedAt), remote: j.isRemote === true || j.workplaceType === "Remote" ? true : null, description: str(j.descriptionPlain), source: "ashby" }];
  });
}

export async function fromRemotive(fetchImpl: typeof fetch, search: string): Promise<FoundJob[]> {
  const data = (await getJson(fetchImpl, `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(search)}&limit=50`)) as { jobs?: Record<string, unknown>[] };
  return (data.jobs ?? []).flatMap((j) => {
    const url = str(j.url);
    const title = str(j.title);
    if (!url || !title) return [];
    const description = str(j.description);
    return [{ title, company: str(j.company_name), url, location: str(j.candidate_required_location), postedAt: isoDate(j.publication_date), remote: true, description: description ? htmlToText(description, 20_000) : null, source: "remotive" }];
  });
}

export async function fromArbeitnow(fetchImpl: typeof fetch): Promise<FoundJob[]> {
  const data = (await getJson(fetchImpl, "https://www.arbeitnow.com/api/job-board-api")) as { data?: Record<string, unknown>[] };
  return (data.data ?? []).flatMap((j) => {
    const url = str(j.url);
    const title = str(j.title);
    if (!url || !title) return [];
    const description = str(j.description);
    return [{ title, company: str(j.company_name), url, location: str(j.location), postedAt: isoDate(j.created_at), remote: j.remote === true ? true : null, description: description ? htmlToText(description, 20_000) : null, source: "arbeitnow" }];
  });
}

/* ------------------------------------------------------- fuentes con clave */

export async function fromAdzuna(
  fetchImpl: typeof fetch,
  cred: { appId: string; appKey: string; country: string },
  what: string,
  where: string | null,
  maxDays: number,
): Promise<FoundJob[]> {
  const params = new URLSearchParams({
    app_id: cred.appId,
    app_key: cred.appKey,
    what,
    results_per_page: "50",
    max_days_old: String(maxDays),
    sort_by: "date",
    "content-type": "application/json",
  });
  if (where) params.set("where", where);
  const country = (ADZUNA_COUNTRIES as readonly string[]).includes(cred.country) ? cred.country : "es";
  const data = (await getJson(fetchImpl, `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`)) as { results?: Record<string, unknown>[] };
  return (data.results ?? []).flatMap((j) => {
    const url = str(j.redirect_url);
    const title = str(j.title);
    if (!url || !title) return [];
    const loc = (j.location ?? {}) as { display_name?: string };
    const description = str(j.description);
    return [{ title: htmlToText(title, 200), company: str((j.company as { display_name?: string })?.display_name), url, location: str(loc.display_name), postedAt: isoDate(j.created), remote: null, description: description ? htmlToText(description, 2_000) : null, source: "adzuna" }];
  });
}

const BRAVE_SITES = ["boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com"];

export function braveFreshness(maxDays: number) {
  return maxDays <= 1 ? "pd" : maxDays <= 7 ? "pw" : maxDays <= 31 ? "pm" : "py";
}

/** Busca en la web páginas de ofertas en los ATS públicos y devuelve los tablones (empresas) encontrados. */
export async function discoverBoardsWithBrave(fetchImpl: typeof fetch, apiKey: string, query: string, maxDays: number): Promise<{ boards: (Ats & { company: string | null })[]; results: number }> {
  const q = `${queryTerms(query).join(" ")} (${BRAVE_SITES.map((s) => `site:${s}`).join(" OR ")})`;
  const res = await fetchImpl(`https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q, count: "20", freshness: braveFreshness(maxDays) })}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "clave de Brave rechazada" : res.status === 429 ? "límite de Brave alcanzado" : `HTTP ${res.status}`);
  const data = (await res.json()) as { web?: { results?: { url?: string; title?: string }[] } };
  const results = data.web?.results ?? [];
  const boards = new Map<string, Ats & { company: string | null }>();
  for (const r of results) {
    const ats = detectAts(r.url);
    if (!ats) continue;
    // El identificador del tablón es estable (el título del resultado varía según el ATS).
    const company = decodeURIComponent(ats.token).replace(/[-_]+/g, " ").replace(/\b\p{L}/gu, (c) => c.toUpperCase());
    boards.set(`${ats.kind}:${ats.token.toLowerCase()}`, { ...ats, company });
  }
  return { boards: [...boards.values()], results: results.length };
}
