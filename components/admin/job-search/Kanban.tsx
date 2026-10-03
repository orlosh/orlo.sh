"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { idle } from "@/lib/admin/form";
import { changeStatusAction } from "@/lib/job-search/actions";
import { relativeDay } from "@/lib/job-search/dates";
import { OPPORTUNITY_STATUSES, type OpportunityStatus } from "@/lib/job-search/enums";
import { INTERVIEW_KIND_LABEL, OPTIONS, STATUS_LABEL } from "@/lib/job-search/labels";
import { CLOSED_STATUSES } from "@/lib/job-search/stages";
import type { KanbanCard } from "@/lib/job-search/views";
import { PriorityTag } from "./ui";

const OPEN = OPPORTUNITY_STATUSES.filter((s) => !(CLOSED_STATUSES as readonly string[]).includes(s));

/**
 * Kanban con arrastrar y soltar nativo (HTML5). El cambio se ve al instante (useOptimistic) y
 * el servidor aplica las automatizaciones del nuevo estado. En móvil y con teclado, cada
 * tarjeta tiene además un selector de estado: el drag & drop no es la única vía.
 */
export function Kanban({ cards, today }: { cards: KanbanCard[]; today: string }) {
  const [showClosed, setShowClosed] = useState(false);
  const [over, setOver] = useState<OpportunityStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimistic, move] = useOptimistic(cards, (state, { id, status }: { id: string; status: OpportunityStatus }) =>
    state.map((c) => (c.id === id ? { ...c, status, daysInStage: 0 } : c)),
  );

  const changeStatus = (id: string, status: OpportunityStatus) => {
    const card = optimistic.find((c) => c.id === id);
    if (!card || card.status === status) return;
    setError(null);
    startTransition(async () => {
      move({ id, status });
      const fd = new FormData();
      fd.append("ids", id);
      fd.set("status", status);
      const res = await changeStatusAction(idle, fd);
      if (res.status === "error") setError(res.message);
    });
  };

  const columns = showClosed ? [...OPEN, ...CLOSED_STATUSES] : OPEN;
  const closedCount = optimistic.filter((c) => (CLOSED_STATUSES as readonly string[]).includes(c.status)).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-600">Arrastra una tarjeta a otra columna, o usa su selector de estado.</p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="size-3.5 accent-primary" />
          Mostrar cerradas ({closedCount})
        </label>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      ) : null}
      <div className="-mx-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        <div className="flex min-w-max gap-3">
          {columns.map((status) => {
            const list = optimistic.filter((c) => c.status === status).sort((a, b) => b.score - a.score);
            return (
              <section
                key={status}
                aria-label={STATUS_LABEL[status]}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(status);
                }}
                onDragLeave={() => setOver((o) => (o === status ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  changeStatus(e.dataTransfer.getData("text/plain"), status);
                }}
                className={`flex w-64 shrink-0 flex-col rounded-lg border bg-slate-50 transition-colors ${over === status ? "border-carbon" : "border-slate-200"}`}
              >
                <h2 className="flex items-center justify-between px-3 py-2.5 font-mono text-xs text-slate-600">
                  {STATUS_LABEL[status]}
                  <span className="text-slate-500">{list.length}</span>
                </h2>
                <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                  {list.map((c) => (
                    <li
                      key={c.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", c.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className="cursor-grab rounded-md border border-slate-200 bg-white p-3 shadow-xs active:cursor-grabbing"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/admin/job-search/opportunities/${c.id}`} className="min-w-0 text-sm text-carbon hover:underline">
                          <span className="block truncate font-medium">{c.company ?? "Sin empresa"}</span>
                          <span className="block truncate text-slate-700">{c.title}</span>
                        </Link>
                        <span className="shrink-0 font-mono text-xs text-slate-600" title="Score">
                          {c.score}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <PriorityTag priority={c.priority} />
                        <span className="font-mono text-[0.7rem] text-slate-500">{c.daysInStage} d en fase</span>
                      </div>
                      <dl className="mt-2 space-y-0.5 text-xs text-slate-600">
                        {c.nextAction ? (
                          <div className="truncate">
                            <dt className="inline text-slate-500">Próx.: </dt>
                            <dd className="inline">{c.nextAction}</dd>
                          </div>
                        ) : null}
                        {c.nextFollowUpAt ? (
                          <div>
                            <dt className="inline text-slate-500">Follow-up: </dt>
                            <dd className={`inline ${c.nextFollowUpAt < today ? "font-medium text-carbon" : ""}`}>{relativeDay(c.nextFollowUpAt, today)}</dd>
                          </div>
                        ) : null}
                        {c.referral !== "none" ? (
                          <div>
                            <dt className="inline text-slate-500">Referral: </dt>
                            <dd className="inline">{c.referral === "received" ? "recibido" : "solicitado"}</dd>
                          </div>
                        ) : null}
                        {c.interview ? (
                          <div>
                            <dt className="inline text-slate-500">Entrevista: </dt>
                            <dd className="inline">
                              {INTERVIEW_KIND_LABEL[c.interview.kind as keyof typeof INTERVIEW_KIND_LABEL]} {relativeDay(c.interview.at, today)}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      <select
                        aria-label={`Estado de ${c.company ?? c.title}`}
                        value={c.status}
                        onChange={(e) => changeStatus(c.id, e.target.value as OpportunityStatus)}
                        className="field mt-2 py-1 text-xs"
                      >
                        {OPTIONS.status().map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
