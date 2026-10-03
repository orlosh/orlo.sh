"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  ["/admin", "Resumen"],
  ["/admin/profile", "Perfil"],
  ["/admin/experience", "Experiencia"],
  ["/admin/projects", "Proyectos"],
  ["/admin/stack", "Stack"],
  ["/admin/notes", "Notas"],
  ["/admin/education", "Formación"],
] as const;

/** Navegación del panel con la sección actual marcada por una barra verde. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <ul className="flex flex-wrap gap-1 md:flex-col">
      {NAV.map(([href, label]) => {
        const active = href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative block rounded-md px-3 py-1.5 text-sm transition-colors ${
                active
                  ? "bg-slate-100 font-medium text-carbon before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
                  : "text-slate-600 hover:bg-slate-50 hover:text-carbon"
              }`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
