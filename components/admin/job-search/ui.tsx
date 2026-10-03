import Link from "next/link";
import type { OpportunityStatus, Priority } from "@/lib/job-search/enums";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/job-search/labels";
import { stageGroup } from "@/lib/job-search/stages";

/**
 * Piezas de presentación de Job Search, hechas con las mismas clases del panel (.panel, .label,
 * .btn…). Tinta carbon y slate; el verde solo como marca (punto, barra activa), nunca como texto.
 */

export function Badge({ children, tone = "default", title }: { children: React.ReactNode; tone?: "default" | "dark" | "muted"; title?: string }) {
  const cls = {
    default: "bg-slate-100 text-slate-700",
    dark: "bg-carbon text-white",
    muted: "bg-white text-slate-500 ring-1 ring-slate-200",
  }[tone];
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[0.7rem] ${cls}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: OpportunityStatus }) {
  const g = stageGroup(status);
  const tone = g === "offer" || g === "interviewing" ? "dark" : g === "closed" ? "muted" : "default";
  return (
    <Badge tone={tone}>
      {g === "offer" ? <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" /> : null}
      {STATUS_LABEL[status]}
    </Badge>
  );
}

const PRIORITY_DOT: Record<Priority, string> = { high: "bg-carbon", medium: "bg-slate-400", low: "bg-slate-200 ring-1 ring-slate-300" };

export function PriorityTag({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-600">
      <span aria-hidden="true" className={`size-2 rounded-full ${PRIORITY_DOT[priority]}`} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

/** Stat tile: etiqueta, valor y una línea de contexto opcional. */
export function Stat({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: string; href?: string }) {
  const body = (
    <>
      <dt className="label">{label}</dt>
      <dd className="mt-2 font-mono text-2xl text-carbon md:text-3xl">{value}</dd>
      {hint ? <dd className="mt-1 text-xs text-slate-500">{hint}</dd> : null}
    </>
  );
  return href ? (
    <Link href={href} className="panel block p-4 transition-colors hover:border-slate-300">
      {body}
    </Link>
  ) : (
    <div className="panel p-4">{body}</div>
  );
}

export function Section({ title, action, children, id }: { title: string; action?: React.ReactNode; children: React.ReactNode; id?: string }) {
  const hid = id ?? `s-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={hid} className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 id={hid} className="label">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="panel px-4 py-6 text-sm text-slate-500">{children}</p>;
}

/** Cabecera de página de Job Search. */
export function PageHeader({ title, count, description, action }: { title: string; count?: number; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="page-title">
          {title}
          {count !== undefined ? <span className="ml-3 font-mono text-sm font-normal text-slate-500">{count}</span> : null}
        </h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-slate-600">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Pestañas como enlaces (funcionan sin JavaScript y se pueden compartir). */
export function Tabs({ tabs, current }: { tabs: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <nav aria-label="Secciones" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex min-w-max gap-1 border-b border-slate-200">
        {tabs.map((t) => {
          const active = t.key === current;
          return (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`relative block px-3 py-2 text-sm transition-colors ${
                  active
                    ? "font-medium text-carbon after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-slate-600 hover:text-carbon"
                }`}
              >
                {t.label}
                {t.count ? <span className="ml-1.5 font-mono text-xs text-slate-500">{t.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Barra horizontal de una sola serie: tinta carbon sobre una pista slate, extremo redondeado y
 * el valor en la punta, en texto. El título nativo hace de tooltip.
 */
export function BarRow({ label, value, max, detail }: { label: string; value: number; max: number; detail?: string }) {
  const w = max > 0 ? Math.max((value / max) * 100, value > 0 ? 1.5 : 0) : 0;
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-3 sm:grid-cols-[11rem_1fr]" title={`${label}: ${value}${detail ? ` · ${detail}` : ""}`}>
      <span className="truncate text-sm text-slate-700">{label}</span>
      <span className="flex items-center gap-2">
        <span className="relative h-4 flex-1 rounded-r-sm bg-slate-100">
          <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-carbon" style={{ width: `${w}%` }} />
        </span>
        <span className="w-24 shrink-0 font-mono text-xs text-slate-700 tabular-nums">
          {value}
          {detail ? <span className="ml-1.5 text-slate-500">{detail}</span> : null}
        </span>
      </span>
    </div>
  );
}

/** Tabla del panel: cabecera slate-50, filas con borde fino. */
export function Table({ head, children, minWidth = "36rem" }: { head: React.ReactNode[]; children: React.ReactNode; minWidth?: string }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead>
          <tr className="bg-slate-50 font-mono text-xs text-slate-500">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-4 py-2.5 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const td = "border-t border-slate-200 px-4 py-2.5 align-top text-slate-700";

export function Muted({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-xs text-slate-500">{children}</span>;
}

/** Bloque de texto libre guardado (notas, JD): respeta saltos de línea, sin HTML. */
export function PlainText({ children }: { children: string | null | undefined }) {
  if (!children?.trim()) return <p className="text-sm text-slate-500">—</p>;
  return <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{children}</p>;
}
