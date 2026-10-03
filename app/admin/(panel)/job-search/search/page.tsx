import Link from "next/link";
import { Empty, PageHeader, Section, StatusBadge } from "@/components/admin/job-search/ui";
import { formatDateTime } from "@/lib/job-search/dates";
import { DOCUMENT_KIND_LABEL, INTERVIEW_KIND_LABEL, TIER_LABEL } from "@/lib/job-search/labels";
import { search } from "@/lib/job-search/repository";
import { db, getSnapshot } from "@/lib/job-search/server";

export const metadata = { title: "Búsqueda" };

const B = "/admin/job-search";

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <Section title={`${title} · ${count}`}>
      <ul className="panel divide-y divide-slate-200">{children}</ul>
    </Section>
  );
}

const item = "block px-4 py-2.5 hover:bg-slate-50";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const [s, r] = await Promise.all([getSnapshot(), q.length >= 2 ? search(db, q) : null]);
  const total = r ? Object.values(r).reduce((n, list) => n + list.length, 0) : 0;

  return (
    <div className="space-y-8">
      <PageHeader title="Búsqueda" description={q ? `${total} resultado${total === 1 ? "" : "s"} para “${q}”` : "Oportunidades, empresas, contactos, entrevistas, notas y documentos."} />
      <form role="search" className="flex max-w-xl gap-2">
        <label htmlFor="search-q" className="sr-only">
          Término
        </label>
        <input id="search-q" name="q" type="search" defaultValue={q} autoFocus className="field" placeholder="Mínimo 2 caracteres" />
        <button className="btn">Buscar</button>
      </form>
      {r && !total ? <Empty>Sin resultados.</Empty> : null}
      {r ? (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Group title="Oportunidades" count={r.opportunities.length}>
            {r.opportunities.map((o) => (
              <li key={o.id}>
                <Link href={`${B}/opportunities/${o.id}`} className={`${item} flex items-center justify-between gap-3`}>
                  <span className="truncate text-sm text-carbon">{o.companyName ? `${o.companyName} · ${o.title}` : o.title}</span>
                  <StatusBadge status={o.status} />
                </Link>
              </li>
            ))}
          </Group>
          <Group title="Empresas" count={r.companies.length}>
            {r.companies.map((c) => (
              <li key={c.id}>
                <Link href={`${B}/companies/${c.id}`} className={item}>
                  <span className="text-sm text-carbon">{c.name}</span> {c.tier ? <span className="font-mono text-xs text-slate-500">{TIER_LABEL[c.tier]}</span> : null}
                </Link>
              </li>
            ))}
          </Group>
          <Group title="Contactos" count={r.contacts.length}>
            {r.contacts.map((c) => (
              <li key={c.id}>
                <Link href={`${B}/contacts/${c.id}`} className={item}>
                  <span className="block text-sm text-carbon">{c.name}</span>
                  <span className="block text-xs text-slate-600">{[c.title, c.companyName].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </Group>
          <Group title="Entrevistas" count={r.interviews.length}>
            {r.interviews.map((i) => (
              <li key={i.id}>
                <Link href={`${B}/interviews/${i.id}`} className={item}>
                  <span className="block text-sm text-carbon">{i.companyName ? `${i.companyName} · ${i.title}` : i.title}</span>
                  <span className="block text-xs text-slate-600">
                    {INTERVIEW_KIND_LABEL[i.kind]} · {formatDateTime(i.scheduledAt, s.goal.timezone)}
                  </span>
                </Link>
              </li>
            ))}
          </Group>
          <Group title="Notas" count={r.notes.length}>
            {r.notes.map((n) => {
              const href = n.opportunityId
                ? `${B}/opportunities/${n.opportunityId}?tab=notes`
                : n.contactId
                  ? `${B}/contacts/${n.contactId}`
                  : n.companyId
                    ? `${B}/companies/${n.companyId}`
                    : n.interviewId
                      ? `${B}/interviews/${n.interviewId}`
                      : `${B}`;
              return (
                <li key={n.id}>
                  <Link href={href} className={item}>
                    <span className="line-clamp-2 text-sm text-slate-800">{n.body}</span>
                  </Link>
                </li>
              );
            })}
          </Group>
          <Group title="Documentos" count={r.documents.length}>
            {r.documents.map((d) => (
              <li key={d.id}>
                <Link href={`${B}/documents`} className={item}>
                  <span className="text-sm text-carbon">{d.name}</span>{" "}
                  <span className="font-mono text-xs text-slate-500">
                    {DOCUMENT_KIND_LABEL[d.kind]}
                    {d.version ? ` · ${d.version}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </Group>
        </div>
      ) : null}
    </div>
  );
}
