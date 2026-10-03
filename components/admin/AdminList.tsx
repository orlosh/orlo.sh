import Link from "next/link";

export function AdminList({
  title,
  newHref,
  items,
}: {
  title: string;
  newHref: string;
  items: { href: string; title: string; meta: string; badge?: string }[];
}) {
  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="page-title">
          {title}
          <span className="ml-3 font-mono text-sm font-normal text-slate-500">{items.length}</span>
        </h1>
        <Link href={newHref} className="btn">
          Nuevo
        </Link>
      </div>
      <ul className="panel mt-8 divide-y divide-slate-200 overflow-hidden">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="group flex flex-col gap-1 px-4 py-3.5 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-carbon">
                {i.title}
                {i.badge ? (
                  <span className="ml-3 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[0.7rem] text-slate-600">{i.badge}</span>
                ) : null}
              </span>
              <span className="flex items-center gap-3 font-mono text-xs text-slate-500">
                {i.meta}
                <span aria-hidden="true" className="hidden text-slate-300 transition-colors group-hover:text-carbon sm:inline">
                  →
                </span>
              </span>
            </Link>
          </li>
        ))}
        {!items.length ? <li className="px-4 py-6 text-sm text-slate-500">Vacío.</li> : null}
      </ul>
    </div>
  );
}
