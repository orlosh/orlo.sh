"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/site";

/** Marca la sección actual. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <ul className="flex flex-wrap items-center gap-x-6 gap-y-1">
      {NAV.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={active ? "glow text-primary" : "text-slate-400 hover:text-white"}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
