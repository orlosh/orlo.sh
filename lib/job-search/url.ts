import type { Source } from "./enums";

/**
 * Lo que se puede deducir de una URL de oferta sin descargarla: la fuente y, en los ATS que
 * llevan la empresa en la ruta, su nombre. No se hace ninguna petición a la URL.
 */

const titleCase = (slug: string) =>
  decodeURIComponent(slug)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/** Hosts de ATS con la empresa en el primer segmento de la ruta. */
const PATH_ATS = ["boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com", "apply.workable.com", "jobs.smartrecruiters.com"];
/** ATS con la empresa como subdominio (acme.recruitee.com). */
const SUBDOMAIN_ATS = ["recruitee.com", "teamtailor.com", "personio.de", "personio.com", "bamboohr.com", "breezy.hr", "workable.com", "factorialhr.com"];
const JOB_BOARDS = ["indeed.", "infojobs.", "glassdoor.", "tecnoempleo.", "remoteok.", "weworkremotely.", "otta.com", "welovedevs.", "getmanfred.", "remotive.", "stackoverflow.", "dice.com", "monster."];

export function guessFromUrl(raw: string | null | undefined): { source: Source | null; company: string | null; title: string | null } {
  if (!raw) return { source: null, company: null, title: null };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { source: null, company: null, title: null };
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host.endsWith("linkedin.com")) return { source: "linkedin", company: null, title: null };
  if (host.endsWith("wellfound.com") || host.endsWith("angel.co")) {
    const i = parts.indexOf("company");
    return { source: "wellfound", company: i >= 0 && parts[i + 1] ? titleCase(parts[i + 1]) : null, title: null };
  }
  if (host.endsWith("welcometothejungle.com")) {
    const i = parts.indexOf("companies");
    const j = parts.indexOf("jobs");
    return {
      source: "welcome_to_the_jungle",
      company: i >= 0 && parts[i + 1] ? titleCase(parts[i + 1]) : null,
      title: j >= 0 && parts[j + 1] ? titleCase(parts[j + 1].replace(/_[a-z0-9]+$/i, "")) : null,
    };
  }
  if (PATH_ATS.includes(host)) return { source: "company_website", company: parts[0] ? titleCase(parts[0]) : null, title: null };
  const sub = SUBDOMAIN_ATS.find((d) => host.endsWith(`.${d}`));
  if (sub) return { source: "company_website", company: titleCase(host.slice(0, -(sub.length + 1)).split(".").pop()!), title: null };
  if (JOB_BOARDS.some((b) => host.includes(b))) return { source: "job_board", company: null, title: null };

  // Web propia de la empresa (careers.acme.com, acme.com/jobs/…): el dominio es la empresa.
  const labels = host.split(".");
  const name = labels.length >= 2 ? labels[labels.length - 2] : labels[0];
  const looksLikeCareers = /career|jobs|empleo|trabaja|join/.test(url.href.toLowerCase());
  return { source: looksLikeCareers ? "company_website" : null, company: looksLikeCareers ? titleCase(name) : null, title: null };
}
