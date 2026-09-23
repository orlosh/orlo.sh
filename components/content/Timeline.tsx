import type { Experience } from "@/lib/content/types";
import { formatPeriod } from "@/lib/format";

/**
 * Experiencia dibujada a escala sobre un eje temporal (precisión de mes). Los puestos actuales
 * llegan hasta "hoy" en verde; los anteriores, en carbón. Cada barra tiene su equivalente
 * textual (puesto + periodo) para lectores de pantalla.
 */
function toMonths(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return y * 12 + (m - 1);
}

export function Timeline({ items, now = new Date() }: { items: Experience[]; now?: Date }) {
  if (!items.length) return null;
  const today = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const firstYear = Math.min(...items.map((e) => Number(e.startDate.slice(0, 4))));
  const start = firstYear * 12;
  const end = (now.getUTCFullYear() + 1) * 12;
  const span = end - start;
  const years = Array.from({ length: end / 12 - firstYear }, (_, i) => firstYear + i);
  const pct = (months: number) => `${((months - start) / span) * 100}%`;

  const rows = [...items].sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="rounded-md border border-border-dark/15 bg-white p-4 sm:p-6">
      <ol className="space-y-5 md:space-y-3">
        {rows.map((e) => {
          const s = toMonths(e.startDate);
          const f = e.endDate ? toMonths(e.endDate) + 1 : today + 1;
          return (
            <li key={e.id} className="grid gap-2 md:grid-cols-[15rem_1fr] md:items-center md:gap-6">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-carbon">
                  {e.role}
                  {e.company ? <span className="font-normal text-slate-600"> · {e.company}</span> : null}
                </p>
                <p className="font-mono text-xs text-slate-600">{formatPeriod(e.startDate, e.endDate)}</p>
              </div>
              <div className="relative h-6" aria-hidden>
                {years.map((y) => (
                  <span key={y} className="absolute inset-y-0 w-px bg-border-dark/10" style={{ left: pct(y * 12) }} />
                ))}
                <span
                  className={`absolute top-1/2 h-3 -translate-y-1/2 rounded-[2px] ${e.endDate ? "bg-carbon" : "bg-primary"}`}
                  style={{ left: pct(s), width: `max(4px, ${((f - s) / span) * 100}%)` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <div aria-hidden className="relative mt-4 h-5 md:ml-[16.5rem]">
        {years.map((y) => (
          <span key={y} className="absolute -translate-x-1/2 font-mono text-[0.6875rem] text-slate-600" style={{ left: pct(y * 12 + 6) }}>
            {y}
          </span>
        ))}
        <span className="absolute -top-2 h-7 w-px bg-carbon" style={{ left: pct(today + 1) }} />
      </div>
    </div>
  );
}
