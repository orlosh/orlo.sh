"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useSyncExternalStore } from "react";
import { type ActionState, idle } from "@/lib/admin/form";
import { bulkAction } from "@/lib/job-search/actions";
import type { OpportunityStatus, Priority, Source, Workplace } from "@/lib/job-search/enums";
import { OPTIONS, SOURCE_LABEL, STATUS_LABEL, WORKPLACE_LABEL } from "@/lib/job-search/labels";
import { STAGE_GROUPS, type StageGroup } from "@/lib/job-search/stages";
import { PriorityTag, StatusBadge } from "./ui";

export type TableRow = {
  id: string;
  title: string;
  company: string | null;
  status: OpportunityStatus;
  stage: StageGroup;
  priority: Priority;
  source: Source;
  workplace: Workplace | null;
  location: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  score: number;
  referral: "none" | "requested" | "received";
  hasRecruiter: boolean;
  discoveredAt: string;
  appliedAt: string | null;
  nextAction: string | null;
  nextFollowUpAt: string | null;
  daysInStage: number;
  idleDays: number;
};

const COLUMNS = [
  ["company", "Empresa"],
  ["title", "Puesto"],
  ["status", "Estado"],
  ["priority", "Prioridad"],
  ["score", "Puntuación"],
  ["source", "Fuente"],
  ["workplace", "Modalidad"],
  ["location", "Ubicación"],
  ["salary", "Salario"],
  ["referral", "Recomendación"],
  ["recruiter", "Reclutador"],
  ["daysInStage", "Días en fase"],
  ["appliedAt", "Aplicada"],
  ["nextFollowUpAt", "Seguimiento"],
  ["nextAction", "Próxima acción"],
  ["discoveredAt", "Descubierta"],
] as const;
type ColumnKey = (typeof COLUMNS)[number][0];

const DEFAULT_COLUMNS: ColumnKey[] = ["company", "title", "status", "priority", "score", "source", "daysInStage", "nextFollowUpAt", "nextAction"];
const STORAGE_KEY = "job-search.table.columns";
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

function sortValue(r: TableRow, key: ColumnKey): string | number {
  switch (key) {
    case "salary":
      return r.salaryMax ?? r.salaryMin ?? -1;
    case "priority":
      return PRIORITY_ORDER[r.priority];
    case "referral":
      return { received: 0, requested: 1, none: 2 }[r.referral];
    case "recruiter":
      return r.hasRecruiter ? 0 : 1;
    case "status":
      return Object.keys(STATUS_LABEL).indexOf(r.status);
    case "score":
    case "daysInStage":
      return r[key];
    default:
      return (r[key] ?? "").toString().toLowerCase();
  }
}

const money = (r: TableRow) => {
  if (!r.salaryMin && !r.salaryMax) return "—";
  const k = (n: number) => `${Math.round(n / 1000)}k`;
  const range = r.salaryMin && r.salaryMax ? `${k(r.salaryMin)}–${k(r.salaryMax)}` : k((r.salaryMax ?? r.salaryMin)!);
  return `${range}${r.salaryCurrency ? ` ${r.salaryCurrency}` : ""}`;
};

type Filters = {
  q: string;
  status: string;
  stage: string;
  priority: string;
  source: string;
  company: string;
  location: string;
  minSalary: string;
  referral: string;
  recruiter: string;
  workplace: string;
};

const EMPTY: Filters = { q: "", status: "", stage: "", priority: "", source: "", company: "", location: "", minSalary: "", referral: "", recruiter: "", workplace: "" };

/**
 * Columnas visibles: preferencia de este navegador en localStorage. useSyncExternalStore evita el
 * desajuste de hidratación (el servidor siempre pinta las de por defecto) y si el almacenamiento
 * falla (modo privado, bloqueado) se usan las de por defecto.
 */
