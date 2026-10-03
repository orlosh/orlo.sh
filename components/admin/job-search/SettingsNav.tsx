import Link from "next/link";

/** Selector entre los dos grupos de ajustes de la búsqueda. */
export function SettingsNav({ current }: { current: "goal" | "ai" }) {
  const items = [
    ["goal", "Objetivo y reglas", "/admin/job-search/settings"],
    ["ai", "Inteligencia artificial", "/admin/job-search/settings/ai"],
  ] as const;
  return (
    <nav aria-label="Ajustes">
      <ul className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-sm">
        {items.map(([key, label, href]) => (
          <li key={key}>
            <Link
              href={href}
              aria-current={current === key ? "page" : undefined}
              className={`block rounded px-3 py-1 transition-colors ${current === key ? "bg-carbon text-white" : "text-slate-600 hover:text-carbon"}`}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
