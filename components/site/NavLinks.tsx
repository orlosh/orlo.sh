"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/site";

/** El único JS de cliente en la cabecera pública: marca la sección actual. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <ul className="flex items-center gap-1 font-mono text-[0.8125rem]">
      {NAV.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`block whitespace-nowrap rounded-sm px-2 py-1 transition-colors duration-150 ${
                active ? "bg-primary text-carbon" : "text-slate-600 hover:bg-white hover:text-carbon"
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
