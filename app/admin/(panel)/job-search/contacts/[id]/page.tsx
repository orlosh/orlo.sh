import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { Checkbox, Select, TextArea, TextField } from "@/components/admin/fields";
import { Notes, TaskFields, TaskList, Timeline } from "@/components/admin/job-search/lists";
import { Badge, Empty, Section, StatusBadge } from "@/components/admin/job-search/ui";
import { deleteContactAction, logInteractionAction, saveContactAction } from "@/lib/job-search/actions";
import { mailto } from "@/lib/job-search/calendar";
import { formatDay, relativeDay } from "@/lib/job-search/dates";
import { CONTACT_KIND_LABEL, CONTACT_STATUS_LABEL, OPTIONS, REFERRAL_STATUS_LABEL } from "@/lib/job-search/labels";
import { editorId } from "@/lib/admin/params";
import * as repo from "@/lib/job-search/repository";
import { db, getSnapshot } from "@/lib/job-search/server";

export const metadata = { title: "Contacto" };

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const id = await editorId(params);
  if (!id) redirect("/admin/job-search/contacts");
  const [data, s] = await Promise.all([repo.getContact(db, id), getSnapshot()]);
  if (!data) notFound();
  const { contact: c, activities, tasks, notes } = data;
  const tz = s.goal.timezone;
  const linkedOpps = c.opportunities.map((l) => ({ value: l.opportunity.id, label: l.opportunity.company ? `${l.opportunity.company.name} · ${l.opportunity.title}` : l.opportunity.title }));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/job-search/contacts" className="font-mono text-xs text-slate-600 hover:text-carbon">
          ← contactos
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">{c.name}</h1>
            <p className="mt-1 text-slate-700">
              {[c.title, c.company?.name].filter(Boolean).join(" · ") || <span className="text-slate-500">Sin cargo ni empresa</span>}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="dark">{CONTACT_KIND_LABEL[c.kind]}</Badge>
              <Badge>{CONTACT_STATUS_LABEL[c.status]}</Badge>
              <span className="font-mono text-xs text-slate-500">
                última interacción {relativeDay(c.lastInteractionAt, s.today)} · seguimiento {relativeDay(c.nextFollowUpAt, s.today)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.linkedinUrl ? (
              <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                LinkedIn ↗
              </a>
            ) : null}
            {c.email ? (
              <a href={mailto(c.email, "", `Hola ${c.name.split(" ")[0]},\n\n`)} className="btn-ghost">
                Escribir
              </a>
            ) : null}
            {c.phone ? (
              <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="btn-ghost">
                Llamar
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Registrar interacción">
          <ActionForm action={logInteractionAction} hidden={{ contactId: c.id }} submitLabel="Registrar" className="panel space-y-4 p-4">
            <Select
              name="direction"
              label="Dirección"
              options={[
                { value: "outbound", label: "Le he escrito / llamado" },
                { value: "inbound", label: "Me ha respondido" },
              ]}
              defaultValue="outbound"
            />
            <TextField name="summary" label="Resumen" required placeholder="Mensaje por LinkedIn sobre la vacante de…" />
            {linkedOpps.length ? <Select name="opportunityId" label="Oportunidad" options={[{ value: "", label: "—" }, ...linkedOpps]} /> : null}
            <Checkbox name="createFollowUp" label={`Crear un seguimiento a ${s.goal.followupRecruiterDays} días laborables (solo si escribes tú)`} defaultChecked />
          </ActionForm>
        </Section>

        <Section title="Oportunidades y recomendaciones">
          {c.opportunities.length ? (
            <ul className="panel divide-y divide-slate-200">
              {c.opportunities.map(({ opportunity: o, role }) => (
                <li key={o.id}>
                  <Link href={`/admin/job-search/opportunities/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-carbon">{o.company ? `${o.company.name} · ${o.title}` : o.title}</span>
                      <span className="block text-xs text-slate-600">{CONTACT_KIND_LABEL[role]}</span>
                    </span>
                    <StatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No está vinculado a ninguna oportunidad.</Empty>
          )}
          {c.referrals.length ? (
            <ul className="panel divide-y divide-slate-200">
              {c.referrals.map((r) => (
                <li key={r.id} className="px-4 py-2.5 text-sm">
                  Recomendación para{" "}
                  <Link href={`/admin/job-search/opportunities/${r.opportunityId}?tab=contacts`} className="link">
                    {r.opportunity.title}
                  </Link>{" "}
                  · {REFERRAL_STATUS_LABEL[r.status]} · {formatDay(r.requestedAt)}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Section title="Tareas">
          <TaskList tasks={tasks} today={s.today} />
          <details className="panel p-4">
            <summary className="cursor-pointer text-sm text-carbon">Nueva tarea</summary>
            <div className="mt-4">
              <TaskFields refs={{ contactId: c.id }} today={s.today} />
            </div>
          </details>
        </Section>
        <Section title="Actividad">
          <Timeline activities={activities} timezone={tz} today={s.today} />
        </Section>
      </div>

      <Section title="Notas">
        <Notes notes={notes} refs={{ contactId: c.id }} timezone={tz} today={s.today} />
      </Section>

      <details className="panel p-4">
        <summary className="cursor-pointer font-medium text-carbon">Editar contacto</summary>
        <div className="mt-6">
          <ActionForm action={saveContactAction} hidden={{ id: c.id }} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <TextField name="name" label="Nombre" defaultValue={c.name} required />
            <TextField name="companyName" label="Empresa" defaultValue={c.company?.name} />
            <TextField name="title" label="Cargo" defaultValue={c.title} />
            <Select name="kind" label="Tipo" options={OPTIONS.contactKind()} defaultValue={c.kind} />
            <Select name="status" label="Estado" options={OPTIONS.contactStatus()} defaultValue={c.status} />
            <TextField name="relationship" label="Relación" defaultValue={c.relationship} />
            <TextField name="linkedinUrl" label="LinkedIn" type="url" defaultValue={c.linkedinUrl} />
            <TextField name="email" label="Correo" type="email" defaultValue={c.email} />
            <TextField name="phone" label="Teléfono" type="tel" defaultValue={c.phone} />
            <TextField name="lastInteractionAt" label="Última interacción" type="date" defaultValue={c.lastInteractionAt} />
            <TextField name="nextFollowUpAt" label="Próximo seguimiento" type="date" defaultValue={c.nextFollowUpAt} />
            <div className="md:col-span-3">
              <TextArea name="notes" label="Notas del contacto" rows={3} defaultValue={c.notes} />
            </div>
          </ActionForm>
        </div>
        <div className="mt-8 border-t border-slate-200 pt-6">
          <DeleteButton action={deleteContactAction} hidden={{ id: c.id }} />
        </div>
      </details>
    </div>
  );
}
