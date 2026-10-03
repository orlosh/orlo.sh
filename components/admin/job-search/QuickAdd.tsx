"use client";

import { useRef, useState } from "react";
import { ActionForm } from "@/components/admin/ActionForm";
import { Select, TextArea, TextField } from "@/components/admin/fields";
import { addNoteAction, quickAddOpportunityAction, saveContactAction, saveInterviewAction, saveTaskAction } from "@/lib/job-search/actions";
import { OPTIONS } from "@/lib/job-search/labels";

type Opt = { value: string; label: string };
const KINDS = [
  ["opportunity", "Opportunity"],
  ["contact", "Contact"],
  ["task", "Task"],
  ["interview", "Interview"],
  ["note", "Note"],
] as const;
type Kind = (typeof KINDS)[number][0];

/**
 * Acciones rápidas en un <dialog> nativo (foco atrapado, Escape para cerrar, sin librerías).
 * Pensado también para el móvil: un formulario corto por tipo.
 */
export function QuickAdd({ opportunities, contacts, today }: { opportunities: Opt[]; contacts: Opt[]; today: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind>("opportunity");
  // El contenido solo existe con el diálogo abierto: sin etiquetas duplicadas en la página.
  const [open, setOpen] = useState(false);
  const oppOptions = [{ value: "", label: "— Ninguna —" }, ...opportunities];

  return (
    <>
      <button
        type="button"
        className="btn shrink-0 whitespace-nowrap"
        onClick={() => {
          setOpen(true);
          ref.current?.showModal();
        }}
      >
        <span aria-hidden="true">+</span> Quick add
      </button>
      <dialog
        ref={ref}
        aria-labelledby="quick-add-title"
        onClose={() => setOpen(false)}
        className="m-auto w-[min(34rem,calc(100%-2rem))] rounded-lg border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-carbon/40"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 id="quick-add-title" className="font-medium text-carbon">
            Quick add
          </h2>
          <button type="button" onClick={() => ref.current?.close()} className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100" aria-label="Cerrar">
            ✕
          </button>
        </div>
        {open ? (
          <>
            <div className="px-5 pt-4">
              <div role="tablist" aria-label="Qué añadir" className="inline-flex flex-wrap rounded-md border border-slate-200 bg-white p-0.5 font-mono text-xs">
                {KINDS.map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={kind === k}
                    onClick={() => setKind(k)}
                    className={`rounded px-2.5 py-1 ${kind === k ? "bg-slate-100 text-carbon" : "text-slate-600 hover:text-carbon"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[70dvh] overflow-y-auto px-5 py-4">
              {kind === "opportunity" ? (
                <ActionForm action={quickAddOpportunityAction} submitLabel="Guardar" hidden={{ next: "/admin/job-search/opportunities/:id" }}>
                  <TextField name="url" label="URL de la oferta" type="url" placeholder="https://…" hint="Se deducen la fuente y, si se puede, la empresa." />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField name="companyName" label="Empresa" />
                    <TextField name="title" label="Puesto" />
                    <Select name="source" label="Fuente" options={OPTIONS.source()} defaultValue="other" />
                    <Select name="priority" label="Prioridad" options={OPTIONS.priority()} defaultValue="medium" />
                  </div>
                  <Select name="status" label="Estado" options={OPTIONS.status()} defaultValue="discovered" />
                </ActionForm>
              ) : null}
              {kind === "contact" ? (
                <ActionForm action={saveContactAction} submitLabel="Añadir contacto" hidden={{ stay: "true" }}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField name="name" label="Nombre" required />
                    <TextField name="companyName" label="Empresa" />
                    <Select name="kind" label="Tipo" options={OPTIONS.contactKind()} defaultValue="recruiter" />
                    <TextField name="title" label="Cargo" />
                  </div>
                  <TextField name="linkedinUrl" label="LinkedIn" type="url" placeholder="https://www.linkedin.com/in/…" />
                  <TextField name="email" label="Email" type="email" />
                  <Select name="opportunityId" label="Vincular a oportunidad" options={oppOptions} />
                </ActionForm>
              ) : null}
              {kind === "task" ? (
                <ActionForm action={saveTaskAction} submitLabel="Crear tarea">
                  <TextField name="title" label="Tarea" required />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Select name="kind" label="Tipo" options={OPTIONS.taskKind()} defaultValue="other" />
                    <TextField name="dueDate" label="Fecha" type="date" defaultValue={today} />
                    <Select name="priority" label="Prioridad" options={OPTIONS.priority()} defaultValue="medium" />
                  </div>
                  <Select name="opportunityId" label="Oportunidad" options={oppOptions} />
                  <Select name="contactId" label="Contacto" options={[{ value: "", label: "— Ninguno —" }, ...contacts]} />
                </ActionForm>
              ) : null}
              {kind === "interview" ? (
                opportunities.length ? (
                  <ActionForm action={saveInterviewAction} submitLabel="Programar">
                    <Select name="opportunityId" label="Oportunidad" options={opportunities} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Select name="kind" label="Tipo" options={OPTIONS.interviewKind()} defaultValue="recruiter_screen" />
                      <TextField name="scheduledLocal" label="Fecha y hora" type="datetime-local" hint="En tu zona horaria (Ajustes)." />
                    </div>
                    <TextField name="meetingUrl" label="Enlace de la reunión" type="url" placeholder="https://…" />
                    <TextField name="interviewerName" label="Entrevistador" />
                  </ActionForm>
                ) : (
                  <p className="text-sm text-slate-600">Primero añade una oportunidad.</p>
                )
              ) : null}
              {kind === "note" ? (
                <ActionForm action={addNoteAction} submitLabel="Guardar nota">
                  <TextArea name="body" label="Nota" rows={5} />
                  <Select name="opportunityId" label="Oportunidad" options={oppOptions} />
                </ActionForm>
              ) : null}
            </div>
          </>
        ) : null}
      </dialog>
    </>
  );
}
