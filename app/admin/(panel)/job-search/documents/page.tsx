import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { Checkbox, Select, TextArea, TextField } from "@/components/admin/fields";
import { Badge, Empty, PageHeader, Section } from "@/components/admin/job-search/ui";
import type { jobDocuments } from "@/db/schema";
import { deleteDocumentAction, saveDocumentAction } from "@/lib/job-search/actions";
import { formatDay } from "@/lib/job-search/dates";
import { DOCUMENT_KIND_LABEL, OPTIONS, STATUS_LABEL } from "@/lib/job-search/labels";
import { listDocuments } from "@/lib/job-search/repository";
import { db } from "@/lib/job-search/server";

export const metadata = { title: "Documents" };

function DocumentFields({ d }: { d?: typeof jobDocuments.$inferSelect }) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Select name="kind" label="Tipo" options={OPTIONS.documentKind()} defaultValue={d?.kind ?? "cv"} />
        <TextField name="name" label="Nombre" defaultValue={d?.name} required />
        <TextField name="version" label="Versión" defaultValue={d?.version} placeholder="v3 · backend" />
        <TextField name="url" label="URL" type="url" defaultValue={d?.url} hint="Drive, Notion… (https)" />
      </div>
      <TextArea name="content" label="Texto (para CV matching)" rows={8} defaultValue={d?.content} hint="Pega el texto del CV: cada línea se evalúa contra la Job Description. Se queda en tu base de datos." />
      <TextArea name="notes" label="Notas" rows={2} defaultValue={d?.notes} />
      {d ? <Checkbox name="archived" label="Archivado (ya no se ofrece al registrar candidaturas)" defaultChecked={d.archived} /> : null}
    </>
  );
}

export default async function DocumentsPage() {
  const docs = await listDocuments(db);
  return (
    <div className="space-y-8">
      <PageHeader title="Documents" count={docs.length} description="CVs, cover letters, versiones del portfolio, case studies y referencias. Cada candidatura registra qué versión enviaste." />
      {docs.length ? (
        <ul className="space-y-3">
          {docs.map((d) => (
            <li key={d.id} className={`panel p-4 ${d.archived ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge tone="dark">{DOCUMENT_KIND_LABEL[d.kind]}</Badge>
                    <span className="text-carbon">{d.name}</span>
                    {d.version ? <span className="font-mono text-xs text-slate-500">{d.version}</span> : null}
                    {d.archived ? <Badge tone="muted">archivado</Badge> : null}
                    {d.content ? <Badge tone="muted">texto para matching</Badge> : null}
                  </p>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="link mt-1 inline-block text-sm">
                      Abrir ↗
                    </a>
                  ) : null}
                </div>
                <span className="font-mono text-xs text-slate-500">
                  {d.usages.length} candidatura{d.usages.length === 1 ? "" : "s"}
                </span>
              </div>
              {d.usages.length ? (
                <ul className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
                  {d.usages.map((u) => (
                    <li key={u.opportunityId} className="flex flex-wrap justify-between gap-2">
                      <Link href={`/admin/job-search/opportunities/${u.opportunityId}?tab=documents`} className="link">
                        {u.companyName ? `${u.companyName} · ${u.title}` : u.title}
                      </Link>
                      <span className="font-mono text-xs text-slate-500">
                        {formatDay(u.usedAt)} · {STATUS_LABEL[u.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-slate-700">Editar</summary>
                <div className="mt-4 space-y-4">
                  <ActionForm action={saveDocumentAction} hidden={{ id: d.id }}>
                    <DocumentFields d={d} />
                  </ActionForm>
                  <DeleteButton
                    action={deleteDocumentAction}
                    hidden={{ id: d.id }}
                    confirmText={d.usages.length ? "Este documento se usó en candidaturas: archívalo en lugar de borrarlo. ¿Intentar borrar igualmente?" : "¿Eliminar el documento?"}
                  />
                </div>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Sin documentos todavía.</Empty>
      )}
      <Section title="Nuevo documento">
        <div className="panel p-4">
          <ActionForm action={saveDocumentAction} submitLabel="Añadir">
            <DocumentFields />
          </ActionForm>
        </div>
      </Section>
    </div>
  );
}
