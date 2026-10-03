import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { Select, TextField } from "@/components/admin/fields";
import { ActionButton } from "@/components/admin/job-search/ActionButton";
import { Empty, PageHeader, StatusBadge } from "@/components/admin/job-search/ui";
import { quickAddOpportunityAction, reviewInboxAction } from "@/lib/job-search/actions";
import { relativeDay } from "@/lib/job-search/dates";
import { OPTIONS, SOURCE_LABEL } from "@/lib/job-search/labels";
import { getWorkspace } from "@/lib/job-search/server";
import { INBOX_STATUSES } from "@/lib/job-search/stages";

export const metadata = { title: "Bandeja" };

/** Bandeja → revisión → cualificada o descartada. Pegar una URL basta para no perder una oferta. */
export default async function InboxPage() {
  const { snapshot: s, engine } = await getWorkspace();
  const items = s.opportunities
    .filter((o) => (INBOX_STATUSES as readonly string[]).includes(o.status))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div className="space-y-8">
      <PageHeader title="Bandeja" count={items.length} description="Guarda ofertas en segundos pegando la URL y decide después: cualificar la pasa al tablero; descartar la archiva." />

      <div className="panel p-4">
        <ActionForm action={quickAddOpportunityAction} submitLabel="Guardar en la bandeja" className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr_1fr_1fr] md:items-end">
          <TextField name="url" label="URL de la oferta" type="url" placeholder="https://…" />
          <TextField name="companyName" label="Empresa (opcional)" />
          <TextField name="title" label="Puesto (opcional)" />
          <Select name="source" label="Fuente" options={OPTIONS.source()} defaultValue="other" />
        </ActionForm>
      </div>

      {items.length ? (
        <ul className="panel divide-y divide-slate-200">
          {items.map((o) => {
            const sc = engine.scores.get(o.id);
            return (
              <li key={o.id} className="px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/admin/job-search/opportunities/${o.id}`} className="font-medium text-carbon hover:underline">
                      {o.companyName ? `${o.companyName} · ` : ""}
                      {o.title}
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                      <StatusBadge status={o.status} />
                      <span>{SOURCE_LABEL[o.source]}</span>
                      <span>· guardada {relativeDay(o.discoveredAt, s.today)}</span>
                      <span>· puntuación {sc?.score ?? "—"}</span>
                      {o.url ? (
                        <a href={o.url} target="_blank" rel="noopener noreferrer" className="link">
                          ver oferta ↗
                        </a>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <ActionButton action={reviewInboxAction} hidden={{ id: o.id, decision: "qualify", priority: o.priority }} label="Cualificar" variant="primary" />
                    {o.status === "discovered" ? (
                      <ActionButton action={reviewInboxAction} hidden={{ id: o.id, decision: "research", priority: o.priority }} label="Investigar" />
                    ) : null}
                    <ActionButton action={reviewInboxAction} hidden={{ id: o.id, decision: "discard", priority: o.priority }} label="Descartar" variant="link" />
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-600 hover:text-carbon">Completar datos antes de decidir</summary>
                  <div className="mt-3 grid gap-6 md:grid-cols-2">
                    <ActionForm action={reviewInboxAction} hidden={{ id: o.id, decision: "qualify" }} submitLabel="Guardar y cualificar" className="space-y-3">
                      <TextField name="companyName" label="Empresa" defaultValue={o.companyName} />
                      <TextField name="title" label="Puesto" defaultValue={o.title} />
                      <Select name="priority" label="Prioridad" options={OPTIONS.priority()} defaultValue={o.priority} />
                    </ActionForm>
                    <ActionForm action={reviewInboxAction} hidden={{ id: o.id, decision: "discard", priority: o.priority }} submitLabel="Descartar con motivo" className="space-y-3">
                      <TextField name="discardReason" label="Motivo del descarte" placeholder="Nivel, salario, tecnologías…" />
                    </ActionForm>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty>Bandeja vacía: todo revisado.</Empty>
      )}
    </div>
  );
}
