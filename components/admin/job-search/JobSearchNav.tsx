"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE = "/admin/job-search";

type Section = { label: string; href: string; paths: string[]; views?: { label: string; href: string }[] };

/**
 * Pocas secciones arriba y, dentro de cada una, sus vistas como selector segmentado. Así la
 * navegación cabe en una línea y cada vista relacionada queda junta (bandeja/tablero/lista…).
 */
const SECTIONS: Section[] = [
  { label: "Hoy", href: BASE, paths: [""] },
  {
    label: "Oportunidades",
    href: `${BASE}/pipeline`,
    paths: ["/pipeline", "/opportunities", "/inbox"],
    views: [
      { label: "Tablero", href: `${BASE}/pipeline` },
      { label: "Lista", href: `${BASE}/opportunities` },
      { label: "Bandeja", href: `${BASE}/inbox` },
    ],
  },
  { label: "Tareas", href: `${BASE}/tasks`, paths: ["/tasks"] },
  {
    label: "Entrevistas",
    href: `${BASE}/interviews`,
    paths: ["/interviews"],
    views: [
      { label: "Agenda", href: `${BASE}/interviews` },
      { label: "Historias STAR", href: `${BASE}/interviews/stories` },
    ],
  },
  {
    label: "Contactos",
    href: `${BASE}/contacts`,
    paths: ["/contacts", "/networking"],
    views: [
      { label: "Todos", href: `${BASE}/contacts` },
      { label: "A quién escribir", href: `${BASE}/networking` },
    ],
  },
  { label: "Empresas", href: `${BASE}/companies`, paths: ["/companies"] },
  {
    label: "Análisis",
    href: `${BASE}/analytics`,
    paths: ["/analytics", "/review"],
    views: [
      { label: "Métricas", href: `${BASE}/analytics` },
      { label: "Revisión semanal", href: `${BASE}/review` },
    ],
  },
];

const SECONDARY = [
  { label: "Documentos", href: `${BASE}/documents` },
  { label: "Ajustes", href: `${BASE}/settings` },
];

function matches(pathname: string, path: string) {
  const full = `${BASE}${path}`;
  return path === "" ? pathname === BASE : pathname === full || pathname.startsWith(`${full}/`);
}

export function JobSearchNav() {
  const pathname = usePathname();
  const current = SECTIONS.find((s) => s.paths.some((p) => matches(pathname, p)));
  // La vista activa es la de ruta más larga que encaje (historias STAR antes que la agenda).
  const activeView = current?.views
    ?.filter((v) => pathname === v.href || pathname.startsWith(`${v.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  // En el detalle de una oportunidad no hay vista activa: no se resalta ninguna.
  const inDetail = /\/(opportunities|interviews|contacts|companies)\/[0-9a-f-]{36}/.test(pathname);

  return (
    <div className="space-y-3">
      <nav aria-label="Búsqueda de empleo" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex min-w-max items-end justify-between gap-6 border-b border-slate-200">
          <ul className="flex gap-1">
            {SECTIONS.map((s) => {
              const active = s === current;
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative block px-3 py-2 text-sm transition-colors ${
                      active
                        ? "font-medium text-carbon after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary"
                        : "text-slate-600 hover:text-carbon"
                    }`}
                  >
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <ul className="flex gap-1 pb-1">
            {SECONDARY.map((s) => {
              const active = matches(pathname, s.href.slice(BASE.length));
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-2.5 py-1 text-xs transition-colors ${active ? "bg-slate-100 text-carbon" : "text-slate-500 hover:text-carbon"}`}
                  >
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
      {current?.views && !inDetail ? (
        <nav aria-label={`Vistas de ${current.label}`}>
          <ul className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-sm">
            {current.views.map((v) => {
              const active = v === activeView;
              return (
                <li key={v.href}>
                  <Link
                    href={v.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded px-3 py-1 transition-colors ${active ? "bg-carbon text-white" : "text-slate-600 hover:text-carbon"}`}
                  >
                    {v.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
