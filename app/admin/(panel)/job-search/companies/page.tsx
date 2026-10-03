import Link from "next/link";
import { ActionForm } from "@/components/admin/ActionForm";
import { Select, TextField } from "@/components/admin/fields";
import { Badge, Empty, Muted, PageHeader, Section, Table, td } from "@/components/admin/job-search/ui";
import { saveCompanyAction } from "@/lib/job-search/actions";
import { dateIn, relativeDay } from "@/lib/job-search/dates";
import { OPTIONS } from "@/lib/job-search/labels";
import * as repo from "@/lib/job-search/repository";
import { db, getSnapshot } from "@/lib/job-search/server";

export const metadata = { title: "Empresas" };

const INTEREST = [{ value: "", label: "—" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}/5` }))];

export default async function CompaniesPage() {
  const [s, rows] = await Promise.all([getSnapshot(), repo.listCompanies(db)]);
  return (
    <div className="space-y-8">
      <PageHeader title="Empresas" count={rows.length} description="Empresas objetivo por categoría. Una empresa se crea sola al escribir su nombre en una oportunidad o un contacto." />
      {rows.length ? (
        <Table head={["Empresa", "Categoría", "Interés", "Oportunidades", "Reclutadores", "Contactos", "Recomendaciones", "Última actividad", "Próxima acción"]} minWidth="56rem">
          {rows.map((c) => (
            <tr key={c.id} className={c.archived ? "opacity-60" : ""}>
              <td className={td}>
                <Link href={`/admin/job-search/companies/${c.id}`} className="text-carbon hover:underline">
                  {c.name}
                </Link>
              </td>
              <td className={td}>{c.tier ? <Badge tone={c.tier === "a" ? "dark" : "default"}>{c.tier.toUpperCase()}</Badge> : "—"}</td>
              <td className={td}>
                <Muted>{c.interest ? `${c.interest}/5` : "—"}</Muted>
              </td>
              <td className={td}>
                <Muted>
                  {c.active_opportunities} / {c.opportunities}
                </Muted>
              </td>
              <td className={td}>
                <Muted>{c.recruiters}</Muted>
              </td>
              <td className={td}>
                <Muted>{c.contacts}</Muted>
              </td>
              <td className={td}>
                <Muted>{c.referrals}</Muted>
              </td>
              <td className={td}>
                <Muted>{c.last_activity ? relativeDay(dateIn(c.last_activity, s.goal.timezone), s.today) : "—"}</Muted>
              </td>
              <td className={td}>
                {c.next_action ?? "—"}
                {c.next_action_at ? <span className="block font-mono text-[0.7rem] text-slate-500">{relativeDay(c.next_action_at, s.today)}</span> : null}
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty>Sin empresas todavía.</Empty>
      )}
      <Section title="Nueva empresa objetivo">
        <ActionForm action={saveCompanyAction} submitLabel="Añadir" className="panel grid gap-4 p-4 md:grid-cols-4">
          <TextField name="name" label="Empresa" required />
          <Select name="tier" label="Categoría" options={OPTIONS.tier("—")} defaultValue="b" />
          <Select name="interest" label="Interés" options={INTEREST} />
          <TextField name="careersUrl" label="Página de empleo" type="url" />
        </ActionForm>
      </Section>
    </div>
  );
}
