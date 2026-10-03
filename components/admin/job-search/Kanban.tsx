"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { idle } from "@/lib/admin/form";
import { changeStatusAction } from "@/lib/job-search/actions";
import { relativeDay } from "@/lib/job-search/dates";
import type { InterviewKind, OpportunityStatus } from "@/lib/job-search/enums";
import { INTERVIEW_KIND_LABEL, OPTIONS } from "@/lib/job-search/labels";
import { BOARD_COLUMNS } from "@/lib/job-search/stages";
import type { KanbanCard } from "@/lib/job-search/views";
import { PriorityTag } from "./ui";

type Column = (typeof BOARD_COLUMNS)[number];
const columnOf = (status: OpportunityStatus) => BOARD_COLUMNS.find((c) => (c.statuses as readonly string[]).includes(status))!;

/** Lo más urgente de una tarjeta en una sola línea: entrevista, seguimiento o próxima acción. */
function nextLine(c: KanbanCard, today: string): { text: string; urgent: boolean } | null {
  if (c.interview) return { text: `${INTERVIEW_KIND_LABEL[c.interview.kind as InterviewKind]} ${relativeDay(c.interview.at, today)}`, urgent: c.interview.at <= today };
  if (c.nextFollowUpAt) return { text: `Seguimiento ${relativeDay(c.nextFollowUpAt, today)}`, urgent: c.nextFollowUpAt <= today };
  if (c.nextAction) return { text: c.nextAction, urgent: false };
  return null;
}

/**
 * Tablero por fases con arrastrar y soltar nativo. El cambio se ve al instante (useOptimistic)
 * y el servidor aplica las automatizaciones del nuevo estado. En móvil y con teclado, cada
 * tarjeta tiene su selector de estado: arrastrar nunca es la única vía.
 */
export function Kanban({ cards, today }: { cards: KanbanCard[]; today: string }) {
  const [showClosed, setShowClosed] = useState(false);
  const [over, setOver] = useState<string | null>(null);
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

  const dropInto = (col: Column, id: string) => {
    const card = optimistic.find((c) => c.id === id);
    // Dentro de la misma fase no se toca el estado: eso se hace con el selector.
    if (!card || !col.drop || columnOf(card.status).key === col.key) return;
    changeStatus(id, col.drop);
  };

  const columns = BOARD_COLUMNS.filter((c) => showClosed || c.key !== "closed");
  const closedCount = optimistic.filter((c) => columnOf(c.status).key === "closed").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-600">Arrastra una tarjeta a otra fase o cambia su estado con el selector.</p>
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
      {/* relative: los textos sr-only (posición absoluta) se quedan dentro del scroll. */}
      <div className="relative -mx-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        {/* En escritorio las fases reparten el ancho; en pantallas estrechas se desplazan. */}
        <div className={`flex min-w-max gap-3 lg:grid lg:min-w-0 ${showClosed ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
          {columns.map((col) => {
            const list = optimistic.filter((c) => columnOf(c.status).key === col.key).sort((a, b) => b.score - a.score);
            const droppable = !!col.drop;
            return (
              <section
                key={col.key}
                aria-label={col.label}
                onDragOver={(e) => {
                  if (!droppable) return;
                  e.preventDefault();
                  setOver(col.key);
                }}
                onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  dropInto(col, e.dataTransfer.getData("text/plain"));
                }}
                className={`flex w-64 shrink-0 flex-col rounded-lg border lg:w-auto lg:min-w-0 bg-slate-50 transition-colors ${over === col.key ? "border-carbon bg-white" : "border-slate-200"}`}
              >
                <h2 className="flex items-baseline justify-between px-3 py-2.5">
                  <span className="text-sm font-medium text-carbon">{col.label}</span>
                  <span className="font-mono text-xs text-slate-500">{list.length}</span>
                </h2>
                <ul className="flex min-h-28 flex-1 flex-col gap-2 px-2 pb-2">
                  {list.map((c) => {
                    const line = nextLine(c, today);
                    return (
                      <li
                        key={c.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", c.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        className="cursor-grab rounded-md border border-slate-200 bg-white p-3 active:cursor-grabbing"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/admin/job-search/opportunities/${c.id}`} className="min-w-0 text-sm hover:underline">
                            <span className="block truncate font-medium text-carbon">{c.company ?? "Sin empresa"}</span>
                            <span className="block truncate text-slate-700">{c.title}</span>
                          </Link>
                          <span className="shrink-0 font-mono text-xs text-slate-600" title="Puntuación">
                            {c.score}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <PriorityTag priority={c.priority} />
                          <span className="text-[0.7rem] text-slate-500">{c.daysInStage} d en esta fase</span>
                          {c.referral !== "none" ? <span className="text-[0.7rem] text-slate-500">· recomendación {c.referral === "received" ? "recibida" : "pedida"}</span> : null}
                        </div>
                        {line ? <p className={`mt-1.5 truncate text-xs ${line.urgent ? "font-medium text-carbon" : "text-slate-600"}`}>{line.text}</p> : null}
                        <label className="mt-2 block">
                          <span className="sr-only">Estado de {c.company ?? c.title}</span>
                          <select
                            value={c.status}
                            onChange={(e) => changeStatus(c.id, e.target.value as OpportunityStatus)}
                            className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 hover:border-slate-300"
                          >
                            {OPTIONS.status().map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </li>
                    );
                  })}
                  {!list.length ? <li className="px-1 py-3 text-xs text-slate-500">{droppable ? "Suelta aquí" : "Vacía"}</li> : null}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
