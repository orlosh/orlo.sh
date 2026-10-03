import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { Select, TextField } from "@/components/admin/fields";
import { Empty, PageHeader, StatusBadge } from "@/components/admin/job-search/ui";
import { quickAddOpportunityAction, reviewInboxAction } from "@/lib/job-search/actions";
import { relativeDay } from "@/lib/job-search/dates";
import { OPTIONS, SOURCE_LABEL } from "@/lib/job-search/labels";
import { getWorkspace } from "@/lib/job-search/server";
import { INBOX_STATUSES } from "@/lib/job-search/stages";

export const metadata = { title: "Inbox" };

/** Inbox → Review → Qualified / Discarded. Pegar una URL basta para no perder una oferta. */
export default async function InboxPage() {
  const { snapshot: s, engine } = await getWorkspace();
  const items = s.opportunities
    .filter((o) => (INBOX_STATUSES as readonly string[]).includes(o.status))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="space-y-8">
      <PageHeader title="Inbox" count={items.length} description="Guarda ofertas en segundos pegando la URL. Después revísalas: cualificar las pasa al pipeline; descartar las archiva con un motivo." />

      <div className="panel p-4">
        <ActionForm action={quickAddOpportunityAction} submitLabel="Guardar en el inbox" className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
          <TextField name="url" label="URL de la oferta" type="url" placeholder="https://…" />
          <TextField name="companyName" label="Empresa (opcional)" />
          <TextField name="title" label="Puesto (opcional)" />
          <Select name="source" label="Fuente" options={OPTIONS.source()} defaultValue="other" />
        </ActionForm>
      </div>

      {items.length ? (
        <ul className="space-y-3">
          {items.map((o) => {
            const sc = engine.scores.get(o.id);
            return (
              <li key={o.id} className="panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/job-search/opportunities/${o.id}`} className="font-medium text-carbon hover:underline">
                      {o.companyName ? `${o.companyName} · ` : ""}
                      {o.title}
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500">
                      <StatusBadge status={o.status} />
                      {SOURCE_LABEL[o.source]} · guardada {relativeDay(o.discoveredAt, s.today)}
                      {o.url ? (
                        <a href={o.url} target="_blank" rel="noopener noreferrer" className="link">
                          abrir oferta ↗
                        </a>
                      ) : null}
                    </p>
                  </div>
                  <span className="font-mono text-sm text-slate-700" title="Score provisional">
                    score {sc?.score ?? "—"}
                  </span>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-slate-700">Revisar</summary>
                  <div className="mt-3 grid gap-6 md:grid-cols-2">
                    <ActionForm action={reviewInboxAction} hidden={{ id: o.id, decision: "qualify" }} submitLabel="Qualify" className="space-y-3">
                      <TextField name="companyName" label="Empresa" defaultValue={o.companyName} />
                      <TextField name="title" label="Puesto" defaultValue={o.title} />
                      <Select name="priority" label="Prioridad" options={OPTIONS.priority()} defaultValue={o.priority} />
                    </ActionForm>
                    <div className="space-y-6">
                      <ActionForm action={reviewInboxAction} hidden={{ id: o.id, decision: "discard", priority: o.priority }} submitLabel="Discard" className="space-y-3">
                        <TextField name="discardReason" label="Motivo del descarte" placeholder="Seniority, salario, stack…" />
                      </ActionForm>
                      {o.status === "discovered" ? (
                        <ActionForm action={reviewInboxAction} hidden={{ id: o.id, decision: "research", priority: o.priority }} submitLabel="Marcar como Researching" className="space-y-3">
                          <p className="text-xs text-slate-600">Necesitas investigar antes de decidir.</p>
                        </ActionForm>
                      ) : null}
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>Inbox vacío.</Empty>
      )}
    </div>
  );
}
