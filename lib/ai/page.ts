import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Descarga de páginas de ofertas desde el servidor, con protección SSRF: solo http(s), sin
 * credenciales en la URL, y cada salto de redirección se comprueba contra direcciones privadas
 * o internas antes de conectar. Tamaño y tiempo limitados.
 *
 * Además extrae el JSON-LD JobPosting (schema.org) que publican la mayoría de ATS: datos
 * exactos de la propia oferta, que tienen prioridad sobre lo que deduzca la IA.
 */

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 4;
const UA = "Mozilla/5.0 (compatible; orlo-job-search/1.0; +https://orlo.sh)";

/** IPv4/IPv6 privadas, de loopback, link-local, CGNAT, metadatos de nube, multicast… */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return isPrivateAddress(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6);
}

export class PageError extends Error {}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new PageError("Solo se admiten URLs http(s)");
  if (url.username || url.password) throw new PageError("La URL no puede llevar credenciales");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new PageError("Destino no permitido");
  }
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new PageError("Destino no permitido");
}

export type FetchedPage = { finalUrl: string; status: number; html: string; contentType: string };

export async function fetchPage(rawUrl: string, { timeoutMs = 12_000, fetchImpl = fetch }: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<FetchedPage> {
  let url = new URL(rawUrl);
  const deadline = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const res = await fetchImpl(url, {
      redirect: "manual",
      signal: deadline,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5", "Accept-Language": "es,en;q=0.8" },
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|application\/json|text\/plain/.test(contentType)) {
      return { finalUrl: url.toString(), status: res.status, html: "", contentType };
    }
    // Lectura acotada: una página enorme no debe agotar la memoria de la función.
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
    return { finalUrl: url.toString(), status: res.status, html, contentType };
  }
  throw new PageError("Demasiadas redirecciones");
}

/* ------------------------------------------------------------- extracción */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", euro: "€" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** HTML → texto legible con saltos de línea en bloques y viñetas en listas. */
export function htmlToText(html: string, maxChars = 30_000): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<(br|\/p|\/div|\/h[1-6]|\/ul|\/ol|\/tr|\/section|\/article)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .replace(/^ +| +$/gm, "")
    .trim()
    .slice(0, maxChars);
}

export type JobPostingLd = {
  title?: string;
  description?: string;
  datePosted?: string;
  validThrough?: string;
  employmentType?: string;
  company?: string;
  companyUrl?: string;
  location?: string;
  remote?: boolean;
  salary?: { min?: number; max?: number; currency?: string; unit?: string };
};

const asText = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const asDate = (v: unknown): string | undefined => {
  const s = asText(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined;
};

function findPostings(node: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(node)) node.forEach((n) => findPostings(n, out));
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    const type = o["@type"];
    if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) out.push(o);
    if (o["@graph"]) findPostings(o["@graph"], out);
  }
}

export function extractJobPosting(html: string): JobPostingLd | null {
  const postings: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      findPostings(JSON.parse(m[1].trim()), postings);
    } catch {
      // JSON-LD mal formado: se ignora, hay más fuentes.
    }
  }
  const p = postings[0];
  if (!p) return null;
  const org = (p.hiringOrganization ?? {}) as Record<string, unknown>;
  const locs = (Array.isArray(p.jobLocation) ? p.jobLocation : [p.jobLocation]).filter(Boolean) as Record<string, unknown>[];
  const location = locs
    .map((l) => {
      const a = (l.address ?? {}) as Record<string, unknown>;
      return [a.addressLocality, a.addressRegion, a.addressCountry].map(asText).filter(Boolean).join(", ");
    })
    .filter(Boolean)
    .join(" · ");
  const salary = (p.baseSalary ?? {}) as Record<string, unknown>;
  const value = (salary.value ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);
  const description = asText(p.description);
  return {
    title: asText(p.title),
    // Muchos ATS publican la descripción con el HTML escapado (&lt;p&gt;): se decodifica antes de limpiar.
    description: description ? htmlToText(decodeEntities(description), 20_000) : undefined,
    datePosted: asDate(p.datePosted),
    validThrough: asDate(p.validThrough),
    employmentType: Array.isArray(p.employmentType) ? p.employmentType.join(", ") : asText(p.employmentType),
    company: asText(org.name),
    companyUrl: asText(org.sameAs) ?? asText(org.url),
    location: location || undefined,
    remote: p.jobLocationType === "TELECOMMUTE" ? true : undefined,
    salary:
      num(value.minValue) || num(value.maxValue) || num(value.value)
        ? { min: num(value.minValue) ?? num(value.value), max: num(value.maxValue) ?? num(value.value), currency: asText(salary.currency), unit: asText(value.unitText) }
        : undefined,
  };
}

export function extractMeta(html: string) {
  const meta = (name: string) =>
    decodeEntities(
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i").exec(html)?.[1] ??
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, "i").exec(html)?.[1] ??
        "",
    ).trim() || undefined;
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim() || undefined;
  return { title: meta("og:title") ?? title, description: meta("og:description") ?? meta("description"), siteName: meta("og:site_name") };
}

/** Lo que el servidor consigue leer de una oferta por sí mismo. */
export async function readJobPage(url: string, fetchImpl?: typeof fetch) {
  try {
    const page = await fetchPage(url, { fetchImpl });
    if (page.status >= 400) return { ok: false as const, finalUrl: page.finalUrl, error: `HTTP ${page.status}` };
    return {
      ok: true as const,
      finalUrl: page.finalUrl,
      posting: extractJobPosting(page.html),
      meta: extractMeta(page.html),
      text: htmlToText(page.html),
    };
  } catch (err) {
    return { ok: false as const, finalUrl: url, error: err instanceof Error ? err.message : "Error al descargar" };
  }
}