const COLUMNS_EVENT = "job-search:columns";
function readColumnsRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}
function writeColumns(next: ColumnKey[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  window.dispatchEvent(new Event(COLUMNS_EVENT));
}
function subscribeColumns(cb: () => void) {
  window.addEventListener(COLUMNS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(COLUMNS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function useStoredColumns(): ColumnKey[] {
  const raw = useSyncExternalStore(subscribeColumns, readColumnsRaw, () => "");
  return useMemo(() => {
    try {
      const saved: unknown = JSON.parse(raw || "null");
      if (Array.isArray(saved)) {
        const valid = COLUMNS.map(([k]) => k).filter((k) => saved.includes(k));
        if (valid.length) return valid;
      }
    } catch {}
    return DEFAULT_COLUMNS;
  }, [raw]);
}

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block space-y-1">
      <span className="font-mono text-[0.7rem] text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="field py-1.5">
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function OpportunityTable({ rows, initial }: { rows: TableRow[]; initial: Partial<Filters> }) {
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, ...initial });
  const [sort, setSort] = useState<{ key: ColumnKey; dir: 1 | -1 }>({ key: "score", dir: -1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const columns = useStoredColumns();
  // Tras una acción bulk correcta se vacía la selección (dentro de la acción, no en un efecto).
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (prev, fd) => {
    const res = await bulkAction(prev, fd);
    if (res.status === "success") setSelected(new Set());
    return res;
  }, idle);
  const toggleColumn = (key: ColumnKey) =>
    writeColumns(columns.includes(key) ? columns.filter((c) => c !== key) : COLUMNS.map(([k]) => k).filter((k) => k === key || columns.includes(k)));

  const set = (k: keyof Filters) => (v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const companies = useMemo(() => [...new Set(rows.map((r) => r.company).filter((c): c is string => !!c))].sort(), [rows]);

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const min = Number(filters.minSalary) || 0;
    return rows
      .filter((r) => {
        if (q && !`${r.title} ${r.company ?? ""} ${r.location ?? ""} ${r.nextAction ?? ""}`.toLowerCase().includes(q)) return false;
        if (filters.status && r.status !== filters.status) return false;
        if (filters.stage && r.stage !== filters.stage) return false;
        if (filters.priority && r.priority !== filters.priority) return false;
        if (filters.source && r.source !== filters.source) return false;
        if (filters.company && r.company !== filters.company) return false;
        if (filters.workplace && r.workplace !== filters.workplace) return false;
        if (filters.location && !(r.location ?? "").toLowerCase().includes(filters.location.toLowerCase())) return false;
        if (min && (r.salaryMax ?? r.salaryMin ?? 0) < min) return false;
        if (filters.referral === "yes" && r.referral === "none") return false;
        if (filters.referral === "received" && r.referral !== "received") return false;
        if (filters.referral === "no" && r.referral !== "none") return false;
        if (filters.recruiter === "yes" && !r.hasRecruiter) return false;
        if (filters.recruiter === "no" && r.hasRecruiter) return false;
        return true;
      })
      .sort((a, b) => {
        const x = sortValue(a, sort.key);
        const y = sortValue(b, sort.key);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [rows, filters, sort]);

  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.id)));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const activeFilters = Object.entries(filters).filter(([, v]) => v).length;

  const cell = (r: TableRow, key: ColumnKey): React.ReactNode => {
    switch (key) {
      case "company":
        return r.company ?? "—";
      case "title":
        return (
          <Link href={`/admin/job-search/opportunities/${r.id}`} className="text-carbon hover:underline">
            {r.title}
          </Link>
        );
      case "status":
        return <StatusBadge status={r.status} />;
      case "priority":
        return <PriorityTag priority={r.priority} />;
      case "score":
        return <span className="font-mono text-carbon">{r.score}</span>;
      case "source":
        return SOURCE_LABEL[r.source];
      case "workplace":
        return r.workplace ? WORKPLACE_LABEL[r.workplace] : "—";
      case "salary":
        return <span className="font-mono text-xs">{money(r)}</span>;
      case "referral":
        return r.referral === "none" ? "—" : r.referral === "received" ? "Recibida" : "Pedida";
      case "recruiter":
        return r.hasRecruiter ? "Sí" : "—";
      case "daysInStage":
        return <span className="font-mono text-xs">{r.daysInStage} d</span>;
      default:
        return r[key] ?? "—";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[14rem] flex-1 space-y-1">
          <span className="font-mono text-[0.7rem] text-slate-500">Buscar</span>
          <input type="search" value={filters.q} onChange={(e) => set("q")(e.target.value)} placeholder="Empresa, puesto, ubicación…" className="field py-1.5" />
        </label>
        <details className="relative">
          <summary className="btn-ghost cursor-pointer list-none">Filtros{activeFilters ? ` · ${activeFilters}` : ""}</summary>
          <div className="panel absolute right-0 z-20 mt-2 grid w-[min(40rem,calc(100vw-2rem))] gap-3 p-4 shadow-lg sm:grid-cols-3">
            <SelectFilter label="Estado" value={filters.status} onChange={set("status")} options={OPTIONS.status()} />
            <SelectFilter label="Fase" value={filters.stage} onChange={set("stage")} options={Object.entries(STAGE_GROUPS).map(([value, g]) => ({ value, label: g.label }))} />
            <SelectFilter label="Prioridad" value={filters.priority} onChange={set("priority")} options={OPTIONS.priority()} />
            <SelectFilter label="Fuente" value={filters.source} onChange={set("source")} options={OPTIONS.source()} />
            <SelectFilter label="Empresa" value={filters.company} onChange={set("company")} options={companies.map((c) => ({ value: c, label: c }))} />
            <SelectFilter label="Modalidad" value={filters.workplace} onChange={set("workplace")} options={OPTIONS.workplace()} />
            <SelectFilter
              label="Recomendación"
              value={filters.referral}
              onChange={set("referral")}
              options={[
                { value: "yes", label: "Con recomendación (pedida o recibida)" },
                { value: "received", label: "Recomendación recibida" },
                { value: "no", label: "Sin recomendación" },
              ]}
            />
            <SelectFilter label="Reclutador" value={filters.recruiter} onChange={set("recruiter")} options={[{ value: "yes", label: "Con reclutador" }, { value: "no", label: "Sin reclutador" }]} />
            <label className="block space-y-1">
              <span className="font-mono text-[0.7rem] text-slate-500">Ubicación</span>
              <input value={filters.location} onChange={(e) => set("location")(e.target.value)} className="field py-1.5" />
            </label>
            <label className="block space-y-1">
              <span className="font-mono text-[0.7rem] text-slate-500">Salario mínimo</span>
              <input type="number" min={0} step={1000} value={filters.minSalary} onChange={(e) => set("minSalary")(e.target.value)} className="field py-1.5" />
            </label>
            <div className="flex items-end sm:col-span-2">
              <button type="button" className="btn-ghost" onClick={() => setFilters(EMPTY)}>
                Limpiar filtros
              </button>
            </div>
          </div>
        </details>
        <details className="relative">
          <summary className="btn-ghost cursor-pointer list-none">Columnas</summary>
          <fieldset className="panel absolute right-0 z-20 mt-2 grid w-64 gap-1.5 p-4 shadow-lg">
            <legend className="sr-only">Columnas visibles</legend>
            {COLUMNS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-slate-800">
                <input type="checkbox" checked={columns.includes(key)} onChange={() => toggleColumn(key)} className="size-3.5 accent-primary" />
                {label}
              </label>
            ))}
          </fieldset>
        </details>
      </div>

      {selected.size ? (
        <form action={formAction} className="panel flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <span className="font-mono text-xs text-slate-600">{selected.size} seleccionadas</span>
          <select name="status" aria-label="Nuevo estado" className="field w-auto py-1" defaultValue="">
            <option value="">Estado…</option>
            {OPTIONS.status().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="submit" name="op" value="status" className="btn-ghost" disabled={pending}>
            Cambiar estado
          </button>
          <select name="priority" aria-label="Nueva prioridad" className="field w-auto py-1" defaultValue="">
            <option value="">Prioridad…</option>
            {OPTIONS.priority().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="submit" name="op" value="priority" className="btn-ghost" disabled={pending}>
            Cambiar prioridad
          </button>
          <button
            type="submit"
            name="op"
            value="delete"
            disabled={pending}
            onClick={(e) => {
              if (!window.confirm(`¿Eliminar ${selected.size} oportunidades con su actividad? No se puede deshacer.`)) e.preventDefault();
            }}
            className="rounded-md px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/5"
          >
            Eliminar
          </button>
          <button type="button" className="ml-auto text-xs text-slate-600 hover:text-carbon" onClick={() => setSelected(new Set())}>
            Deseleccionar
          </button>
        </form>
      ) : null}
      <p role="status" aria-live="polite" className="text-sm">
        {state.status === "success" ? <span className="text-slate-700">{state.message}</span> : null}
        {state.status === "error" ? <span className="text-red-500">{state.message}</span> : null}
      </p>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead>
            <tr className="bg-slate-50 font-mono text-xs text-slate-500">
              <th scope="col" className="w-8 px-4 py-2.5">
                <input type="checkbox" aria-label="Seleccionar todas" checked={allSelected} onChange={toggleAll} className="size-3.5 accent-primary" />
              </th>
              {COLUMNS.filter(([k]) => columns.includes(k)).map(([key, label]) => (
                <th key={key} scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="px-3 py-2.5 font-normal">
                  <button
                    type="button"
                    onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "score" ? -1 : 1 }))}
                    className="inline-flex items-center gap-1 hover:text-carbon"
                  >
                    {label}
                    <span aria-hidden="true">{sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className={`border-t border-slate-200 ${selected.has(r.id) ? "bg-slate-50" : ""}`}>
                <td className="px-4 py-2.5">
                  <input type="checkbox" aria-label={`Seleccionar ${r.title}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="size-3.5 accent-primary" />
                </td>
                {COLUMNS.filter(([k]) => columns.includes(k)).map(([key]) => (
                  <td key={key} className="max-w-[16rem] truncate px-3 py-2.5 text-slate-700">
                    {cell(r, key)}
                  </td>
                ))}
              </tr>
            ))}
            {!visible.length ? (
              <tr>
                <td colSpan={columns.length + 1} className="border-t border-slate-200 px-4 py-6 text-sm text-slate-500">
                  {rows.length ? "Ninguna oportunidad coincide con los filtros." : "Vacío."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="font-mono text-xs text-slate-500">
        {visible.length} de {rows.length}
      </p>
    </div>
  );
}
