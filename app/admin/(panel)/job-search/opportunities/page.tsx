import Link from "next/link";
import { OpportunityTable } from "@/components/admin/job-search/OpportunityTable";
import { PageHeader } from "@/components/admin/job-search/ui";
import { scoreValues } from "@/lib/job-search/engine";
import { OPPORTUNITY_STATUSES } from "@/lib/job-search/enums";
import { getWorkspace } from "@/lib/job-search/server";
import { STAGE_GROUPS } from "@/lib/job-search/stages";
import { tableRows } from "@/lib/job-search/views";

export const metadata = { title: "Opportunities" };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { snapshot, engine } = await getWorkspace();
  const rows = tableRows(snapshot, scoreValues(engine));
  // Filtros iniciales desde la URL (enlaces del dashboard), solo si son valores conocidos.
  const status = typeof sp.status === "string" && (OPPORTUNITY_STATUSES as readonly string[]).includes(sp.status) ? sp.status : "";
  const stage = typeof sp.stage === "string" && sp.stage in STAGE_GROUPS ? sp.stage : "";
  return (
    <div className="space-y-6">
      <PageHeader
        title="Opportunities"
        count={rows.length}
        action={
          <Link href="/admin/job-search/opportunities/new" className="btn">
            Nueva
          </Link>
        }
      />
      <OpportunityTable rows={rows} initial={{ status, stage }} />
    </div>
  );
}
