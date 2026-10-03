import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { Select, TextField } from "@/components/admin/fields";
import { Empty, Muted, PageHeader, Section, Table, td } from "@/components/admin/job-search/ui";
import { saveContactAction } from "@/lib/job-search/actions";
import { relativeDay } from "@/lib/job-search/dates";
import { CONTACT_KIND_LABEL, CONTACT_STATUS_LABEL, OPTIONS } from "@/lib/job-search/labels";
import * as repo from "@/lib/job-search/repository";
import { db, getSnapshot } from "@/lib/job-search/server";

export const metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  const [s, rows] = await Promise.all([getSnapshot(), repo.listContacts(db)]);
  const list = sp.kind ? rows.filter((r) => r.c.kind === sp.kind) : rows;
  return (
    <div className="space-y-8">
      <PageHeader title="Contacts" count={rows.length} description="CRM de recruiters, hiring managers, referrals y red personal." />
      <nav aria-label="Filtrar por tipo" className="flex flex-wrap gap-1.5">
        <Link href="/admin/job-search/contacts" className={`rounded-full px-2.5 py-1 font-mono text-xs ${!sp.kind ? "bg-carbon text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
          Todos
        </Link>
        {OPTIONS.contactKind().map((o) => (
          <Link
            key={o.value}
            href={`/admin/job-search/contacts?kind=${o.value}`}
            className={`rounded-full px-2.5 py-1 font-mono text-xs ${sp.kind === o.value ? "bg-carbon text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            {o.label} <span className="opacity-70">{rows.filter((r) => r.c.kind === o.value).length}</span>
          </Link>
        ))}
      </nav>
      {list.length ? (
        <Table head={["Nombre", "Empresa", "Tipo", "Estado", "Última interacción", "Próximo follow-up"]} minWidth="44rem">
          {list.map(({ c, companyName }) => (
            <tr key={c.id}>
              <td className={td}>
                <Link href={`/admin/job-search/contacts/${c.id}`} className="text-carbon hover:underline">
                  {c.name}
                </Link>
                {c.title ? <span className="block text-xs text-slate-500">{c.title}</span> : null}
              </td>
              <td className={td}>{companyName ?? "—"}</td>
              <td className={td}>{CONTACT_KIND_LABEL[c.kind]}</td>
              <td className={td}>{CONTACT_STATUS_LABEL[c.status]}</td>
              <td className={td}>
                <Muted>{relativeDay(c.lastInteractionAt, s.today)}</Muted>
              </td>
              <td className={td}>
                <span className={`font-mono text-xs ${c.nextFollowUpAt && c.nextFollowUpAt < s.today ? "font-semibold text-carbon" : "text-slate-500"}`}>{relativeDay(c.nextFollowUpAt, s.today)}</span>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty>Sin contactos.</Empty>
      )}
      <Section title="Nuevo contacto">
        <ActionForm action={saveContactAction} submitLabel="Añadir" className="panel grid gap-4 p-4 md:grid-cols-3">
          <TextField name="name" label="Nombre" required />
          <TextField name="companyName" label="Empresa" />
          <TextField name="title" label="Cargo" />
          <Select name="kind" label="Tipo" options={OPTIONS.contactKind()} defaultValue={sp.kind ?? "recruiter"} />
          <Select name="status" label="Estado" options={OPTIONS.contactStatus()} defaultValue="to_contact" />
          <TextField name="relationship" label="Relación" placeholder="Ex-compañero, comunidad…" />
          <TextField name="linkedinUrl" label="LinkedIn" type="url" />
          <TextField name="email" label="Email" type="email" />
          <TextField name="phone" label="Teléfono" type="tel" />
        </ActionForm>
      </Section>
    </div>
  );
}
