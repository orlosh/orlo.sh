import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/admin/ActionForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { Checkbox, Select, TextArea, TextField } from "@/components/admin/fields";
import { AiButton } from "@/components/admin/job-search/ai";
import { CompanyResearchCard } from "@/components/admin/job-search/AiResults";
import { Notes } from "@/components/admin/job-search/lists";
import { researchCompanyAction } from "@/lib/ai/actions";
import { getAiSettings } from "@/lib/ai/store";
import { Badge, Empty, Section, StatusBadge } from "@/components/admin/job-search/ui";
import { deleteCompanyAction, saveCompanyAction } from "@/lib/job-search/actions";
import { relativeDay } from "@/lib/job-search/dates";
import { CONTACT_KIND_LABEL, CONTACT_STATUS_LABEL, OPTIONS, TIER_LABEL } from "@/lib/job-search/labels";
import { editorId } from "@/lib/admin/params";
import * as repo from "@/lib/job-search/repository";
import { db, getSnapshot } from "@/lib/job-search/server";

export const metadata = { title: "Empresa" };

const INTEREST = [{ value: "", label: "—" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}/5` }))];

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const id = await editorId(params);
  if (!id) redirect("/admin/job-search/companies");
  const [data, s, ai] = await Promise.all([repo.getCompany(db, id), getSnapshot(), getAiSettings(db)]);
  if (!data) notFound();
  const { company: c, opportunities, contacts, notes } = data;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/job-search/companies" className="font-mono text-xs text-slate-600 hover:text-carbon">
          ← empresas
        </Link>
        <h1 className="page-title mt-3">{c.name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          {c.tier ? <Badge tone="dark">{TIER_LABEL[c.tier]}</Badge> : null}
          {c.interest ? <Badge>Interés {c.interest}/5</Badge> : null}
          {c.industry ? <Badge tone="muted">{c.industry}</Badge> : null}
          {c.website ? (
            <a href={c.website} target="_blank" rel="noopener noreferrer" className="link text-sm">
              Web ↗
            </a>
          ) : null}
          {c.careersUrl ? (
            <a href={c.careersUrl} target="_blank" rel="noopener noreferrer" className="link text-sm">
              Empleo ↗
            </a>
          ) : null}
        </p>
        {c.nextAction ? (
          <p className="mt-2 text-sm text-slate-700">
            Próxima acción: {c.nextAction}
            {c.nextActionAt ? ` · ${relativeDay(c.nextActionAt, s.today)}` : ""}
          </p>
        ) : null}
      </div>

      <Section
        title="Investigación (IA)"
        action={
          <AiButton
            action={researchCompanyAction}
            hidden={{ id: c.id }}
            label={c.aiResearch ? "Actualizar investigación" : "Investigar con IA"}
            pendingLabel="Buscando en la web…"
            disabled={!ai.enabled ? "Activa la IA en Ajustes → Inteligencia artificial" : undefined}
          />
        }
      >
        {c.aiResearch ? (
          <CompanyResearchCard research={c.aiResearch as Parameters<typeof CompanyResearchCard>[0]["research"]} />
        ) : (
          <Empty>Producto, tamaño, financiación, noticias, señales de contratación o despidos y lo que se sabe de su proceso de selección, con las fuentes.</Empty>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Section title={`Oportunidades · ${opportunities.length}`}>
          {opportunities.length ? (
            <ul className="panel divide-y divide-slate-200">
              {opportunities.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/job-search/opportunities/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
                    <span className="truncate text-sm text-carbon">{o.title}</span>
                    <StatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Sin oportunidades en esta empresa.</Empty>
          )}
        </Section>
        <Section title={`Contactos · ${contacts.length}`}>
          {contacts.length ? (
            <ul className="panel divide-y divide-slate-200">
              {contacts.map((k) => (
                <li key={k.id}>
                  <Link href={`/admin/job-search/contacts/${k.id}`} className="block px-4 py-2.5 hover:bg-slate-50">
                    <span className="block text-sm text-carbon">{k.name}</span>
                    <span className="block text-xs text-slate-600">
                      {CONTACT_KIND_LABEL[k.kind]} · {CONTACT_STATUS_LABEL[k.status]}
                      {k.title ? ` · ${k.title}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nadie conocido aquí: busca a alguien de dentro o a un reclutador para pedir una recomendación.</Empty>
          )}
        </Section>
      </div>

      <Section title="Notas">
        <Notes notes={notes} refs={{ companyId: c.id }} timezone={s.goal.timezone} today={s.today} />
      </Section>

      <details className="panel p-4">
        <summary className="cursor-pointer font-medium text-carbon">Editar empresa</summary>
        <div className="mt-6">
          <ActionForm action={saveCompanyAction} hidden={{ id: c.id }} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <TextField name="name" label="Nombre" defaultValue={c.name} required />
            <Select name="tier" label="Categoría" options={OPTIONS.tier("—")} defaultValue={c.tier} />
            <Select name="interest" label="Interés" options={INTEREST} defaultValue={c.interest?.toString()} />
            <TextField name="website" label="Web" type="url" defaultValue={c.website} />
            <TextField name="careersUrl" label="Página de empleo" type="url" defaultValue={c.careersUrl} />
            <TextField name="industry" label="Sector" defaultValue={c.industry} />
            <TextField name="nextAction" label="Próxima acción" defaultValue={c.nextAction} />
            <TextField name="nextActionAt" label="Fecha" type="date" defaultValue={c.nextActionAt} />
            <div className="flex items-end pb-2">
              <Checkbox name="archived" label="Archivada" defaultChecked={c.archived} />
            </div>
            <div className="md:col-span-3">
              <TextArea name="notes" label="Notas de la empresa" rows={4} defaultValue={c.notes} />
            </div>
          </ActionForm>
        </div>
        <div className="mt-8 border-t border-slate-200 pt-6">
          <DeleteButton action={deleteCompanyAction} hidden={{ id: c.id }} confirmText="¿Eliminar la empresa? Sus oportunidades y contactos se conservan sin empresa." />
        </div>
      </details>
    </div>
  );
}
