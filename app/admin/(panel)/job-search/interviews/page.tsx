import Link from "next/link";
import { InterviewForm } from "@/components/admin/job-search/InterviewForm";
import { Empty, Muted, PageHeader, Section, Table, td } from "@/components/admin/job-search/ui";
import { formatDateTime } from "@/lib/job-search/dates";
import { INTERVIEW_FORMAT_LABEL, INTERVIEW_KIND_LABEL, INTERVIEW_OUTCOME_LABEL } from "@/lib/job-search/labels";
import { checklistProgress, listInterviews } from "@/lib/job-search/repository";
import { db, getOptions, getSnapshot } from "@/lib/job-search/server";

export const metadata = { title: "Entrevistas" };

type Row = Awaited<ReturnType<typeof listInterviews>>[number];

function InterviewTable({ rows, tz }: { rows: Row[]; tz: string }) {
  if (!rows.length) return <Empty>Ninguna.</Empty>;
  return (
    <Table head={["Cuándo", "Empresa · puesto", "Tipo", "Entrevistador", "Formato", "Preparación", "Resultado"]} minWidth="48rem">
      {rows.map(({ i, title, companyName }) => {
        const p = checklistProgress(i.prepChecklist);
        return (
          <tr key={i.id}>
            <td className={td}>
              <Link href={`/admin/job-search/interviews/${i.id}`} className="text-carbon hover:underline">
                {formatDateTime(i.scheduledAt, i.timezone ?? tz)}
              </Link>
            </td>
            <td className={td}>{companyName ? `${companyName} · ${title}` : title}</td>
            <td className={td}>
              {INTERVIEW_KIND_LABEL[i.kind]}
              {i.round ? <Muted> · r{i.round}</Muted> : null}
            </td>
            <td className={td}>{i.interviewerName ?? "—"}</td>
            <td className={td}>{i.format ? INTERVIEW_FORMAT_LABEL[i.format] : "—"}</td>
            <td className={td}>
              <Muted>{p.total ? `${p.done}/${p.total}` : "—"}</Muted>
            </td>
            <td className={td}>{INTERVIEW_OUTCOME_LABEL[i.outcome]}</td>
          </tr>
        );
      })}
    </Table>
  );
}

export default async function InterviewsPage() {
  const [s, rows, options] = await Promise.all([getSnapshot(), listInterviews(db), getOptions()]);
  const tz = s.goal.timezone;
  const now = s.now.getTime();
  const upcoming = rows.filter(({ i }) => i.outcome === "pending" && (!i.scheduledAt || i.scheduledAt.getTime() >= now - 3_600_000)).reverse();
  const awaiting = rows.filter(({ i }) => i.outcome === "pending" && i.scheduledAt && i.scheduledAt.getTime() < now - 3_600_000);
  const past = rows.filter(({ i }) => i.outcome !== "pending");

  return (
    <div className="space-y-10">
      <PageHeader
        title="Entrevistas"
        count={rows.length}
        action={
          <Link href="/admin/job-search/interviews/stories" className="btn-ghost">
            STAR stories
          </Link>
        }
      />
      <Section title={`Próximas · ${upcoming.length}`}>
        <InterviewTable rows={upcoming} tz={tz} />
      </Section>
      {awaiting.length ? (
        <Section title={`Pendientes de registrar resultado · ${awaiting.length}`}>
          <InterviewTable rows={awaiting} tz={tz} />
        </Section>
      ) : null}
      <Section title={`Completadas · ${past.length}`}>
        <InterviewTable rows={past} tz={tz} />
      </Section>
      <Section title="Programar entrevista">
        {options.opportunities.length ? (
          <div className="panel p-4">
            <InterviewForm opportunities={options.opportunities} contacts={options.contacts} timezone={tz} />
          </div>
        ) : (
          <Empty>Primero añade una oportunidad.</Empty>
        )}
      </Section>
    </div>
  );
}
