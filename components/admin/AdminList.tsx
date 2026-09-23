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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-carbon">{title}</h1>
        <Link href={newHref} className="rounded-sm bg-primary px-3 py-1.5 text-sm font-semibold text-background-dark">
          Nuevo
        </Link>
      </div>
      <ul className="mt-8 divide-y divide-border-dark/15 border-y border-border-dark/15">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="flex flex-col gap-1 py-4 hover:bg-white sm:flex-row sm:items-center sm:justify-between sm:px-2">
              <span className="text-carbon">
                {i.title}
                {i.badge ? <span className="ml-3 rounded-full border border-border-dark/15 px-2 py-0.5 font-mono text-[0.65rem] text-slate-700">{i.badge}</span> : null}
              </span>
              <span className="font-mono text-xs text-slate-600">{i.meta}</span>
            </Link>
          </li>
        ))}
        {!items.length ? <li className="py-4 text-sm text-slate-600">Vacío.</li> : null}
      </ul>
    </div>
  );
}
