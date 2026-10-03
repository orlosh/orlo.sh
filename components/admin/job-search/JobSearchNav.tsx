"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE = "/admin/job-search";
const NAV = [
  ["", "Dashboard"],
  ["/inbox", "Inbox"],
  ["/pipeline", "Pipeline"],
  ["/opportunities", "Opportunities"],
  ["/tasks", "Tasks"],
  ["/interviews", "Interviews"],
  ["/contacts", "Contacts"],
  ["/networking", "Networking"],
  ["/companies", "Companies"],
  ["/documents", "Documents"],
  ["/analytics", "Analytics"],
  ["/review", "Weekly Review"],
  ["/settings", "Ajustes"],
] as const;

/** Subnavegación de Job Search; se desplaza en horizontal en móvil. */
export function JobSearchNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Job Search" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b border-slate-200">
        {NAV.map(([path, label]) => {
          const href = `${BASE}${path}`;
          const active = path === "" ? pathname === BASE : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative block px-3 py-2 text-sm transition-colors ${
                  active
                    ? "font-medium text-carbon after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-slate-600 hover:text-carbon"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
